/**
 * 測試下載功能
 * 用於驗證抖音/小紅書影片下載
 */

import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = 'C:\\Users\\DMB7890\\下載\\test-dl';

// 確保輸出目錄存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 使用 Node.js 內建的 fetch（Node 18+）
const fetch = globalThis.fetch;

async function testNetwork() {
  console.log('=== 測試 1: 網路連線 ===');
  try {
    const response = await fetch('https://www.baidu.com');
    console.log('✅ 網路正常，狀態:', response.status);
    return true;
  } catch (error) {
    console.log('❌ 網路錯誤:', error.message);
    return false;
  }
}

async function testDouyinShortUrl(url) {
  console.log('\n=== 測試 2: 抖音短網址解析 ===');
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      redirect: 'follow',
    });
    
    console.log('最終 URL:', response.url);
    console.log('最終狀態:', response.status);
    
    // 如果有 location header
    const location = response.headers.get('location');
    if (location) {
      console.log('Location:', location);
    }
    
    return response.url;
  } catch (error) {
    console.log('❌ 請求失敗:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 開始測試下載功能\n');
  
  // 測試網路
  const networkOk = await testNetwork();
  
  if (networkOk) {
    console.log('\n✅ 網路測試通過！');
    
    // 測試抖音短網址
    const finalUrl = await testDouyinShortUrl('https://v.douyin.com/xxxxx');
    
    console.log('\n📝 測試完成！');
    console.log('\n要完整測試影片下載，需要：');
    console.log('1. 部署 Cloudflare Workers 解析 API');
    console.log('2. 或使用 FDM 命令列: fdm.exe -fs "URL"');
  }
}

main().catch(console.error);
