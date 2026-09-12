/**
 * 短影片平台解析器
 * 
 * 支援平台：
 * - 抖音 (douyin.com)
 * - 小紅書 (xiaohongshu.com)
 * - TikTok (tiktok.com)
 * 
 * 直接呼叫平台 API 取得無水印影片 URL
 */

import log from 'electron-log';

// ===== 類型定義 =====

export interface ParsedVideo {
  url: string;           // 無水印影片 URL
  title: string;         // 影片標題
  cover?: string;        // 封面圖
  duration?: number;     // 時長（秒）
  width?: number;        // 寬度
  height?: number;       // 高度
  platform: 'douyin' | 'xiaohongshu' | 'tiktok' | 'kuaishou' | 'unknown';
  author?: string;       // 作者暱稱
  authorId?: string;     // 作者 ID
  videoId: string;       // 影片 ID
  createTime?: number;   // 創建時間
}

export interface ParseResult {
  success: boolean;
  data?: ParsedVideo;
  error?: string;
}

// ===== 平台檢測 =====

/**
 * 檢測 URL 屬於哪個平台
 */
export function detectPlatform(url: string): 'douyin' | 'xiaohongshu' | 'tiktok' | 'kuaishou' | 'unknown' {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('douyin.com')) return 'douyin';
  if (lowerUrl.includes('xiaohongshu.com') || lowerUrl.includes('xhslink.com')) return 'xiaohongshu';
  if (lowerUrl.includes('tiktok.com')) return 'tiktok';
  if (lowerUrl.includes('kuaishou.com')) return 'kuaishou';
  
  return 'unknown';
}

/**
 * 從 URL 中提取影片 ID
 */
export function extractVideoId(url: string, platform: string): string | null {
  // 抖音：支持多種 URL 格式
  // https://www.douyin.com/video/7324567890123456789
  // https://v.douyin.com/abc123
  // https://www.douyin.com/discover?modal_id=7324567890123456789
  if (platform === 'douyin') {
    // 短網址格式
    const shortMatch = url.match(/v\.douyin\.com\/([a-zA-Z0-9]+)/);
    if (shortMatch) return shortMatch[1];
    
    // 完整網址格式
    const videoMatch = url.match(/\/video\/(\d+)/);
    if (videoMatch) return videoMatch[1];
    
    // modal_id 參數
    const modalMatch = url.match(/modal_id=(\d+)/);
    if (modalMatch) return modalMatch[1];
  }
  
  // 小紅書
  // https://www.xiaohongshu.com/explore/abc123def456
  // https://xhslink.com/xxx
  if (platform === 'xiaohongshu') {
    const noteMatch = url.match(/\/explore\/([a-zA-Z0-9]+)/);
    if (noteMatch) return noteMatch[1];
    
    const userMatch = url.match(/\/user\/profile\/(\w+)/);
    if (userMatch) return userMatch[1];
  }
  
  // TikTok
  // https://www.tiktok.com/@user/video/7324567890123456789
  if (platform === 'tiktok') {
    const videoMatch = url.match(/\/video\/(\d+)/);
    if (videoMatch) return videoMatch[1];
  }
  
  // 快手
  // https://www.kuaishou.com/short-video/abc123
  if (platform === 'kuaishou') {
    const shortMatch = url.match(/\/short-video\/(\w+)/);
    if (shortMatch) return shortMatch[1];
  }
  
  return null;
}

// ===== 抖音解析 =====

/**
 * 抖音 API 請求頭（模擬瀏覽器請求）
 */
function getDouyinHeaders(): Record<string, string> {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.douyin.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cookie': '', // 需要真實 Cookie 才能訪問
  };
}

/**
 * 解析抖音影片
 * 
 * API: https://www.douyin.com/aweme/v1/web/aweme/detail/
 */
export async function parseDouyin(url: string): Promise<ParseResult> {
  log.info('[解析] 抖音:', url);
  
  try {
    // 提取影片 ID
    const videoId = extractVideoId(url, 'douyin');
    if (!videoId) {
      return { success: false, error: '無法從 URL 提取影片 ID' };
    }
    
    log.info('[解析] 抖音影片 ID:', videoId);
    
    // 呼叫抖音 API
    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=6383&channel=channel_pc_web&pc_client_type=1&version_code=190500&version_name=19.5.0&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-TW&browser_platform=Win32&browser_name=Chrome&browser_version=120.0.0.0`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: getDouyinHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`API 錯誤: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.aweme_detail) {
      return { success: false, error: 'API 回應中沒有找到影片資訊' };
    }
    
    const aweme = data.aweme_detail;
    
    // 取得無水印 URL（url_list[2] 通常是無水印）
    let videoUrl = '';
    if (aweme.video?.play_addr?.url_list) {
      // 優先使用 url_list[2]（通常是高畫質無水印）
      videoUrl = aweme.video.play_addr.url_list[2] || 
                 aweme.video.play_addr.url_list[1] || 
                 aweme.video.play_addr.url_list[0];
    } else if (aweme.video?.download_addr?.url_list) {
      videoUrl = aweme.video.download_addr.url_list[0];
    }
    
    if (!videoUrl) {
      return { success: false, error: '無法取得影片 URL' };
    }
    
    // 轉換 HTTP 為 HTTPS
    videoUrl = videoUrl.replace('http://', 'https://');
    
    const result: ParsedVideo = {
      url: videoUrl,
      title: aweme.desc || '抖音影片',
      cover: aweme.video?.cover?.url_list?.[0] || '',
      duration: Math.round((aweme.video?.duration || 0) / 1000),
      width: aweme.video?.play_addr?.width || 0,
      height: aweme.video?.play_addr?.height || 0,
      platform: 'douyin',
      author: aweme.author?.nickname || '',
      authorId: String(aweme.author?.uid || ''),
      videoId: String(aweme.aweme_id || videoId),
      createTime: aweme.create_time ? aweme.create_time * 1000 : undefined,
    };
    
    log.info('[解析] 抖音成功:', result.title);
    return { success: true, data: result };
    
  } catch (error) {
    log.error('[解析] 抖音失敗:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '解析失敗'
    };
  }
}

// ===== 小紅書解析 =====

/**
 * 小紅書 API 請求頭
 */
function getXiaohongshuHeaders(): Record<string, string> {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.xiaohongshu.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'X-Requested-With': 'XMLHttpRequest',
  };
}

/**
 * 解析小紅書
 */
export async function parseXiaohongshu(url: string): Promise<ParseResult> {
  log.info('[解析] 小紅書:', url);
  
  try {
    // 小紅書需要登入 cookie，嘗試直接 fetch
    const response = await fetch(url, {
      method: 'GET',
      headers: getXiaohongshuHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // 從 HTML 中提取 __INITIAL_STATE__
    const match = html.match(/<script>window\.__INITIAL_STATE__\s*=\s*(\{.*?\})<\/script>/s);
    if (!match) {
      return { success: false, error: '無法解析頁面' };
    }
    
    const state = JSON.parse(match[1].replace(/undefined/g, 'null'));
    
    // 提取影片資訊
    const note = state.note?.noteDetailMap;
    if (!note) {
      return { success: false, error: '無法取得筆記資訊' };
    }
    
    const noteId = Object.keys(note)[0];
    const noteData = note[noteId];
    
    if (!noteData?.note?.video) {
      return { success: false, error: '這不是影片或無法解析' };
    }
    
    const video = noteData.note.video;
    
    const result: ParsedVideo = {
      url: video.mediaStream?.streamUrl?.h265?.[0]?.masterUrl || 
           video.mediaStream?.streamUrl?.h264?.[0]?.masterUrl || 
           '',
      title: noteData.note.title || noteData.note.desc || '小紅書影片',
      cover: noteData.note.imageList?.[0]?.urlDefault || '',
      duration: video.duration || 0,
      platform: 'xiaohongshu',
      author: noteData.note.user?.nickname || '',
      authorId: noteData.note.user?.userId || '',
      videoId: noteId,
    };
    
    if (!result.url) {
      return { success: false, error: '無法取得影片 URL' };
    }
    
    log.info('[解析] 小紅書成功:', result.title);
    return { success: true, data: result };
    
  } catch (error) {
    log.error('[解析] 小紅書失敗:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '解析失敗'
    };
  }
}

// ===== 統一解析入口 =====

/**
 * 解析任意平台的影片 URL
 */
export async function parseVideoUrl(url: string): Promise<ParseResult> {
  const platform = detectPlatform(url);
  
  log.info('[解析] 開始解析:', { url, platform });
  
  switch (platform) {
    case 'douyin':
      return parseDouyin(url);
    case 'xiaohongshu':
      return parseXiaohongshu(url);
    default:
      return { success: false, error: `不支援的平台: ${platform}` };
  }
}

// ===== 匯出 =====

export const videoParser = {
  detectPlatform,
  extractVideoId,
  parseVideoUrl,
  parseDouyin,
  parseXiaohongshu,
};

export default videoParser;
