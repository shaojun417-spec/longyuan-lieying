/**
 * 影片解析提供者介面
 *
 * 設計目標：
 * - 不耦合到任何外部服務（v8i8、第三方 API）
 * - 不依賴任何外部工具（Python、yt-dlp、FFmpeg）
 * - 每個實作都是「可選的」，可在 App 啟動時註冊
 *
 * 為什麼需要這個介面？
 * - 抖音反爬蟲複雜，不同場景用不同實作
 * - 第一個實作：直接 GET 短網址 302 + 拿到 _signature/hash
 * - 第二個實作：自己算 a-bogus/x-bogus 純算法（package 進 Electron）
 * - 第三個實作：呼叫自家 API（如果未來決定架後端）
 *
 * 使用流程：
 * 1. App 啟動時註冊所有可用的實作
 * 2. 下載管理器依序嘗試，直到成功為止
 * 3. 全部失敗時，提供最後的錯誤訊息給用戶
 */

/** 解析後的影片資訊（與平台無關的標準格式） */
export interface ParsedVideo {
  /** 影片/音訊可下載 URL（可能是 m3u8、mp4、mp3 等） */
  url: string;
  /** 影片標題 */
  title: string;
  /** 封面縮圖 URL */
  cover?: string;
  /** 時長（秒） */
  duration?: number;
  /** 上傳者/作者 */
  author?: string;
  /** 來源平台 */
  platform: string;
  /** 多畫質選項 */
  formats?: Array<{
    id: string;
    label: string;
    url: string;
  }>;
}

/** 解析結果 */
export interface ParseResult {
  success: boolean;
  data?: ParsedVideo;
  error?: string;
  /** 用了哪個實作（debug 用） */
  provider?: string;
}

/** 解析提供者介面 */
export interface ParseProvider {
  /** 提供者名稱 */
  readonly name: string;
  /** 支援的平台列表 */
  readonly supportedPlatforms: string[];
  /** 是否健康（沒壞掉） */
  isHealthy(): Promise<boolean>;
  /** 解析影片網址 */
  parse(url: string, signal?: AbortSignal): Promise<ParseResult>;
}
