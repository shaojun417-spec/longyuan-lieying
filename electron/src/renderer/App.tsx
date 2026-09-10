import { useState, useEffect } from 'react';
import FirstRunScreen from './pages/FirstRunScreen';
import NarrationScreen from './pages/NarrationScreen';

type Page = 'first-run' | 'home' | 'narration';

function App() {
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('home');

  useEffect(() => {
    const checkFirstRun = async () => {
      // 簡化：先用 localStorage 標記
      const completed = localStorage.getItem('first-run-completed');
      setIsFirstRun(completed !== 'true');
    };

    checkFirstRun();
  }, []);

  const handleFirstRunComplete = () => {
    localStorage.setItem('first-run-completed', 'true');
    setIsFirstRun(false);
  };

  if (isFirstRun === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-600 border-t-orange-500 mx-auto mb-4"></div>
          <p className="text-slate-400">載入中...</p>
        </div>
      </div>
    );
  }

  if (isFirstRun) {
    return <FirstRunScreen onComplete={handleFirstRunComplete} />;
  }

  // 主畫面：簡單切換頁面
  if (currentPage === 'narration') {
    return (
      <div>
        <div className="fixed top-0 left-0 right-0 bg-slate-800 border-b border-slate-700 z-10">
          <div className="max-w-5xl mx-auto px-8 py-3 flex items-center gap-4">
            <button
              onClick={() => setCurrentPage('home')}
              className="text-orange-500 hover:text-orange-400 font-semibold"
            >
              ← 回首頁
            </button>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">AI 文案生成</span>
          </div>
        </div>
        <div className="pt-14">
          <NarrationScreen />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-orange-500 mb-4">
          🐉 龍淵裂影
        </h1>
        <p className="text-slate-400 mb-8">
          本地 AI 短影音創作工具
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setCurrentPage('narration')}
            className="p-6 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors border border-slate-700 hover:border-orange-500"
          >
            <div className="text-3xl mb-2">✍️</div>
            <h2 className="text-xl font-semibold text-slate-100 mb-1">
              AI 文案生成
            </h2>
            <p className="text-sm text-slate-400">
              輸入產品資訊，自動產生 3-5 支台灣口吻的口播文案
            </p>
          </button>

          <div className="p-6 bg-slate-800/50 rounded-lg text-left border border-slate-700/50 opacity-50">
            <div className="text-3xl mb-2">🎙️</div>
            <h2 className="text-xl font-semibold text-slate-300 mb-1">
              AI 配音
            </h2>
            <p className="text-sm text-slate-500">
              即將推出...
            </p>
          </div>

          <div className="p-6 bg-slate-800/50 rounded-lg text-left border border-slate-700/50 opacity-50">
            <div className="text-3xl mb-2">✂️</div>
            <h2 className="text-xl font-semibold text-slate-300 mb-1">
              智能混剪
            </h2>
            <p className="text-sm text-slate-500">
              即將推出...
            </p>
          </div>

          <div className="p-6 bg-slate-800/50 rounded-lg text-left border border-slate-700/50 opacity-50">
            <div className="text-3xl mb-2">📤</div>
            <h2 className="text-xl font-semibold text-slate-300 mb-1">
              一鍵發布
            </h2>
            <p className="text-sm text-slate-500">
              即將推出...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
