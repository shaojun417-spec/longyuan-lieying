// 追蹤抖音短網址重定向
async function traceDouyin() {
  const shortUrl = 'https://v.douyin.com/iJ2R6Dtu/';
  console.log('Fetching:', shortUrl);

  const r = await fetch(shortUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  console.log('Final URL:', r.url);
  console.log('Status:', r.status);
}

traceDouyin().catch(console.error);
