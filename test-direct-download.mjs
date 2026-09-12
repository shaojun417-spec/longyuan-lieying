/**
 * 直接下載測試
 * 使用 Node.js 內建 fetch 下載抖音影片
 */

const OUTPUT_DIR = 'C:\\Users\\DMB7890\\下載\\test-dl';
const fetch = globalThis.fetch;

// 用戶提供的影片 URL
const VIDEO_URL = 'https://v3-dy-o.zjcdn.com/dc00eedc4cbc246301449dbd6da6eabc/6aa25604/video/tos/cn/tos-cn-ve-15/ocEbXIDEIBALOQ3bbheaxWrLfFFcOBAWnCf7QA/?a=6383&ch=0&cr=0&dr=0&er=0&cd=0%7C0%7C0%7C0&cv=1&br=1870&bt=1870&cs=0&ds=4&ft=CZcaELOtDDhNJFVQ9wajKMHhd.2f93mR3-ApQX&mime_type=video_mp4&qs=0&rc=ZTY6ZGhoMzRoOjM4aDs6NUBpamVybTM6Zm15cTMzNGkzM0AuYmI1YjBjX14xNDUzLzVjYSNzX2EycjRnL2tgLS1kLWFzcw%3D%3D&btag=c0000e00010000&cc=1f&cquery=100b_108D&dy_q=1789020129&feature_id=46a7bb47b4fd1280f3d3825bf2b29388&l=2026091014020939B729F3E4EFAFFB0184&req_cdn_type=';

async function downloadVideo(url) {
  console.log('🚀 開始下載影片...\n');
  console.log('URL:', url.substring(0, 100) + '...\n');
  
  const startTime = Date.now();
  
  try {
    console.log('📡 發送請求...');
    const response = await fetch(url);
    
    console.log('✅ 請求成功！');
    console.log('狀態:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('Content-Length:', response.headers.get('content-length'), 'bytes');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log('\n📥 讀取資料...');
    const buffer = await response.arrayBuffer();
    
    const duration = Date.now() - startTime;
    const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
    const speedMBps = ((buffer.byteLength / 1024 / 1024) / (duration / 1000)).toFixed(2);
    
    console.log(`\n✅ 下載完成！`);
    console.log(`大小: ${sizeMB} MB`);
    console.log(`耗時: ${duration}ms`);
    console.log(`速度: ${speedMBps} MB/s`);
    
    // 儲存檔案
    const filename = `test-video-${Date.now()}.mp4`;
    const filepath = `${OUTPUT_DIR}\\${filename}`;
    
    console.log(`\n💾 儲存到: ${filepath}`);
    
    const fs = await import('fs');
    fs.writeFileSync(filepath, Buffer.from(buffer));
    
    console.log('✅ 儲存成功！');
    console.log('\n📹 檔案路徑:', filepath);
    console.log('📏 檔案大小:', fs.statSync(filepath).size, 'bytes');
    
    return filepath;
  } catch (error) {
    console.error('❌ 下載失敗:', error.message);
    return null;
  }
}

downloadVideo(VIDEO_URL);
