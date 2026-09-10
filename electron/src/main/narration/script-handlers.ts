/**
 * IPC Handler：文案生成
 *
 * 路由：
 * - script:generate    - 開始生成（會回傳 promise 等待完成）
 * - script:on-progress - 監聽進度（Event 推送）
 * - script:cancel      - 取消正在進行的生成
 * - script:dispose     - 卸載模型（釋放記憶體）
 * - script:is-loaded   - 查詢模型是否已載入
 */

import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import { modelManager } from '../model-manager';
import { generateScripts, type ScriptWriterProgress } from './script-writer';
import { isLLMLoaded, disposeLLM } from './llm-engine';
import type { GenerateScriptsRequest } from '../../shared/types';

// 儲存 AbortController（支援取消）
let currentAbortController: AbortController | null = null;

export function registerScriptHandlers(): void {
  log.info('註冊 script: IPC handlers...');

  /**
   * 生成文案
   * 這是長任務，呼叫者應該監聽 script:progress 事件
   */
  ipcMain.handle('script:generate', async (_event, request: GenerateScriptsRequest) => {
    log.info('收到 script:generate 請求');
    log.info(`產品: ${request.product?.product}, 數量: ${request.count}`);

    // 參數驗證
    if (!request.product) {
      return {
        success: false,
        scripts: [],
        modelUsed: '',
        totalTimeMs: 0,
        error: '缺少產品資訊',
      };
    }

    if (!request.product.product || request.product.product.trim() === '') {
      return {
        success: false,
        scripts: [],
        modelUsed: '',
        totalTimeMs: 0,
        error: '請填寫產品名稱',
      };
    }

    if (request.count < 1 || request.count > 5) {
      return {
        success: false,
        scripts: [],
        modelUsed: '',
        totalTimeMs: 0,
        error: '生成數量必須在 1-5 之間',
      };
    }

    // 確認模型已下載
    const modelName = 'qwen2.5-3b-instruct-q4_k_m';
    if (!modelManager.isModelDownloaded(modelName)) {
      return {
        success: false,
        scripts: [],
        modelUsed: '',
        totalTimeMs: 0,
        error: `模型尚未下載：${modelName}\n請先到設定頁下載模型`,
      };
    }

    const modelPath = modelManager.getModelPath(modelName);

    // 建立新的 AbortController
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    // 定義 progress callback，透過 IPC 推播給所有視窗
    const onProgress = (progress: ScriptWriterProgress) => {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send('script:progress', progress);
      }
    };

    try {
      const result = await generateScripts(
        modelPath,
        request,
        onProgress,
        currentAbortController.signal,
      );

      currentAbortController = null;
      return result;
    } catch (err) {
      currentAbortController = null;
      const error = err instanceof Error ? err.message : String(err);
      log.error('script:generate 失敗:', error);
      return {
        success: false,
        scripts: [],
        modelUsed: modelPath.split(/[/\\]/).pop() || modelPath,
        totalTimeMs: 0,
        error,
      };
    }
  });

  /**
   * 取消生成
   */
  ipcMain.handle('script:cancel', async () => {
    log.info('收到 script:cancel 請求');
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
      return true;
    }
    return false;
  });

  /**
   * 卸載模型（釋放記憶體）
   */
  ipcMain.handle('script:dispose', async () => {
    log.info('收到 script:dispose 請求');
    await disposeLLM();
    return true;
  });

  /**
   * 查詢模型是否已載入
   */
  ipcMain.handle('script:is-loaded', async () => {
    return isLLMLoaded();
  });

  log.info('script: IPC handlers 註冊完成');
}
