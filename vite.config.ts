import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  // Renderer 的根目錄
  root: path.resolve(__dirname, 'electron/src/renderer'),
  base: './', // 打包後的相對路徑（讓 Electron 用 file:// 載入）
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/src/main/index.ts',
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              // 強制 external,確保 main 用的是 Node 版的 electron-log,
              // 不會被 vite-plugin-electron-renderer 替換成 renderer 版
              external: [
                'electron',
                'electron-log',
                'node-llama-cpp',
                'systeminformation',
              ],
            },
          },
        },
      },
      {
        entry: 'electron/src/preload/index.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'electron/src'),
      '@renderer': path.resolve(__dirname, 'electron/src/renderer'),
      '@main': path.resolve(__dirname, 'electron/src/main'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
