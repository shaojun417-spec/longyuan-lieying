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
│   │   └── first-run.ts         # 首次啟動流程
│   ├── preload/           # 預載腳本（IPC 橋接）
│   │   └── index.ts
│   └── renderer/          # React UI
│       ├── App.tsx
│       ├── pages/
│       │   └── FirstRunScreen.tsx
│       └── components/
├── resources/             # 圖片、圖標、BGM
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

### 🚧 開發中
- [ ] AI 文案生成器
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

## 📄 授權

MIT License - 詳見 [LICENSE](LICENSE) 檔案

## 👨‍💻 作者

[shaojun417](https://github.com/shaojun417)
