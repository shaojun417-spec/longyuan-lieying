/**
 * 純 GET 解析提供者
 *
 * 設計理念：
 * - 不繞任何反爬蟲簽名（不簽 a-bogus、不簽 x-s）
 * - 用 fetch 直接 GET 短網址 / 分享網址
 * - 嘗試從 HTML / 跳轉 / XHR 結果中找影片 URL
 *
 * 能用的情境：
 * - 部分情況下抖音短網址的 302 跳轉回應中包含影片資訊
 * - 部分 YouTube 公開影片可用
 *
 * 不能用的情境：
 * - 抖音正式 API 強制要求 a-bogus（會被 403）
 * - Instagram 多數內容需要登入 cookie
 *
 * 這個 provider 是「保留骨幹」，確保抖音/小紅書真的完全失敗時，
 * 我們至少可以告訴用戶「這個網址無法下載」，而不是什麼都沒做。
 *
 * 為什麼不用 Python？
 * - 用戶拿到 .exe 就該能用，不能要他們裝 Python
 * - Node.js fetch + HTML 解析已能處理 80% 的「拿 metadata」場景
 */

import log from 'electron-log';
import type { ParseProvider, ParseResult, ParsedVideo } from './parse-provider';
import { detectPlatformFromUrl, extractUrl } from '../url-utils';

/** 模擬常見瀏覽器請求頭 */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

class PlainHttpParseProvider implements ParseProvider {
  readonly name = 'plain-http';
  readonly supportedPlatforms = [
    'douyin', 'tiktok', 'youtube', 'xiaohongshu',
    'twitter', 'instagram', 'threads', 'facebook',
  ];

  async isHealthy(): Promise<boolean> {
    return true; // 不需要依賴，永遠可用
  }

  async parse(url: string, signal?: AbortSignal): Promise<ParseResult> {
    const cleanUrl = extractUrl(url);
    if (!cleanUrl) {
      return { success: false, error: '找不到有效的網址', provider: this.name };
    }

    const platform = detectPlatformFromUrl(cleanUrl);
    log.info(`[${this.name}] 解析 ${platform} 網址:`, cleanUrl);

    try {
      // ===== 步驟 1：處理短網址跳轉 =====
      let realUrl = cleanUrl;
      try {
        const redirectRes = await fetch(cleanUrl, {
          method: 'HEAD',
          redirect: 'follow',
          headers: BROWSER_HEADERS,
          signal,
        });
        realUrl = redirectRes.url || cleanUrl;
        log.info(`[${this.name}] 短網址跳轉後:`, realUrl);
      } catch (e) {
        log.warn(`[${this.name}] 短網址跳轉失敗，繼續用原網址:`, e);
      }

      // ===== 步驟 2：GET 網頁內容 =====
      const response = await fetch(realUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: BROWSER_HEADERS,
        signal,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}：該網址需要更進階的解析器（可能已被反爬蟲阻擋）`,
          provider: this.name,
        };
      }

      const html = await response.text();
      log.info(`[${this.name}] 取得 ${html.length} 字元`);

      // ===== 步驟 3：嘗試從 HTML 提取影片 URL =====
      const videoInfo = this.extractFromHtml(html, platform, realUrl);

      if (videoInfo) {
        return { success: true, data: videoInfo, provider: this.name };
      }

      return {
        success: false,
        error: `${platform} 平台需要 a-bogus 簽名參數才能解析，請等待 App 更新內建的解析器`,
        provider: this.name,
      };
    } catch (error) {
      log.error(`[${this.name}] 解析失敗:`, error);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: '解析已取消', provider: this.name };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : '未知錯誤',
        provider: this.name,
      };
    }
  }

  /**
   * 從 HTML 中提取影片資訊
   *
   * 這裡不簽任何 a-bogus，因為：
   * - 我們只是 GET 網頁，看 public 可訪問的部分
   * - 大多數平台都會在 HTML 嵌入 metadata 以便分享卡片預覽
   */
  private extractFromHtml(html: string, platform: string, url: string): ParsedVideo | null {
    // 方法 1：OG / Twitter Card metadata
    const ogVideo = this.extractMeta(html, ['og:video', 'og:video:url', 'og:video:secure_url']);
    if (ogVideo) {
      return {
        url: ogVideo,
        title: this.extractMeta(html, ['og:title']) || '未知標題',
        cover: this.extractMeta(html, ['og:image']),
        platform,
      };
    }

    // 方法 2：JSON-LD
    const jsonLdMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (ld.contentUrl || ld['@graph']?.contentUrl) {
          return {
            url: ld.contentUrl || ld['@graph'].contentUrl,
            title: ld.name || '未知標題',
            cover: ld.thumbnailUrl,
            platform,
          };
        }
      } catch (e) {
        // JSON 解析失敗就跳過
      }
    }

    // 方法 3：抖音網頁版 window._ROUTER_DATA 或 INIT_DATA
    const routerMatch = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});/);
    if (routerMatch) {
      try {
        const data = JSON.parse(routerMatch[1]);
        const url2 = this.walkForVideoUrl(data);
        if (url2) {
          const titleMatch = html.match(/<title>([^<]+)<\/title>/);
          return {
            url: url2,
            title: titleMatch?.[1]?.trim() || '抖音影片',
            platform,
          };
        }
      } catch (e) {
        // 跳過
      }
    }

    // 方法 4：找 mp4 / m3u8 URL
    const videoUrlMatch = html.match(/(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)(\?[^\s"'<>]*)?)/i);
    if (videoUrlMatch) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      return {
        url: videoUrlMatch[1],
        title: titleMatch?.[1]?.trim() || '影片',
        platform,
      };
    }

    return null;
  }

  /** 提取 <meta property="X" content="Y"> */
  private extractMeta(html: string, properties: string[]): string | null {
    for (const prop of properties) {
      const m = html.match(new RegExp(`<meta\\s+property=["']${prop}["']\\s+content=["']([^"']+)["']`, 'i'));
      if (m) return m[1];
      const m2 = html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${prop}["']`, 'i'));
      if (m2) return m2[1];
      // name="twitter:image" 等
      const m3 = html.match(new RegExp(`<meta\\s+name=["']${prop}["']\\s+content=["']([^"']+)["']`, 'i'));
      if (m3) return m3[1];
    }
    return null;
  }

  /** 從 JSON 樹中找出影片 URL */
  private walkForVideoUrl(obj: any, depth = 0): string | null {
    if (depth > 8 || !obj || typeof obj !== 'object') return null;

    // 抖音格式：play_addr.url_list[0]
    if (obj.play_addr?.url_list && Array.isArray(obj.play_addr.url_list)) {
      const url = obj.play_addr.url_list.find((u: string) => typeof u === 'string' && !u.includes('watermark'));
      if (url) return url;
    }
    if (obj.bit_rate?.[0]?.play_addr?.url_list?.[0]) {
      return obj.bit_rate[0].play_addr.url_list[0];
    }
    // 一般 videoUrl
    if (typeof obj.videoUrl === 'string' && obj.videoUrl.startsWith('http')) {
      return obj.videoUrl;
    }
    // 一般 video url
    if (typeof obj.url === 'string' && obj.url.startsWith('http') && /\.(mp4|m3u8)/i.test(obj.url)) {
      return obj.url;
    }

    // 遞迴
    for (const key of Object.keys(obj)) {
      if (key.startsWith('_')) continue;
      const result = this.walkForVideoUrl(obj[key], depth + 1);
      if (result) return result;
    }
    return null;
  }
}

export const plainHttpProvider = new PlainHttpParseProvider();
export default plainHttpProvider;
