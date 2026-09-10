/**
 * 共用型別定義
 * 給 Renderer 和 Main 都使用
 */

export interface ElectronAPI {
  firstRun: {
    start: () => Promise<any>;
    onProgress: (callback: (state: any) => void) => void;
    retryDownload: (modelName: string) => Promise<boolean>;
  };

  model: {
    getStatus: () => Promise<any[]>;
    getPath: () => Promise<string>;
    isDownloaded: (modelName: string) => Promise<boolean>;
  };

  app: {
    getInfo: () => Promise<{
      version: string;
      userDataPath: string;
      modelsPath: string;
    }>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}