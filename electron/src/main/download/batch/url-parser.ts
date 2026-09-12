/**
 * URL 解析工具
 *
 * 從使用者輸入的文字中提取網址列表，支援：
 * - 每行一個網址
 * - 空行自動跳過
 * - # 開頭的行視為註解
 * - 自動去除空白
 * - 從混合文字中提取網址
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

export interface ParseResult {
  urls: string[];
  duplicates: number;       // 重複的數量
  invalid: string[];        // 無效的行（不是網址的）
  total: number;            // 原始行數
}

/**
 * 從文字中提取 URL 列表
 */
export function parseUrlsFromText(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const urls: string[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];
  let duplicates = 0;
  let total = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    total++;

    // 跳過空行、註解
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    // 嘗試從這行提取 URL
    const matches = line.match(URL_PATTERN);

    if (matches && matches.length > 0) {
      for (const url of matches) {
        // 去除尾端的標點符號（常見於純文字中混入 URL）
        const cleanUrl = cleanUrlEnd(url);

        if (!isValidUrl(cleanUrl)) {
          invalid.push(line);
          continue;
        }

        // 去重
        if (seen.has(cleanUrl)) {
          duplicates++;
          continue;
        }

        seen.add(cleanUrl);
        urls.push(cleanUrl);
      }
    } else {
      invalid.push(line);
    }
  }

  return {
    urls,
    duplicates,
    invalid,
    total,
  };
}

/**
 * 從檔案內容讀取 URL
 */
export function parseUrlsFromFile(content: string): ParseResult {
  return parseUrlsFromText(content);
}

/**
 * 清理 URL 尾端常見的標點符號
 * （純文字中常見：「看這個影片 https://... 很精彩。」）
 */
function cleanUrlEnd(url: string): string {
  return url.replace(/[.,;:!?)>\]]+$/, '');
}

/**
 * 驗證 URL 是否有效
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 從 JSON 格式提取 URL（支援抖音收藏、YouTube 播放清單匯出等）
 */
export function parseUrlsFromJson(jsonContent: string): string[] {
  try {
    const data = JSON.parse(jsonContent);
    const urls: string[] = [];

    const extract = (obj: unknown): void => {
      if (typeof obj === 'string') {
        if (isValidUrl(obj)) {
          urls.push(obj);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(extract);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(extract);
      }
    };

    extract(data);
    return Array.from(new Set(urls));
  } catch {
    return [];
  }
}
