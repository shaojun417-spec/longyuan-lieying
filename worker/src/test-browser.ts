// 最小可行測試 — 用 Browser Rendering API 抓抖音頁面，看能不能跑 JS 拿到 mp4
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url') || 'https://v.douyin.com/ZgPWaJ_Llqo/';

    // 檢查有沒有 BROWSER binding
    const browser = (env as any).BROWSER;
    if (!browser) {
      return new Response(JSON.stringify({
        error: 'BROWSER binding 未設定',
        message: '請在 wrangler.toml 加上 browser = { binding = "BROWSER" } 並升級到 Paid Plan',
        account_id: 'b58a04fdc94b54fb8e25f8e6d1f67ee9'
      }, null, 2), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    try {
      // 開瀏覽器 session
      const session = await browser.newSession({ browser: { type: 'chromium' } });
      try {
        const page = await session.newPage();
        await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        // 等待 5 秒讓 JS 跑完
        await new Promise(r => setTimeout(r, 5000));

        // 嘗試抓頁面所有 video 元素的 src
        const result: any = await page.evaluate(() => {
          const videos: string[] = [];
          // 抓所有 video 元素
          document.querySelectorAll('video').forEach(v => {
            if (v.src) videos.push(v.src);
            if (v.currentSrc) videos.push(v.currentSrc);
            v.querySelectorAll('source').forEach(s => {
              if (s.src) videos.push(s.src);
            });
          });
          // 抓 performance API 裡的 mp4 請求
          const perfVideos: string[] = [];
          const entries = performance.getEntriesByType('resource');
          entries.forEach((e: any) => {
            if (/\.mp4|m3u8/.test(e.name)) perfVideos.push(e.name);
          });
          return {
            videoElements: videos,
            perfVideos: perfVideos.slice(0, 10),
            title: document.title,
            url: location.href
          };
        });

        await session.close();

        return new Response(JSON.stringify({
          success: true,
          target: targetUrl,
          result
        }, null, 2), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (e: any) {
        await session.close().catch(() => {});
        throw e;
      }
    } catch (e: any) {
      return new Response(JSON.stringify({
        error: 'Browser Rendering 失敗',
        message: e.message,
        stack: e.stack,
        hint: '這通常代表帳號沒升級到 Paid Plan，或 BROWSER binding 沒綁'
      }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }
};

interface Env {}
