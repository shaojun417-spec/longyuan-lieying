/**
 * 模型管理器
 * 負責下載、管理 AI 模型（LLM 和 TTS）
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, dialog } from 'electron';
import log from 'electron-log';

export interface ModelInfo {
  name: string;
  size: number;        // 單位：bytes
  downloaded: boolean;
  path: string;
  url: string;
}

export interface DownloadProgress {
  modelName: string;
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
}

// 模型下載 URLs
const MODEL_URLS = {
  // Qwen2.5 模型（從 HuggingFace）
  'qwen2.5-3b-instruct-q4_k_m': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    size: 2_100_000_000, // 約 2GB
  },
  'qwen2.5-7b-instruct-q4_k_m': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
    size: 4_900_000_000, // 約 4.9GB
  },
  // Piper TTS 中文化模型
  'piper-zh-tw': {
    url: 'https://github.com/rhasspy/piper-phonemize/releases/download/2024.08.28-2/piper_zh_tw_tingfang_liaoliao.tar.gz',
    size: 150_000_000, // 約 150MB
  },
};

export class ModelManager {
  private modelsDir: string;
  private downloadCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();

  constructor() {
    // 模型存放目錄：在使用者資料夾下的 longyuan-lieying/models
    this.modelsDir = path.join(app.getPath('userData'), 'models');
    log.info('模型存放目錄:', this.modelsDir);
  }

  /**
   * 確保模型目錄存在
   */
  async ensureModelsDir(): Promise<void> {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
      log.info('已建立模型目錄:', this.modelsDir);
    }
  }

  /**
   * 取得模型目錄路徑
   */
  getModelsDir(): string {
    return this.modelsDir;
  }

  /**
   * 檢查模型是否已下載
   */
  isModelDownloaded(modelName: string): boolean {
    const modelPath = this.getModelPath(modelName);
    return fs.existsSync(modelPath);
  }

  /**
   * 取得模型完整路徑
   */
  getModelPath(modelName: string): string {
    // 根據模型名稱決定副檔名
    let extension = '.gguf';
    if (modelName.includes('piper')) {
      extension = '.onnx';
    }
    return path.join(this.modelsDir, `${modelName}${extension}`);
  }

  /**
   * 取得所有模型的狀態
   */
  async getAllModelsStatus(): Promise<ModelInfo[]> {
    await this.ensureModelsDir();

    const models: ModelInfo[] = [];

    for (const [modelName, info] of Object.entries(MODEL_URLS)) {
      const modelPath = this.getModelPath(modelName);
      const downloaded = fs.existsSync(modelPath);
      
      models.push({
        name: modelName,
        size: info.size,
        downloaded,
        path: modelPath,
        url: info.url,
      });
    }

    return models;
  }

  /**
   * 下載模型（使用 Electron 的 main process）
   */
  async downloadModel(
    modelName: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<boolean> {
    const modelInfo = MODEL_URLS[modelName as keyof typeof MODEL_URLS];
    if (!modelInfo) {
      log.error('未知的模型:', modelName);
      return false;
    }

    await this.ensureModelsDir();
    const outputPath = this.getModelPath(modelName);

    log.info(`開始下載模型: ${modelName}`);
    log.info(`下載網址: ${modelInfo.url}`);
    log.info(`儲存位置: ${outputPath}`);

    try {
      // 使用 Node.js 的 https 模組下載
      const https = await import('https');
      const fsPromises = await import('fs').then(m => m.promises);

      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);
        let downloadedBytes = 0;

        https.get(modelInfo.url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // 跟隨重新導向
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              log.info('跟隨重新導向到:', redirectUrl);
              https.get(redirectUrl, (redirectResponse) => {
                this.downloadFile(redirectResponse, file, modelName, modelInfo.size, onProgress)
                  .then(resolve)
                  .catch(reject);
                return;
              });
              return;
            }
          }

          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            const percentage = Math.round((downloadedBytes / modelInfo.size) * 100);
            
            if (onProgress) {
              onProgress({
                modelName,
                downloadedBytes,
                totalBytes: modelInfo.size,
                percentage,
              });
            }
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            log.info(`模型下載完成: ${modelName}`);
            resolve(true);
          });
        }).on('error', (err) => {
          log.error('下載失敗:', err);
          fs.unlink(outputPath, () => {}); // 刪除失敗的檔案
          reject(err);
        });
      });
    } catch (error) {
      log.error('下載模型時發生錯誤:', error);
      return false;
    }
  }

  /**
   * 內部方法：處理檔案下載
   */
  private async downloadFile(
    response: NodeJS.ReadableStream,
    file: fs.WriteStream,
    modelName: string,
    totalSize: number,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let downloadedBytes = 0;

      response.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        const percentage = Math.round((downloadedBytes / totalSize) * 100);
        
        if (onProgress) {
          onProgress({
            modelName,
            downloadedBytes,
            totalBytes: totalSize,
            percentage,
          });
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        log.info(`模型下載完成: ${modelName}`);
        resolve(true);
      });

      file.on('error', (err) => {
        log.error('寫入檔案失敗:', err);
        reject(err);
      });
    });
  }

  /**
   * 刪除模型
   */
  async deleteModel(modelName: string): Promise<boolean> {
    const modelPath = this.getModelPath(modelName);
    
    if (fs.existsSync(modelPath)) {
      try {
        fs.unlinkSync(modelPath);
        log.info(`已刪除模型: ${modelName}`);
        return true;
      } catch (error) {
        log.error(`刪除模型失敗: ${modelName}`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * 取得已下載模型的總大小
   */
  async getTotalDownloadedSize(): Promise<number> {
    let totalSize = 0;
    
    for (const modelName of Object.keys(MODEL_URLS)) {
      const modelPath = this.getModelPath(modelName);
      if (fs.existsSync(modelPath)) {
        const stats = fs.statSync(modelPath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }
}

// 匯出單例
export const modelManager = new ModelManager();
