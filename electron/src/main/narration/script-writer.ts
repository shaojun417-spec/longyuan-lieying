/**
 * 文案生成器（Script Writer）
 *
 * 職責：
 * 1. 接收使用者輸入的產品資訊 + 要幾支
 * 2. 呼叫 LLM 一支一支生成
 * 3. 每支做完不相似性檢查，太像就重試（最多 3 次）
 * 4. 回傳完整結果
 *
 * 設計原則：
 * - 一支一支生成（不並行）：讓模型更專注品質、避免記憶體爆掉
 * - 失敗 fallback：第一支永遠直接接受（沒歷史可比）
 * - 進度回報：透過 onProgress callback 讓 UI 顯示進度
 */

import log from 'electron-log';
import type {
  GeneratedScript,
  GenerateScriptsRequest,
  GenerateScriptsResponse,
  ProductInfo,
} from '../../shared/types';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt-templates';
import { isTooSimilar, extractHook } from './similarity-check';
import { generate, disposeLLM } from './llm-engine';

export interface ScriptWriterProgress {
  /** 當前處理到第幾支（1-based） */
  currentIndex: number;
  /** 總共幾支 */
  total: number;
  /** 階段描述 */
  stage: 'loading-model' | 'generating' | 'checking-similarity' | 'done' | 'error';
  /** 這支目前的嘗試次數 */
  attempt?: number;
  /** 訊息 */
  message: string;
  /** 已完成的文案（讓 UI 可以提前顯示） */
  completedScripts?: GeneratedScript[];
}

/**
 * 計算字數（中文一個字算一字）
 */
function countWords(text: string): number {
  // 去除空白、標點後計算長度
  return text.replace(/[\s\p{P}]/gu, '').length;
}

/**
 * 清理 LLM 輸出
 * - 移除多餘的引號、markdown 標記
 * - 移除前言（「好的」「以下是」「這是文案」之類）
 */
function cleanOutput(raw: string): string {
  let text = raw.trim();

  // 移除開頭的引號
  text = text.replace(/^["「『]/, '').replace(/["」』]$/, '');

  // 移除 markdown 粗體標記
  text = text.replace(/\*\*/g, '');

  // 移除常見 AI 前言
  const preambles = [
    /^(好的[，,。！!]?\s*)/,
    /^(以下是[^\n]*[，,。！!]?\s*)/,
    /^(這是[^\n]*[，,。！!]?\s*)/,
    /^(文案[：:]\s*)/,
    /^(標題[：:]\s*)/,
    /^(第[一二三四五六七八九十\d]+支[，,。：:]\s*)/,
    /^(當然[，,。]?\s*)/,
  ];
  for (const pattern of preambles) {
    text = text.replace(pattern, '');
  }

  // 移除尾巴的「以上」「就是這樣」之類
  text = text.replace(/(以上就是.+。?\s*)$/, '');
  text = text.replace(/(這樣就.+。?\s*)$/, '');

  return text.trim();
}

/**
 * 生成 N 支差異化文案
 */
export async function generateScripts(
  modelPath: string,
  request: GenerateScriptsRequest,
  onProgress?: (progress: ScriptWriterProgress) => void,
  signal?: AbortSignal,
): Promise<GenerateScriptsResponse> {
  const startTime = Date.now();
  const { product, count, maxAttempts = 3 } = request;

  log.info('=== 開始生成文案 ===');
  log.info(`模型: ${modelPath}`);
  log.info(`產品: ${product.product}`);
  log.info(`數量: ${count}`);

  const completedScripts: GeneratedScript[] = [];

  try {
    for (let i = 1; i <= count; i++) {
      // 檢查是否被取消
      if (signal?.aborted) {
        throw new Error('使用者取消');
      }

      // 報告進度
      onProgress?.({
        currentIndex: i,
        total: count,
        stage: isLLMLoaded() ? 'generating' : 'loading-model',
        message: isLLMLoaded()
          ? `正在生成第 ${i}/${count} 支文案...`
          : `正在載入模型（首次需要 5-30 秒）...`,
      });

      // 1. 生成文案（含不相似性檢查的重試邏輯）
      const content = await generateWithRetry(
        modelPath,
        product,
        i,
        count,
        completedScripts.map((s) => s.content),
        maxAttempts,
        onProgress,
        signal,
      );

      // 2. 清理輸出
      const cleaned = cleanOutput(content);
      const wordCount = countWords(cleaned);

      // 3. 建立結果物件
      const result: GeneratedScript = {
        index: i,
        total: count,
        content: cleaned,
        hook: extractHook(cleaned),
        wordCount,
        generatedAt: Date.now(),
      };

      completedScripts.push(result);

      log.info(`第 ${i}/${count} 支完成 (${wordCount} 字)`);

      // 報告這支完成
      onProgress?.({
        currentIndex: i,
        total: count,
        stage: 'generating',
        message: `第 ${i}/${count} 支完成`,
        completedScripts: [...completedScripts],
      });
    }

    // 全部完成
    onProgress?.({
      currentIndex: count,
      total: count,
      stage: 'done',
      message: '全部生成完成',
      completedScripts,
    });

    return {
      success: true,
      scripts: completedScripts,
      modelUsed: modelPath.split(/[/\\]/).pop() || modelPath,
      totalTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error('文案生成失敗:', error);

    onProgress?.({
      currentIndex: completedScripts.length,
      total: count,
      stage: 'error',
      message: error,
      completedScripts,
    });

    return {
      success: false,
      scripts: completedScripts,
      modelUsed: modelPath.split(/[/\\]/).pop() || modelPath,
      totalTimeMs: Date.now() - startTime,
      error,
    };
  }
}

/**
 * 帶不相似性檢查的重試生成
 */
async function generateWithRetry(
  modelPath: string,
  product: ProductInfo,
  index: number,
  total: number,
  existing: string[],
  maxAttempts: number,
  onProgress?: (progress: ScriptWriterProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  const userPrompt = buildUserPrompt(product, index, total);
  let lastOutput = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('使用者取消');

    onProgress?.({
      currentIndex: index,
      total,
      stage: 'generating',
      attempt,
      message: `第 ${index}/${total} 支 - 嘗試 ${attempt}/${maxAttempts}`,
    });

    try {
      const output = await generate(modelPath, {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        signal,
      });
      lastOutput = output;

      // 第一支不用檢查相似度（沒歷史可比）
      if (index === 1 || existing.length === 0) {
        return output;
      }

      // 檢查相似度
      onProgress?.({
        currentIndex: index,
        total,
        stage: 'checking-similarity',
        attempt,
        message: `第 ${index}/${total} 支 - 檢查相似度...`,
      });

      const tooSimilar = isTooSimilar(output, existing);
      if (!tooSimilar) {
        log.info(`第 ${index} 支通過相似度檢查 (attempt ${attempt})`);
        return output;
      }

      log.warn(`第 ${index} 支太相似 (attempt ${attempt}/${maxAttempts})，重試`);
    } catch (err) {
      log.error(`第 ${index} 支生成失敗 (attempt ${attempt}):`, err);
      if (attempt === maxAttempts) throw err;
    }
  }

  // 重試 N 次都失敗就接受最後一次的結果（避免無限迴圈）
  log.warn(`第 ${index} 支放棄相似度檢查，使用最後一次的輸出`);
  return lastOutput;
}
