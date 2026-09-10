# 龍淵裂影 🐉

> 本地 AI 短影音創作工具 - 全自動生成台灣口播文案 + 台語配音 + 智能混剪

## ✨ 功能特色

- 🤖 **本地 AI 模型**：完全離線運作，保護隱私
- 🎤 **台灣口音配音**：支援國語、台語等多種口音
- ✍️ **AI 自動寫稿**：一鍵生成符合台灣文化的口播文案
- 🎬 **智能混剪**：自動配字幕、轉場、BGM

## 🛠️ 技術架構

- **前端**：Electron + React + TypeScript + Tailwind CSS
- **AI 模型**：Qwen2.5 (LLM) + Piper TTS (語音合成)
- **硬體偵測**：自動推薦適合的模型
- **打包工具**：Vite + electron-builder

## 📦 安裝步驟

```bash
# 1. 克隆專案
git clone https://github.com/shaojun417/longyuan-lieying.git
cd longyuan-lieying

# 2. 安裝依賴
npm install

# 3. 開發模式
npm run dev

# 4. 打包成 .exe
npm run build
```

## 🖥️ 系統需求

- **作業系統**：Windows 10/11（macOS、Linux 開發中）
- **RAM**：建議 8GB 以上
- **硬碟空間**：需要 5GB+ 給 AI 模型
- **網路**：首次啟動需要下載 AI 模型

## 📂 專案結構

```
electron/
├── src/
│   ├── main/              # Electron 主程序
│   │   ├── index.ts       # 主入口
│   │   ├── hardware-detect.ts   # 硬體偵測
│   │   ├── model-manager.ts     # 模型管理
│   │   ├── first-run.ts         # 首次啟動流程
│   │   └── narration/           # 文案生成（階段 2）
│   │       ├── prompt-templates.ts   # Prompt 範本
│   │       ├── similarity-check.ts   # 不相似性檢查
│   │       ├── llm-engine.ts         # node-llama-cpp 封裝
│   │       ├── script-writer.ts      # 主邏輯
│   │       └── script-handlers.ts     # IPC handlers
│   ├── preload/           # 預載腳本（IPC 橋接）
│   │   └── index.ts
│   ├── renderer/          # React UI
│   │   ├── App.tsx
│   │   └── pages/
│   │       ├── FirstRunScreen.tsx
│   │       └── NarrationScreen.tsx  # 文案生成 UI
│   ├── shared/            # 共用型別
│   │   └── types.ts
│   └── resources/             # 圖片、圖標、BGM
└── models/                # AI 模型（不下載到 git）
```

## 🎯 開發進度

查看 [PLAN.md](PLAN.md) 了解完整的開發計劃。

### ✅ 已完成
- [x] 專案初始化
- [x] Electron + React + TypeScript 架構
- [x] 硬體偵測模組
- [x] 模型管理器
- [x] 首次啟動流程
- [x] 首次啟動 UI
- [x] **環境驗證**（npm install / vite build / Electron 三進程啟動）
- [x] **修正 vite-plugin-electron-renderer 導致 electron-log 變成 renderer 版的 bug**
- [x] **修正模型管理器：殘留檔（< 預期大小 95%）會被誤判為已下載的 bug**
- [x] **AI 文案生成器**（LLM + 不相似性檢查 + React UI + IPC）
  - 台灣口吻 prompt 範本（直接說話聊天風格）
  - node-llama-cpp 單例 Lazy Loading
  - 簡轉繁字典（180+ 字）+ Levenshtein 不相似性檢查
  - 自動重試（最多 3 次，太相似就重生）
  - 5 種不同切入點（痛點/故事/反轉/情境/數字）

### 🚧 開發中
- [ ] AI 文案生成器（E2E 實測，需下載 4.9GB 模型）
- [ ] TTS 語音合成
- [ ] 影片素材管理
- [ ] 混剪引擎

## 🔧 開發指令速查

| 指令 | 用途 |
|------|------|
| `npm install` | 安裝依賴（含 Electron 二進位檔） |
| `npm run dev` 或 `npx vite` | 啟動開發模式（熱重載） |
| `npx tsc --noEmit` | 型別檢查（renderer） |
| `npx tsc --noEmit -p tsconfig.node.json` | 型別檢查（main + preload） |
| `npm run build` | 打包成 production 版本 |
| `npm run electron:build` | 打包成 .exe |

## ⚠️ 已知陷阱與解法

### 1. vite-plugin-electron-renderer 會把 electron-log 換成 renderer 版

**症狀**：主進程啟動時報錯 `Cannot set properties of undefined (setting 'level')`，出現在 `dist-electron/main/index.js:1006:27`。

**原因**：`vite-plugin-electron-renderer` 預設會把 Node module（包括 `electron-log`）在主進程的 require 替換成瀏覽器版的 polyfill，但 polyfill 沒有 `file` transport，所以 `logger.transports.file.level` 會 undefined。

**解法**：在 `vite.config.ts` 的 main bundle `rollupOptions.external` 明確加入 `electron-log`，強制 main process 用 Node 版的 electron-log（從 `node_modules` 載入，有 `file` transport）。

```ts
// vite.config.ts
external: [
  'electron',
  'electron-log',   // ← 關鍵！不要讓 renderer plugin 接手
  'node-llama-cpp',
  'systeminformation',
],
```

同時也建議**不要使用 `vite-plugin-electron-renderer`**，因為它的 polyfill 機制在 main process 也會干擾，直接拿掉即可。

### 2. 模型管理器會把殘留檔（未下載完的檔案）當成「已下載」

**症狀**：模型下載中途中斷（手動關閉、網路斷線），重啟後看到「模型已存在，不需要下載」，但實際檔案大小只有幾 KB，無法載入使用。

**原因**：原本用 `fs.existsSync()` 判斷模型是否已下載，但只要檔案存在就會回傳 true。

**解法**：
- 改用「檔案存在 + 大小 >= 預期的 95%」判斷（容忍 server 報告 size 的微小誤差）
- 啟動時呼叫 `modelManager.cleanupIncompleteModels()`，自動清掉所有殘留檔

```ts
// 私有 helper：完整檢查
private isModelFileComplete(modelName: string, expectedSize: number): boolean {
  const modelPath = this.getModelPath(modelName);
  if (!fs.existsSync(modelPath)) return false;
  const stats = fs.statSync(modelPath);
  return stats.size >= expectedSize * 0.95;
}
```

### 3. main process 的 vite watch 不會自動重啟

**症狀**：用 `npm run dev`（vite-only）時，改了 `electron/src/main/index.ts`，但主進程不會重啟，必須手動 `Ctrl+C` 再重啟。

**原因**：`vite-plugin-electron` 的 HMR 只在它自己啟動時運作，如果只用 `vite`（沒有透過 plugin）就不會觸發。

**解法**：直接用 `npm run dev`（已經改成 `build:all && electron .`），或對 `electron/src/main/**` 改檔後手動重啟。

## 📄 授權

MIT License - 詳見 [LICENSE](LICENSE) 檔案

## 👨‍💻 作者

[shaojun417](https://github.com/shaojun417)
