/**
 * 測試影片解析功能
 * 
 * 測試抖音/小紅書影片解析
 */

import { parseVideoUrl, detectPlatform, extractVideoId } from './electron/src/main/download/video-parser';

// 測試 URL
const TEST_URLS = [
  // 抖音測試
  'https://www.douyin.com/video/7490867298203340047',
  'https://v.douyin.com/xxxxx',
  
  // 小紅書測試
  'https://www.xiaohongshu.com/explore/abc123def456',
];

async function test() {
  console.log('🚀 測試影片解析功能\n');
  
  for (const url of TEST_URLS) {
    console.log('='.repeat(60));
    console.log('📝 測試 URL:', url);
    
    // 檢測平台
    const platform = detectPlatform(url);
    console.log('🔍 平台:', platform);
    
    // 提取 ID
    const videoId = extractVideoId(url, platform);
    console.log('🆔 影片 ID:', videoId);
    
    // 解析
    console.log('\n⏳ 解析中...');
    const result = await parseVideoUrl(url);
    
    if (result.success && result.data) {
      console.log('\n✅ 解析成功！');
      console.log('📹 標題:', result.data.title);
      console.log('👤 作者:', result.data.author);
      console.log('🎬 時長:', result.data.duration, '秒');
      console.log('📐 解析度:', result.data.width, 'x', result.data.height);
      console.log('🔗 URL:', result.data.url.substring(0, 80) + '...');
    } else {
      console.log('\n❌ 解析失敗:', result.error);
    }
    
    console.log('\n');
  }
  
  console.log('='.repeat(60));
  console.log('🏁 測試完成');
}

test().catch(console.error);
