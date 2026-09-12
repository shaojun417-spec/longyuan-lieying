# 影片下載 v2.0 - 多引擎融合架構

> 本文件說明龍淵裂影影片下載功能的 v2.0 改進計劃，
> 融合蝸牛助手、v8i8、Free Download Manager 三個工具的優勢。

## 📚 從 3 個工具學到的關鍵技術

### 1️⃣ 蝸牛助手 → 抖音/小紅書 a-bogus 純算算法

蝸牛助手能在瀏覽器插件內直接解析抖音/小紅書/快手/B站的影片，
核心是實現了抖音的 **a-bogus 簽名算法**（純算，不依賴瀏覽器自動化）：

```
a_bogus 生成流程：
1. SM3 雙重雜湊（鹽值 "dhzx"）
2. 組裝 payload（時間戳 + 設備指紋 + UA）
3. 位元遮罩擴展（3字節 → 4字節）
4. RC4 變體加密（key=0xD3，反轉S-box）
5. 自定義 Base64 編碼（s4 表）
→ 輸出 192 字元 a_bogus
```

呼叫抖音 `/aweme/v1/web/aweme/detail/` API 時帶上 a_bogus，
即可拿到**無水印** CDN 直連（play_url 不帶浮水印）。

**優勢**：不需要使用者提供 Cookie、不依賴 v8i8 第三方伺服器。

### 2️⃣ v8i8 → yt-dlp 核心 + Web API 封裝

v8i8 底層使用 **yt-dlp**（社群維護的 youtube-dl fork），
支援 1800+ 網站的影片解析（YouTube、Twitter、Instagram、B站等）。

**架構**：
- 後端：FastAPI + yt-dlp + ffmpeg
- 前端：Vue3 + Vite + TailwindCSS
- 任務佇列：Redis + 背景 worker
- 即時進度：Server-Sent Events (SSE)

**API 設計**：
- `POST /api/info` - 解析網址，返回 formats 列表
- `POST /api/download` - 開始下載，返回 task_id
- `GET /api/progress/{task_id}` - 查詢進度（SSE）
- `GET /api/file/{task_id}` - 下載完成的檔案

**優勢**：通用性極強，1800+ 站開箱即用。

### 3️⃣ Free Download Manager → aria2 多執行緒加速

FDM 本質是包裝 **aria2** 的 GUI，核心加速原理：

```
1. 發送 HEAD 請求 → 確認伺服器支援 Range
2. 把檔案切成 N 個 4MB 分片
3. 同時開 N 條 TCP 連線並行下載
4. 動態調整分片大小（4MB → 8MB 或 1MB）
5. 連線池複用（同伺服器省去 TCP 握手）
6. 完成 → 合併為完整檔案
```

**aria2 關鍵參數**：
- `split=N` - 每個任務分割數（建議 8-16）
- `max-connection-per-server=N` - 每伺服器最大連線
- `min-split-size=20M` - 最小分割檔案大小
- `disk-cache=64M` - 磁碟緩衝
- `max-concurrent-downloads=5` - 同時下載任務數

**優勢**：能達到物理頻寬 90%+，單連線限速伺服器的剋星。

---

## 🎯 融合後的新架構（v2.0）

```
                龍淵裂影 v2.0 - 多引擎影片下載
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   使用者貼上 URL（網頁 / Electron App / iOS Shortcut）   │
│        │                                                 │
│        ▼                                                 │
│   ┌──────────────────┐                                   │
│   │ URL 平台自動偵測   │                                   │
│   └────┬─────────────┘                                   │
│        │                                                 │
│   ┌────┼──────────┬──────────────┐                       │
│   ▼    ▼          ▼              ▼                       │
│ 抖音  小紅書    YouTube/Twitter  其他 1800+ 站           │
│   │    │          │              │                       │
│   ▼    ▼          ▼              ▼                       │
│[引擎1] [引擎1]   [引擎2]        [引擎2]                  │
│a-bogus 純算      yt-dlp         yt-dlp                  │
│   │    │          │              │                       │
│   ▼    ▼          ▼              ▼                       │
│   ┌─────────────────────────────┐                       │
│   │ 統一介面：返回無水印 URL     │                       │
│   └────┬────────────────────────┘                       │
│        │                                                 │
│        ▼                                                 │
│   ┌──────────────────┐                                   │
│   │ 引擎 3：aria2 加速 │                                   │
│   │  - HTTP Range     │                                   │
│   │  - 多執行緒分片   │                                   │
│   │  - 動態分片       │                                   │
│   │  - 連線池複用     │                                   │
│   └────┬─────────────┘                                   │
│        │                                                 │
│        ▼                                                 │
│   儲存到本地（電腦 / 手機 PWA 下載）                     │
└──────────────────────────────────────────────────────────┘
```

## 🔑 三大引擎分工

| 引擎 | 來源 | 負責平台 | 檔案 |
|------|------|---------|------|
| **引擎 1：a-bogus 抖音解析** | 蝸牛助手 | 抖音、小紅書、快手、B站 | `engines/douyin-parser/` |
| **引擎 2：yt-dlp 通用解析** | v8i8 | YouTube、Twitter、Instagram 等 1800+ 站 | `engines/ytdlp-engine/` |
| **引擎 3：aria2 多執行緒下載** | FDM | 所有平台的下載階段 | `engines/aria2-downloader/` |

## 📁 程式碼組織

```
electron/src/main/download/
├── engines/                         # 新增：多引擎目錄
│   ├── douyin-parser/              # 引擎 1：a-bogus 抖音解析
│   │   ├── abogus.ts               #   - a-bogus 簽名算法（純算）
│   │   ├── sm3.ts                  #   - SM3 雜湊實現
│   │   ├── rc4.ts                  #   - RC4 變體加密
│   │   ├── browser-fingerprint.ts  #   - 瀏覽器指紋生成
│   │   ├── douyin-api.ts           #   - 抖音 Web API 封裝
│   │   └── index.ts                #   - 統一介面
│   ├── ytdlp-engine/               # 引擎 2：yt-dlp 通用解析
│   │   ├── ytdlp-binary.ts         #   - yt-dlp 二進位管理
│   │   ├── parser.ts               #   - 影片資訊解析
│   │   ├── format-selector.ts      #   - 畫質選擇
│   │   ├── cookies.ts              #   - Cookie 管理（可選）
│   │   └── index.ts                #   - 統一介面
│   └── aria2-downloader/           # 引擎 3：aria2 多執行緒下載
│       ├── aria2-rpc.ts             #   - JSON-RPC 客戶端
│       ├── aria2-binary.ts          #   - aria2c 二進位管理
│       ├── downloader.ts           #   - 下載任務管理
│       └── index.ts                #   - 統一介面
├── router/                          # 新增：智能路由
│   ├── platform-detector.ts        #   - URL 平台識別
│   └── engine-router.ts            #   - 引擎選擇策略
├── video-parser.ts                  # 既有：保留作為備用
├── v8i8-api-client.ts               # 既有：保留作為備用
├── download-manager.ts              # 改寫：調用新引擎
└── README.md                        # 引擎架構說明
```

## 🚀 實作優先順序

### 階段 1：引擎 2（yt-dlp 整合）— 最快見效
- 從 v8i8 依賴 → 內建 yt-dlp 二進位
- 不需要 a-bogus 複雜算法
- 解決 1800+ 站的覆蓋面

### 階段 2：引擎 1（a-bogus 抖音解析）— 擺脫第三方依賴
- 純算 SM3 + RC4 + 自定義 Base64
- 抖音/小紅書/快手不再依賴 v8i8

### 階段 3：引擎 3（aria2 加速下載）— 性能優化
- 多執行緒分片下載
- 動態分片大小調整
- 連線池複用

## 🌐 跨平台支援

| 平台 | 方案 | 狀態 |
|------|------|------|
| **Windows 桌面** | Electron + 內建二進位 | 主要平台 |
| **macOS 桌面** | Electron + 內建二進位 | 待測試 |
| **網頁版（手機/電腦瀏覽器）** | PWA + 雲端後端 | 規劃中 |
| **iOS 捷徑** | Shortcuts + REST API | 規劃中 |

## 📊 預期效益

| 指標 | 改進前（v1.0） | 改進後（v2.0） |
|------|--------------|--------------|
| 平台覆蓋 | 12 個（靠 v8i8） | 1800+ 個 |
| 隱私性 | v8i8 看到所有請求 | 完全本地（a-bogus 自算） |
| 下載速度 | 單執行緒 fetch | 8-16 執行緒 aria2 |
| 離線使用 | ❌ 不行 | ✅ 完整支援 |
| 反爬蟲 | 靠 v8i8 撐 | 自家算法，可持續維護 |

## ⚠️ 已知風險

1. **抖音反爬蟲升級**：a-bogus 算法可能過幾個月失效，需要從最新 JS dump 重新逆向
2. **yt-dlp 二進位大小**：~30MB，首次下載較慢
3. **aria2 設定複雜**：分片數、連線數需要根據網路情況調整
4. **平台條款風險**：下載影片可能違反抖音/YouTube 服務條款，僅供個人備份使用

## 📖 參考資源

- 蝸牛助手原理：[White's Blog - a_bogus 純算構造](https://haloowhite.com/2026/04/15/dy-abogus-pure-algorithm/)
- v8i8 架構：[yt-dlp GUI 開源專案](https://github.com/imsyy/yt-dlp-gui)
- FDM/aria2 原理：[心居網 - FDM 重構下載全鏈路](https://www.xjtaxi.com/2026081460165.html)
- aria2 並發模型：[TrueSight - Aria2 並發模型深度剖析](https://tsight.io/articles/17683053)
