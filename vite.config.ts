import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
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
              external: ['electron', 'node-llama-cpp', 'systeminformation'],
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
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'electron/src'),
      '@renderer': path.resolve(__dirname, 'electron/src/renderer'),
      '@main': path.resolve(__dirname, 'electron/src/main'),
    },
  },
  build: {
    outDir: 'dist',
  },
});
