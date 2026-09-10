/**
 * 龍淵裂影 - 共用型別定義
 *
 * 包含 main / renderer / preload 三端共用的 interface / type
 */

import type { DownloadProgress } from '../main/model-manager';

// ===== 模型管理 =====

export type { DownloadProgress };

export interface ModelStatus {
  name: string;
  size: number;
  downloaded: boolean;
  path: string;
  url: string;
}

// ===== 硬體偵測 =====

export interface HardwareInfo {
  totalRAM: number;          // GB
  cpuCores: number;
  gpuVRAM: number;           // GB（0 = 沒獨顯）
  recommendedModel: string;
  tier: 'low' | 'mid' | 'high';
}

// ===== 首次啟動狀態 =====

export type FirstRunStep =
  | 'idle'
  | 'detecting-hardware'
  | 'selecting-model'
  | 'downloading'
  | 'ready'
  | 'error';

export interface FirstRunState {
  step: FirstRunStep;
  hardware?: HardwareInfo;
  selectedModel?: string;
  downloadProgress?: DownloadProgress;
  error?: string;
}

// ===== AI 文案生成 =====

/**
 * 使用者輸入：產品資訊
 * 由 UI 表單填寫
 */
export interface ProductInfo {
  product: string;          // 產品名稱（例：「抗老精華液」）
  effect: string;           // 功效（例：「淡化細紋、提亮膚色」）
  audience: string;         // 目標受眾（例：「25-35 歲輕熟女」）
  context: string;          // 使用情境（例：「熬夜後、上妝前」）
}

/**
 * 單支影片的生成結果
 */
export interface GeneratedScript {
  index: number;            // 第幾支（從 1 開始）
  total: number;            // 共幾支
  content: string;          // 口播文案全文
  hook: string;             // 第一句 hook（提取出來方便預覽）
  wordCount: number;        // 字數
  generatedAt: number;      // 時間戳
}

/**
 * 生成請求
 */
export interface GenerateScriptsRequest {
  product: ProductInfo;
  count: number;            // 1-5，通常是 3
  maxAttempts?: number;     // 不相似性檢查的重試次數，預設 3
}

/**
 * 生成回應
 */
export interface GenerateScriptsResponse {
  success: boolean;
  scripts: GeneratedScript[];
  modelUsed: string;        // 用了哪個模型（例：qwen2.5-3b-instruct-q4_k_m）
  totalTimeMs: number;
  error?: string;
}
