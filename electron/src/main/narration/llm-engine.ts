/**
 * LLM 引擎
 *
 * 封裝 node-llama-cpp，提供：
 * - 單例 Lazy loading（第一次呼叫才載入模型，避免啟動慢）
 * - 統一的 generate() API
 * - Cancellation 支援（透過 AbortController）
 *
 * 為什麼用單例？
 * - 模型載入要 5-30 秒，整個 App 只應該載一次
 * - 釋放記憶體要 unload，不能在 React 每次 render 時建立新 instance
 */

import { getLlama, LlamaChatSession, type Llama } from 'node-llama-cpp';
import * as fs from 'fs';
import log from 'electron-log';

interface LLMSingleton {
  llama: Llama;
  // model 與 session 是 dynamic loaded，這邊用 any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentSession: any;
  loadedModelPath: string;
}

let singleton: LLMSingleton | null = null;
let isLoading = false;

export interface GenerateOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;        // 預設 400（足夠 150 字文案 + buffer）
  temperature?: number;      // 預設 0.9（高變化避免同質化）
  topP?: number;             // 預設 0.9
  signal?: AbortSignal;      // 用於取消生成
}

/**
 * 取得或建立 LLM singleton
 */
async function getOrCreateLLM(modelPath: string): Promise<LLMSingleton> {
  if (singleton && singleton.loadedModelPath === modelPath) {
    return singleton;
  }

  if (isLoading) {
    // 防止併發呼叫時重複載入
    while (isLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (singleton) return singleton;
  }

  isLoading = true;
  try {
    log.info('=== 開始載入 LLM ===');
    log.info('模型路徑:', modelPath);

    if (!fs.existsSync(modelPath)) {
      throw new Error(`模型檔案不存在: ${modelPath}\n請先到設定頁下載模型`);
    }

    const llama = await getLlama();
    log.info('Llama runtime 載入完成');

    const model = await llama.loadModel({ modelPath });
    log.info('Model 載入完成');

    const session = new LlamaChatSession({ model });
    log.info('Chat session 建立完成');

    singleton = {
      llama,
      model,
      currentSession: session,
      loadedModelPath: modelPath,
    };

    log.info('=== LLM 載入完成 ===');
    return singleton;
  } catch (err) {
    log.error('LLM 載入失敗:', err);
    throw err;
  } finally {
    isLoading = false;
  }
}

/**
 * 卸載 LLM（釋放記憶體）
 */
export async function disposeLLM(): Promise<void> {
  if (!singleton) return;
  try {
    if (singleton.currentSession) {
      await singleton.currentSession.dispose?.();
    }
    if (singleton.model) {
      await singleton.model.dispose?.();
    }
  } catch (err) {
    log.warn('LLM 卸載時發生錯誤:', err);
  } finally {
    singleton = null;
    log.info('LLM 已卸載');
  }
}

/**
 * 檢查 LLM 是否已載入
 */
export function isLLMLoaded(): boolean {
  return singleton !== null;
}

/**
 * 核心生成函式
 *
 * 流程：
 * 1. 取得 singleton（第一次會載入模型）
 * 2. 設定 system prompt + user prompt
 * 3. 呼叫 prompt() 生成
 * 4. 回傳結果
 */
export async function generate(
  modelPath: string,
  options: GenerateOptions,
): Promise<string> {
  const llm = await getOrCreateLLM(modelPath);

  const {
    systemPrompt,
    userPrompt,
    maxTokens = 400,
    temperature = 0.9,
    topP = 0.9,
    signal,
  } = options;

  // 設置 system prompt
  llm.currentSession.setChatHistory([
    { type: 'system', text: systemPrompt },
  ]);

  log.debug('開始生成...');
  log.debug('User prompt:', userPrompt.slice(0, 100) + '...');

  const response = await llm.currentSession.prompt(userPrompt, {
    maxTokens,
    temperature,
    topP,
    signal,   // 支援取消
  });

  log.debug('生成完成，長度:', response.length);
  return response;
}

/**
 * 簡化版生成（給 IPC 用）
 */
export async function simpleGenerate(
  modelPath: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  return generate(modelPath, {
    systemPrompt,
    userPrompt,
  });
}
