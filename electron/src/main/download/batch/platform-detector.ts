/**
 * 平台偵測器
 *
 * 根據 URL 自動識別是哪個平台，決定使用哪個引擎
 */

export type Platform =
  | 'douyin'        // 抖音
  | 'xiaohongshu'   // 小紅書
  | 'kuaishou'      // 快手
  | 'bilibili'      // B站
  | 'youtube'       // YouTube
  | 'twitter'       // Twitter / X
  | 'instagram'     // Instagram
  | 'threads'       // Threads
  | 'tiktok'        // TikTok
  | 'facebook'      // Facebook
  | 'vimeo'         // Vimeo
  | 'taobao'        // 淘寶
  | 'shopee'        // 蝦皮
  | 'unknown';

/**
 * 引擎類型
 *
 * 注意：App 用解析提供者（providers）而非「引擎」，這裡保留類型是
 * 為相容 UI 顯示。實際解析鏈在 download-manager.ts 內。
 */
export type EngineType =
  | 'plain-http'    // 純 HTTP 解析提供者
  | 'provider-chain' // 提供者鏈（依序嘗試）
  | 'local';        // 本地解析（需要登入 cookie 才能用）

interface PlatformRule {
  /** 平台名稱 */
  platform: Platform;
  /** 引擎類型 */
  engine: EngineType;
  /** URL 匹配規則（陣列形式，逐一比對） */
  patterns: RegExp[];
  /** 顯示名稱 */
  displayName: string;
  /** 是否支援 */
  supported: boolean;
}

/** 平台規則表（按優先級排序）
 *
 * 設計原則：用戶**什麼都不用裝**，所有平台都走「解析提供者鏈」。
 * 只要某個平台「目前還沒實作夠強的解析器」時，會被列為 supported: false。
 */
const PLATFORM_RULES: PlatformRule[] = [
  // ===== 抖音 =====
  {
    platform: 'douyin',
    engine: 'provider-chain',
    displayName: '抖音',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?douyin\.com\//i,
      /^https?:\/\/v\.douyin\.com\//i,
      /^https?:\/\/iesdouyin\.com\//i,
    ],
  },
  // ===== 小紅書 =====
  {
    platform: 'xiaohongshu',
    engine: 'provider-chain',
    displayName: '小紅書',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?xiaohongshu\.com\//i,
      /^https?:\/\/xhslink\.com\//i,
    ],
  },
  // ===== 快手 =====
  {
    platform: 'kuaishou',
    engine: 'provider-chain',
    displayName: '快手',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?kuaishou\.com\//i,
      /^https?:\/\/v\.kuaishou\.com\//i,
    ],
  },
  // ===== B站 =====
  {
    platform: 'bilibili',
    engine: 'provider-chain',
    displayName: 'B站',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?bilibili\.com\//i,
      /^https?:\/\/b23\.tv\//i,
    ],
  },
  // ===== YouTube =====
  {
    platform: 'youtube',
    engine: 'provider-chain',
    displayName: 'YouTube',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?youtube\.com\//i,
      /^https?:\/\/youtu\.be\//i,
      /^https?:\/\/m\.youtube\.com\//i,
    ],
  },
  // ===== TikTok =====
  {
    platform: 'tiktok',
    engine: 'provider-chain',
    displayName: 'TikTok',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?tiktok\.com\//i,
      /^https?:\/\/vm\.tiktok\.com\//i,
    ],
  },
  // ===== Twitter / X =====
  {
    platform: 'twitter',
    engine: 'provider-chain',
    displayName: 'Twitter',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?twitter\.com\//i,
      /^https?:\/\/(?:www\.)?x\.com\//i,
      /^https?:\/\/t\.co\//i,
    ],
  },
  // ===== Instagram =====
  {
    platform: 'instagram',
    engine: 'provider-chain',
    displayName: 'Instagram',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?instagram\.com\//i,
    ],
  },
  // ===== Threads =====
  {
    platform: 'threads',
    engine: 'provider-chain',
    displayName: 'Threads',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?threads\.(?:net|com)\//i,
      /^https?:\/\/threads\.ml\//i,
    ],
  },
  // ===== Facebook =====
  {
    platform: 'facebook',
    engine: 'provider-chain',
    displayName: 'Facebook',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?facebook\.com\//i,
      /^https?:\/\/fb\.watch\//i,
    ],
  },
  // ===== Vimeo =====
  {
    platform: 'vimeo',
    engine: 'provider-chain',
    displayName: 'Vimeo',
    supported: true,
    patterns: [
      /^https?:\/\/(?:www\.)?vimeo\.com\//i,
    ],
  },
  // ===== 淘寶 =====
  {
    platform: 'taobao',
    engine: 'local',
    displayName: '淘寶',
    supported: false, // 需要登入 + 瀏覽器自動化（未實作）
    patterns: [
      /^https?:\/\/(?:www\.)?taobao\.com\//i,
      /^https?:\/\/item\.taobao\.com\//i,
      /^https?:\/\/detail\.tmall\.com\//i,
    ],
  },
  // ===== 蝦皮 =====
  {
    platform: 'shopee',
    engine: 'local',
    displayName: '蝦皮',
    supported: false, // 需要登入 + 瀏覽器自動化（未實作）
    patterns: [
      /^https?:\/\/(?:www\.)?shopee\./i,
      /^https?:\/\/shp\.ee\//i,
      /^https?:\/\/s\.shopee\./i,
    ],
  },
];

export interface PlatformInfo {
  platform: Platform;
  engine: EngineType;
  displayName: string;
  supported: boolean;
}

/**
 * 偵測 URL 屬於哪個平台
 */
export function detectPlatform(url: string): PlatformInfo {
  for (const rule of PLATFORM_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(url)) {
        return {
          platform: rule.platform,
          engine: rule.engine,
          displayName: rule.displayName,
          supported: rule.supported,
        };
      }
    }
  }

  return {
    platform: 'unknown',
    engine: 'provider-chain', // 未知的也走解析提供者鏈
    displayName: '未知',
    supported: false,
  };
}

/**
 * 批次偵測多個 URL 的平台
 */
export function detectPlatforms(urls: string[]): PlatformInfo[] {
  return urls.map(detectPlatform);
}

/**
 * 取得所有支援的平台列表
 */
export function getSupportedPlatforms(): Array<{
  platform: Platform;
  displayName: string;
  engine: EngineType;
}> {
  return PLATFORM_RULES
    .filter((rule) => rule.supported)
    .map((rule) => ({
      platform: rule.platform,
      displayName: rule.displayName,
      engine: rule.engine,
    }));
}

/**
 * 將平台分組（用於並行解析時的引擎分流）
 */
export function groupByEngine(
  urls: string[]
): Map<EngineType, Array<{ url: string; info: PlatformInfo }>> {
  const groups = new Map<EngineType, Array<{ url: string; info: PlatformInfo }>>();

  for (const url of urls) {
    const info = detectPlatform(url);
    if (!groups.has(info.engine)) {
      groups.set(info.engine, []);
    }
    groups.get(info.engine)!.push({ url, info });
  }

  return groups;
}
