/**
 * 硬體偵測模組
 * 用於偵測電腦的 RAM、CPU、GPU 等資訊，來推薦適合的 AI 模型
 */

import * as si from 'systeminformation';
import log from 'electron-log';

export interface HardwareInfo {
  totalRAM: number;        // 單位：GB
  availableRAM: number;     // 單位：GB
  cpuCores: number;         // CPU 核心數
  cpuModel: string;         // CPU 型號
  gpuVRAM: number;          // GPU VRAM，單位：GB（如果有的話）
  gpuModel: string;         // GPU 型號
  os: string;               // 作業系統
}

export interface ModelRecommendation {
  modelTier: 'low' | 'medium' | 'high';
  recommendedModel: string;
  description: string;
}

/**
 * 偵測電腦硬體資訊
 */
export async function detectHardware(): Promise<HardwareInfo> {
  log.info('開始偵測硬體資訊...');

  try {
    // 並行取得所有硬體資訊
    const [cpuData, memData, graphicsData, osData] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.graphics(),
      si.osInfo(),
    ]);

    // 計算 GPU VRAM（取第一張顯示卡的 VRAM）
    const gpu = graphicsData.controllers[0];
    const gpuVRAM = gpu?.vram ?? 0;

    const hardwareInfo: HardwareInfo = {
      totalRAM: Math.round(memData.total / (1024 * 1024 * 1024)), // 轉換成 GB
      availableRAM: Math.round(memData.available / (1024 * 1024 * 1024)),
      cpuCores: cpuData.cores,
      cpuModel: `${cpuData.manufacturer} ${cpuData.brand}`,
      gpuVRAM: gpuVRAM,
      gpuModel: gpu?.model ?? '無獨立顯卡',
      os: `${osData.distro} ${osData.release}`,
    };

    log.info('硬體偵測完成:', hardwareInfo);
    return hardwareInfo;

  } catch (error) {
    log.error('硬體偵測失敗:', error);
    // 如果偵測失敗，回傳預設值
    return {
      totalRAM: 8,
      availableRAM: 4,
      cpuCores: 4,
      cpuModel: 'Unknown CPU',
      gpuVRAM: 0,
      gpuModel: 'Unknown GPU',
      os: 'Unknown OS',
    };
  }
}

/**
 * 根據硬體資訊推薦適合的模型
 */
export function recommendModel(hardware: HardwareInfo): ModelRecommendation {
  log.info('根據硬體推薦模型:', hardware);

  // 根據可用 RAM 來決定模型大小
  if (hardware.totalRAM >= 16 && hardware.gpuVRAM >= 6) {
    // 高效能配置：16GB+ RAM + 6GB+ VRAM
    return {
      modelTier: 'high',
      recommendedModel: 'qwen2.5-7b-instruct-q4_k_m',
      description: '最高品質模型，建議用於高效能電腦',
    };
  } else if (hardware.totalRAM >= 8) {
    // 中等配置：8GB+ RAM
    return {
      modelTier: 'medium',
      recommendedModel: 'qwen2.5-3b-instruct-q4_k_m',
      description: '平衡模型，在大多數電腦上都能流暢運行',
    };
  } else {
    // 低配置：低於 8GB RAM
    return {
      modelTier: 'low',
      recommendedModel: 'qwen2.5-1.5b-instruct-q4_k_m',
      description: '輕量模型，適合記憶體較少的電腦',
    };
  }
}

/**
 * 檢查是否滿足最低需求
 */
export function checkMinimumRequirements(hardware: HardwareInfo): {
  meets: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (hardware.totalRAM < 6) {
    warnings.push(`RAM 不足：目前 ${hardware.totalRAM}GB，建議至少 8GB 以獲得較佳體驗`);
  }

  if (hardware.cpuCores < 4) {
    warnings.push(`CPU 核心數不足：目前 ${hardware.cpuCores} 核心，建議至少 4 核心`);
  }

  // Windows 10/11 以外不支援
  if (!hardware.os.includes('Windows')) {
    warnings.push(`目前僅支援 Windows 系統`);
  }

  return {
    meets: warnings.length === 0,
    warnings,
  };
}
