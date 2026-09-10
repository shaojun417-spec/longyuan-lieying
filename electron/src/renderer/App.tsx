import { useState, useEffect } from 'react';
import FirstRunScreen from './pages/FirstRunScreen';

function App() {
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);

  useEffect(() => {
    // 檢查是否首次啟動
    // TODO: 實際應該從本地儲存讀取設定
    const checkFirstRun = async () => {
      // 這裡簡單設為 true，正式版需要讀取設定檔
      setIsFirstRun(true);
    };

    checkFirstRun();
  }, []);

  if (isFirstRun === null) {
    // 載入中
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
    return <FirstRunScreen onComplete={() => setIsFirstRun(false)} />;
  }

  // 正式的主畫面
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="p-8">
        <h1 className="text-3xl font-bold text-orange-500 mb-4">🐉 龍淵裂影</h1>
        <p className="text-slate-400">本地 AI 短影音創作工具</p>

        <div className="mt-8 p-6 bg-slate-800 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">歡迎使用！</h2>
          <p className="text-slate-300">
            這個是主畫面，UI 開發即將開始...
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;