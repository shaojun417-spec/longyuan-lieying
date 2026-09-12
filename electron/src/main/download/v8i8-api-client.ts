/**
 * v8i8.com API 客戶端（保留供學習參考，目前主流程不再依賴此檔）
 *
 * ⚠️ 本檔案已被 deprecated：
 * - 主流程已改用「本地解析提供者」（providers/）
 * - 保留它是為了：
 *   1. 開發者除錯時手動測試 v8i8 API
 *   2. 學習對象的程式碼範例
 * - 千萬不要在主下載流程中 import 此檔案！
 *
 * 為什麼不再用 v8i8？
 * - v8i8 是第三方網站，依賴它等於把用戶體驗交到別人手裡
 * - 我們要打造「不依賴任何人」的本地解析
 *
 * v8i8 可參考的 API 端點（用瀏覽器開發者工具觀察得到）：
 * - GET https://v8i8.com/api/video-info?url=<url>
 * - GET https://v8i8.com/api/download-progress?url=<url>&...
 * - GET https://v8i8.com/api/serve-file?filename=<name>
 * - GET https://v8i8.com/api/debug-douyin?url=<url>
 */

import log from 'electron-log';
import { extractUrl, detectPlatformFromUrl } from './url-utils';

const V8I8_BASE_URL = 'https://v8i8.com';

// ===== 類型定義（保留） =====

export interface V8i8VideoInfo {
  url: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  platform?: string;
  embed_url?: string;
  proxy_url?: string;
  cdn_url?: string;
  cdn_audio_url?: string;
  formats?: Array<{
    id: string;
    label: string;
    url: string;
  }>;
  error?: string;
  error_hint?: string;
}

export interface V8i8DownloadProgress {
  type: 'progress' | 'done' | 'error';
  pct?: number;
  msg?: string;
  filename?: string;
  title?: string;
  size_mb?: number;
  platform?: string;
  message?: string;
}

// 保留舊介面以避免外部 import 報錯（相容性 shim）
export type ParseResult = {
  success: boolean;
  data?: V8i8VideoInfo;
  error?: string;
};

// ===== 開發者測試用函式 =====

/**
 * 解析影片 URL（手動除錯用）
 *
 * 注意：此函式實際呼叫 v8i8 伺服器，**只供開發者手動測試**，
 * 主下載流程不應該呼叫這個。
 */
export async function parseVideoViaV8i8(
  url: string,
  signal?: AbortSignal
): Promise<ParseResult> {
  // 先標準化 URL
  const cleanUrl = extractUrl(url);
  if (!cleanUrl) {
    return { success: false, error: '找不到有效的網址' };
  }

  log.info('[v8i8-dev] 解析影片:', cleanUrl);

  try {
    const apiUrl = `${V8I8_BASE_URL}/api/video-info?url=${encodeURIComponent(cleanUrl)}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': V8I8_BASE_URL + '/',
      },
      signal,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `v8i8 API 錯誤: HTTP ${response.status}`,
      };
    }

    const data = await response.json() as V8i8VideoInfo;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '解析失敗',
    };
  }
}

/**
 * 取得裝置 ID（手動除錯用）
 */
function getDeviceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 取得 v8i8 的實際檔案 URL（手動除錯用）
 */
export function getV8i8FileUrl(filename: string): string {
  return `${V8I8_BASE_URL}/api/serve-file?filename=${encodeURIComponent(filename)}&cleanup=true`;
}

// 注意：舊的 v8i8Client 已經移除。
// 主流程請改用 providers/plain-http-provider.ts
