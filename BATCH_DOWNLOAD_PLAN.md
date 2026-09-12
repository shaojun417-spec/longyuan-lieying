# 批量下載架構（v2.0 增強）

> 支援一次貼上多個網址，自動分流到不同引擎，並行解析+下載。

## 🎯 使用者體驗

### 輸入方式（3 種）

```
方式 1：手動貼上（一行一個）
─────────────────────────────────
https://v.douyin.com/abc123/
https://www.youtube.com/watch?v=xyz
https://www.xiaohongshu.com/explore/456
https://twitter.com/xxx/status/789
```

```
方式 2：匯入檔案
─────────────────────────────────
上傳 urls.txt（每行一個網址）
```

```
方式 3：批量匯出收藏夾
─────────────────────────────────
從抖音/YouTube 匯出收藏 JSON，自動提取網址
```

### 輸出方式

```
✅ 全部成功 → 自動開啟下載資料夾
⚠️ 部分失敗 → 顯示失敗清單，提供「一鍵重試失敗項」
❌ 全部失敗 → 常見原因提示（網路、Cookie、反爬）
```

## 🏗️ 批量架構

```
┌──────────────────────────────────────────────────────────────┐
│  BatchDownloadManager 批次下載管理器                          │
│                                                              │
│  ┌──────────────────┐                                       │
│  │ 1. 輸入解析       │ → 提取 URL 列表、去除空行/註解        │
│  └────┬─────────────┘                                       │
│       ▼                                                     │
│  ┌──────────────────┐                                       │
│  │ 2. URL 去重       │ → 用 Set 去重（保留順序）              │
│  └────┬─────────────┘                                       │
│       ▼                                                     │
│  ┌──────────────────┐                                       │
│  │ 3. URL 平台偵測   │ → 並行（5 並發）                       │
│  │  - 抖音網域      │                                        │
│  │  - YouTube 網域  │                                        │
│  │  - 小紅書網域    │                                        │
│  │  - 其他網域      │                                        │
│  └────┬─────────────┘                                       │
│       ▼                                                     │
│  ┌──────────────────┐                                       │
│  │ 4. 引擎分流       │ → 抖音組→a-bogus / YouTube組→yt-dlp    │
│  └────┬─────────────┘                                       │
│       ▼                                                     │
│  ┌──────────────────┐                                       │
│  │ 5. 並行解析（5）   │ → 帶進度回報的批次解析                 │
│  │   失敗項放入重試池 │                                        │
│  └────┬─────────────┘                                       │
│       ▼                                                     │
│  ┌──────────────────┐                                       │
│  │ 6. 並行下載（3）   │ → aria2 多執行緒，3 任務並行           │
│  │   每個任務 SSE 推送│                                        │
│  └────┬─────────────┘                                       │
│       ▼                                                     │
│  ┌──────────────────┐                                       │
│  │ 7. 結果統計       │ → 成功 X / 失敗 Y / 總大小 Z MB        │
│  └──────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────┘
```

## 💻 核心資料結構

```typescript
// ===== 批量任務狀態 =====
interface BatchTask {
  id: string;                       // 批次 ID
  total: number;                    // 總數
  completed: number;                // 已完成
  failed: number;                   // 失敗
  status: 'parsing' | 'downloading' | 'completed' | 'partial';
  
  items: BatchItem[];               // 每個網址的狀態
  
  startTime: number;
  endTime?: number;
}

// ===== 單個項目狀態 =====
interface BatchItem {
  id: string;                       // 項目 ID
  url: string;                      // 原始網址
  platform: 'douyin' | 'youtube' | 'xiaohongshu' | 'twitter' | 'unknown';
  engine: 'abogus' | 'ytdlp' | 'v8i8';
  
  status: 'pending' | 'parsing' | 'downloading' | 'completed' | 'failed';
  progress: number;                 // 0-100
  
  videoInfo?: VideoInfo;            // 解析結果
  outputPath?: string;              // 輸出檔案
  fileSize?: number;                // 檔案大小
  error?: string;                   // 錯誤訊息
  retryCount: number;               // 重試次數
}

// ===== 批量配置 =====
interface BatchOptions {
  maxParseConcurrency: number;      // 預設 5
  maxDownloadConcurrency: number;   // 預設 3
  maxRetries: number;               // 預設 3
  retryDelayMs: number;             // 預設 2000（指數退避）
  outputDir: string;                // 預設 ~/Downloads/longyuan-videos/
  filenameTemplate: string;         // 預設 '{platform}_{title}_{date}'
}
```

## 📡 IPC 介面（Electron 主程序 ↔ 渲染程序）

```typescript
// 開始批量下載
ipcMain.handle('batch:start', async (event, {
  urls: string[],
  options?: Partial<BatchOptions>,
}) => {
  return await batchDownloadManager.start(urls, options);
});

// 取消批量
ipcMain.handle('batch:cancel', async (event, batchId: string) => {
  return await batchDownloadManager.cancel(batchId);
});

// 重試失敗項
ipcMain.handle('batch:retry-failed', async (event, batchId: string) => {
  return await batchDownloadManager.retryFailed(batchId);
});

// 即時進度推送（主動發送）
mainWindow.webContents.send('batch:progress', batchTask);
```

## 🎨 UI 設計（React）

```
┌──────────────────────────────────────────────────────────┐
│  📥 批量下載影片                                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 貼上網址（一行一個）                               │  │
│  │ ┌────────────────────────────────────────────────┐ │  │
│  │ │ https://v.douyin.com/abc123/                  │ │  │
│  │ │ https://www.youtube.com/watch?v=xyz           │ │  │
│  │ │ https://www.xiaohongshu.com/explore/456       │ │  │
│  │ │ https://twitter.com/xxx/status/789            │ │  │
│  │ │ ...                                            │ │  │
│  │ └────────────────────────────────────────────────┘ │  │
│  │                              共 50 個網址          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ⚙️ 設定                                                 │
│  並行解析數：[5 ▼]  並行下載數：[3 ▼]  重試次數：[3 ▼]    │
│                                                          │
│  [開始批量下載]  [匯入 urls.txt]  [清空]                  │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  📊 進度                                                  │
│  [██████████░░░░░░░░] 32/50 (64%)  ·  解析中: 5  下載中: 3│
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ✅ 抖音爆紅影片 #1     抖音   [已完成]  12.3 MB   │  │
│  │ ✅ Tech Review       YouTube [已完成] 145.2 MB   │  │
│  │ ⏳ 旅遊 Vlog #3      小紅書  [解析中]  ──────    │  │
│  │ ⏳ 程式教學          YouTube [下載中 47%] ──────  │  │
│  │ ❌ 失效連結          抖音    [失敗]   重試按鈕    │  │
│  │ ⏸ 等待中...                                        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  統計：成功 28  失敗 2  總大小 1.2 GB                     │
│  [取消]  [重試失敗]  [開啟資料夾]                         │
└──────────────────────────────────────────────────────────┘
```

## 📁 程式碼組織

```
electron/src/main/download/
├── batch/                              # 新增：批量管理
│   ├── batch-download-manager.ts     # 批量管理器主類別
│   ├── url-parser.ts                  # 從文字提取 URL 列表
│   ├── url-deduplicator.ts            # URL 去重
│   ├── platform-detector.ts           # 平台識別
│   ├── concurrency-queue.ts           # 並行佇列
│   └── retry-manager.ts               # 智能重試
├── engines/                            # 三個獨立引擎
│   ├── douyin-parser/
│   ├── ytdlp-engine/
│   └── aria2-downloader/
└── batch-handlers.ts                  # IPC handlers

electron/src/renderer/
├── pages/
│   └── BatchDownloadScreen.tsx        # 批量下載 UI
└── components/
    ├── UrlInputBox.tsx                # 多行 URL 輸入框
    ├── BatchProgressTable.tsx         # 進度表
    └── BatchSettings.tsx              # 設定面板
```

## ⚡ 並行佇列實現思路

```typescript
// 並行佇列（限制並發數）
class ConcurrencyQueue<T> {
  private queue: T[] = [];
  private running = 0;
  private maxConcurrency: number;

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
  }

  async add(task: () => Promise<void>, item: T) {
    this.queue.push(item);
    this.processNext();
  }

  private async processNext() {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift()!;
    this.running++;

    try {
      await this.executeTask(item);
    } finally {
      this.running--;
      this.processNext(); // 繼續處理下一個
    }
  }

  private async executeTask(item: T) {
    // 呼叫實際處理邏輯
  }
}
```

## 🔄 重試策略（指數退避）

```
第 1 次失敗 → 等待 1 秒 → 重試
第 2 次失敗 → 等待 2 秒 → 重試
第 3 次失敗 → 等待 4 秒 → 重試
第 4 次失敗 → 標記為最終失敗，停止重試
```

對於特定錯誤（如 404「影片不存在」）直接標記失敗，不重試。

## 📊 效能預估

| 批量大小 | 預估耗時（光纖 100Mbps） |
|---------|-------------------------|
| 10 個影片（平均 50MB） | ~40 秒 |
| 50 個影片（平均 50MB） | ~3 分鐘 |
| 100 個影片（平均 50MB） | ~6 分鐘 |

瓶頸分析：
- 解析階段：受 a-bogus 算法 CPU 限制，5 並行是甜蜜點
- 下載階段：受頻寬限制，3 並行 + 每個 16 連線 = 48 條 TCP 連線
- 反爬限制：抖音 1 秒最多 3 個請求

## 🧪 測試案例

### 測試 1：混合平台批量
```
輸入：10 個 URL（5 抖音 + 3 YouTube + 2 小紅書）
預期：所有影片成功下載，按平台分流到不同引擎
驗證：輸出資料夾有 10 個檔案
```

### 測試 2：包含無效 URL
```
輸入：10 個 URL（含 2 個失效連結）
預期：8 個成功，2 個失敗（不影響其他）
驗證：UI 顯示「成功 8 / 失敗 2」，可重試失敗項
```

### 測試 3：去重
```
輸入：20 個 URL（其中 5 個重複）
預期：只處理 15 個
驗證：輸出資料夾只有 15 個檔案
```

### 測試 4：中途取消
```
輸入：50 個 URL
操作：處理到 20 個時按取消
預期：取消正在執行的任務，已完成保留
驗證：輸出資料夾有部分檔案，無半成品
```

### 測試 5：反爬觸發
```
輸入：100 個抖音 URL（極限測試）
預期：前 80 個成功，後 20 個觸發反爬失敗
驗證：失敗項可重試（等待 30 秒後）
```
