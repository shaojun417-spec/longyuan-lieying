/**
 * Preload 腳本
 * 在 Renderer 和 Main Process 之間建立安全的橋樑
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  GenerateScriptsRequest,
  GenerateScriptsResponse,
} from '../shared/types';

// 定義 API 型別
export interface ElectronAPI {
  // 首次啟動
  firstRun: {
    start: () => Promise<any>;
    onProgress: (callback: (state: any) => void) => void;
    retryDownload: (modelName: string) => Promise<boolean>;
  };

  // 模型管理
  model: {
    getStatus: () => Promise<any[]>;
    getPath: () => Promise<string>;
    isDownloaded: (modelName: string) => Promise<boolean>;
  };

  // 文案生成
  script: {
    generate: (request: GenerateScriptsRequest) => Promise<GenerateScriptsResponse>;
    cancel: () => Promise<boolean>;
    dispose: () => Promise<boolean>;
    isLoaded: () => Promise<boolean>;
    onProgress: (callback: (progress: any) => void) => void;
  };

  // 應用程式
  app: {
    getInfo: () => Promise<{
      version: string;
      userDataPath: string;
      modelsPath: string;
    }>;
  };
}

// 暴露 API 到 Renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // 首次啟動
  firstRun: {
    start: () => ipcRenderer.invoke('first-run:start'),
    onProgress: (callback: (state: any) => void) => {
      ipcRenderer.on('first-run:progress', (_event: IpcRendererEvent, state: any) => {
        callback(state);
      });
    },
    retryDownload: (modelName: string) =>
      ipcRenderer.invoke('first-run:retry-download', modelName),
  },

  // 模型管理
  model: {
    getStatus: () => ipcRenderer.invoke('model:get-status'),
    getPath: () => ipcRenderer.invoke('model:get-path'),
    isDownloaded: (modelName: string) =>
      ipcRenderer.invoke('model:is-downloaded', modelName),
  },

  // 文案生成
  script: {
    generate: (request: GenerateScriptsRequest) =>
      ipcRenderer.invoke('script:generate', request),
    cancel: () => ipcRenderer.invoke('script:cancel'),
    dispose: () => ipcRenderer.invoke('script:dispose'),
    isLoaded: () => ipcRenderer.invoke('script:is-loaded'),
    onProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('script:progress', (_event: IpcRendererEvent, progress: any) => {
        callback(progress);
      });
    },
  },

  // 應用程式
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info'),
  },
} as ElectronAPI);

// 宣告全域型別
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
