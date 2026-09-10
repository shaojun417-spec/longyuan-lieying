/**
 * Narration 頁面
 *
 * 功能：
 * 1. 填寫產品資訊（產品名、功效、受眾、情境）
 * 2. 選擇生成幾支（3-5）
 * 3. 按下「生成文案」呼叫 LLM
 * 4. 顯示 3 支差異化的文案（含 hook 預覽）
 * 5. 可複製、可重新生成
 */

import { useState, useEffect, useRef } from 'react';
import type {
  GeneratedScript,
  ProductInfo,
} from '../../../shared/types';

interface ScriptProgress {
  currentIndex: number;
  total: number;
  stage: 'loading-model' | 'generating' | 'checking-similarity' | 'done' | 'error';
  attempt?: number;
  message: string;
  completedScripts?: GeneratedScript[];
}

export default function NarrationScreen() {
  // 表單狀態
  const [product, setProduct] = useState<ProductInfo>({
    product: '',
    effect: '',
    audience: '',
    context: '',
  });
  const [count, setCount] = useState<number>(3);

  // 生成狀態
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ScriptProgress | null>(null);
  const [scripts, setScripts] = useState<GeneratedScript[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState<boolean>(false);
  const [checkingModel, setCheckingModel] = useState<boolean>(true);

  // 複製狀態
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // 監聽 progress 事件
  useEffect(() => {
    if (!window.electronAPI?.script) return;

    window.electronAPI.script.onProgress((p: ScriptProgress) => {
      setProgress(p);
      if (p.completedScripts) {
        setScripts(p.completedScripts);
      }
    });

    // 檢查模型是否已下載
    window.electronAPI.model
      .isDownloaded('qwen2.5-3b-instruct-q4_k_m')
      .then((ready) => {
        setModelReady(ready);
        setCheckingModel(false);
      });
  }, []);

  const canGenerate =
    !isGenerating &&
    modelReady &&
    product.product.trim().length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (!window.electronAPI?.script) return;

    setIsGenerating(true);
    setError(null);
    setScripts([]);
    setProgress(null);

    try {
      const result = await window.electronAPI.script.generate({
        product,
        count,
      });

      if (result.success) {
        setScripts(result.scripts);
        setProgress({
          currentIndex: count,
          total: count,
          stage: 'done',
          message: `完成！耗時 ${(result.totalTimeMs / 1000).toFixed(1)} 秒`,
        });
      } else {
        setError(result.error || '生成失敗');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancel = async () => {
    if (!window.electronAPI?.script) return;
    await window.electronAPI.script.cancel();
    setIsGenerating(false);
  };

  const handleCopy = async (index: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      // fallback
    }
  };

  // 模型還在檢查
  if (checkingModel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-slate-400">檢查模型狀態中...</div>
      </div>
    );
  }

  // 模型未下載
  if (!modelReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-8">
        <div className="max-w-md bg-slate-800 rounded-lg p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-slate-100 mb-2">尚未下載模型</h2>
          <p className="text-slate-400 mb-6">
            需要先下載 LLM 模型才能生成文案（約 2 GB）。
          </p>
          <p className="text-sm text-slate-500">
            請回到首次啟動畫面，按「開始設定」下載模型。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-orange-500 mb-2">
            ✍️ AI 文案生成
          </h1>
          <p className="text-slate-400">
            輸入產品資訊，AI 會幫你寫出 3-5 支差異化的台灣口吻口播文案
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左側：表單 */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">📝 產品資訊</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  產品名稱 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={product.product}
                  onChange={(e) => setProduct({ ...product, product: e.target.value })}
                  placeholder="例：抗老精華液"
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  disabled={isGenerating}
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">功效</label>
                <input
                  type="text"
                  value={product.effect}
                  onChange={(e) => setProduct({ ...product, effect: e.target.value })}
                  placeholder="例：淡化細紋、提亮膚色"
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  disabled={isGenerating}
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">目標受眾</label>
                <input
                  type="text"
                  value={product.audience}
                  onChange={(e) => setProduct({ ...product, audience: e.target.value })}
                  placeholder="例：25-35 歲輕熟女"
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  disabled={isGenerating}
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">使用情境</label>
                <input
                  type="text"
                  value={product.context}
                  onChange={(e) => setProduct({ ...product, context: e.target.value })}
                  placeholder="例：熬夜後、上妝前"
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  disabled={isGenerating}
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">生成數量</label>
                <div className="flex gap-2">
                  {[3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      disabled={isGenerating}
                      className={`px-4 py-2 rounded ${
                        count === n
                          ? 'bg-orange-500 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      } disabled:opacity-50`}
                    >
                      {n} 支
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                {isGenerating ? (
                  <button
                    onClick={handleCancel}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    ❌ 取消生成
                  </button>
                ) : (
                  <button
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    🚀 生成 {count} 支文案
                  </button>
                )}
              </div>

              {/* 進度 */}
              {progress && (
                <div className="bg-slate-900/50 rounded p-3 text-sm">
                  <div className="text-slate-300">{progress.message}</div>
                  {progress.stage !== 'done' && progress.stage !== 'error' && (
                    <div className="mt-2 h-1 bg-slate-700 rounded overflow-hidden">
                      <div
                        className="h-full bg-orange-500 transition-all duration-300"
                        style={{
                          width: `${(progress.currentIndex / progress.total) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 錯誤訊息 */}
              {error && (
                <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-300">
                  ❌ {error}
                </div>
              )}
            </div>
          </div>

          {/* 右側：結果 */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">
              📄 生成結果 ({scripts.length}/{count})
            </h2>

            {scripts.length === 0 && !isGenerating && (
              <div className="text-center text-slate-500 py-12">
                還沒生成文案<br />
                填寫產品資訊後按「生成」
              </div>
            )}

            {scripts.length === 0 && isGenerating && (
              <div className="text-center text-slate-400 py-12">
                <div className="animate-pulse">生成中...</div>
                <div className="text-sm mt-2 text-slate-500">
                  第一次會比較慢（需要載入模型）
                </div>
              </div>
            )}

            <div className="space-y-4">
              {scripts.map((script) => (
                <div
                  key={script.index}
                  className="bg-slate-900/50 rounded-lg p-4 border border-slate-700"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-xs text-orange-400 font-semibold">
                      第 {script.index} / {script.total} 支
                      <span className="ml-2 text-slate-500">
                        ({script.wordCount} 字)
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy(script.index, script.content)}
                      className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                    >
                      {copiedIndex === script.index ? '✓ 已複製' : '📋 複製'}
                    </button>
                  </div>

                  {script.hook && (
                    <div className="text-sm text-orange-300 mb-2 italic">
                      Hook：「{script.hook}」
                    </div>
                  )}

                  <div className="text-slate-200 whitespace-pre-wrap text-sm leading-relaxed">
                    {script.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
