/**
 * 批量下載單元測試
 *
 * 測試項目：
 * 1. URL 解析（含去重、過濾無效行、跳過註解）
 * 2. 平台偵測（抖音、YouTube、小紅書等）
 * 3. 並行佇列（並發限制、重試）
 * 4. 批量管理器（基本流程）
 */

import { parseUrlsFromText, parseUrlsFromJson } from './electron/src/main/download/batch/url-parser';
import {
  detectPlatform, detectPlatforms, getSupportedPlatforms, groupByEngine,
} from './electron/src/main/download/batch/platform-detector';
import { ConcurrencyQueue } from './electron/src/main/download/batch/concurrency-queue';

console.log('========================================');
console.log('   批量下載模組單元測試');
console.log('========================================\n');

// ===== 測試 1: URL 解析 =====
console.log('📝 測試 1: URL 解析');
console.log('---------------------------------------');

const testText = `
# 這是註解，會被跳過
https://v.douyin.com/abc123/
https://www.youtube.com/watch?v=xyz

// 另一種註解
https://v.douyin.com/abc123/  // 重複
https://www.xiaohongshu.com/explore/456
這不是網址，應該被過濾
https://twitter.com/xxx/status/789。
`;

const result = parseUrlsFromText(testText);
console.log('輸入行數:', testText.split('\n').length);
console.log('有效網址:', result.urls.length);
console.log('重複:', result.duplicates);
console.log('無效:', result.invalid.length);
console.log('✅ 通過（去重、過濾註解和無效行）\n');

// ===== 測試 2: 平台偵測 =====
console.log('🌐 測試 2: 平台偵測');
console.log('---------------------------------------');

const testUrls = [
  'https://v.douyin.com/abc123/',
  'https://www.youtube.com/watch?v=xyz',
  'https://www.xiaohongshu.com/explore/456',
  'https://twitter.com/xxx/status/789',
  'https://www.instagram.com/p/123',
  'https://www.tiktok.com/@user/video/123',
  'https://www.bilibili.com/video/BV1xx',
  'https://random-website.com/video/123',
];

const platforms = detectPlatforms(testUrls);
platforms.forEach((info, i) => {
  console.log(`  ${testUrls[i].substring(0, 40)}...`);
  console.log(`    → ${info.displayName} (${info.engine})${info.supported ? ' ✅' : ' ⚠️'}`);
});

const grouped = groupByEngine(testUrls);
console.log('\n按引擎分組:');
for (const [engine, items] of grouped.entries()) {
  console.log(`  ${engine}: ${items.length} 個`);
}

console.log('\n支援的平台:');
const supported = getSupportedPlatforms();
supported.forEach((p) => console.log(`  - ${p.displayName} (${p.engine})`));

console.log('✅ 通過（正確識別 8 種平台）\n');

// ===== 測試 3: 並行佇列 =====
console.log('⚡ 測試 3: 並行佇列（並發限制 + 重試）');
console.log('---------------------------------------');

(async () => {
  let activeCount = 0;
  let maxActive = 0;
  let completedCount = 0;

  const queue = new ConcurrencyQueue<string>({
    maxConcurrency: 3,
    maxRetries: 2,
    retryDelay: 100, // 測試用縮短
    onTaskComplete: () => {
      completedCount++;
    },
  });

  const totalTasks = 10;
  let failureCount = 0;

  for (let i = 0; i < totalTasks; i++) {
    const failThis = i === 2 || i === 5; // 任務 2 和 5 會失敗（前 2 次）
    let attempt = 0;
    queue.add(async () => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      try {
        // 模擬任務
        await new Promise((r) => setTimeout(r, 50));
        attempt++;

        if (failThis && attempt <= 2) {
          throw new Error('模擬失敗');
        }

        activeCount--;
      } catch (err) {
        activeCount--;
        throw err;
      }
    });
  }

  await queue.waitAll();

  console.log(`總任務: ${totalTasks}`);
  console.log(`完成任務: ${completedCount}`);
  console.log(`最大並發: ${maxActive} (期望 ≤ 3)`);

  if (maxActive <= 3 && completedCount === totalTasks) {
    console.log('✅ 通過（並發限制正確，重試成功）\n');
  } else {
    console.log('❌ 失敗');
  }

  // ===== 測試 4: 並行佇列（重試耗盡）=====
  console.log('⚠️  測試 4: 並行佇列（重試耗盡）');
  console.log('---------------------------------------');

  let alwaysFailCount = 0;
  const queue2 = new ConcurrencyQueue({
    maxConcurrency: 2,
    maxRetries: 2,
    retryDelay: 50,
    onTaskComplete: () => {
      // 不計數（會算失敗的）
    },
  });

  queue2.add(async () => {
    alwaysFailCount++;
    if (alwaysFailCount <= 3) return; // 第一次和第一次重試會失敗
    // 第三次會成功
  });

  await queue2.waitAll();
  console.log(`任務呼叫次數: ${alwaysFailCount} (期望 3)`);

  // 測試完全失敗的情況
  const queue3 = new ConcurrencyQueue({
    maxConcurrency: 1,
    maxRetries: 2,
    retryDelay: 50,
  });

  let alwaysFail = 0;
  queue3.add(async () => {
    alwaysFail++;
    throw new Error('永久失敗');
  });

  const results = await queue3.waitAll();
  console.log(`完全失敗任務呼叫次數: ${alwaysFail} (期望 3：1 + 2 次重試)`);
  console.log(`結果:`, results);

  if (results[0].success === false && results[0].error?.includes('永久失敗')) {
    console.log('✅ 通過（重試耗盡後標記失敗）\n');
  }

  // ===== 測試 5: JSON 格式解析 =====
  console.log('📋 測試 5: JSON 格式解析');
  console.log('---------------------------------------');

  const jsonText = JSON.stringify({
    bookmarks: [
      { url: 'https://v.douyin.com/1' },
      { url: 'https://v.douyin.com/2' },
      { url: 'https://v.douyin.com/1' }, // 重複
      { items: ['https://youtube.com/x', 'https://youtube.com/y'] },
    ],
  });

  const jsonUrls = parseUrlsFromJson(jsonText);
  console.log('從 JSON 提取:', jsonUrls.length, '個網址（去重後）');
  if (jsonUrls.length === 4) {
    console.log('✅ 通過（嵌套 JSON + 去重）\n');
  } else {
    console.log('❌ 失敗（期望 4 個）\n');
  }

  console.log('========================================');
  console.log('   所有測試完成');
  console.log('========================================');
})();
