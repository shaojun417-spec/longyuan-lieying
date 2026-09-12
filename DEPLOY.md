# 影片批量下載工具 - 部署指南

> 打開網址 → 貼多個影片網址 → 一鍵下載。
> 不要錢、不用裝、免費額度夠你一個人用到天荒地老。

---

## 你會得到什麼

部署完成後你會有兩個網址：

| 名稱 | 網址範例 | 用途 |
|------|---------|------|
| **前端** | `https://longyuan-video.pages.dev` | 你打開來用的網頁 |
| **後端 Worker** | `https://longyuan-workers.xxx.workers.dev` | 前端會呼叫它解析影片 |

兩個都免費，不用綁信用卡。

---

## 步驟一：部署 Worker（後端）

1. 打開 https://dash.cloudflare.com → 註冊/登入
2. 左邊選 **Workers & Pages** → **Create application** → **Create Worker**
3. 名稱隨便打（例如 `longyuan-workers`）→ **Deploy**
4. 部署完後點 **Edit code**
5. **把裡面所有程式碼刪掉**，把 `workers/src/index.ts` 的內容整個貼上去
6. 點 **Save and Deploy**
7. 記下你的 Worker 網址（會長這樣：`https://longyuan-workers.你的子網域.workers.dev`）

### 測試一下

打開瀏覽器網址列，貼：

```
https://longyuan-workers.你的子網域.workers.dev/health
```

應該會看到：

```json
{"status":"ok","timestamp":"...","platforms":["douyin","xiaohongshu","tiktok","youtube"]}
```

看到這個就成功了。

---

## 步驟二：部署前端

1. 回到 Cloudflare **Workers & Pages** → **Create application**
2. 選 **Pages** → **Upload assets**（不要選 Git）
3. 專案名稱打 `longyuan-video` → **Create project**
4. 把 **`web/` 這個資料夾**整包拖進去上傳（不需要打包，資料夾拖進去就好）
5. 部署完成後會給你網址：`https://longyuan-video.pages.dev`

### 把 Worker 網址串到前端

打開 `web/index.html`，找到第 165 行附近：

```javascript
const API = '';   // 例如 'https://longyuan-workers.xxx.workers.dev'
```

把你的 Worker 網址貼進去，存檔。

> **或是**不要改檔案，直接在部署前先用記事本打開 `web/index.html` 改好再上傳。

---

## 步驟三：開始用

1. 打開你的 Pages 網址（例如 `https://longyuan-video.pages.dev`）
2. 把影片連結貼進去（一行一個，最多 10 個）
3. 點「🚀 開始解析」
4. 每個網址解析完成後，按「⬇️ 下載」存到電腦

---

## 自訂網域（選用）

### 給 Pages 加自己的網域
1. 在 Pages 專案頁面 → **Custom domains** → **Set up a custom domain**
2. 輸入你的網域（例如 `video.你的網域.com`）
3. 它會叫你加一筆 DNS（在你的網域註冊商後台加）

### 給 Worker 加自己的網域
1. 在 Worker 頁面 → **Triggers** → **Custom Domains** → **Add Custom Domain**
2. 輸入（例如 `api.你的網域.com`）
3. 一樣加 DNS

---

## 哪些能下載、哪些不能

| 平台 | 狀態 | 說明 |
|------|------|------|
| 抖音 | ⚠️ 部分 | 需要貼「分享文字」（抖音 App 點分享 → 複製連結）才能解析到無水印。影片本身的解析需要 a-bogus 簽名（複雜），目前只能用抓 HTML 的方式湊合 |
| 小紅書 | ⚠️ 部分 | 沒登入狀態下很多影片抓不到，建議貼影片分享文字 |
| TikTok | ✅ 大部分可 | 用 `__UNIVERSAL_DATA_FOR_REHYDRATION__` 解析，成功率高 |
| YouTube | ❌ 不支援下載 | 只給嵌入預覽。YouTube 擋得緊，需要 yt-dlp |

### 抖音失敗最常見原因

1. **貼的是「用戶主頁」而不是影片** → 改成貼該用戶的「單支影片分享文字」
2. **抖音擋了 byted_acrawler** → Worker 沒做 a-bogus 簽名就會被擋
3. **網址被截斷** → 確認整段網址都貼上了，沒缺尾巴的 `/` 或字母

---

## 費用

Cloudflare 免費額度：
- Workers：每日 10 萬次請求
- Pages：無限靜態檔案託管、無限流量

你一個人用，**一輩子免費**。

---

## 怎麼更新程式碼

### 改前端
1. 改 `web/index.html`
2. 到 Cloudflare Pages 專案 → **Create deployment** → 重新上傳 `web/` 資料夾

### 改 Worker
1. 改 `workers/src/index.ts`
2. 到 Cloudflare Workers → **Edit code** → 貼上新程式碼 → **Save and Deploy**

---

## 出問題了

**前端開起來顯示「請先設定 API」**
→ 你忘了把 Worker 網址貼到 `web/index.html` 第 165 行

**解析一直失敗**
→ 開瀏覽器開發者工具（F12）→ Console 頁籤，看錯誤訊息

**下載按了沒反應**
→ 可能是瀏覽器擋了彈出下載，看網址列有沒有「允許下載」的提示

**抖音全部失敗**
→ 預期的，a-bogus 沒做。需要另外處理（這部分需要較深的逆向工程，不在本工具範圍）
