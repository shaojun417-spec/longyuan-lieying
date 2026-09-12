/**
 * 並行佇列（限制並發數）
 *
 * 用途：批量處理多個任務，但限制同時執行的數量，
 *       避免觸發平台反爬蟲（如抖音 1 秒最多 3 個請求）
 *
 * 使用範例：
 * ```typescript
 * const queue = new ConcurrencyQueue<string>(5); // 最多 5 並行
 *
 * for (const url of urls) {
 *   queue.add(async () => {
 *     return await parseVideo(url);
 *   });
 * }
 *
 * await queue.waitAll(); // 等待全部完成
 * ```
 */

/** 任務函數（返回 Promise） */
export type TaskFn<T = void> = () => Promise<T>;

interface QueueOptions {
  /** 最大並發數 */
  maxConcurrency: number;
  /** 每個任務失敗時的重試次數（0 = 不重試） */
  maxRetries?: number;
  /** 重試延遲（毫秒，預設 2000） */
  retryDelay?: number;
  /** 進度回調（每個任務完成時觸發） */
  onTaskComplete?: (result: TaskResult) => void;
  /** 失敗回調 */
  onTaskError?: (error: Error, retriesLeft: number) => void;
}

export interface TaskResult {
  /** 任務索引 */
  index: number;
  /** 是否成功 */
  success: boolean;
  /** 錯誤訊息 */
  error?: string;
  /** 重試次數 */
  retries: number;
  /** 耗時（毫秒） */
  duration: number;
}

export class ConcurrencyQueue<T = void> {
  private queue: Array<{
    index: number;
    task: TaskFn<T>;
    retries: number;
    startTime: number;
  }> = [];

  private running = 0;
  private maxConcurrency: number;
  private maxRetries: number;
  private retryDelay: number;
  private onTaskComplete?: (result: TaskResult) => void;
  private onTaskError?: (error: Error, retriesLeft: number) => void;

  /** 已完成的任務數 */
  private completed = 0;
  private resolveAll: (() => void) | null = null;
  private rejectAll: ((err: Error) => void) | null = null;

  constructor(options: QueueOptions) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency);
    this.maxRetries = options.maxRetries ?? 0;
    this.retryDelay = options.retryDelay ?? 2000;
    this.onTaskComplete = options.onTaskComplete;
    this.onTaskError = options.onTaskError;
  }

  /**
   * 加入任務到佇列
   */
  add(task: TaskFn<T>): void {
    this.queue.push({
      index: this.completed + this.running + this.queue.length,
      task,
      retries: 0,
      startTime: Date.now(),
    });
  }

  /**
   * 開始處理佇列（呼叫後會啟動 worker）
   */
  async run(): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    return new Promise((resolve, reject) => {
      this.resolveAll = () => resolve(results);
      this.rejectAll = reject;

      // 啟動 workers
      for (let i = 0; i < this.maxConcurrency; i++) {
        this.processNext(results);
      }
    });
  }

  /**
   * 等待所有任務完成（佇列已啟動的情況）
   */
  async waitAll(): Promise<TaskResult[]> {
    if (this.queue.length === 0 && this.running === 0) {
      return [];
    }
    return this.run();
  }

  /**
   * 取得當前進度
   */
  getProgress(): { total: number; running: number; queued: number; completed: number } {
    return {
      total: this.completed + this.running + this.queue.length,
      running: this.running,
      queued: this.queue.length,
      completed: this.completed,
    };
  }

  // ===== 私有方法 =====

  private processNext(results: TaskResult[]): void {
    // 已無任務且沒有正在執行
    if (this.queue.length === 0 || this.running >= this.maxConcurrency) {
      if (this.running === 0 && this.resolveAll) {
        this.resolveAll();
        return;
      }
      return;
    }

    const item = this.queue.shift()!;
    this.running++;
    this.executeTask(item, results);
  }

  private async executeTask(
    item: { index: number; task: TaskFn<T>; retries: number; startTime: number },
    results: TaskResult[]
  ): Promise<void> {
    try {
      await item.task();
      const result: TaskResult = {
        index: item.index,
        success: true,
        retries: item.retries,
        duration: Date.now() - item.startTime,
      };
      results.push(result);
      this.completed++;
      this.onTaskComplete?.(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // 檢查是否要重試
      if (item.retries < this.maxRetries) {
        const retriesLeft = this.maxRetries - item.retries;
        this.onTaskError?.(err, retriesLeft);

        // 指數退避：1s, 2s, 4s, 8s...
        const delay = this.retryDelay * Math.pow(2, item.retries);
        await this.sleep(delay);

        // 重新加入佇列
        this.queue.push({
          ...item,
          retries: item.retries + 1,
        });
      } else {
        // 已達最大重試次數，標記為失敗
        const result: TaskResult = {
          index: item.index,
          success: false,
          error: err.message,
          retries: item.retries,
          duration: Date.now() - item.startTime,
        };
        results.push(result);
        this.completed++;
        this.onTaskComplete?.(result);
      }
    } finally {
      this.running--;
      this.processNext(results);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
