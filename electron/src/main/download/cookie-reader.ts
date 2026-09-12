/**
 * Chrome Cookie 讀取器
 * 
 * 從 Chrome 瀏覽器讀取登入狀態（Cookie）
 */

import { app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';

/**
 * 讀取 Chrome Cookie 資料庫
 * 
 * Chrome 把 Cookie 存在 SQLite 資料庫中
 */

// Chrome Cookie 資料庫路徑
function getChromeCookiePath(): string {
  // Windows: %LOCALAPPDATA%\Google\Chrome\User Data
  const basePath = process.env.LOCALAPPDATA || 
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  
  // 嘗試多個 Chrome 配置
  const profiles = [
    'Default',
    'Profile 1',
    'Profile 2', 
    'Profile 3',
    'Profile 4',
  ];
  
  for (const profile of profiles) {
    const cookiePath = path.join(
      basePath,
      'Google', 'Chrome', 'User Data',
      profile,
      'Network', 'Cookies'
    );
    
    if (fs.existsSync(cookiePath)) {
      log.info('[Cookie] 找到 Chrome 配置:', profile);
      return cookiePath;
    }
  }
  
  // 回退到 Default
  return path.join(basePath, 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies');
}

/**
 * Cookie 結構
 */
export interface ChromeCookie {
  host_key: string;
  name: string;
  value: string;
  path: string;
  expires_utc: number;
  is_secure: boolean;
  is_httponly: boolean;
  same_party: number;
  priority: number;
  encrypted_value: string;
  has_restrictions: boolean;
  session: boolean;
  same_site: string;
}

/**
 * 從 Chrome 讀取特定網站的 Cookie
 * 
 * @param domains 要讀取的域名，例如 ['douyin.com', 'xiaohongshu.com']
 * @returns 合併後的 Cookie 字串
 */
export async function getChromeCookies(domains: string[]): Promise<string> {
  log.info('[Cookie] 開始讀取 Chrome Cookie');
  log.info('[Cookie] 目標域名:', domains);
  
  const cookiePath = getChromeCookiePath();
  
  // 檢查檔案是否存在
  if (!fs.existsSync(cookiePath)) {
    log.error('[Cookie] Cookie 資料庫不存在:', cookiePath);
    throw new Error('找不到 Chrome Cookie 資料庫，請確認 Chrome 已關閉');
  }
  
  // 檢查 Chrome 是否正在運行（鎖定檔案）
  const lockPath = cookiePath + '.lock';
  if (fs.existsSync(lockPath)) {
    log.warn('[Cookie] Chrome 正在運行，Cookie 資料庫被鎖定');
    throw new Error('請先關閉 Chrome 瀏覽器後再試');
  }
  
  // 嘗試讀取 SQLite 資料庫
  try {
    // 動態導入 better-sqlite3
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(cookiePath, { readonly: true });
    
    const cookies: ChromeCookie[] = [];
    
    // 查詢每個域名的 Cookie
    for (const domain of domains) {
      const pattern = domain.startsWith('.') ? domain : `%${domain}`;
      const results = db.prepare(`
        SELECT host_key, name, value, path, expires_utc, 
               is_secure, is_httponly, same_party, priority,
               encrypted_value, has_restrictions, session, same_site
        FROM cookies 
        WHERE host_key LIKE ?
        ORDER BY creation_utc DESC
      `).all(`%${domain}`) as ChromeCookie[];
      
      cookies.push(...results);
    }
    
    db.close();
    
    // 轉換為 Cookie 字串
    const cookieString = cookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ');
    
    log.info('[Cookie] 成功讀取', cookies.length, '個 Cookie');
    
    return cookieString;
    
  } catch (error) {
    // 如果 better-sqlite3 不可用，嘗試其他方法
    log.warn('[Cookie] better-sqlite3 不可用:', error);
    
    // 方法 2: 使用 Chrome 的 --remote-debugging-port
    return await getCookiesViaDevTools(domains);
  }
}

/**
 * 透過 Chrome DevTools Protocol 讀取 Cookie
 * 需要 Chrome 以 --remote-debugging-port=9222 啟動
 */
async function getCookiesViaDevTools(domains: string[]): Promise<string> {
  log.info('[Cookie] 嘗試透過 DevTools Protocol 讀取');
  
  try {
    // 連接到 Chrome
    const response = await fetch('http://localhost:9222/json');
    if (!response.ok) {
      throw new Error('無法連接到 Chrome DevTools');
    }
    
    const tabs = await response.json();
    const cookieTab = tabs.find((tab: any) => 
      tab.url && domains.some(d => tab.url.includes(d))
    );
    
    if (!cookieTab) {
      throw new Error('找不到目標網站的 Chrome 分頁');
    }
    
    // 執行 CDP 命令獲取 Cookie
    const ws = await import('ws');
    const websocket = new ws.default(`ws://localhost:9222${cookieTab.webSocketDebuggerUrl}`);
    
    return new Promise((resolve, reject) => {
      let result = '';
      
      websocket.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Network.getCookies') {
          result = msg.params.cookies
            .map((c: any) => `${c.name}=${c.value}`)
            .join('; ');
          websocket.close();
          resolve(result);
        }
      });
      
      websocket.on('error', reject);
      
      // 發送請求
      websocket.on('open', () => {
        websocket.send(JSON.stringify({
          id: 1,
          method: 'Network.getCookies',
          params: { urls: domains.map(d => `https://${d}`) }
        }));
      });
      
      // 超時
      setTimeout(() => {
        websocket.close();
        reject(new Error('讀取 Cookie 超時'));
      }, 5000);
    });
    
  } catch (error) {
    log.error('[Cookie] DevTools 方法也失敗了:', error);
    throw new Error('無法讀取 Chrome Cookie：\n1. 請關閉 Chrome 後重試\n2. 或手動複製 Cookie');
  }
}

/**
 * 檢查是否需要 Cookie
 */
export function needsCookie(platform: string): boolean {
  // 這些平台需要登入 Cookie
  return ['douyin', 'xiaohongshu'].includes(platform);
}

/**
 * 取得指定平台的 Cookie
 */
export async function getPlatformCookies(platform: string): Promise<string> {
  const domainMap: Record<string, string[]> = {
    douyin: ['douyin.com', 'bytedance.com'],
    xiaohongshu: ['xiaohongshu.com', 'xhslink.com'],
    tiktok: ['tiktok.com', 'tiktokcdn.com'],
    kuaishou: ['kuaishou.com', 'kuaishoup.com'],
  };
  
  const domains = domainMap[platform] || [platform];
  return getChromeCookies(domains);
}

// 匯出
export const chromeCookieReader = {
  getChromeCookies,
  getPlatformCookies,
  needsCookie,
};

export default chromeCookieReader;
