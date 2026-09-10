/**
 * Electron 主程序入口
 * 龍淵裂影 - 本地 AI 短影音創作工具
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import log from 'electron-log';
import { registerFirstRunIpcHandlers } from './first-run';
import { modelManager } from './model-manager';

// 設定日誌
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('=== 龍淵裂影啟動 ===');
log.info('應用程式版本:', app.getVersion());
log.info('Electron 版本:', process.versions.electron);
log.info('Node 版本:', process.versions.node);

// 防止多個實例
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log.warn('已有實例運行，關閉這個實例');
  app.quit();
}

// 全域變數
let mainWindow: BrowserWindow | null = null;

/**
 * 建立主視窗
 */
function createWindow(): void {
  log.info('建立主視窗...');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '龍淵裂影',
    icon: path.join(__dirname, '../../electron/resources/icons/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // 需要載入本地模型，所以要關閉 sandbox
    },
  });

  // 註冊 IPC 處理器
  registerIpcHandlers();

  // 開發模式直接打開 DevTools
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // 根據環境載入頁面
  if (process.env.VITE_DEV_SERVER_URL) {
    // 開發模式：從 Vite dev server 載入
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    log.info('開發模式：載入 Vite Dev Server');
  } else {
    // 生產模式：從編譯後的檔案載入
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    log.info('生產模式：載入編譯後的 HTML');
  }

  // 視窗關閉時
  mainWindow.on('closed', () => {
    mainWindow = null;
    log.info('主視窗已關閉');
  });
}

/**
 * 註冊所有 IPC 處理器
 */
function registerIpcHandlers(): void {
  log.info('註冊 IPC 處理器...');

  // 首次啟動相關
  registerFirstRunIpcHandlers();

  // 模型管理相關
  ipcMain.handle('model:get-status', async () => {
    return await modelManager.getAllModelsStatus();
  });

  ipcMain.handle('model:get-path', async () => {
    return modelManager.getModelsDir();
  });

  ipcMain.handle('model:is-downloaded', async (_event, modelName: string) => {
    return modelManager.isModelDownloaded(modelName);
  });

  // 應用程式資訊
  ipcMain.handle('app:get-info', async () => {
    return {
      version: app.getVersion(),
      userDataPath: app.getPath('userData'),
      modelsPath: modelManager.getModelsDir(),
    };
  });

  log.info('IPC 處理器註冊完成');
}

// 應用程式準備好時
app.whenReady().then(async () => {
  log.info('應用程式準備就緒');
  
  // 啟動時清理不完整的殘留模型檔（避免下次誤判）
  const cleaned = await modelManager.cleanupIncompleteModels();
  if (cleaned > 0) {
    log.info(`已清理 ${cleaned} 個不完整的殘留模型檔`);
  }
  
  createWindow();

  // macOS 特殊處理
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有視窗關閉時（macOS 除外）
app.on('window-all-closed', () => {
  log.info('所有視窗已關閉');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 應用程式即將退出
app.on('before-quit', () => {
  log.info('=== 龍淵裂影關閉 ===');
});

// 全域錯誤處理
process.on('uncaughtException', (error) => {
  log.error('未處理的錯誤:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('未處理的 Promise 拒絕:', reason);
});
