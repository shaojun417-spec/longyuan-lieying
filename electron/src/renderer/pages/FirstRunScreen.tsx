import { useState } from 'react';
import { create } from 'zustand';

// 首次啟動狀態
interface FirstRunState {
  step: 'welcome' | 'checking' | 'downloading' | 'complete' | 'error';
  progress: number;
  errorMessage?: string;
  hardwareInfo?: {
    totalRAM: number;
    cpuCores: number;
    gpuModel: string;
  };
  recommendedModel?: {
    modelTier: string;
    recommendedModel: string;
    description: string;
  };
  warnings?: string[];
}

const useFirstRunStore = create<FirstRunState>(() => ({
  step: 'welcome',
  progress: 0,
}));

export default function FirstRunScreen({ onComplete }: { onComplete: () => void }) {
  const state = useFirstRunStore();
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }

    setIsStarting(true);
    
    // 監聽進度更新
    window.electronAPI.firstRun.onProgress((newState: FirstRunState) => {
      useFirstRunStore.setState(newState);
    });

    // 開始首次啟動流程
    const result = await window.electronAPI.firstRun.start();
    useFirstRunStore.setState(result);

    if (result.currentStep === 'complete') {
      // 完成後等待一下再切換到主畫面
      setTimeout(() => {
        onComplete();
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-slate-800 rounded-2xl shadow-2xl p-8">
        {/* 標題 */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🐉</div>
          <h1 className="text-4xl font-bold text-orange-500 mb-2">龍淵裂影</h1>
          <p className="text-slate-400">本地 AI 短影音創作工具</p>
        </div>

        {/* 歡迎畫面 */}
        {state.step === 'welcome' && (
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-6">歡迎使用！</h2>
            <p className="text-slate-300 mb-8 leading-relaxed">
              為了讓 AI 順利運作，需要先下載一些模型檔案<br />
              整個過程大約需要 5-10 分鐘，請耐心等候
            </p>
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="px-8 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              {isStarting ? '準備中...' : '開始設定'}
            </button>
          </div>
        )}

        {/* 偵測硬體中 */}
        {state.step === 'checking' && (
          <div className="text-center">
            <div className="animate-pulse mb-6">
              <div className="w-16 h-16 mx-auto border-4 border-slate-600 border-t-orange-500 rounded-full animate-spin"></div>
            </div>
            <h2 className="text-2xl font-semibold mb-3">正在偵測電腦硬體...</h2>
            <p className="text-slate-400">找出最適合你的 AI 模型</p>
          </div>
        )}

        {/* 下載模型中 */}
        {state.step === 'downloading' && (
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-center">正在下載 AI 模型...</h2>
            
            {state.hardwareInfo && (
              <div className="mb-6 p-4 bg-slate-700 rounded-lg">
                <h3 className="font-medium mb-2">📊 你的電腦配置</h3>
                <div className="text-sm text-slate-300 space-y-1">
                  <div>RAM：{state.hardwareInfo.totalRAM} GB</div>
                  <div>CPU 核心：{state.hardwareInfo.cpuCores} 核心</div>
                  <div>顯示卡：{state.hardwareInfo.gpuModel}</div>
                </div>
              </div>
            )}

            {state.recommendedModel && (
              <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
                <h3 className="font-medium mb-1">🤖 推薦模型</h3>
                <div className="text-sm text-slate-300">{state.recommendedModel.description}</div>
              </div>
            )}

            {/* 進度條 */}
            <div className="mb-2 flex justify-between text-sm text-slate-400">
              <span>下載進度</span>
              <span>{state.progress}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              ></div>
            </div>

            <p className="mt-6 text-sm text-slate-400 text-center">
              ⏱️ 請勿關閉程式
            </p>
          </div>
        )}

        {/* 完成 */}
        {state.step === 'complete' && (
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-semibold mb-3 text-green-400">設定完成！</h2>
            <p className="text-slate-300 mb-2">AI 模型已準備就緒</p>
            <p className="text-slate-400 text-sm">即將進入主畫面...</p>
          </div>
        )}

        {/* 錯誤 */}
        {state.step === 'error' && (
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-semibold mb-3 text-red-400">發生錯誤</h2>
            <p className="text-slate-300 mb-6">{state.errorMessage || '未知錯誤'}</p>
            <button
              onClick={handleStart}
              className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium"
            >
              重試
            </button>
          </div>
        )}

        {/* 警告訊息 */}
        {state.warnings && state.warnings.length > 0 && (
          <div className="mt-6 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
            <h3 className="font-medium mb-2 text-yellow-400">⚠️ 提醒</h3>
            <ul className="text-sm text-yellow-200 space-y-1">
              {state.warnings.map((warning, index) => (
                <li key={index}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
