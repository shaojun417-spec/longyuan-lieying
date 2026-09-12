/**
 * 批量下載管理器
 *
 * 協調多個引擎（a-bogus、yt-dlp、v8i8、aria2），完成：
 * 1. URL 解析與去重
 * 2. 平台自動偵測
 * 3. 並行解析（受並發限制）
 * 4. 並行下載（受並發限制）
 * 5. 失敗自動重試（指數退避）
 * 6. 即時進度推送
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import log from 'electron-log';

import { ConcurrencyQueue } from './concurrency-queue';
import { parseUrlsFromText } from './url-parser';
import { detectPlatform, groupByEngine, type PlatformInfo, type EngineType } from './platform-detector';

import { downloadManager } from '../download-manager';

/** 下載目錄 */
function getDownloadDir(): string {
  const dir = path.join(app.getPath('userData'), 'downloads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ===== 型別定義 =====

export type ItemStatus =
  | 'pending'      // 等待中
  | 'parsing'      // 解析中
  | 'downloading'  // 下載中
  | 'completed'    // 完成
  | 'failed';      // 失敗

export interface BatchItem {
  id: string;
  url: string;
  platform: PlatformInfo;
  status: ItemStatus;
  progress: number;            // 0-100
  title?: string;              // 解析後的標題
  outputPath?: string;         // 輸出檔案路徑
  fileSize?: number;           // 檔案大小（bytes）
  error?: string;              // 錯誤訊息
  retryCount: number;          // 已重試次數
}

export type BatchStatus =
  | 'idle'             // 尚未啟動
  | 'parsing'          // 解析階段
  | 'downloading'      // 下載階段
  | 'completed'        // 全部成功
  | 'partial'          // 部分成功
  | 'failed'           // 全部失敗
  | 'cancelled';       // 已取消

export interface BatchTask {
  id: string;
  status: BatchStatus;
  items: BatchItem[];
  total: number;
  completed: number;
  failed: number;
  parsing: number;
  downloading: number;
  totalBytes: number;          //累計下載位元組
  startTime: number;
  endTime?: number;
}

export interface BatchOptions {
  /** 並行解析數 */
  maxParseConcurrency?: number;
  /** 並行下載數 */
  maxDownloadConcurrency?: number;
  /** 最大重試次數 */
  maxRetries?: number;
  /** 重試延遲（毫秒） */
  retryDelay?: number;
  /** 檔名範本（支援變數：{platform}, {title}, {index}, {date}） */
  filenameTemplate?: string;
  /** 進度回調 */
  onProgress?: (task: BatchTask) => void;
}

const DEFAULT_OPTIONS: Required<Omit<BatchOptions, 'onProgress'>> = {
  maxParseConcurrency: 5,
  maxDownloadConcurrency: 3,
  maxRetries: 3,
  retryDelay: 2000,
  filenameTemplate: '{platform}_{title}_{date}',
};

// ===== 批量下載管理器 =====

export class BatchDownloadManager extends EventEmitter {
  private currentBatch: BatchTask | null = null;
  private cancelRequested = false;

  /**
   * 啟動批量下載
   */
  async start(
    input: string | string[],
    options: BatchOptions = {}
  ): Promise<BatchTask> {
    // 1. 解析 URL
    const text = Array.isArray(input) ? input.join('\n') : input;
    const parseResult = parseUrlsFromText(text);

    if (parseResult.urls.length === 0) {
      throw new Error('沒有可用的網址');
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };

    log.info('[批量下載] 啟動任務:', {
      urls: parseResult.urls.length,
      duplicates: parseResult.duplicates,
      invalid: parseResult.invalid.length,
      options: opts,
    });

    // 2. 建立批量任務
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const items: BatchItem[] = parseResult.urls.map((url, index) => {
      const platform = detectPlatform(url);
      return {
        id: `item_${batchId}_${index}`,
        url,
        platform,
        status: 'pending',
        progress: 0,
        retryCount: 0,
      };
    });

    const batch: BatchTask = {
      id: batchId,
      status: 'idle',
      items,
      total: items.length,
      completed: 0,
      failed: 0,
      parsing: 0,
      downloading: 0,
      totalBytes: 0,
      startTime: Date.now(),
    };

    this.currentBatch = batch;
    this.cancelRequested = false;

    // 3. 執行批次處理
    try {
      await this.executeBatch(batch, opts);
    } catch (error) {
      log.error('[批量下載] 執行失敗:', error);
      batch.status = 'failed';
      batch.endTime = Date.now();
      this.emit('progress', batch);
    }

    return batch;
  }

  /**
   * 取消當前批次
   */
  cancel(): void {
    if (!this.currentBatch) return;
    this.cancelRequested = true;
    this.currentBatch.status = 'cancelled';
    log.info('[批量下載] 取消請求已發送');
    this.emit('progress', this.currentBatch);
  }

  /**
   * 重試失敗的項目
   */
  async retryFailed(options: BatchOptions = {}): Promise<BatchTask | null> {
    if (!this.currentBatch) return null;

    const failedItems = this.currentBatch.items.filter((item) => item.status === 'failed');
    if (failedItems.length === 0) {
      log.info('[批量下載] 沒有失敗的項目需要重試');
      return this.currentBatch;
    }

    log.info('[批量下載] 重試失敗項目:', failedItems.length);

    // 重置失敗項目
    for (const item of failedItems) {
      item.status = 'pending';
      item.progress = 0;
      item.error = undefined;
      // 不重置 retryCount，繼續累積
    }

    // 重置統計
    this.currentBatch.failed = 0;
    this.currentBatch.status = 'parsing';

    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.cancelRequested = false;

    await this.executeBatch(this.currentBatch, opts);
    return this.currentBatch;
  }

  // ===== 私有方法 =====

  /**
   * 執行批次處理（兩階段：解析 → 下載）
   */
  private async executeBatch(
    batch: BatchTask,
    options: Required<Omit<BatchOptions, 'onProgress'>>
  ): Promise<void> {
    // ===== 階段 1：並行解析 =====
    log.info('[批量下載] 階段 1：解析', batch.items.length, '個 URL');
    batch.status = 'parsing';
    this.emitProgress(batch);

    const parseQueue = new ConcurrencyQueue({
      maxConcurrency: options.maxParseConcurrency,
      maxRetries: options.maxRetries,
      retryDelay: options.retryDelay,
      onTaskComplete: (result) => {
        if (result.success) {
          // 成功
        } else {
          // 失敗（已重試完）
        }
        this.emitProgress(batch);
      },
    });

    // 把待解析的項目加入佇列
    for (const item of batch.items) {
      if (item.status === 'pending' && !this.cancelRequested) {
        item.status = 'parsing';
        item.progress = 5; // 解析階段進度
        batch.parsing++;
        this.emitProgress(batch);

        parseQueue.add(async () => {
          await this.parseItem(item, batch);
        });
      }
    }

    await parseQueue.waitAll();

    // 檢查取消
    if (this.cancelRequested) {
      log.info('[批量下載] 已取消，跳過下載階段');
      batch.endTime = Date.now();
      this.emitProgress(batch);
      return;
    }

    // 統計解析結果
    const parseSuccess = batch.items.filter((i) =>
      ['completed', 'downloading'].includes(i.status) ||
      (i.status === 'failed' && i.outputPath) // 已下載
    ).length;

    log.info('[批量下載] 解析完成:', {
      success: parseSuccess,
      failed: batch.items.length - parseSuccess,
    });

    // ===== 階段 2：並行下載 =====
    log.info('[批量下載] 階段 2：下載');
    batch.status = 'downloading';
    this.emitProgress(batch);

    const downloadQueue = new ConcurrencyQueue({
      maxConcurrency: options.maxDownloadConcurrency,
      maxRetries: options.maxRetries,
      retryDelay: options.retryDelay,
    });

    for (const item of batch.items) {
      // 只下載解析成功且尚未下載的項目
      if (item.status === 'parsing' && !this.cancelRequested) {
        item.status = 'downloading';
        batch.downloading++;
        this.emitProgress(batch);

        downloadQueue.add(async () => {
          await this.downloadItem(item, batch);
        });
      }
    }

    await downloadQueue.waitAll();

    // ===== 完成統計 =====
    batch.endTime = Date.now();
    batch.status = batch.failed === 0 ? 'completed' :
                   batch.completed === 0 ? 'failed' : 'partial';

    log.info('[批量下載] 任務結束:', {
      total: batch.total,
      completed: batch.completed,
      failed: batch.failed,
      duration: `${((batch.endTime - batch.startTime) / 1000).toFixed(1)}s`,
      totalSize: `${(batch.totalBytes / 1024 / 1024).toFixed(2)} MB`,
    });

    this.emitProgress(batch);
  }

  /**
   * 解析單個項目
   */
  private async parseItem(item: BatchItem, batch: BatchTask): Promise<void> {
    try {
      // 呼叫下載管理器解析
      const videoInfo = await downloadManager.parseVideoUrl(item.url);

      item.title = videoInfo.title;
      item.platform.displayName = item.platform.displayName;
      batch.parsing--;
      item.progress = 30; // 解析完成，等待下載

      log.info('[批量] 解析成功:', { url: item.url, title: videoInfo.title });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      item.error = err.message;
      item.status = 'failed';
      batch.parsing--;
      batch.failed++;
      log.warn('[批量] 解析失敗:', { url: item.url, error: err.message });
      throw error; // 拋出以觸發重試
    }
  }

  /**
   * 下載單個項目
   */
  private async downloadItem(item: BatchItem, batch: BatchTask): Promise<void> {
    try {
      const filename = this.generateFilename(item);
      const outputPath = path.join(getDownloadDir(), filename);

      // 使用下載管理器執行下載
      const actualPath = await downloadManager.download(item.url, {
        onProgress: (p) => {
          // 把下載進度（0-100）對應到 30-95
          item.progress = 30 + Math.round(p.progress * 0.65);
          this.emitProgress(batch);
        },
      });

      item.outputPath = actualPath;
      item.fileSize = fs.existsSync(actualPath) ? fs.statSync(actualPath).size : 0;
      item.status = 'completed';
      item.progress = 100;
      batch.totalBytes += item.fileSize || 0;
      batch.downloading--;
      batch.completed++;

      log.info('[批量] 下載成功:', { url: item.url, size: item.fileSize });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      item.error = err.message;
      item.status = 'failed';
      batch.downloading--;
      batch.failed++;
      log.warn('[批量] 下載失敗:', { url: item.url, error: err.message });
      throw error;
    }
  }

  /**
   * 生成檔名
   */
  private generateFilename(item: BatchItem): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');

    const vars: Record<string, string> = {
      platform: item.platform.displayName,
      title: (item.title || 'untitled')
        .replace(/[\\/:*?"<>|]/g, '')  // 移除非法字元
        .slice(0, 50),                 // 限制長度
      index: String(batch_index++).padStart(3, '0'),
      date: `${dateStr}_${timeStr}`,
    };

    return `${vars.platform}_${vars.title}_${vars.date}.mp4`;
  }

  /**
   * 推送進度事件
   */
  private emitProgress(batch: BatchTask): void {
    // 重算統計
    batch.parsing = batch.items.filter((i) => i.status === 'parsing').length;
    batch.downloading = batch.items.filter((i) => i.status === 'downloading').length;
    batch.completed = batch.items.filter((i) => i.status === 'completed').length;
    batch.failed = batch.items.filter((i) => i.status === 'failed').length;

    this.emit('progress', batch);
  }
}

// 全域計數器（避免重複檔名）
let batch_index = 0;

// 匯出單例
export const batchDownloadManager = new BatchDownloadManager();
