// ============================================================
// 龍淵裂影 - Cloudflare Worker (合併版，單檔上傳)
// ============================================================

// ---------------- 以下為 src/abogus.js 合併 ----------------
// ============================================================
// 抖音 a-bogus 簽名（純算版，Worker 內運行）
// 來源：renmu123/biliLive-tools 的 TypeScript 移植（來自 hua0512/rust-srec）
// 改動：去掉 npm 依賴（自寫 SM3，RC4 用原生實作，型別移除）
// ⚠️ 抖音每次升級 bdms 時，a-bogus 算法版本會變。
//    如果失效，到 bilibiliLive-tools 拿新版 sign.ts 換掉這個檔即可。
// ============================================================

// ---------------- SM3 雜湊（國標 GB/T 32905-2016） ----------------
const SM3_IV = [
  0x7380166F, 0x4914B2B9, 0x172442D7, 0xDA8A0600,
  0xA96F30BC, 0x163138AA, 0xE38DEE4D, 0xB0FB0E4E,
];

const SM3_TJ = (() => {
  const T = new Uint32Array(64);
  for (let j = 0; j < 16; j++) T[j] = 0x79CC4519;
  for (let j = 16; j < 64; j++) {
    let a = T[j - 16] ^ T[j - 9] ^ (T[j - 3] << 15 | T[j - 3] >>> 17);
    a ^= a << 17;
    a ^= a >>> 9;
    a ^= a << 8;
    T[j] = T[j - 16] ^ a ^ T[j - 6] ^ (T[j - 3] << 23 | T[j - 3] >>> 9) ^ (T[j - 10] << 13 | T[j - 10] >>> 19);
  }
  return T;
})();

function rotl(x, n) {
  return (x << n) | (x >>> (32 - n));
}

function sm3Compress(V, block) {
  const W = new Uint32Array(68);
  for (let i = 0; i < 16; i++) {
    W[i] = (block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3];
  }
  for (let i = 16; i < 68; i++) {
    const x = W[i - 16] ^ W[i - 9] ^ rotl(W[i - 3], 15);
    W[i] = (x ^ rotl(W[i - 13], 7) ^ rotl(W[i - 6], 19) ^ W[i - 6] >>> 0) >>> 0;
  }
  const W1 = new Uint32Array(64);
  for (let i = 0; i < 64; i++) W1[i] = W[i] ^ W[i + 4];

  let A = V[0], B = V[1], C = V[2], D = V[3];
  let E = V[4], F = V[5], G = V[6], H = V[7];

  for (let j = 0; j < 64; j++) {
    const A12 = rotl(A, 12);
    const SS1 = rotl((rotl(A, 12) + E + SM3_TJ[j]) >>> 0, 7);
    const SS2 = (SS1 ^ A12) >>> 0;
    const TT1 = j < 16
      ? ((A ^ B ^ C) + D + SS2 + W1[j]) >>> 0
      : ((A & B | A & C | B & C) + D + SS2 + W[j]) >>> 0;
    const TT2 = j < 16
      ? ((E ^ F ^ G) + H + SS1 + W[j]) >>> 0
      : ((E & F | ~E & G) + H + SS1 + W[j]) >>> 0;
    D = C; C = rotl(B, 9); B = A; A = TT1;
    H = G; G = rotl(F, 19); F = E; E = (TT2 ^ rotl(TT1, 9) ^ rotl(TT2, 17)) >>> 0;
  }
  V[0] ^= A; V[1] ^= B; V[2] ^= C; V[3] ^= D;
  V[4] ^= E; V[5] ^= F; V[6] ^= G; V[7] ^= H;
}

function sm3(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const len = bytes.length;
  const bitLen = len * 8;
  const padLen = (((len + 8) >> 6) + 1) << 4;
  const buf = new Uint8Array(padLen * 4);
  buf.set(bytes);
  buf[len] = 0x80;
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  buf[padLen * 4 - 4] = (hi >>> 24) & 0xff;
  buf[padLen * 4 - 3] = (hi >>> 16) & 0xff;
  buf[padLen * 4 - 2] = (hi >>> 8) & 0xff;
  buf[padLen * 4 - 1] = hi & 0xff;
  buf[padLen * 4 - 8] = (lo >>> 24) & 0xff;
  buf[padLen * 4 - 7] = (lo >>> 16) & 0xff;
  buf[padLen * 4 - 6] = (lo >>> 8) & 0xff;
  buf[padLen * 4 - 5] = lo & 0xff;

  const V = new Uint32Array(SM3_IV);
  for (let i = 0; i < padLen * 4; i += 64) {
    sm3Compress(V, buf.subarray(i, i + 64));
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4]     = (V[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (V[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (V[i] >>> 8) & 0xff;
    out[i * 4 + 3] = V[i] & 0xff;
  }
  return Array.from(out, b => b.toString(16).padStart(2, '0')).join('');
}

function rc4Encrypt(key, plaintext) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const out = new Uint8Array(plaintext.length);
  let i = 0; j = 0;
  for (let k = 0; k < plaintext.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
    out[k] = plaintext.charCodeAt(k) ^ S[(S[i] + S[j]) & 0xff];
  }
  return out;
}

function toCharStr(bytes) {
  return Array.from(bytes, b => String.fromCharCode(b)).join('');
}

function toCharArray(s) {
  const arr = [];
  for (let i = 0; i < s.length; i++) arr.push(s.charCodeAt(i));
  return arr;
}

function generateRandomBytes(length) {
  const result = [];
  for (let i = 0; i < length; i++) {
    const rd = Math.floor(Math.random() * 10000);
    result.push((rd & 255 & 170) | 1);
    result.push((rd & 255 & 85) | 2);
    result.push(((rd >> 8) & 170) | 5);
    result.push(((rd >> 8) & 85) | 40);
  }
  return toCharStr(new Uint8Array(result));
}

const BIG_ARRAY = [
  121, 243, 55, 234, 103, 36, 47, 228, 30, 231, 106, 6, 115, 95, 78, 101, 250, 207, 198, 50,
  139, 227, 220, 105, 97, 143, 34, 28, 194, 215, 18, 100, 159, 160, 43, 8, 169, 217, 180, 120,
  247, 45, 90, 11, 27, 197, 46, 3, 84, 72, 5, 68, 62, 56, 221, 75, 144, 79, 73, 161, 178, 81,
  64, 187, 134, 117, 186, 118, 16, 241, 130, 71, 89, 147, 122, 129, 65, 40, 88, 150, 110, 219,
  199, 255, 181, 254, 48, 4, 195, 248, 208, 32, 116, 167, 69, 201, 17, 124, 125, 104, 96, 83,
  80, 127, 236, 108, 154, 126, 204, 15, 20, 135, 112, 158, 13, 1, 188, 164, 210, 237, 222, 98,
  212, 77, 253, 42, 170, 202, 26, 22, 29, 182, 251, 10, 173, 152, 58, 138, 54, 141, 185, 33,
  157, 31, 252, 132, 233, 235, 102, 196, 191, 223, 240, 148, 39, 123, 92, 82, 128, 109, 57, 24,
  38, 113, 209, 245, 2, 119, 153, 229, 189, 214, 230, 174, 232, 63, 52, 205, 86, 140, 66, 175,
  111, 171, 246, 133, 238, 193, 99, 60, 74, 91, 225, 51, 76, 37, 145, 211, 166, 151, 213, 206,
  0, 200, 244, 176, 218, 44, 184, 172, 49, 216, 93, 168, 53, 21, 183, 41, 67, 85, 224, 155, 226,
  242, 87, 177, 146, 70, 190, 12, 162, 19, 137, 114, 25, 165, 163, 192, 23, 59, 9, 94, 179, 107,
  35, 7, 142, 131, 239, 203, 149, 136, 61, 249, 14, 156,
];

function sm3ToArray(input) {
  const hash = sm3(input);
  return hash.match(/.{2}/g).map(b => parseInt(b, 16));
}

function transformBytes(valuesList) {
  const arr = BIG_ARRAY.slice();
  const result = [];
  let indexB = arr[1];
  let initialValue = 0, valueE = 0;
  const arrayLen = arr.length;
  for (let index = 0; index < valuesList.length; index++) {
    let sumInitial;
    if (index === 0) {
      initialValue = arr[indexB];
      sumInitial = indexB + initialValue;
      arr[1] = initialValue;
      arr[indexB] = indexB;
    } else {
      sumInitial = initialValue + valueE;
    }
    const sumInitialIdx = sumInitial % arrayLen;
    const valueF = arr[sumInitialIdx];
    result.push(valuesList[index] ^ valueF);
    const nextIdx = (index + 2) % arrayLen;
    valueE = arr[nextIdx];
    const newSumInitialIdx = (indexB + valueE) % arrayLen;
    initialValue = arr[newSumInitialIdx];
    [arr[newSumInitialIdx], arr[nextIdx]] = [arr[nextIdx], arr[newSumInitialIdx]];
    indexB = newSumInitialIdx;
  }
  return result;
}

const ALPHABET_0 = "Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe";
const ALPHABET_1 = "ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe";

function base64Encode(bytes, selectedAlphabet) {
  const alphabet = selectedAlphabet === 0 ? ALPHABET_0 : ALPHABET_1;
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1] || 0;
    const b3 = bytes[i + 2] || 0;
    const combined = (b1 << 16) | (b2 << 8) | b3;
    output += alphabet[(combined >> 18) & 63];
    output += alphabet[(combined >> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(combined >> 6) & 63] : "";
    output += i + 2 < bytes.length ? alphabet[combined & 63] : "";
  }
  while (output.length % 4 !== 0) output += "=";
  return output;
}

function abogusEncode(values, selectedAlphabet) {
  const alphabet = selectedAlphabet === 0 ? ALPHABET_0 : ALPHABET_1;
  let out = "";
  for (let i = 0; i < values.length; i += 3) {
    const v1 = values[i];
    const v2 = values[i + 1] || 0;
    const v3 = values[i + 2] || 0;
    const n = (v1 << 16) | (v2 << 8) | v3;
    out += alphabet[(n & 0xfc0000) >> 18];
    out += alphabet[(n & 0x03f000) >> 12];
    out += i + 1 < values.length ? alphabet[(n & 0x0fc0) >> 6] : "";
    out += i + 2 < values.length ? alphabet[n & 0x3f] : "";
  }
  while (out.length % 4 !== 0) out += "=";
  return out;
}

function generateFingerprint() {
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const innerWidth = rand(1024, 1920);
  const innerHeight = rand(768, 1080);
  const outerWidth = innerWidth + rand(24, 32);
  const outerHeight = innerHeight + rand(75, 90);
  const screenX = 0;
  const screenY = [0, 30][rand(0, 1)];
  const sizeWidth = rand(1024, 1920);
  const sizeHeight = rand(768, 1080);
  const availWidth = rand(1280, 1920);
  const availHeight = rand(800, 1080);
  return `${innerWidth}|${innerHeight}|${outerWidth}|${outerHeight}|${screenX}|${screenY}|0|0|${sizeWidth}|${sizeHeight}|${availWidth}|${availHeight}|${innerWidth}|${innerHeight}|24|24|Win32`;
}

const SORT_INDEX = [
  18, 20, 52, 26, 30, 34, 58, 38, 40, 53, 42, 21, 27, 54, 55, 31, 35, 57, 39, 41, 43, 22, 28,
  32, 60, 36, 23, 29, 33, 37, 44, 45, 59, 46, 47, 48, 49, 50, 24, 25, 65, 66, 70, 71,
];
const SORT_INDEX_2 = [
  18, 20, 26, 30, 34, 38, 40, 42, 21, 27, 31, 35, 39, 41, 43, 22, 28, 32, 36, 23, 29, 33, 37,
  44, 45, 46, 47, 48, 49, 50, 24, 25, 52, 53, 54, 55, 57, 58, 59, 60, 65, 66, 70, 71,
];
const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function generateABogus(params, body = "", userAgent = DEFAULT_UA) {
  const abDir = {
    8: 3, 18: 44, 66: 0, 69: 0, 70: 0, 71: 0,
  };
  const startEncryption = Date.now();
  const paramsHash1 = sm3(params + "cus");
  const array1 = sm3ToArray(paramsHash1);
  const bodyHash1 = sm3((body || "") + "cus");
  const array2 = sm3ToArray(bodyHash1);
  const rc4Ua = rc4Encrypt([0x00, 0x01, 0x0e], userAgent);
  const uaB64 = base64Encode(rc4Ua, 1);
  const array3 = sm3ToArray(uaB64);
  const endEncryption = Date.now();

  abDir[20] = (startEncryption >> 24) & 255;
  abDir[21] = (startEncryption >> 16) & 255;
  abDir[22] = (startEncryption >> 8) & 255;
  abDir[23] = startEncryption & 255;
  abDir[24] = Math.floor(startEncryption / 0x100000000);
  abDir[25] = Math.floor(startEncryption / 0x10000000000);

  const options = [0, 1, 14];
  abDir[26] = (options[0] >> 24) & 255;
  abDir[27] = (options[0] >> 16) & 255;
  abDir[28] = (options[0] >> 8) & 255;
  abDir[29] = options[0] & 255;
  abDir[30] = Math.floor(options[1] / 256) & 255;
  abDir[31] = options[1] % 256;
  abDir[32] = (options[1] >> 24) & 255;
  abDir[33] = (options[1] >> 16) & 255;
  abDir[34] = (options[2] >> 24) & 255;
  abDir[35] = (options[2] >> 16) & 255;
  abDir[36] = (options[2] >> 8) & 255;
  abDir[37] = options[2] & 255;

  abDir[38] = array1[21];
  abDir[39] = array1[22];
  abDir[40] = array2[21];
  abDir[41] = array2[22];
  abDir[42] = array3[23];
  abDir[43] = array3[24];

  abDir[44] = (endEncryption >> 24) & 255;
  abDir[45] = (endEncryption >> 16) & 255;
  abDir[46] = (endEncryption >> 8) & 255;
  abDir[47] = endEncryption & 255;
  abDir[48] = abDir[8];
  abDir[49] = Math.floor(endEncryption / 0x100000000);
  abDir[50] = Math.floor(endEncryption / 0x10000000000);

  const pageId = 0;
  abDir[51] = (pageId >> 24) & 255;
  abDir[52] = (pageId >> 16) & 255;
  abDir[53] = (pageId >> 8) & 255;
  abDir[54] = pageId & 255;
  abDir[55] = pageId;

  const aid = 6383;
  abDir[56] = aid;
  abDir[57] = aid & 255;
  abDir[58] = (aid >> 8) & 255;
  abDir[59] = (aid >> 16) & 255;
  abDir[60] = (aid >> 24) & 255;

  const fp = generateFingerprint();
  abDir[64] = fp.length;
  abDir[65] = fp.length;

  const sortedValues = SORT_INDEX.map(i => abDir[i] || 0);
  const fpArray = toCharArray(fp);

  let abXor = 0;
  SORT_INDEX_2.forEach((key, idx) => {
    const val = abDir[key] || 0;
    abXor = idx === 0 ? val : abXor ^ val;
  });

  const allValues = [...sortedValues, ...fpArray, abXor];
  const transformed = transformBytes(allValues);
  const randomPrefix = generateRandomBytes(3).split('').map(c => c.charCodeAt(0));
  const finalValues = [...randomPrefix, ...transformed];
  const abogus = abogusEncode(finalValues, 0);
  return abogus;
}

// ---------------- 以下為 src/index.js 合併 ----------------

function detectPlatform(text) {
  const u = text.toLowerCase();
  if (u.includes('douyin.com') || u.includes('iesdouyin.com')) return 'douyin';
  if (u.includes('xiaohongshu.com') || u.includes('xhslink.com')) return 'xiaohongshu';
  if (u.includes('tiktok.com') || u.includes('vm.tiktok')) return 'tiktok';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  return 'unknown';
}

function extractUrl(raw) {
  const m = raw.match(/https?:\/\/[^\s一-鿿　-〿＀-￯]+/);
  if (m) return m[0].replace(/[,，。、)\]}>]+$/, '');
  return raw.trim();
}

async function fetchFollowing(url, ua) {
  const r = await fetch(url, {
    headers: { 'User-Agent': ua, 'Accept': 'text/html,application/json,*/*' },
    redirect: 'follow',
  });
  return { finalUrl: r.url, html: await r.text(), status: r.status };
}

function stripWatermark(url) {
  return url
    .replace(/watermark=1/g, 'watermark=0')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

const UA_DOUYIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function parseDouyin(rawText) {
  const url = extractUrl(rawText);
  try {
    const { finalUrl, html } = await fetchFollowing(url, UA_DOUYIN);
    const patterns = [
      /"aweme_id":"(\d+)"/,
      /\/video\/(\d{15,20})/,
      /"itemId"\s*:\s*"(\d+)"/,
      /window\.__INITIAL_STATE__\s*=\s*({.+?});\s*</,
    ];
    let awemeId = null;
    for (const p of patterns) {
      const m = html.match(p);
      if (m && p.source.includes('aweme_id')) {
        awemeId = m[1];
        break;
      }
    }
    if (!awemeId) {
      const u = new URL(finalUrl);
      const mid = u.searchParams.get('modal_id');
      if (mid && /^\d+$/.test(mid)) awemeId = mid;
    }

    if (!awemeId) {
      return {
        success: false, platform: 'douyin',
        error: '找不到影片 ID',
        error_hint: '請貼抖音 App「分享 → 複製連結」那整段文字',
      };
    }

    const queryParams = {
      device_platform: 'webapp', aid: '6383', channel: 'channel_pc_web',
      aweme_id: awemeId, pc_client_type: '1', version_code: '190500',
      version_name: '19.5.0', cookie_enabled: 'true',
      screen_width: '1920', screen_height: '1080',
      browser_language: 'zh-CN', browser_platform: 'Win32',
      browser_name: 'Chrome', browser_version: '130.0.0.0',
      browser_online: 'true', engine_name: 'Blink', engine_version: '130.0.0.0',
      os_name: 'Windows', os_version: '10',
      cpu_core_num: '16', device_memory: '8', platform: 'PC',
      downlink: '10', effective_type: '4g', round_trip_time: '0',
      webid: String(Math.floor(Math.random() * 9e15) + 1e14),
    };
    const paramStr = Object.entries(queryParams).map(([k, v]) => `${k}=${v}`).join('&');

    const aBogus = generateABogus(paramStr, '', UA_DOUYIN);
    const fullUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?${paramStr}&a_bogus=${aBogus}`;

    const apiResp = await fetch(fullUrl, {
      headers: {
        'User-Agent': UA_DOUYIN,
        'Referer': 'https://www.douyin.com/',
        'Cookie': 'ttwid=1%7Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      },
    });
    const data = await apiResp.json();

    if (data.status_code !== 0 || !data.aweme_detail) {
      return {
        success: false, platform: 'douyin',
        error: '抖音 API 拒絕請求',
        error_hint: `status_code=${data.status_code}, status_msg=${data.status_msg || 'unknown'}`,
      };
    }

    const aweme = data.aweme_detail;
    let playUrl = '';
    const candidates = [
      aweme.video?.play_addr?.url_list,
      aweme.video?.play_addr_lowbr?.url_list,
      aweme.video?.download_addr?.url_list,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length) { playUrl = c[0]; break; }
    }
    if (!playUrl) {
      return {
        success: false, platform: 'douyin',
        error: '影片已下架或被設為私密',
        error_hint: 'aweme_id=' + awemeId,
      };
    }

    return {
      success: true,
      url: stripWatermark(playUrl),
      title: aweme.desc || `抖音影片 ${awemeId}`,
      thumbnail: aweme.video?.cover?.url_list?.[0] || aweme.video?.origin_cover?.url_list?.[0] || '',
      duration: aweme.video?.duration || 0,
      fileSize: aweme.video?.play_addr?.data_size || 0,
      platform: 'douyin',
      uploader: aweme.author?.nickname || '',
    };
  } catch (e) {
    return { success: false, platform: 'douyin', error: '解析失敗', error_hint: e.message || String(e) };
  }
}

async function parseXiaohongshu(rawText) {
  const url = extractUrl(rawText);
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  try {
    const { html } = await fetchFollowing(url, ua);
    const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\});\s*</);
    if (!m) {
      return { success: false, platform: 'xiaohongshu', error: '抓不到小紅書頁面資料', error_hint: '建議貼影片分享文字' };
    }
    const text = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');
    const urlMatch = text.match(/"(?:masterUrl|videoUrl|backupUrls)":"(https?:\/\/[^"]+\.mp4[^"]*)"/);
    let videoUrl = urlMatch ? urlMatch[1] : '';
    if (!videoUrl) {
      const directMatch = html.match(/(https?:\/\/sns-video[^"'\s]+\.mp4)/);
      if (directMatch) videoUrl = directMatch[1];
    }
    if (!videoUrl) {
      return { success: false, platform: 'xiaohongshu', error: '無法取得影片連結', error_hint: '小紅書未登入請求受限' };
    }
    const title = (text.match(/"title":"([^"]+)"/) || [, ''])[1] ||
                  (text.match(/"desc":"([^"]+)"/) || [, ''])[1] || '小紅書影片';
    const cover = (text.match(/"imageDefault":"([^"]+)"/) || [, ''])[1] || '';
    const author = (text.match(/"nickname":"([^"]+)"/) || [, ''])[1] || '';
    return {
      success: true, url: videoUrl, title, thumbnail: cover, duration: 0,
      platform: 'xiaohongshu', uploader: author,
    };
  } catch (e) {
    return { success: false, platform: 'xiaohongshu', error: '解析失敗', error_hint: e.message };
  }
}

async function parseTikTok(rawText) {
  const url = extractUrl(rawText);
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  try {
    const { html } = await fetchFollowing(url, ua);
    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/);
    if (!m) return { success: false, platform: 'tiktok', error: '抓不到 TikTok 頁面資料', error_hint: '請試試其他平台' };
    const data = JSON.parse(m[1].replace(/undefined/g, 'null'));
    const item = data?.['__DEFAULT_SCOPE__']?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!item) return { success: false, platform: 'tiktok', error: '頁面結構變了' };
    const playUrl = item.video?.playAddr?.[0] || item.video?.downloadAddr?.[0] || '';
    return {
      success: true, url: playUrl, title: item.desc || 'TikTok 影片',
      thumbnail: item.video?.cover?.[0] || '', duration: item.video?.duration || 0,
      platform: 'tiktok', uploader: item.author?.nickname || '',
    };
  } catch (e) {
    return { success: false, platform: 'tiktok', error: '解析失敗', error_hint: e.message };
  }
}

function parseYouTube(rawText) {
  return {
    success: false, platform: 'youtube', error: 'YouTube 不支援直接下載',
    error_hint: '請用 yt-dlp 等工具',
  };
}

async function handleVideoInfo(request) {
  if (request.method !== 'POST') return json({ success: false, error: '請使用 POST' }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'JSON 格式錯誤' }, 400); }
  const raw = body.url?.trim();
  if (!raw) return json({ success: false, error: '請提供網址' }, 400);
  const platform = detectPlatform(raw);
  let result;
  switch (platform) {
    case 'douyin':      result = await parseDouyin(raw); break;
    case 'xiaohongshu': result = await parseXiaohongshu(raw); break;
    case 'tiktok':      result = await parseTikTok(raw); break;
    case 'youtube':     result = parseYouTube(raw); break;
    default:
      result = { success: false, platform: 'unknown', error: '不支援的影片平台', error_hint: '目前支援：抖音、小紅書、TikTok、YouTube' };
  }
  return json(result, result.success ? 200 : 400);
}

async function handleDlStream(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  const referer = url.searchParams.get('referer') || 'https://www.douyin.com/';
  const filename = url.searchParams.get('filename') || 'video.mp4';
  if (!target) return new Response('missing url', { status: 400 });
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer,
      },
    });
    if (!upstream.ok || !upstream.body) return new Response('upstream ' + upstream.status, { status: 502 });
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'video/mp4');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    const cl = upstream.headers.get('Content-Length');
    if (cl) headers.set('Content-Length', cl);
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return new Response('proxy error: ' + e.message, { status: 500 });
  }
}

// ---------------- Worker 入口 (Service Worker 格式) ----------------
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  const path = new URL(request.url).pathname;
  if (path === '/api/video-info') return handleVideoInfo(request);
  if (path === '/api/dl-stream')  return handleDlStream(request);
  if (path === '/' || path === '/health') {
    return json({
      status: 'ok', timestamp: new Date().toISOString(),
      platforms: ['douyin', 'xiaohongshu', 'tiktok', 'youtube'],
      note: '抖音走 a-bogus 純算簽名',
    });
  }
  return json({ error: 'Not Found' }, 404);
}
