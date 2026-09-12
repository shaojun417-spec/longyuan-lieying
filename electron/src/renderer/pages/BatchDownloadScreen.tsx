/**
 * 批量下載頁面
 *
 * 功能：
 * - 一次貼上多個網址（混雜抖音、YouTube、小紅書等）
 * - 即時顯示平台偵測結果
 * - 並行解析+下載（受並發限制）
 * - 即時進度追蹤
 * - 失敗自動重試
 * - 一鍵重試失敗項
 */

import { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    electronAPI: {
      batch: {
        start: (input: string | string[], options?: any) => Promise<any>;
        cancel: () => Promise<any>;
        retryFailed: (options?: any) => Promise<any>;
        parseUrls: (text: string) => Promise<any>;
        getPlatforms: () => Promise<any>;
        onProgress: (callback: (batch: any) => void) => void;
      };
      download: {
        openFolder: () => Promise<any>;
      };
    };
  }
}

interface PlatformInfo {
  platform: string;
  displayName: string;
  engine: string;
  supported: boolean;
}

interface BatchItem {
  id: string;
  url: string;
  platform: PlatformInfo;
  status: 'pending' | 'parsing' | 'downloading' | 'completed' | 'failed';
  progress: number;
  title?: string;
  outputPath?: string;
  fileSize?: number;
  error?: string;
  retryCount: number;
}

interface BatchTask {
  id: string;
  status: 'idle' | 'parsing' | 'downloading' | 'completed' | 'partial' | 'failed' | 'cancelled';
  items: BatchItem[];
  total: number;
  completed: number;
  failed: number;
  parsing: number;
  downloading: number;
  totalBytes: number;
  startTime: number;
  endTime?: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  parsing: '解析中',
  downloading: '下載中',
  completed: '已完成',
  failed: '失敗',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-600',
  parsing: 'bg-blue-500 animate-pulse',
  downloading: 'bg-purple-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

const STATUS_ICON: Record<string, string> = {
  pending: '⏸',
  parsing: '🔍',
  downloading: '⬇️',
  completed: '✅',
  failed: '❌',
};

export default function BatchDownloadScreen() {
  const [urlText, setUrlText] = useState('');
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [parseInfo, setParseInfo] = useState<{
    total: number;
    duplicates: number;
    invalid: number;
  } | null>(null);
  const [batch, setBatch] = useState<BatchTask | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [settings, setSettings] = useState({
    maxParseConcurrency: 5,
    maxDownloadConcurrency: 3,
    maxRetries: 3,
  });
  const [supportedPlatforms, setSupportedPlatforms] = useState<PlatformInfo[]>([]);

  const debounceRef = useRef<number | null>(null);

  // 訂閱進度
  useEffect(() => {
    window.electronAPI.batch.onProgress((updatedBatch: BatchTask) => {
      setBatch(updatedBatch);
    });
  }, []);

  // 載入支援的平台列表
  useEffect(() => {
    window.electronAPI.batch.getPlatforms().then((result) => {
      if (result.success) {
        setSupportedPlatforms(result.data);
      }
    });
  }, []);

  // 解析輸入（debounce）
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      if (urlText.trim()) {
        const result = await window.electronAPI.batch.parseUrls(urlText);
        if (result.success) {
          setPlatforms(result.data.platforms);
          setParseInfo({
            total: result.data.total,
            duplicates: result.data.duplicates,
            invalid: result.data.invalid.length,
          });
        }
      } else {
        setPlatforms([]);
        setParseInfo(null);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [urlText]);

  const handleStart = async () => {
    if (!urlText.trim()) return;
    setIsRunning(true);
    setBatch(null);

    const result = await window.electronAPI.batch.start(urlText, settings);
    if (!result.success) {
      alert('啟動失敗：' + result.error);
    }
    setIsRunning(false);
  };

  const handleCancel = async () => {
    await window.electronAPI.batch.cancel();
  };

  const handleRetryFailed = async () => {
    setIsRunning(true);
    const result = await window.electronAPI.batch.retryFailed(settings);
    if (!result.success) {
      alert('重試失敗：' + result.error);
    }
    setIsRunning(false);
  };

  const handleOpenFolder = async () => {
    await window.electronAPI.download.openFolder();
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      setUrlText((prev) => prev ? prev + '\n' + text : text);
    };
    input.click();
  };

  const handleClear = () => {
    setUrlText('');
    setBatch(null);
    setPlatforms([]);
    setParseInfo(null);
  };

  // 統計各平台數量
  const platformStats = platforms.reduce((acc, p) => {
    acc[p.displayName] = (acc[p.displayName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} 分 ${remainingSeconds} 秒`;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-6xl mx-auto p-6">
        {/* 標題列 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-orange-500 mb-2">
            📥 批量下載影片
          </h1>
          <p className="text-slate-400 text-sm">
            一次貼上多個網址，自動分流到不同引擎並行下載
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 左側：輸入區 */}
          <div className="lg:col-span-2 space-y-4">
            {/* URL 輸入框 */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-slate-300">
                  貼上網址（一行一個）
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={handleImportFile}
                    disabled={isRunning}
                    className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 disabled:opacity-50"
                  >
                    📁 匯入檔案
                  </button>
                  <button
                    onClick={handleClear}
                    disabled={isRunning || !urlText}
                    className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 disabled:opacity-50"
                  >
                    🗑️ 清空
                  </button>
                </div>
              </div>

              <textarea
                value={urlText}
                onChange={(e) => setUrlText(e.target.value)}
                disabled={isRunning}
                placeholder="https://v.douyin.com/abc123/&#10;https://www.youtube.com/watch?v=xyz&#10;https://www.xiaohongshu.com/explore/456&#10;..."
                rows={10}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm font-mono resize-y focus:outline-none focus:border-orange-500 disabled:opacity-50"
              />

              {/* 解析統計 */}
              {parseInfo && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <span className="text-slate-400">
                    共 <strong className="text-slate-200">{platforms.length}</strong> 個有效網址
                  </span>
                  {parseInfo.duplicates > 0 && (
                    <span className="text-yellow-500">
                      重複 {parseInfo.duplicates}
                    </span>
                  )}
                  {parseInfo.invalid > 0 && (
                    <span className="text-red-500">
                      無效 {parseInfo.invalid}
                    </span>
                  )}
                </div>
              )}

              {/* 平台分組 */}
              {Object.keys(platformStats).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(platformStats).map(([name, count]) => (
                    <span
                      key={name}
                      className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-200"
                    >
                      {name}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 設定 */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">⚙️ 設定</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">並行解析數</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.maxParseConcurrency}
                    onChange={(e) =>
                      setSettings({ ...settings, maxParseConcurrency: parseInt(e.target.value) })
                    }
                    disabled={isRunning}
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">並行下載數</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.maxDownloadConcurrency}
                    onChange={(e) =>
                      setSettings({ ...settings, maxDownloadConcurrency: parseInt(e.target.value) })
                    }
                    disabled={isRunning}
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">重試次數</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={settings.maxRetries}
                    onChange={(e) =>
                      setSettings({ ...settings, maxRetries: parseInt(e.target.value) })
                    }
                    disabled={isRunning}
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-sm disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {/* 操作按鈕 */}
            <div className="flex gap-2">
              {!batch || ['completed', 'failed', 'partial', 'cancelled'].includes(batch.status) ? (
                <button
                  onClick={handleStart}
                  disabled={!urlText.trim() || isRunning}
                  className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  🚀 開始批量下載
                </button>
              ) : (
                <button
                  onClick={handleCancel}
                  className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded transition-colors"
                >
                  ⏹ 取消
                </button>
              )}

              {batch && batch.failed > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={isRunning}
                  className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded disabled:opacity-50"
                >
                  🔄 重試失敗 ({batch.failed})
                </button>
              )}

              <button
                onClick={handleOpenFolder}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded"
              >
                📂 開啟資料夾
              </button>
            </div>
          </div>

          {/* 右側：支援的平台 */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 h-fit">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">
              🌐 支援的平台
            </h3>
            <div className="space-y-2">
              {supportedPlatforms.map((p) => (
                <div
                  key={p.platform}
                  className="flex justify-between items-center px-2 py-1 bg-slate-900 rounded text-xs"
                >
                  <span className="text-slate-200">{p.displayName}</span>
                  <span className="text-slate-500">
                    {p.engine === 'provider-chain' ? '🔗 本地鏈' : p.engine === 'plain-http' ? '🌐 HTTP' : '💻 本地'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 進度區 */}
        {batch && (
          <div className="mt-6 bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold text-slate-200">
                📊 進度
              </h3>
              <div className="text-sm text-slate-400">
                {batch.completed + batch.failed} / {batch.total}
                {batch.failed > 0 && (
                  <span className="text-red-400 ml-2">({batch.failed} 失敗)</span>
                )}
              </div>
            </div>

            {/* 進度條 */}
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all"
                style={{ width: `${((batch.completed + batch.failed) / batch.total) * 100}%` }}
              />
            </div>

            {/* 統計 */}
            <div className="grid grid-cols-4 gap-2 mb-4 text-center text-sm">
              <div className="bg-slate-900 rounded p-2">
                <div className="text-blue-400 text-lg">{batch.parsing}</div>
                <div className="text-xs text-slate-500">解析中</div>
              </div>
              <div className="bg-slate-900 rounded p-2">
                <div className="text-purple-400 text-lg">{batch.downloading}</div>
                <div className="text-xs text-slate-500">下載中</div>
              </div>
              <div className="bg-slate-900 rounded p-2">
                <div className="text-green-400 text-lg">{batch.completed}</div>
                <div className="text-xs text-slate-500">已完成</div>
              </div>
              <div className="bg-slate-900 rounded p-2">
                <div className="text-red-400 text-lg">{batch.failed}</div>
                <div className="text-xs text-slate-500">失敗</div>
              </div>
            </div>

            {/* 項目列表 */}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {batch.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-900 rounded text-sm"
                >
                  <span className="text-lg w-6 text-center">
                    {STATUS_ICON[item.status]}
                  </span>
                  <span className={`w-1 h-6 rounded ${STATUS_COLOR[item.status]}`} />
                  <span className="text-slate-300 flex-1 truncate">
                    {item.title || item.url}
                  </span>
                  <span className="text-xs text-slate-500">
                    {item.platform.displayName}
                  </span>
                  <span className="text-xs text-slate-500 w-20 text-right">
                    {item.status === 'completed' && item.fileSize
                      ? formatBytes(item.fileSize)
                      : item.status === 'downloading' || item.status === 'parsing'
                      ? `${item.progress}%`
                      : STATUS_LABEL[item.status]}
                  </span>
                </div>
              ))}
            </div>

            {/* 結果統計 */}
            {batch.endTime && (
              <div className="mt-4 p-3 bg-slate-900 rounded text-sm">
                <div className="text-slate-400">
                  ✅ 成功 {batch.completed} / ❌ 失敗 {batch.failed} / ⏱ 耗時 {formatDuration(batch.endTime - batch.startTime)}
                  {batch.totalBytes > 0 && (
                    <span className="ml-2">📦 總大小 {formatBytes(batch.totalBytes)}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
