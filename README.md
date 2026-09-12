# 龍淵裂影 - 影片下載工具

跨平台無水印影片下載工具，部署在 Cloudflare Workers 上。

## 🌐 線上服務

**網址**：https://longyuan-video.shaojun417.workers.dev

開啟網頁 → 貼上影片網址 → 取得下載連結（完全免費，無需註冊）。

## ✨ 支援的平台

| 平台 | 狀態 | 備註 |
|---|---|---|
| 抖音 | ✅（需第三方 API Key） | App 分享短網址成功率最高 |
| 小紅書 | ✅（需第三方 API Key） | 短網址優先 |
| TikTok | ✅（需第三方 API Key） | |
| Instagram | ✅（需第三方 API Key） | Reel / Post |
| Threads | ✅（需第三方 API Key） | |
| **YouTube** | ✅（auto-download Key） | 完整支援（12+ 格式） |
| **Facebook** | ✅（auto-download Key） | |
| **Twitter/X** | ✅（auto-download Key） | |
| **Bilibili** | ✅（auto-download Key） | |
| **Pinterest / Reddit / Vimeo / 9GAG / Tumblr** | ✅（auto-download Key） | |
| **40+ 其他平台** | ✅（auto-download Key） | 見下方說明 |
| 蝦皮短影音 | ❌ | 需 Browser Rendering（$5/月） |
| **淘寶 / 天貓影片** | ✅ 直接 CDN URL | 商品頁因風控無法解析；需從開發者工具複製 `.mp4` 完整網址（含 `auth_key`） |

### auto-download-all-in-one 一個 Key 包打 60+ 平台

提供者是 `nguyenmanhict`（RapidAPI 上同一個作者），透過 auto-download-all-in-one 服務（檔名 `auto-download-all-in-one.p.rapidapi.com`）支援：
- **無水印下載**：TikTok, 抖音, CapCut, Hipi, 小紅書
- **影片社群**：Facebook, Instagram, YouTube, X/Twitter, Pinterest, Threads, Bilibili, VK, Weibo 等
- **音訊**：SoundCloud, Spotify, Apple Music 等
- **雲端**：Box, Dropbox, Google Drive, MediaFire 等

**註冊 → 訂 BASIC ($0/月, 100 次/月) → 拿 X-RapidAPI-Key**

## 🏗️ 架構

```
用戶 → Worker (handleVideoInfo)
         ↓
      Key 池（環境變數）
         ↓
      ┌─→ auto-download-all-in-one (RAPIDAPI_AUTO_KEY, 60+ 平台)
      ├─→ TikHub API（輪詢 Key 池, 5 平台）
      ├─→ RapidAPI（輪詢 Key 池, 各別 provider）
      ├─→ 用戶自帶 Key（userKey 參數）
      └─→ 自寫解析（a-bogus 兜底）
         ↓
      影片 URL → 用戶
```

### 解析優先順序（從上往下嘗試）

1. **auto-download-all-in-one** — 60+ 平台，一個 Key 通殺（推薦）
2. 用戶自帶 Key（userKey）
3. TikHub Key 池輪詢
4. RapidAPI Key 池輪詢（其他 provider）
5. 自寫解析（抖音、小紅書、IG、Threads、蝦皮）

### Key 池設計

- 支援多 Key 輪詢（`TIKHUB_KEYS=key1,key2,key3`）
- 失敗的 Key 自動跳過（連續 3 次失敗暫停使用）
- 用戶可在請求中帶 `userKey` 自帶 Key（不消耗你的額度）
- 每個 Key 的健康度、月用量持久化到 KV

## 🔑 設定環境變數（Cloudflare Dashboard）

進入 **Workers & Pages → longyuan-video → Settings → Variables**

### auto-download-all-in-one (推薦，一次包打 60+ 平台)

```
RAPIDAPI_AUTO_KEY = <your rapidapi key>
```

或環境變數 `RAPIDAPI_AUTO_KEYS` 可放多個 Key（逗號分隔輪詢）。

**取得方式**：[https://rapidapi.com/nguyenmanhict-MuTUtGWD7K/api/auto-download-all-in-one/pricing](https://rapidapi.com/nguyenmanhict-MuTUtGWD7K/api/auto-download-all-in-one/pricing)
- BASIC 方案：**免費 $0/月，100 次/月**

### TikHub
```
TIKHUB_KEYS = your_key_1,your_key_2,your_key_3
```

單 Key：
```
TIKHUB_KEY = your_single_key
```

註冊：https://tikhub.io（免費 500 次/月）

### 其他 RapidAPI Provider
```
RAPIDAPI_KEYS = host1.com:key1,host2.com:key2
```

或單個：
```
RAPIDAPI_KEY = your_rapidapi_key
RAPIDAPI_HOST = your-default-host.p.rapidapi.com
```

註冊：https://rapidapi.com

## 🚀 部署

```bash
cd C:\Projects\龍淵裂影\workers\src
python deploy.py
```

或在 `deploy.py` 內編輯 `SECRETS` 區塊，加上你想設定的 Key：
```python
SECRETS = {
    "RAPIDAPI_AUTO_KEY": "你的_RapidAPI_Key",
    "TIKHUB_KEYS": "tikhub_key_1,tikhub_key_2",
    "ADMIN_TOKEN": "your_admin_token",
}
```

## ⚠️ 已知問題

### auto-download-all-in-one 在 Worker 環境下會被 BIC 阻擋

RapidAPI 端 Cloudflare 的 **Browser Integrity Check** (BIC) 對 Cloudflare Workers 的 `fetch` 會回 `403 error code: 1010`。

**繞過方法**：
1. ✅ 暫時用 TikHub（5 平台）或自寫解析
2. ❌ 從 Worker 發 fetch 偽裝瀏覽器 — 不可行（BIC 看 TLS 指紋，不是 headers）
3. ✅ 用 RapidAPI 的前端 PlayGround/Postman 直接呼叫 → 前端使用者自己的瀏覽器有瀏覽器身份
4. ✅ Cloudflare Browser Rendering API（付費）

## 📁 檔案結構

```
workers/src/
├── index.js              # 主程式（含前端 HTML + 5 平台解析）
├── deploy_v2.py          # 部署腳本
├── test_keys.py          # 測試腳本
├── bundle-worker.js      # 舊版（保留）
└── ...
```

## 🧪 測試

```bash
python test_keys.py
```

## 📡 API

### POST /api/video-info

**請求**：
```json
{
  "url": "https://v.douyin.com/xxxxxx/",
  "userKey": "optional_user_tikhub_key"
}
```

**回應**：
```json
{
  "success": true,
  "url": "https://...",
  "title": "影片標題",
  "thumbnail": "https://...",
  "duration": 15000,
  "platform": "douyin",
  "uploader": "作者",
  "source": "tikhub"
}
```

### GET /api/dl-stream

代理下載影片（繞過 referer 限制）。

```
GET /api/dl-stream?url=<video_url>&filename=<name>.mp4
```

## 💡 使用建議

1. **剛開始**：先用 1 個 TikHub Key 試用（500 次/月）
2. **用量大**：邀請朋友註冊（每邀請 1 人 +500 次/月）
3. **不想付費**：讓用戶自帶 Key
4. **商業用**：付費 $5/月（10000 次/月）

## 🔒 注意事項

- 第三方 API Key 切勿提交到 git
- 大量請求時 Worker 會自動分散到不同 Key
- 失敗的 Key 會暫時跳過，恢復後自動重試

---

## 已知問題

### 抖音

- 2026 年抖音 bdms 升級後，自寫 a-bogus 簽名無法繞過
- **必須用 TikHub 或 RapidAPI 才能成功解析**
- App 分享的短網址（v.douyin.com）成功率最高

### Instagram / Threads

- 需要登入的內容無法解析
- 公開 Reel / Post 成功率 80%+

### 蝦皮

- Free 帳號下完全無法解析
- 需升 Cloudflare Paid + Browser Rendering
