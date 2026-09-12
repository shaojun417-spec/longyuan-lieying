/**
 * 批量下載 IPC Handlers
 *
 * 橋接 Electron 主程序 ↔ 渲染程序，提供：
 * - batch:start 啟動批量下載
 * - batch:cancel 取消當前任務
 * - batch:retry-failed 重試失敗項
 * - batch:progress 主動推送進度
 * - batch:parse-urls 解析輸入文字（前端預覽用）
 * - batch:detect-platforms 偵測 URL 平台
 */

import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

import {
  batchDownloadManager,
  type BatchOptions,
} from './batch-download-manager';
import { parseUrlsFromText } from './url-parser';
import { detectPlatforms, getSupportedPlatforms } from './platform-detector';

export function registerBatchHandlers(): void {
  // ===== 1. 啟動批量下載 =====
  ipcMain.handle('batch:start', async (event, payload: {
    input: string | string[];
    options?: BatchOptions;
  }) => {
    log.info('[IPC] batch:start 收到請求', { urlCount: Array.isArray(payload.input) ? payload.input.length : payload.input.split('\n').length });

    const mainWindow = BrowserWindow.fromWebContents(event.sender);

    // 註冊進度推送（每次啟動前先清掉舊的）
    batchDownloadManager.removeAllListeners('progress');
    batchDownloadManager.on('progress', (batch) => {
      mainWindow?.webContents.send('batch:progress', batch);
    });

    try {
      const result = await batchDownloadManager.start(payload.input, payload.options);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('[IPC] batch:start 失敗:', message);
      return { success: false, error: message };
    }
  });

  // ===== 2. 取消當前批次 =====
  ipcMain.handle('batch:cancel', async () => {
    log.info('[IPC] batch:cancel');
    batchDownloadManager.cancel();
    return { success: true };
  });

  // ===== 3. 重試失敗項 =====
  ipcMain.handle('batch:retry-failed', async (event, options?: BatchOptions) => {
    log.info('[IPC] batch:retry-failed');

    const mainWindow = BrowserWindow.fromWebContents(event.sender);
    batchDownloadManager.removeAllListeners('progress');
    batchDownloadManager.on('progress', (batch) => {
      mainWindow?.webContents.send('batch:progress', batch);
    });

    try {
      const result = await batchDownloadManager.retryFailed(options);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // ===== 4. 解析輸入文字（純前端預覽用）=====
  ipcMain.handle('batch:parse-urls', async (_event, text: string) => {
    const result = parseUrlsFromText(text);
    const platforms = detectPlatforms(result.urls);
    return {
      success: true,
      data: {
        ...result,
        platforms,
      },
    };
  });

  // ===== 5. 取得支援的平台列表 =====
  ipcMain.handle('batch:get-platforms', async () => {
    return {
      success: true,
      data: getSupportedPlatforms(),
    };
  });

  log.info('[批量下載] IPC handlers 已註冊');
}
