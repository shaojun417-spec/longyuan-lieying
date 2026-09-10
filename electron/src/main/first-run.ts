/**
 * 首次啟動流程
 * 處理首次使用軟體時的初始化、引導下載 AI 模型
 */

import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';
import { detectHardware, checkMinimumRequirements, recommendModel, ModelRecommendation } from './hardware-detect';
import { modelManager, ModelInfo, DownloadProgress } from './model-manager';

export interface FirstRunState {
  isFirstRun: boolean;
  hardwareChecked: boolean;
  modelDownloaded: boolean;
  currentStep: 'welcome' | 'checking' | 'downloading' | 'complete' | 'error';
  progress: number;
  errorMessage?: string;
  hardwareInfo?: {
    totalRAM: number;
    cpuCores: number;
    gpuModel: string;
  };
  recommendedModel?: ModelRecommendation;
  warnings?: string[];
}

export class FirstRunManager {
  private window: BrowserWindow | null = null;

  /**
   * 開始首次啟動流程
   */
  async start(window: BrowserWindow): Promise<FirstRunState> {
    this.window = window;
    log.info('=== 開始首次啟動流程 ===');

    const state: FirstRunState = {
      isFirstRun: true,
      hardwareChecked: false,
      modelDownloaded: false,
      currentStep: 'welcome',
      progress: 0,
    };

    try {
      // 步驟 1：偵測硬體
      state.currentStep = 'checking';
      this.sendProgress(state);
      
      const hardware = await detectHardware();
      state.hardwareInfo = {
        totalRAM: hardware.totalRAM,
        cpuCores: hardware.cpuCores,
        gpuModel: hardware.gpuModel,
      };

      // 檢查最低需求
      const requirementCheck = checkMinimumRequirements(hardware);
      state.warnings = requirementCheck.warnings;
      state.hardwareChecked = true;

      // 根據硬體推薦模型
      const recommendation = recommendModel(hardware);
      state.recommendedModel = recommendation;

      log.info('硬體偵測完成:', state.hardwareInfo);
      log.info('推薦模型:', state.recommendedModel);

      // 步驟 2：檢查模型是否已下載
      const isDownloaded = modelManager.isModelDownloaded(recommendation.recommendedModel);

      if (isDownloaded) {
        // 模型已存在，跳過下載
        state.modelDownloaded = true;
        state.currentStep = 'complete';
        state.progress = 100;
        log.info('模型已存在，不需要下載');
      } else {
        // 需要下載模型
        state.currentStep = 'downloading';
        log.info('開始下載模型...');

        const downloadSuccess = await modelManager.downloadModel(
          recommendation.recommendedModel,
          (progress: DownloadProgress) => {
            state.progress = progress.percentage;
            this.sendProgress(state);
          }
        );

        if (downloadSuccess) {
          state.modelDownloaded = true;
          state.currentStep = 'complete';
          state.progress = 100;
          log.info('模型下載完成！');
        } else {
          state.currentStep = 'error';
          state.errorMessage = '模型下載失敗，請檢查網路連線後重試';
          log.error('模型下載失敗');
        }
      }

      this.sendProgress(state);
      return state;

    } catch (error) {
      log.error('首次啟動流程發生錯誤:', error);
      state.currentStep = 'error';
      state.errorMessage = `初始化失敗：${error}`;
      this.sendProgress(state);
      return state;
    }
  }

  /**
   * 手動下載模型（用於錯誤後重試）
   */
  async retryDownload(modelName: string): Promise<boolean> {
    log.info(`重試下載模型: ${modelName}`);

    try {
      const success = await modelManager.downloadModel(modelName, (progress) => {
        if (this.window) {
          this.window.webContents.send('first-run:progress', {
            currentStep: 'downloading',
            progress: progress.percentage,
          });
        }
      });

      return success;
    } catch (error) {
      log.error('重試下載失敗:', error);
      return false;
    }
  }

  /**
   * 發送進度更新到 Renderer
   */
  private sendProgress(state: FirstRunState): void {
    if (this.window) {
      this.window.webContents.send('first-run:progress', state);
    }
  }
}

// 匯出單例
export const firstRunManager = new FirstRunManager();

/**
 * 註冊 IPC 處理器
 */
export function registerFirstRunIpcHandlers(): void {
  ipcMain.handle('first-run:start', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      return await firstRunManager.start(win);
    }
    return { currentStep: 'error', errorMessage: '無法取得視窗' };
  });

  ipcMain.handle('first-run:retry-download', async (_event, modelName: string) => {
    return await firstRunManager.retryDownload(modelName);
  });

  ipcMain.handle('first-run:check-model-status', async () => {
    return await modelManager.getAllModelsStatus();
  });
}
