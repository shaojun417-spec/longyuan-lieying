/**
 * URL 工具函數
 *
 * 把 v8i8-api-client.ts 裡的非 v8i8 依賴部分抽出，
 * 這樣其他解析提供者也能用，不會不小心耦合到 v8i8。
 */

/**
 * 從用戶貼上的內容中提取網址
 *
 * 用戶可能貼：
 * - 純網址: https://v.douyin.com/abc/
 * - 分享文字: "5.99 复制打开抖音，看看【xxx】 https://v.douyin.com/abc/ 复制..."
 */
export function extractUrl(text: string): string | null {
  if (!text) return null;

  // 匹配 http/https 開頭的網址
  const match = text.match(/https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/);
  if (match) {
    // 移除尾部標點
    return match[0].replace(/[,，。！？、]+$/, '').trim();
  }

  // 已經是純網址
  if (text.trim().startsWith('http')) {
    return text.trim();
  }

  return null;
}

/**
 * 檢測 URL 屬於哪個平台（用於 UI 顯示與分流）
 */
export function detectPlatformFromUrl(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('douyin.com')) return 'douyin';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('bilibili.com') || u.includes('b23.tv')) return 'bilibili';
  if (u.includes('xiaohongshu.com') || u.includes('xhslink.com')) return 'xiaohongshu';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('shopee')) return 'shopee';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'facebook';
  if (u.includes('toutiao.com')) return 'toutiao';
  if (u.includes('ixigua.com')) return 'xigua';
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x';
  if (u.includes('weibo.com') || u.includes('weibo.cn')) return 'weibo';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('threads.')) return 'threads';
  return 'unknown';
}
