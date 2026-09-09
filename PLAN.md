# 龍淵裂影 - 技術架構規劃

> 本文件說明龍淵裂影的技術選型、模組切分、開發流程

---

## 🎯 目標

打造一套**完全本地運行**的短影音創作工具，讓使用者只需要上傳影片，其他全部由 AI 自動完成。

**核心約束**：
- ❌ 不串接任何雲端 API（不依賴 ChatGPT、Azure、不需要網路）
- ❌ 不要讓使用者看到技術細節（終端機、Python、CUDA）
- ✅ 全部一鍵完成
- ✅ 一次輸出 3-5 支可發佈的影片

---

## 🏗️ 系統架構

### 整體流程

```
[使用者輸入產品資訊 + 上傳影片]
          ↓
┌─────────────────────────────────┐
│   Electron Desktop App (UI)    │
│   React + TypeScript           │
└────────────┬────────────────────┘
             ↓ IPC
┌─────────────────────────────────┐
│   Main Process (Node.js)        │
│   ┌────────────┬────────────┐  │
│   │ Script Gen │ TTS Engine │  │
│   │ (LLM)      │ (Win+Piper)│  │
│   └────────────┴────────────┘  │
│   ┌──────────────────────────┐  │
│   │ Video Pipeline (FFmpeg)  │  │
│   │  - Scene Detection       │  │
│   │  - Frame Sampling        │  │
│   │  - Color/Zoom Adjustment │  │
│   └──────────────────────────┘  │
└────────────┬────────────────────┘
             ↓ Shell Call
┌─────────────────────────────────┐
│   System (Local)                │
│   - FFmpeg.exe                  │
│   - Qwen Models (GGUF)         │
│   - Piper TTS Models           │
└─────────────────────────────────┘
```

---

## 📦 技術選型

### 前端 UI

| 項目 | 技術 | 原因 |
|------|------|------|
| 框架 | Electron 28+ | 跨平台、容易打包 |
| UI 庫 | React 18 + TypeScript | 主流、學習資源多 |
| 樣式 | Tailwind CSS | 快速開發、維護容易 |
| 狀態管理 | Zustand | 比 Redux 簡單 |

### 後端邏輯

| 項目 | 技術 | 原因 |
|------|------|------|
| 執行環境 | Node.js 20+ | 與前端共用 TypeScript |
| LLM 運行 | node-llama-cpp | 純本地、支援 GGUF |
| TTS | Windows TTS + Piper | 內建免費 + 神經網路高品質 |
| 影片處理 | FFmpeg subprocess | 行業標準 |

### AI 模型

| 項目 | 預設 | 備選 |
|------|------|------|
| LLM | Qwen2.5-3B-Instruct (Q4) | Qwen2.5-7B (16GB+ RAM) |
| LLM 量化 | Q4_K_M | Q5_K_M, Q8_0 |
| LLM 來源 | HuggingFace | 本地檔案 |
| TTS - Win | Hanhan / Yating / Zhiwei | 系統預裝 |
| TTS - 神經 | Piper 中文明 | - |

---

## 🗂️ 模組設計

### Electron 專案結構

```
electron/
├── src/
│   ├── main/                       # Main process (Node.js)
│   │   ├── index.ts                # Entry point
│   │   ├── ipc/                    # IPC handlers
│   │   ├── hardware-detect.ts      # 偵測 RAM / CPU / GPU
│   │   ├── model-manager.ts        # 模型下載 / 載入
│   │   ├── first-run.ts            # 首次啟動流程
│   │   ├── narration/              # 口播相關
│   │   │   ├── script-writer.ts    # LLM 文案生成
│   │   │   ├── prompt-templates.ts # Prompt 範本
│   │   │   ├── tts-engine.ts       # TTS 抽象
│   │   │   ├── windows-tts.ts      # Windows TTS
│   │   │   └── piper-tts.ts        # Piper 神經 TTS
│   │   └── video/                  # 影片處理
│   │       ├── scene-detect.ts     # 鏡頭切割
│   │       ├── remix.ts            # 混剪主邏輯
│   │       ├── fingerprint.ts      # 影片指紋去除
│   │       └── bgm.ts              # BGM 處理
│   │
│   ├── renderer/                   # Renderer process (React)
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Narration.tsx       # 口播文案分頁
│   │   │   ├── Remix.tsx           # 混剪分頁
│   │   │   └── Settings.tsx
│   │   └── store/
│   │
│   ├── preload/                    # 預載腳本（橋接）
│   │   └── index.ts
│   │
│   └── shared/                     # 共用 types
│       └── types.ts
│
├── models/                         # AI 模型（gitignore）
│   ├── qwen2.5-3b-instruct-q4.gguf
│   └── piper/
│       └── zh-CN.onnx
│
├── resources/                      # 應用資源
│   ├── bgm/                        # 內建 BGM 音樂庫
│   └── icons/
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── electron-builder.yml            # 打包設定
```

---

## 🧠 核心邏輯

### 1. 硬體偵測與模型推薦

```typescript
// hardware-detect.ts
export async function detectHardware() {
  const totalRAM = await getTotalRAM(); // GB
  const cpuCores = await getCPUCores();
  const gpuVRAM = await getVRAM(); // 可選
  
  if (totalRAM >= 6) {
    return { recommendedModel: 'qwen2.5-7b-q4', tier: 'high' };
  } else {
    return { recommendedModel: 'qwen2.5-3b-q4', tier: 'low' };
  }
}
```

### 2. LLM 文案生成（防同質化）

```typescript
// script-writer.ts
const PROMPT_TEMPLATE = `
你是台灣 30 歲女性短影音創作者，語氣像跟朋友聊天、不推銷。
請根據以下產品資訊，寫一段 15-30 秒的口播腳本（80-150 字）：

產品：{product}
功效：{effect}
目標受眾：{audience}
使用情境：{context}

要求：
1. 開頭一句 hook 抓眼球（「你知道嗎」「等等先別滑」之類）
2. 中間一個個人故事或生活情境
3. 結尾輕輕帶到產品，不直接叫賣
4. 全用台灣用詞（「影片」不寫「視頻」）
5. 數字寫成國字
6. 不要寫 emoji
7. 這是第 {index}/{total} 支影片，請使用不同的故事切入點

輸出只要一段連續的口播文字。
`;

async function generateUniqueScript(index, total, productInfo) {
  let attempts = 0;
  while (attempts < 3) {
    const script = await llm.generate(formatPrompt(PROMPT_TEMPLATE, {
      index, total, ...productInfo,
    }));
    
    if (index === 0 || !isTooSimilar(script, previousScripts)) {
      return script;
    }
    attempts++;
  }
  return script; // fallback
}
```

### 3. 影片指紋去除（FFmpeg）

```bash
# 抽幀 + 加幀 + 微弱調色 + 輕微 zoom
ffmpeg -i input.mp4 \
  -vf "fps=30,crop=iw*0.96:ih*0.96,noise=alls=2:allf=t+u,eq=contrast=1.02:saturation=1.02,scale=iw*1.02:ih*1.02" \
  output.mp4
```

### 4. 智能鏡頭切割

```bash
# 使用 FFmpeg scene detection
ffmpeg -i input.mp4 \
  -vf "select='gt(scene,0.3)',showinfo" \
  -f null - 2>&1 | grep showinfo
```

---

## 📊 開發階段

### 階段 1：基礎打底（1-2 天）
- [ ] 建立 Electron 專案骨架
- [ ] 硬體偵測 (RAM, CPU)
- [ ] 模型管理器（下載 / 載入）
- [ ] 首次啟動 UI（下載進度）

### 階段 2：文案生成（1-2 天）
- [ ] 整合 node-llama-cpp
- [ ] 寫 prompt 範本
- [ ] 簡轉繁、用詞台灣化
- [ ] 不相似性檢查
- [ ] UI：填表 + 生成 + 3 個按鈕

### 階段 3：配音（1 天）
- [ ] Windows TTS 串接
- [ ] Piper 自動下載
- [ ] 5 種音色選單
- [ ] 試聽功能

### 階段 4：整合混剪（1-2 天）
- [ ] 鏡頭切割
- [ ] 抽幀加幀處理
- [ ] 多支成片生成
- [ ] BGM 自動混音

### 階段 5：警告與保護（半天）
- [ ] 短素材警告
- [ ] 取消 / 重試機制
- [ ] 進度條與錯誤訊息

### 階段 6：測試與文件（1 天）
- [ ] 整合測試
- [ ] README 給使用者
- [ ] 包裝成 .exe

---

## ⚠️ 已知風險與緩解

| 風險 | 緩解策略 |
|------|---------|
| LLM 台灣口語表現不佳 | prompt 嚴格限制 + 範本模式 fallback |
| Piper 下載失敗 | 自動 fallback 到 Windows 內建 |
| FFmpeg 在不同平台差異 | 打包 FFmpeg 隨軟體，使用 subprocess 呼叫 |
| 模型檔太大 | 提供分流下載（HuggingFace + 國內鏡像）|
| 長影片處理時間長 | 非同步處理 + 進度條 |

---

## 🔄 開發流程

```
修改程式碼
  ↓ Git commit
推到 GitHub
  ↓ CI 自動檢查
測試通過
  ↓
打包成 .exe
  ↓
Release 給使用者下載
```

---

## 📚 參考資料

- [node-llama-cpp 文檔](https://github.com/withcatai/node-llama-cpp)
- [Piper TTS](https://github.com/rhasspy/piper)
- [FFmpeg Scene Detection](https://ffmpeg.org/ffmpeg-filters.html#select_002c-aselect)
- [Qwen2.5](https://huggingface.co/Qwen)
