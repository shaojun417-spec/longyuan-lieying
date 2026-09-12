/**
 * 龍淵裂影 - 影片下載工具（整合版）
 *
 * 端點：
 *   GET  /              前端頁面
 *   POST /api/video-info 解析網址，回傳無水印影片 URL
 *   GET  /api/dl-stream  代理下載
 *
 * 架構：
 *   1. 多 Key 池（環境變數 TIKHUB_KEYS / RAPIDAPI_KEYS）
 *   2. 輪詢 + 自動跳過失敗/超額的 Key
 *   3. 用戶可在請求中帶自帶 Key（userKey 參數）
 *   4. TikHub 為主，RapidAPI 為備，a-bogus 為最後兜底
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const UA_MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

// ==================== Key 池（多 Key 輪詢 + KV 狀態持久化）====================

/**
 * Key 在 KV 中的資料結構
 * {
 *   provider: "tikhub" | "rapidapi",
 *   host: "rapidapi-host" (only for rapidapi),
 *   healthy: true | false,
 *   failCount: number,
 *   usedThisMonth: number,
 *   lastUsed: timestamp,
 *   lastError: "error string",
 *   lastSuccess: timestamp,
 * }
 */

/**
 * 取得 Key 在 KV 中的識別 ID
 */
function keyId(entry) {
  if (entry.provider === "tikhub") {
    // TikHub 用 key 的 hash 作為 ID（不暴露完整 key）
    let hash = 0;
    for (let i = 0; i < entry.key.length; i++) {
      hash = ((hash << 5) - hash) + entry.key.charCodeAt(i);
      hash |= 0;
    }
    return "tikhub_" + Math.abs(hash).toString(16);
  } else {
    return "rapidapi_" + (entry.host || "").replace(/\W+/g, "_") + "_" + entry.key.slice(-6);
  }
}

/**
 * 從 KV 載入所有 Key 的狀態
 */
async function loadKeyStates(env) {
  if (!env.KEYS_KV) return {};
  const list = await env.KEYS_KV.list({ prefix: "key:" });
  const states = {};
  for (const k of list.keys) {
    const data = await env.KEYS_KV.get(k.name);
    if (data) {
      try {
        const id = k.name.replace(/^key:/, "");
        states[id] = JSON.parse(data);
      } catch (_) {}
    }
  }
  return states;
}

/**
 * 儲存單個 Key 的狀態到 KV
 */
async function saveKeyState(env, id, state) {
  if (!env.KEYS_KV) return;
  await env.KEYS_KV.put(`key:${id}`, JSON.stringify(state), {
    expirationTtl: 60 * 60 * 24 * 90, // 90 天過期
  });
}

/**
 * 取得本月 Key 的使用次數（從月初累計）
 */
async function getMonthlyUsage(env, id) {
  if (!env.KEYS_KV) return 0;
  const month = new Date().toISOString().slice(0, 7); // "2026-09"
  const usage = await env.KEYS_KV.get(`usage:${month}:${id}`);
  return parseInt(usage || "0", 10);
}

async function incrementMonthlyUsage(env, id) {
  if (!env.KEYS_KV) return;
  const month = new Date().toISOString().slice(0, 7);
  const key = `usage:${month}:${id}`;
  const current = parseInt((await env.KEYS_KV.get(key)) || "0", 10);
  await env.KEYS_KV.put(key, String(current + 1), {
    expirationTtl: 60 * 60 * 24 * 60, // 60 天過期
  });
}

/**
 * 從環境變數讀取 Key 池
 * 環境變數格式（Workers > Settings > Variables）：
 *   TIKHUB_KEYS   = "key1,key2,key3"     多個用逗號分隔
 *   RAPIDAPI_KEYS = "host1:key1,host2:key2"  host:key 格式
 *   也支援單個：TIKHUB_KEY="single-key"
 */
async function loadKeyPool(env) {
  const states = await loadKeyStates(env);
  const pool = { tikhub: [], rapidapi: [] };

  const parseList = (raw) => {
    if (!raw) return [];
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  };

  // TikHub keys
  let tikhubRaw = env.TIKHUB_KEYS || env.TIKHUB_KEY;
  if (tikhubRaw) {
    const keys = parseList(tikhubRaw);
    for (const k of keys) {
      const entry = { key: k, provider: "tikhub" };
      const id = keyId(entry);
      const persisted = states[id] || {};
      pool.tikhub.push({
        ...entry,
        id,
        host: persisted.host || "tikhub",
        healthy: persisted.healthy !== false,
        failCount: persisted.failCount || 0,
        usedThisMonth: persisted.usedThisMonth || 0,
        lastUsed: persisted.lastUsed || 0,
        lastError: persisted.lastError || "",
        lastSuccess: persisted.lastSuccess || 0,
      });
    }
  }

  // RapidAPI keys
  let rapidRaw = env.RAPIDAPI_KEYS;
  if (!rapidRaw && env.RAPIDAPI_KEY) {
    rapidRaw = `${env.RAPIDAPI_HOST || "default"}:${env.RAPIDAPI_KEY}`;
  }
  if (rapidRaw) {
    const keys = parseList(rapidRaw);
    for (const s of keys) {
      const [host, key] = s.split(":").map(x => x.trim());
      if (!key) continue;
      const entry = {
        key,
        provider: "rapidapi",
        host: host || "tiktok-video-no-watermark2.p.rapidapi.com",
      };
      const id = keyId(entry);
      const persisted = states[id] || {};
      pool.rapidapi.push({
        ...entry,
        id,
        healthy: persisted.healthy !== false,
        failCount: persisted.failCount || 0,
        usedThisMonth: persisted.usedThisMonth || 0,
        lastUsed: persisted.lastUsed || 0,
        lastError: persisted.lastError || "",
        lastSuccess: persisted.lastSuccess || 0,
      });
    }
  }

  return pool;
}

/**
 * 挑一個健康的 Key（輪詢 + 優先選使用次數少的）
 */
let _roundRobinIndex = { tikhub: 0, rapidapi: 0 };
function pickKey(pool, preferred = "tikhub") {
  const candidates = pool[preferred].filter(k => k.healthy && k.failCount < 3);
  if (candidates.length === 0) {
    // 全部失敗，重置（給每個 Key 一次機會）
    pool[preferred].forEach(k => { k.healthy = true; k.failCount = 0; });
    const reset = pool[preferred];
    if (reset.length === 0) return null;
    const idx = _roundRobinIndex[preferred] % reset.length;
    _roundRobinIndex[preferred]++;
    return reset[idx];
  }
  const idx = _roundRobinIndex[preferred] % candidates.length;
  _roundRobinIndex[preferred]++;
  return candidates[idx];
}

async function markKeyFailed(env, keyEntry) {
  if (!keyEntry) return;
  keyEntry.failCount = (keyEntry.failCount || 0) + 1;
  keyEntry.lastError = new Date().toISOString();
  if (keyEntry.failCount >= 3) keyEntry.healthy = false;
  if (keyEntry.id) {
    await saveKeyState(env, keyEntry.id, {
      provider: keyEntry.provider,
      host: keyEntry.host,
      healthy: keyEntry.healthy,
      failCount: keyEntry.failCount,
      lastError: keyEntry.lastError,
      usedThisMonth: keyEntry.usedThisMonth || 0,
      lastUsed: keyEntry.lastUsed || 0,
      lastSuccess: keyEntry.lastSuccess || 0,
    });
  }
}

async function markKeySuccess(env, keyEntry) {
  if (!keyEntry) return;
  keyEntry.failCount = 0;
  keyEntry.healthy = true;
  keyEntry.lastUsed = Date.now();
  keyEntry.lastSuccess = Date.now();
  keyEntry.usedThisMonth = (keyEntry.usedThisMonth || 0) + 1;
  if (keyEntry.id) {
    await saveKeyState(env, keyEntry.id, {
      provider: keyEntry.provider,
      host: keyEntry.host,
      healthy: true,
      failCount: 0,
      lastUsed: keyEntry.lastUsed,
      lastSuccess: keyEntry.lastSuccess,
      usedThisMonth: keyEntry.usedThisMonth,
    });
    await incrementMonthlyUsage(env, keyEntry.id);
  }
}

// ==================== 工具函式 ====================

function detectPlatform(text) {
  const u = text.toLowerCase();
  if (u.includes("douyin.com") || u.includes("iesdouyin.com") || u.includes("v.douyin.com")) return "douyin";
  if (u.includes("xiaohongshu.com") || u.includes("xhslink.com") || u.includes("xhscdn.com")) return "xiaohongshu";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("threads.net") || u.includes("threadsapp.com")) return "threads";
  if (u.includes("shopee.") || u.includes("shopee.tw")) return "shopee";
  if (u.includes("taobao.com") || u.includes("tmall.com") || u.includes("tb.cn")) return "taobao";
  if (u.includes("tiktok.com") || u.includes("vm.tiktok")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  // 直接alicdn影片URL也算淘寶平台
  if (u.includes("alicdn.com") && u.match(/\.(mp4|flv|m3u8)/i)) return "taobao";
  return "unknown";
}

function extractUrl(raw) {
  const m = raw.match(/https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/);
  if (m) return m[0].replace(/[,，。、)\]}>]+$/, "");
  return raw.trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

function stripWatermark(url) {
  if (!url) return "";
  return url
    .replace(/watermark=1/gi, "watermark=0")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/");
}

async function fetchWithRedirect(url, options = {}) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": options.ua || UA,
      "Accept": "text/html,application/json,*/*",
      ...options.headers,
    },
    redirect: "follow",
    ...options,
  });
  return { finalUrl: resp.url, html: await resp.text(), status: resp.status, resp };
}

// ==================== 抖音 a-bogus 簽名（簡化版）====================

// ==================== 抖音 a-bogus 簽名（基於 hua0512/rust-srec 移植）====================

const _SM3_IV = [
  0x7380166F, 0x4914B2B9, 0x172442D7, 0xDA8A0600,
  0xA96F30BC, 0x163138AA, 0xE38DEE4D, 0xB0FB0E4E,
];

const _SM3_TJ = (() => {
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

function _rotl(x, n) { return (x << n) | (x >>> (32 - n)); }

function _sm3Compress(V, block) {
  const W = new Uint32Array(68);
  for (let i = 0; i < 16; i++) {
    W[i] = (block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3];
  }
  for (let i = 16; i < 68; i++) {
    const x = W[i - 16] ^ W[i - 9] ^ _rotl(W[i - 3], 15);
    W[i] = (x ^ _rotl(W[i - 13], 7) ^ _rotl(W[i - 6], 19) ^ W[i - 6] >>> 0) >>> 0;
  }
  const W1 = new Uint32Array(64);
  for (let i = 0; i < 64; i++) W1[i] = W[i] ^ W[i + 4];

  let A = V[0], B = V[1], C = V[2], D = V[3];
  let E = V[4], F = V[5], G = V[6], H = V[7];

  for (let j = 0; j < 64; j++) {
    const A12 = _rotl(A, 12);
    const SS1 = _rotl((_rotl(A, 12) + E + _SM3_TJ[j]) >>> 0, 7);
    const SS2 = (SS1 ^ A12) >>> 0;
    const TT1 = j < 16
      ? ((A ^ B ^ C) + D + SS2 + W1[j]) >>> 0
      : ((A & B | A & C | B & C) + D + SS2 + W[j]) >>> 0;
    const TT2 = j < 16
      ? ((E ^ F ^ G) + H + SS1 + W[j]) >>> 0
      : ((E & F | ~E & G) + H + SS1 + W[j]) >>> 0;
    D = C; C = _rotl(B, 9); B = A; A = TT1;
    H = G; G = _rotl(F, 19); F = E; E = (TT2 ^ _rotl(TT1, 9) ^ _rotl(TT2, 17)) >>> 0;
  }
  V[0] ^= A; V[1] ^= B; V[2] ^= C; V[3] ^= D;
  V[4] ^= E; V[5] ^= F; V[6] ^= G; V[7] ^= H;
}

function _sm3(input) {
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

  const V = new Uint32Array(_SM3_IV);
  for (let i = 0; i < padLen * 4; i += 64) {
    _sm3Compress(V, buf.subarray(i, i + 64));
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

function _rc4Encrypt(key, plaintext) {
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

function _toCharStr(bytes) {
  return Array.from(bytes, b => String.fromCharCode(b)).join('');
}

function _toCharArray(s) {
  const arr = [];
  for (let i = 0; i < s.length; i++) arr.push(s.charCodeAt(i));
  return arr;
}

function _generateRandomBytes(length) {
  const result = [];
  for (let i = 0; i < length; i++) {
    const rd = Math.floor(Math.random() * 10000);
    result.push((rd & 255 & 170) | 1);
    result.push((rd & 255 & 85) | 2);
    result.push(((rd >> 8) & 170) | 5);
    result.push(((rd >> 8) & 85) | 40);
  }
  return _toCharStr(new Uint8Array(result));
}

const _BIG_ARRAY = [
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

function _sm3ToArray(input) {
  const hash = _sm3(input);
  return hash.match(/.{2}/g).map(b => parseInt(b, 16));
}

function _transformBytes(valuesList) {
  const arr = _BIG_ARRAY.slice();
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

const _ALPHABET_0 = "Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe";
const _ALPHABET_1 = "ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe";

function _base64Encode(bytes, selectedAlphabet) {
  const alphabet = selectedAlphabet === 0 ? _ALPHABET_0 : _ALPHABET_1;
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

function _abogusEncode(values, selectedAlphabet) {
  const alphabet = selectedAlphabet === 0 ? _ALPHABET_0 : _ALPHABET_1;
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

function _generateFingerprint() {
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

const _SORT_INDEX = [
  18, 20, 52, 26, 30, 34, 58, 38, 40, 53, 42, 21, 27, 54, 55, 31, 35, 57, 39, 41, 43, 22, 28,
  32, 60, 36, 23, 29, 33, 37, 44, 45, 59, 46, 47, 48, 49, 50, 24, 25, 65, 66, 70, 71,
];

const _SORT_INDEX_2 = [
  18, 20, 26, 30, 34, 38, 40, 42, 21, 27, 31, 35, 39, 41, 43, 22, 28, 32, 36, 23, 29, 33, 37,
  44, 45, 46, 47, 48, 49, 50, 24, 25, 52, 53, 54, 55, 57, 58, 59, 60, 65, 66, 70, 71,
];

function generateABogus(params, body = "", userAgent = UA) {
  const abDir = { 8: 3, 18: 44, 66: 0, 69: 0, 70: 0, 71: 0 };

  const startEncryption = Date.now();

  const paramsHash1 = _sm3(params + "cus");
  const array1 = _sm3ToArray(paramsHash1);

  const bodyHash1 = _sm3((body || "") + "cus");
  const array2 = _sm3ToArray(bodyHash1);

  const rc4Ua = _rc4Encrypt([0x00, 0x01, 0x0e], userAgent);
  const uaB64 = _base64Encode(rc4Ua, 1);
  const array3 = _sm3ToArray(uaB64);

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

  const fp = _generateFingerprint();
  abDir[64] = fp.length;
  abDir[65] = fp.length;

  const sortedValues = _SORT_INDEX.map(i => abDir[i] || 0);
  const fpArray = _toCharArray(fp);

  let abXor = 0;
  _SORT_INDEX_2.forEach((key, idx) => {
    const val = abDir[key] || 0;
    abXor = idx === 0 ? val : abXor ^ val;
  });

  const allValues = [...sortedValues, ...fpArray, abXor];
  const transformed = _transformBytes(allValues);

  const randomPrefix = _generateRandomBytes(3).split('').map(c => c.charCodeAt(0));
  const finalValues = [...randomPrefix, ...transformed];
  const abogus = _abogusEncode(finalValues, 0);

  return abogus;
}

// ==================== 抖音解析 ====================

async function parseDouyin(rawText) {
  const url = extractUrl(rawText);
  try {
    // 1. 跟隨短網址跳轉
    let finalUrl = url;
    let html = "";
    try {
      const r = await fetchWithRedirect(url, { ua: UA });
      finalUrl = r.finalUrl;
      html = r.html;
    } catch (_) {}

    // 2. 抓 aweme_id（多種格式）
    const idPatterns = [
      /"aweme_id"\s*:\s*"?(\d{15,20})"?/,
      /"itemId"\s*:\s*"?(\d{15,20})"?/,
      /\/video\/(\d{15,20})/,
      /modal_id=(\d{15,20})/,
      /"awemeId"\s*:\s*"?(\d{15,20})"?/,
    ];
    let awemeId = null;
    for (const p of idPatterns) {
      const m = (html.match(p) || finalUrl.match(p));
      if (m) { awemeId = m[1]; break; }
    }
    // 從 URL query 抓
    if (!awemeId) {
      try {
        const u = new URL(finalUrl);
        const mid = u.searchParams.get("modal_id");
        if (mid && /^\d{15,20}$/.test(mid)) awemeId = mid;
      } catch (_) {}
    }
    // 從 finalUrl path 抓
    if (!awemeId) {
      const m = finalUrl.match(/\/(\d{15,20})(?:[\/\?#]|$)/);
      if (m) awemeId = m[1];
    }

    if (!awemeId) {
      return { success: false, platform: "douyin", error: "找不到影片 ID，請貼 App 分享的短網址（v.douyin.com/...）" };
    }

    // 3. 構造完整查詢字串（順序很重要，必須與抖音校驗一致）
    const queryParams = [
      ["device_platform", "webapp"],
      ["aid", "6383"],
      ["channel", "channel_pc_web"],
      ["pc_client_type", "1"],
      ["version_code", "190500"],
      ["version_name", "19.5.0"],
      ["cookie_enabled", "true"],
      ["platform", "PC"],
      ["browser_language", "zh-CN"],
      ["browser_platform", "Win32"],
      ["browser_name", "Chrome"],
      ["browser_version", "130.0.0.0"],
      ["browser_online", "true"],
      ["engine_name", "Blink"],
      ["engine_version", "130.0.0.0"],
      ["os_name", "Windows"],
      ["os_version", "10"],
      ["screen_width", "1920"],
      ["screen_height", "1080"],
      ["effective_type", "4g"],
      ["downlink", "10"],
      ["webid", String(Math.floor(Math.random() * 9e15) + 1e14)],
      ["aweme_id", awemeId],
    ];

    const paramStr = queryParams.map(([k, v]) => `${k}=${v}`).join("&");
    const aBogus = generateABogus(paramStr, "", UA);
    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?${paramStr}&a_bogus=${aBogus}`;

    // 4. 帶上必要的 cookie 模擬
    const ttwid = "1%7C" + btoa(String(Date.now())).slice(0, 22).replace(/=/g, "");
    const cookie = `ttwid=${ttwid}; msToken=${btoa(Math.random().toString()).slice(0, 86).replace(/=/g, "")};`;

    const apiResp = await fetch(apiUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://www.douyin.com/",
        "Cookie": cookie,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });

    // 5. 解析回應
    let data = null;
    try { data = await apiResp.json(); } catch (_) {}

    // 6. 從 HTML 兜底取影片 URL（如果 API 失敗）
    const findVideoInHtml = (rawHtml) => {
      if (!rawHtml) return null;
      // 移除轉義
      const decoded = rawHtml.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
      const videoPatterns = [
        /"play_addr"\s*:\s*\{[^}]*?"url_list"\s*:\s*\[\s*"([^"]+)"/s,
        /"playAddr"\s*:\s*\{\s*"url"\s*:\s*\[\s*"([^"]+)"\s*\]/,
        /"(?:play_addr|playAddr|play_addr_lowbr)"\s*:\s*\{\s*"[^"]+"\s*:\s*\[\s*\{\s*"[^"]+"\s*:\s*"([^"]+\.mp4[^"]*)"\s*\}\s*\]/,
        /src_url["\s:]+["']([^"']+\.mp4[^"']*)["']/,
        /playAddr["\s:]+["']([^"']+\.mp4[^"']*)["']/,
      ];
      for (const p of videoPatterns) {
        const m = decoded.match(p);
        if (m) {
          let u = m[1];
          // 還原 URL 編碼
          try { u = decodeURIComponent(u); } catch (_) {}
          if (u.startsWith("http")) return u;
        }
      }
      // 直接搜 mp4
      const directMp4 = decoded.match(/(https?:\/\/[^\s"']+\.mp4[^\s"']*)/);
      if (directMp4) return directMp4[1];
      return null;
    };

    // 情況 A：API 成功
    if (data && data.status_code === 0 && data.aweme_detail) {
      const aweme = data.aweme_detail;
      const candidates = [
        aweme.video?.play_addr?.url_list,
        aweme.video?.play_addr_lowbr?.url_list,
        aweme.video?.download_addr?.url_list,
      ];
      for (const c of candidates) {
        if (Array.isArray(c) && c.length) {
          const url = stripWatermark(c[0]);
          return {
            success: true,
            url,
            title: aweme.desc || "抖音影片",
            thumbnail: aweme.video?.cover?.url_list?.[0] || aweme.video?.origin_cover?.url_list?.[0] || "",
            duration: aweme.video?.duration || 0,
            platform: "douyin",
            uploader: aweme.author?.nickname || "",
          };
        }
      }
    }

    // 情況 B：從 HTML 抓
    const htmlVideoUrl = findVideoInHtml(html);
    if (htmlVideoUrl) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/) ||
                         html.match(/"desc"\s*:\s*"([^"]{2,100})"/);
      const coverMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/);
      return {
        success: true,
        url: stripWatermark(htmlVideoUrl),
        title: (titleMatch?.[1] || "抖音影片").slice(0, 100),
        thumbnail: coverMatch?.[1] || "",
        duration: 0,
        platform: "douyin",
        uploader: "",
        note: "fallback-html",
      };
    }

    return { success: false, platform: "douyin", error: "解析失敗（API: " + (data?.status_msg || data?.status_code || "拒絕") + "）" };
  } catch (e) {
    return { success: false, platform: "douyin", error: "解析失敗", error_hint: e.message };
  }
}

// ==================== 第三方 API：TikHub ====================

/**
 * 用 TikHub API 解析影片
 * 文檔：https://docs.tikhub.io
 * 端點範例（抖音）：/api/v1/douyin/app/v3/fetch_one_video_by_share_url?share_url=...
 */
async function parseViaTikHub(env, platform, rawText, keyEntry) {
  if (!keyEntry) return null;
  const shareUrl = extractUrl(rawText);
  const headers = {
    "Authorization": `Bearer ${keyEntry.key}`,
    "User-Agent": UA,
    "Accept": "application/json",
  };

  let endpoint;
  switch (platform) {
    case "douyin":
      endpoint = `https://api.tikhub.io/api/v1/douyin/app/v3/fetch_one_video_by_share_url?share_url=${encodeURIComponent(shareUrl)}`;
      break;
    case "xiaohongshu":
      endpoint = `https://api.tikhub.io/api/v1/xiaohongshu/app/v2/note_detail_by_url?url=${encodeURIComponent(shareUrl)}`;
      break;
    case "tiktok":
      endpoint = `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video_by_share_url?share_url=${encodeURIComponent(shareUrl)}`;
      break;
    case "instagram":
      endpoint = `https://api.tikhub.io/api/v1/instagram/app/v2/fetch_post_by_url?url=${encodeURIComponent(shareUrl)}`;
      break;
    case "threads":
      endpoint = `https://api.tikhub.io/api/v1/threads/app/v2/fetch_post_by_url?url=${encodeURIComponent(shareUrl)}`;
      break;
    default:
      return null;
  }

  const resp = await fetch(endpoint, { headers });
  if (resp.status === 429) {
    await markKeyFailed(env, keyEntry);
    return { _error: "rate_limited" };
  }
  if (!resp.ok) {
    await markKeyFailed(env, keyEntry);
    return { _error: `http_${resp.status}` };
  }
  const data = await resp.json().catch(() => ({}));

  // TikHub 抖音回應格式
  if (platform === "douyin" && data?.data?.aweme_detail) {
    const aweme = data.data.aweme_detail;
    const playUrl = aweme.video?.play_addr?.url_list?.[0] ||
                    aweme.video?.play_addr_lowbr?.url_list?.[0] ||
                    aweme.video?.download_addr?.url_list?.[0];
    if (playUrl) {
      await markKeySuccess(env, keyEntry);
      return {
        success: true,
        url: stripWatermark(playUrl),
        title: aweme.desc || "抖音影片",
        thumbnail: aweme.video?.cover?.url_list?.[0] || "",
        duration: aweme.video?.duration || 0,
        platform: "douyin",
        uploader: aweme.author?.nickname || "",
        source: "tikhub",
      };
    }
  }

  // TikHub 小紅書回應格式
  if (platform === "xiaohongshu" && data?.data) {
    const note = data.data?.note_detail || data.data?.note || data.data;
    const videoUrl = note?.video?.media?.stream?.h264?.[0]?.master_url ||
                     note?.video?.media?.stream?.h265?.[0]?.master_url ||
                     note?.video?.consumer?.origin_video_key ||
                     "";
    if (videoUrl) {
      await markKeySuccess(env, keyEntry);
      return {
        success: true,
        url: videoUrl,
        title: note.title || note.desc || "小紅書影片",
        thumbnail: note.image_list?.[0]?.url || note.cover?.url || "",
        duration: note.video?.duration || 0,
        platform: "xiaohongshu",
        uploader: note.user?.nickname || "",
        source: "tikhub",
      };
    }
  }

  // TikHub TikTok 回應格式
  if (platform === "tiktok" && data?.data?.aweme_detail) {
    const item = data.data.aweme_detail;
    const playUrl = item.video?.play_addr?.url_list?.[0] || item.video?.download_addr?.url_list?.[0];
    if (playUrl) {
      await markKeySuccess(env, keyEntry);
      return {
        success: true,
        url: playUrl,
        title: item.desc || "TikTok 影片",
        thumbnail: item.video?.cover?.url_list?.[0] || "",
        duration: item.video?.duration || 0,
        platform: "tiktok",
        uploader: item.author?.nickname || "",
        source: "tikhub",
      };
    }
  }

  // TikHub IG 回應
  if (platform === "instagram" && data?.data) {
    const post = data.data?.post || data.data;
    const videoUrl = post?.video_url ||
                     post?.video_versions?.[0]?.url ||
                     post?.clips_metadata?.video_url || "";
    if (videoUrl) {
      await markKeySuccess(env, keyEntry);
      return {
        success: true,
        url: videoUrl,
        title: post.caption?.text || "IG 影片",
        thumbnail: post.image_versions2?.candidates?.[0]?.url || "",
        duration: post.video_duration || 0,
        platform: "instagram",
        uploader: post.user?.username || "",
        source: "tikhub",
      };
    }
  }

  // TikHub Threads 回應
  if (platform === "threads" && data?.data) {
    const post = data.data?.post || data.data;
    const videoUrl = post?.video_versions?.[0]?.url || post?.playback_url || "";
    if (videoUrl) {
      await markKeySuccess(env, keyEntry);
      return {
        success: true,
        url: videoUrl,
        title: post.caption?.text || "Threads 影片",
        thumbnail: post.image_versions2?.candidates?.[0]?.url || "",
        duration: post.video_duration || 0,
        platform: "threads",
        uploader: post.user?.username || "",
        source: "tikhub",
      };
    }
  }

  await markKeyFailed(env, keyEntry);
  return { _error: "no_video_in_response" };
}

// ==================== 第三方 API：RapidAPI ====================

async function parseViaRapidAPI(env, platform, rawText, keyEntry) {
  if (!keyEntry) return null;
  const shareUrl = extractUrl(rawText);
  const headers = {
    "X-RapidAPI-Key": keyEntry.key,
    "X-RapidAPI-Host": keyEntry.host,
    "User-Agent": UA,
    "Accept": "application/json",
  };

  // 不同平台不同 endpoint
  let endpoint;
  switch (platform) {
    case "douyin":
      endpoint = `https://${keyEntry.host}/api/video/share/parse?share_url=${encodeURIComponent(shareUrl)}`;
      break;
    case "xiaohongshu":
      endpoint = `https://${keyEntry.host}/api/xhs/video?url=${encodeURIComponent(shareUrl)}`;
      break;
    case "tiktok":
      endpoint = `https://${keyEntry.host}/?url=${encodeURIComponent(shareUrl)}`;
      break;
    default:
      return null;
  }

  const resp = await fetch(endpoint, { headers });
  if (resp.status === 429 || resp.status === 403) {
    await markKeyFailed(env, keyEntry);
    return { _error: "rate_limited" };
  }
  if (!resp.ok) {
    await markKeyFailed(env, keyEntry);
    return { _error: `http_${resp.status}` };
  }
  const data = await resp.json().catch(() => ({}));

  // 通用解析：尋找所有可能的 mp4 URL
  const text = JSON.stringify(data);
  const mp4Match = text.match(/(https?:\/\/[^\s"']+\.mp4[^\s"']*)/);
  if (mp4Match) {
    await markKeySuccess(env, keyEntry);
    return {
      success: true,
      url: mp4Match[1],
      title: data.title || data.desc || `${platform} 影片`,
      thumbnail: data.cover || data.thumbnail || "",
      duration: data.duration || 0,
      platform,
      uploader: data.author || "",
      source: "rapidapi",
    };
  }

  await markKeyFailed(env, keyEntry);
  return { _error: "no_video_in_response" };
}

// ==================== 統一解析（多 Key 輪詢）====================

// ==================== 第三方 API：RapidAPI auto-download-all-in-one ====================
// 統一全平台 API（60+ 平台支援：TikTok, YouTube, IG, FB, X, 抖音, 小紅書, Bilibili, Telegram...）
// 端點：https://auto-download-all-in-one.p.rapidapi.com/v1/social/autolink
// 環境變數：RAPIDAPI_AUTO_KEY (single) 或 RAPIDAPI_AUTO_KEYS (多 key 輪詢)
const AUTO_DOWNLOAD_HOST = "auto-download-all-in-one.p.rapidapi.com";
const UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function parseViaAutoDownload(rawText, apiKey) {
  if (!apiKey) return null;
  const url = extractUrl(rawText);
  const endpoint = `https://${AUTO_DOWNLOAD_HOST}/v1/social/autolink`;

  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": AUTO_DOWNLOAD_HOST,
        "x-rapidapi-key": apiKey,
        // 用標準瀏覽器 UA：RapidAPI 端 Cloudflare 的 BIC (Browser Integrity Check)
        // 對非瀏覽器 User-Agent 會回 1010。我們盡可能接近真實瀏覽器
        "User-Agent": UA_BROWSER,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://rapidapi.com/",
        "Origin": "https://rapidapi.com",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ url }),
      // 確保不被 Cloudflare CDN cache（避免拿到舊的 Cloudflare 拒絕頁）
      cf: { cacheTtl: 0, cacheEverything: false, cacheKey: undefined },
    });
  } catch (e) {
    return { _error: "fetch_failed", _detail: String(e) };
  }

  if (resp.status === 429) {
    return { _error: "rate_limited", _retryAfter: resp.headers.get("x-ratelimit-reset") };
  }
  if (resp.status === 403) {
    // Cloudflare "error code: 1010" = Browser Integrity Check
    // 從 Workers 發出的請求有時會被 RapidAPI 端的 Cloudflare BIC 阻擋
    let body = "";
    try { body = await resp.text(); } catch {}
    if (body.includes("1010") || body.includes("browser")) {
      return { _error: "browser_integrity_check_bypass_failed", _body: body.substring(0, 200) };
    }
    return { _error: "forbidden_or_not_subscribed", _body: body.substring(0, 200) };
  }
  if (resp.status === 401) {
    return { _error: "invalid_api_key" };
  }
  if (!resp.ok) {
    return { _error: `http_${resp.status}` };
  }

  const data = await resp.json().catch(() => ({}));

  // 實際回應格式（已測試驗證）：
  // {
  //   "url": "原始 URL",
  //   "source": "tiktok",
  //   "title": "...",
  //   "thumbnail": "...",
  //   "duration": 88447,
  //   "medias": [
  //     { "url": "...", "quality": "hd_no_watermark", "extension": "mp4", "type": "video" },
  //     { "url": "...", "quality": "no_watermark",    "extension": "mp4", "type": "video" },
  //     { "url": "...", "quality": "watermark",       "extension": "mp4", "type": "video" },
  //     { "url": "...", "quality": "audio",           "extension": "mp3", "type": "audio" }
  //   ],
  //   "error": false
  // }
  if (data.error || !data.medias || !Array.isArray(data.medias)) {
    return { _error: data.message || "no_medias_in_response" };
  }

  // 選最佳影片（優先 hd_no_watermark > no_watermark > watermark > 第一個）
  const priority = ["hd_no_watermark", "no_watermark", "watermark", "_"];
  let best = null;
  for (const q of priority) {
    best = data.medias.find(m => m.type === "video" && (q === "_" || m.quality === q));
    if (best) break;
  }
  if (!best) best = data.medias[0];

  if (!best || !best.url || !best.url.startsWith("http")) {
    return { _error: "no_valid_media_url" };
  }

  // 判斷 platform（從原 URL）
  const platform = detectPlatform(url);

  return {
    success: true,
    url: best.url,
    title: data.title || `${data.source || platform} 影片`,
    thumbnail: data.thumbnail || "",
    duration: data.duration || 0,
    platform,
    uploader: data.author || data.unique_id || "",
    source: "auto-download",
    // 額外資料：所有品質選項（前端可選擇）
    allMedias: data.medias.map(m => ({
      quality: m.quality,
      type: m.type,
      extension: m.extension,
      url: m.url,
    })),
  };
}

async function parseWithFallback(env, platform, rawText, keyPool, userKey) {
  // 優先順序：auto-download-all-in-one (60+ 平台，一個 Key 通殺) → 用戶自帶 → TikHub → RapidAPI → 自寫解析

  // 0a. auto-download-all-in-one 池（從 RAPIDAPI_AUTO_KEY 或 RAPIDAPI_AUTO_KEYS 環境變數讀）
  //     向後相容舊的 ZMIO_KEYS 名稱
  const autoKeysRaw = env.RAPIDAPI_AUTO_KEYS || env.RAPIDAPI_AUTO_KEY
                   || env.ZMIO_KEYS || env.ZMIO_KEY || "";
  const autoKeys = autoKeysRaw.split(",").map(s => s.trim()).filter(Boolean);
  for (const k of autoKeys) {
    const r = await parseViaAutoDownload(rawText, k);
    if (r && !r._error && r.success) return r;
  }

  // 0b. 用戶自帶 Key（用戶自帶 Key 不消耗你的額度）
  if (userKey) {
    const userEntry = { key: userKey, provider: "user", healthy: true, failCount: 0, id: "user_" + Date.now() };
    const r = await parseViaTikHub(env, platform, rawText, userEntry);
    if (r && !r._error && r.success) return r;
  }

  // 1. 嘗試 TikHub 池（輪詢）
  for (let i = 0; i < 3; i++) {
    const keyEntry = pickKey(keyPool, "tikhub");
    if (!keyEntry) break;
    const r = await parseViaTikHub(env, platform, rawText, keyEntry);
    if (r && !r._error && r.success) return r;
  }

  // 2. 嘗試 RapidAPI 池
  for (let i = 0; i < 3; i++) {
    const keyEntry = pickKey(keyPool, "rapidapi");
    if (!keyEntry) break;
    const r = await parseViaRapidAPI(env, platform, rawText, keyEntry);
    if (r && !r._error && r.success) return r;
  }

  // 3. 全部失敗，回傳 null（呼叫方會用 a-bogus 兜底）
  return null;
}

// ==================== 小紅書解析 ====================

async function parseXiaohongshu(rawText) {
  const url = extractUrl(rawText);
  try {
    const { html } = await fetchWithRedirect(url, { ua: UA_MOBILE });

    // 抓 __INITIAL_STATE__
    const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\});?\s*<\/script>/s);
    let videoUrl = "";
    let title = "小紅書影片";
    let cover = "";
    let author = "";

    if (m) {
      const text = m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/\\"/g, '"').replace(/\n/g, "");
      const urlMatch = text.match(/"(?:masterUrl|videoUrl|streamUrl)":"(https?:\/\/[^"]+\.mp4[^"]*)"/);
      if (urlMatch) videoUrl = urlMatch[1];

      if (!videoUrl) {
        const mp4Match = text.match(/(https?:\/\/sns-video[^"'\s]+\.mp4)/);
        if (mp4Match) videoUrl = mp4Match[1];
      }

      title = (text.match(/"title":"([^"]+)"/) || [, ""])[1] ||
              (text.match(/"desc":"([^"]+)"/) || [, ""])[1] || title;
      cover = (text.match(/"imageDefault":"([^"]+)"/) || [, ""])[1] || cover;
      author = (text.match(/"nickname":"([^"]+)"/) || [, ""])[1] || author;
    }

    // 兜底：直接搜 mp4 URL
    if (!videoUrl) {
      const mp4s = [...html.matchAll(/(https?:\/\/sns-video[^"'\s]+\.mp4[^"'\s]*)/g)];
      if (mp4s.length) videoUrl = mp4s[0][1];
    }

    if (!videoUrl) {
      return { success: false, platform: "xiaohongshu", error: "解析失敗（可能需要登入）" };
    }

    return {
      success: true,
      url: videoUrl,
      title,
      thumbnail: cover,
      duration: 0,
      platform: "xiaohongshu",
      uploader: author,
    };
  } catch (e) {
    return { success: false, platform: "xiaohongshu", error: "解析失敗", error_hint: e.message };
  }
}

// ==================== TikTok解析 ====================

async function parseTikTok(rawText) {
  const url = extractUrl(rawText);
  try {
    const { html } = await fetchWithRedirect(url, { ua: UA_MOBILE });
    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/);
    if (!m) {
      return { success: false, platform: "tiktok", error: "解析失敗" };
    }
    const data = JSON.parse(m[1].replace(/undefined/g, "null"));
    const item = data?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.itemInfo?.itemStruct;
    if (!item) {
      return { success: false, platform: "tiktok", error: "解析失敗（頁面結構變動）" };
    }
    const playUrl = item.video?.playAddr?.[0] || item.video?.downloadAddr?.[0] || item.video?.cover?.[0] || "";
    return {
      success: !!playUrl,
      url: playUrl,
      title: item.desc || "TikTok 影片",
      thumbnail: item.video?.cover?.[0] || "",
      duration: item.video?.duration || 0,
      platform: "tiktok",
      uploader: item.author?.nickname || "",
    };
  } catch (e) {
    return { success: false, platform: "tiktok", error: "解析失敗", error_hint: e.message };
  }
}

// ==================== IG解析 ====================

async function parseInstagram(rawText) {
  const url = extractUrl(rawText);
  try {
    // 先嘗試 oEmbed API（不需要登入）
    const oembedUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&maxwidth=480&fields=thumbnail_url,thumbnail_width,thumbnail_height,title,author_name&access_token=IGQVJ...`;
    const oembedResp = await fetch(oembedUrl).catch(() => null);

    // 嘗試抓頁面
    const { html, finalUrl } = await fetchWithRedirect(url, { ua: UA });

    // 抓 meta og:video 或 ld+json
    const ogVideo = html.match(/<meta[^>]+property=["']og:video(?:_url)?["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?:_url)?["']/i);
    const ldJson = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/i);
    let videoUrl = "";
    let thumbnail = "";
    let title = "Instagram 影片";

    if (ogVideo) videoUrl = ogVideo[1];
    if (ldJson) {
      try {
        const ld = JSON.parse(ldJson[1]);
        if (ld.video) videoUrl = ld.video.url || ld.video.contentUrl || videoUrl;
        if (ld.thumbnailUrl) thumbnail = ld.thumbnailUrl;
      } catch (_) {}
    }

    // 從 HTML 抓 JSON data
    if (!videoUrl) {
      const sharedData = html.match(/window\._sharedData\s*=\s*({.+?});/s);
      if (sharedData) {
        try {
          const data = JSON.parse(sharedData[1]);
          const media = data?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
          if (media?.video_url) videoUrl = media.video_url;
          if (media?.display_url) thumbnail = thumbnail || media.display_url;
          if (media?.owner?.username) title = `IG @${media.owner.username} 的影片`;
        } catch (_) {}
      }
    }

    // 抓 download_url 或 video_versions
    if (!videoUrl) {
      const downloadMatch = html.match(/"download_url":"([^"\\]+)"/) ||
                           html.match(/"video_url":"([^"\\]+)"/) ||
                           html.match(/"playbook_url":"([^"\\]+)"/);
      if (downloadMatch) videoUrl = downloadMatch[1].replace(/\\u002F/g, "/");
    }

    if (!videoUrl) {
      return { success: false, platform: "instagram", error: "解析失敗（IG 需要登入才能下載影片，建議使用網頁版下載工具）" };
    }

    return {
      success: true,
      url: videoUrl,
      title,
      thumbnail,
      duration: 0,
      platform: "instagram",
      uploader: "",
    };
  } catch (e) {
    return { success: false, platform: "instagram", error: "解析失敗", error_hint: e.message };
  }
}

// ==================== Threads解析 ====================

async function parseThreads(rawText) {
  const url = extractUrl(rawText);
  try {
    const { html, finalUrl } = await fetchWithRedirect(url, { ua: UA });

    // Threads 使用 ld+json 格式
    const ldJson = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/i);
    let videoUrl = "";
    let thumbnail = "";
    let title = "Threads 影片";

    if (ldJson) {
      try {
        const ld = JSON.parse(ldJson[1]);
        if (Array.isArray(ld)) {
          for (const item of ld) {
            if (item["@type"] === "VideoObject" && item.contentUrl) {
              videoUrl = item.contentUrl;
              thumbnail = item.thumbnailUrl || thumbnail;
              title = item.name || title;
              break;
            }
          }
        } else if (ld.video) {
          videoUrl = ld.video.contentUrl || ld.video.url || "";
          thumbnail = ld.thumbnail?.url || ld.thumbnailUrl || "";
          title = ld.name || title;
        }
      } catch (_) {}
    }

    // 從 HTML 抓 data
    if (!videoUrl) {
      const threadData = html.match(/window\.__DATA__\s*=\s*({.+?});/s) ||
                        html.match(/window\.__INITIAL_PROPS__\s*=\s*({.+?});/s);
      if (threadData) {
        const m2 = threadData[1].match(/"video_url":["']([^"']+)["']/) ||
                   threadData[1].match(/"playback_url":["']([^"']+)["']/) ||
                   threadData[1].match(/"content_url":["']([^"']+)["']/);
        if (m2) videoUrl = m2[1].replace(/\\u002F/g, "/");
      }
    }

    if (!videoUrl) {
      const directMp4 = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
      if (directMp4) videoUrl = directMp4[1];
    }

    if (!videoUrl) {
      return { success: false, platform: "threads", error: "解析失敗（Threads 需要登入才能下載影片，建議使用網頁版下載工具）" };
    }

    return {
      success: true,
      url: videoUrl,
      title,
      thumbnail,
      duration: 0,
      platform: "threads",
      uploader: "",
    };
  } catch (e) {
    return { success: false, platform: "threads", error: "解析失敗", error_hint: e.message };
  }
}

// ==================== 蝦皮短影音解析 ====================

async function parseShopee(rawText) {
  const url = extractUrl(rawText);
  try {
    const { html, finalUrl } = await fetchWithRedirect(url, { ua: UA_MOBILE });

    // 蝦皮影片一般在 shopee.co/xxx.SHOP_ID.html 之類的格式
    // 先抓 JSON data
    const jsonMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([^<]+)<\/script>/i) ||
                     html.match(/window\.__INITIAL_DATA__\s*=\s*({.+?});/s) ||
                     html.match(/window\.__data\s*=\s*({.+?});/s);

    let videoUrl = "";
    let title = "蝦皮短影音";
    let thumbnail = "";

    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const text = JSON.stringify(data);

        // 抓 mp4 URL
        const mp4Matches = [...text.matchAll(/(https?:\/\/[^"']+\.mp4[^"']*)/g)];
        if (mp4Matches.length) videoUrl = mp4Matches[0][1];

        // 抓標題
        const titleMatch = text.match(/"name"\s*:\s*"([^"]{2,100})"/);
        if (titleMatch) title = titleMatch[1];

        // 抓圖片
        const imgMatch = text.match(/"imageUrls"\s*:\s*\["([^"]+)"/) ||
                        text.match(/"thumbnail"\s*:\s*"([^"]+)"/);
        if (imgMatch) thumbnail = imgMatch[1];
      } catch (_) {}
    }

    // 兜底：直接搜 mp4
    if (!videoUrl) {
      const mp4s = [...html.matchAll(/(?:video|src|href)\s*[=:]\s*["']([^"']+\.mp4[^"']*)["']/gi)];
      for (const m of mp4s) {
        if (m[1].includes("shopee")) { videoUrl = m[1]; break; }
      }
      if (!videoUrl) {
        const directMp4 = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
        if (directMp4) videoUrl = directMp4[1];
      }
    }

    if (!videoUrl) {
      return { success: false, platform: "shopee", error: "解析失敗（可能不是短影音或格式不支援）" };
    }

    return {
      success: true,
      url: videoUrl.replace(/\\u002F/g, "/"),
      title,
      thumbnail,
      duration: 0,
      platform: "shopee",
      uploader: "",
    };
  } catch (e) {
    return { success: false, platform: "shopee", error: "解析失敗", error_hint: e.message };
  }
}

// ==================== 淘寶 / 天貓 解析 ====================
// 支援：
// 1. 直接影片 URL（tbm-auth.alicdn.com/...mp4?...auth_key=...）→ 直接返回
// 2. 淘寶商品頁（item.taobao.com/item.htm?id=...）→ fetch + 解析
// 3. 天貓商品頁（detail.tmall.com/item.htm?id=...）→ 同上
// 4. 淘寶影片 URL（video.taobao.com/...）→ fetch + 解析
async function parseTaobao(rawText) {
  const url = extractUrl(rawText);
  const u = url.toLowerCase();

  // Case 1: 已是alicdn.com 直鏈影片 URL → 直接返回
  if (u.includes("alicdn.com") || u.includes("tbcdn.cn")) {
    if (url.match(/\.(mp4|flv|m3u8|webm)(\?|$)/i)) {
      return {
        success: true,
        url,
        title: "淘寶/天貓影片",
        thumbnail: "",
        duration: 0,
        platform: "taobao",
        uploader: "",
        source: "direct_cdn",
      };
    }
    // alicdn URL 但可能不是影片後綴，試解析
  }

  // Case 2: 淘寶/天貓商品頁
  if (u.includes("taobao.com") || u.includes("tmall.com") || u.includes("tb.cn")) {
    try {
      const { html } = await fetchWithRedirect(url, { ua: UA_MOBILE });

      // 偵測是否被風控擋住（登入跳轉頁 / RGV587_ERROR）
      const isBlocked = html.includes("RGV587") ||
                        html.includes("哎哟喂,被挤爆啦") ||
                        html.includes("_____tmd_____") ||
                        html.includes("login.taobao.com/member/login") ||
                        (html.includes("login") && html.length < 10000 && html.includes("login_jump"));

      if (isBlocked) {
        return {
          success: false,
          platform: "taobao",
          error: "淘寶/天貓商品頁需要登入驗證，無法從伺服器直接解析",
          error_hint: "請在電腦版淘寶/天貓網頁開啟影片，播放後從開發者工具的 Network 標籤中複製 .mp4 或 .m3u8 的完整網址（通常包含 auth_key 參數），再貼到這裡解析。",
          blocked_reason: "taobao_risk_control",
        };
      }

      // 策略1: 直接找alicdn視頻URL
      const directVideo = html.match(/https?:\/\/[a-z0-9\-\.]*alicdn\.com[^\s"'<>]+/gi);
      if (directVideo) {
        // 過濾出.mp4 / .flv / 含 video 的 URL
        const mp4Urls = directVideo.filter(uri =>
          uri.match(/\.(mp4|flv|m3u8)(\?|$)/i) || uri.includes("/video/") || uri.includes("/mp4/")
        );
        if (mp4Urls.length > 0) {
          // 取第一個影片 URL，附加完整參數
          let videoUrl = mp4Urls[0].split("?")[0];
          // 從整個 URL 提取 auth_key 等參數
          const authMatch = directVideo.find(uri => uri.includes("auth_key="));
          if (authMatch) {
            const params = authMatch.match(/\?(.+)$/);
            if (params) videoUrl += "?" + params[1];
          }
          return {
            success: true,
            url: videoUrl,
            title: "淘寶/天貓影片",
            thumbnail: "",
            duration: 0,
            platform: "taobao",
            uploader: "",
            source: "taobao_page",
          };
        }
      }

      // 策略2: 找頁面嵌入的JSON資料（商品詳情中的視頻資訊）
      const jsonBlocks = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\});/s);
      if (jsonBlocks) {
        try {
          // 找 video / videoUrl / m3u8 字段
          const vidMatch = jsonBlocks[1].match(/"(https?:\/\/[^"]+\.(?:mp4|m3u8|flv)(?:\?[^"]*)?)"/);
          if (vidMatch) {
            return {
              success: true,
              url: vidMatch[1],
              title: "淘寶/天貓影片",
              thumbnail: "",
              duration: 0,
              platform: "taobao",
              uploader: "",
              source: "taobao_json",
            };
          }
        } catch (_) { /* ignore */ }
      }

      // 策略3: 找 data-video 或 video 標籤
      const videoTagMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i) ||
                           html.match(/data-src=["']([^"']+\.(?:mp4|m3u8|flv)[^"']*)["']/i);
      if (videoTagMatch) {
        return {
          success: true,
          url: videoTagMatch[1],
          title: "淘寶/天貓影片",
          thumbnail: "",
          duration: 0,
          platform: "taobao",
          uploader: "",
          source: "taobao_videotag",
        };
      }

      // 策略4: 找淘寶SDK影片格式 https://cloud.video.taobao.com/play/u/...
      const cloudVideoMatch = html.match(/(https?:\/\/cloud\.video\.taobao\.com\/[^\s"']+)/i);
      if (cloudVideoMatch) {
        return {
          success: true,
          url: cloudVideoMatch[1],
          title: "淘寶雲影片",
          thumbnail: "",
          duration: 0,
          platform: "taobao",
          uploader: "",
          source: "taobao_cloud",
        };
      }

      // 找不到影片
      return {
        success: false,
        platform: "taobao",
        error: "頁面中找不到影片連結（商品可能沒有影片、或需要登入）",
        error_hint: "如果該商品有影片，請在瀏覽器開啟商品頁 → 播放影片 → 右鍵「檢查」→「Network」標籤 → 找 .mp4 或 .m3u8 → 右鍵 → Copy URL → 貼到這裡。",
      };
    } catch (e) {
      return { success: false, platform: "taobao", error: "解析失敗：" + e.message };
    }
  }

  // Case 3: 其他淘寶影片 URL（video.taobao.com 等）
  if (u.includes("video.taobao.com")) {
    try {
      const { html } = await fetchWithRedirect(url, { ua: UA_MOBILE });
      const mp4Match = html.match(/(https?:\/\/[^\s"'<]+\.mp4[^\s"'<>]*)/);
      if (mp4Match) {
        return {
          success: true,
          url: mp4Match[1].split("?")[0],
          title: "淘寶影片",
          thumbnail: "",
          duration: 0,
          platform: "taobao",
          uploader: "",
          source: "taobao_video_page",
        };
      }
    } catch (e) {
      return { success: false, platform: "taobao", error: "解析失敗：" + e.message };
    }
  }

  return {
    success: false,
    platform: "taobao",
    error: "不是有效的淘寶/天貓連結",
  };
}

// ==================== 主路由 ====================

async function handleVideoInfo(request, env) {
  if (request.method !== "POST") {
    return json({ success: false, error: "請使用 POST 方法" }, 405);
  }
  let body;
  try { body = await request.json(); } catch {
    return json({ success: false, error: "JSON 格式錯誤" }, 400);
  }
  const raw = body.url?.trim();
  if (!raw) return json({ success: false, error: "請提供網址" }, 400);

  const platform = detectPlatform(raw);
  const userKey = body.userKey?.trim() || null;  // 用戶可自帶 Key
  const keyPool = await loadKeyPool(env);
  let result;

  // 支援的平台：先用第三方 API（多 Key 池）
  // auto-download-all-in-one 涵蓋 60+ 平台：YouTube, Facebook, Twitter, Bilibili, Snapchat, VK, Weibo 等
  const supportedForApi = [
    "douyin", "xiaohongshu", "tiktok", "instagram", "threads",
    "youtube", "facebook", "twitter", "bilibili", "snapchat",
    "vk", "weibo", "telegram", "pinterest", "linkedin",
    "reddit", "tumblr", "vimeo", "dailymotion", "rumble",
    "twitch", "espn", "imdb", "imgur", "9gag", "coub",
    "likee", "kuaishou", "afreecatv", "chzzk", "kick",
    "dlive", "sharechat", "ifunny", "ted", "sohu",
    "ok", "rutube", "lemon8", "soundcloud", "spotify",
    // 注意：taobao 不在這裡（會繞過 RapidAPI，直接用 parseTaobao 自寫解析）
  ];
  if (supportedForApi.includes(platform)) {
    result = await parseWithFallback(env, platform, raw, keyPool, userKey);
  }

  // 第三方 API 失敗 → 用 a-bogus / 自寫解析兜底
  if (!result || !result.success) {
    switch (platform) {
      case "douyin":      result = await parseDouyin(raw); break;
      case "xiaohongshu": result = await parseXiaohongshu(raw); break;
      case "tiktok":      result = await parseTikTok(raw); break;
      case "instagram":   result = await parseInstagram(raw); break;
      case "threads":     result = await parseThreads(raw); break;
      case "shopee":      result = await parseShopee(raw); break;
      case "taobao":      result = await parseTaobao(raw); break;
      default:
        // 其他原本不支援的平台：用 auto-download-all-in-one 再試一次（上面的 parseWithFallback 已用過）
        // 若 API 都拿不到，就回傳錯誤
        if (!result || !result.success) {
          result = {
            success: false,
            platform,
            error: result?.error || `不支援的平台或解析失敗：${platform}`,
            hint: "如有私密或需登入的內容，請在請求加 cookie 參數",
          };
        }
        break;
    }
  }
  return json(result, result.success ? 200 : 400);
}

// ==================== 下載代理 ====================

async function handleDlStream(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  const referer = url.searchParams.get("referer") || "https://www.douyin.com/";
  const filename = url.searchParams.get("filename") || "video.mp4";
  if (!target) return new Response("缺少 url 參數", { status: 400 });
  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": UA,
        "Referer": referer,
      },
    });
    if (!upstream.ok) return new Response("上游返回 " + upstream.status, { status: 502 });
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "video/mp4");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    const cl = upstream.headers.get("Content-Length");
    if (cl) headers.set("Content-Length", cl);
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return new Response("代理錯誤：" + e.message, { status: 500 });
  }
}

// ==================== Admin API（Key 管理）====================

/**
 * 驗證管理員 token
 * 環境變數：ADMIN_TOKEN（沒設定則用預設值，但建議改成自己的）
 */
function checkAdmin(request, env) {
  const token = env.ADMIN_TOKEN || "longyuan-admin-default-token";
  const auth = request.headers.get("Authorization") || "";
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  return auth === `Bearer ${token}` || queryToken === token;
}

async function handleAdminKeys(request, env) {
  if (!checkAdmin(request, env)) return json({ error: "未授權" }, 401);
  const pool = await loadKeyPool(env);

  // 遮罩 Key 顯示（只顯示前 4 + 後 4）
  const mask = (k) => {
    if (!k || k.length < 10) return "****";
    return k.slice(0, 4) + "..." + k.slice(-4);
  };

  return json({
    tikhub: pool.tikhub.map(k => ({
      id: k.id,
      key: mask(k.key),
      healthy: k.healthy,
      failCount: k.failCount,
      usedThisMonth: k.usedThisMonth,
      lastUsed: k.lastUsed ? new Date(k.lastUsed).toISOString() : null,
      lastSuccess: k.lastSuccess ? new Date(k.lastSuccess).toISOString() : null,
      lastError: k.lastError || null,
    })),
    rapidapi: pool.rapidapi.map(k => ({
      id: k.id,
      host: k.host,
      key: mask(k.key),
      healthy: k.healthy,
      failCount: k.failCount,
      usedThisMonth: k.usedThisMonth,
      lastUsed: k.lastUsed ? new Date(k.lastUsed).toISOString() : null,
      lastSuccess: k.lastSuccess ? new Date(k.lastSuccess).toISOString() : null,
      lastError: k.lastError || null,
    })),
    summary: {
      totalTikhub: pool.tikhub.length,
      healthyTikhub: pool.tikhub.filter(k => k.healthy).length,
      totalRapidapi: pool.rapidapi.length,
      healthyRapidapi: pool.rapidapi.filter(k => k.healthy).length,
      totalUsedThisMonth: [...pool.tikhub, ...pool.rapidapi].reduce((s, k) => s + (k.usedThisMonth || 0), 0),
    },
  });
}

async function handleAdminUsage(request, env) {
  if (!checkAdmin(request, env)) return json({ error: "未授權" }, 401);
  if (!env.KEYS_KV) return json({ error: "KV 沒設定" }, 500);

  // 列出本月所有 Key 的使用次數
  const month = new Date().toISOString().slice(0, 7);
  const list = await env.KEYS_KV.list({ prefix: `usage:${month}:` });
  const usage = [];
  for (const k of list.keys) {
    const val = await env.KEYS_KV.get(k.name);
    const id = k.name.replace(`usage:${month}:`, "");
    usage.push({ id, count: parseInt(val || "0", 10) });
  }
  usage.sort((a, b) => b.count - a.count);

  return json({
    month,
    usage,
    total: usage.reduce((s, u) => s + u.count, 0),
  });
}

async function handleAdminReset(request, env) {
  if (!checkAdmin(request, env)) return json({ error: "未授權" }, 401);
  if (request.method !== "POST") return json({ error: "需 POST" }, 405);

  let body = {};
  try { body = await request.json(); } catch (_) {}
  const targetId = body.id;

  if (!env.KEYS_KV) return json({ error: "KV 沒設定" }, 500);

  if (targetId) {
    // 重置特定 Key
    const state = await env.KEYS_KV.get(`key:${targetId}`);
    if (!state) return json({ error: "找不到該 Key" }, 404);
    const parsed = JSON.parse(state);
    parsed.healthy = true;
    parsed.failCount = 0;
    parsed.lastError = "";
    await saveKeyState(env, targetId, parsed);
    return json({ success: true, message: `已重置 ${targetId}` });
  } else {
    // 重置所有 Key
    const list = await env.KEYS_KV.list({ prefix: "key:" });
    for (const k of list.keys) {
      const state = await env.KEYS_KV.get(k.name);
      if (state) {
        const parsed = JSON.parse(state);
        parsed.healthy = true;
        parsed.failCount = 0;
        parsed.lastError = "";
        await env.KEYS_KV.put(k.name, JSON.stringify(parsed));
      }
    }
    return json({ success: true, message: `已重置 ${list.keys.length} 個 Key` });
  }
}

async function handleAdminStats(request, env) {
  if (!checkAdmin(request, env)) return json({ error: "未授權" }, 401);
  if (!env.KEYS_KV) return json({ error: "KV 沒設定" }, 500);

  const month = new Date().toISOString().slice(0, 7);
  const list = await env.KEYS_KV.list({ prefix: `usage:${month}:` });
  const today = new Date().toISOString().slice(0, 10);

  // 統計本月 + 今日
  let monthTotal = 0;
  const perKey = [];
  for (const k of list.keys) {
    const val = parseInt((await env.KEYS_KV.get(k.name)) || "0", 10);
    monthTotal += val;
    perKey.push({ id: k.name.replace(`usage:${month}:`, ""), month: val });
  }

  // 今日
  const todayList = await env.KEYS_KV.list({ prefix: `usage:${today}:` });
  let todayTotal = 0;
  for (const k of todayList.keys) {
    todayTotal += parseInt((await env.KEYS_KV.get(k.name)) || "0", 10);
  }

  return json({
    month,
    today,
    todayTotal,
    monthTotal,
    perKey: perKey.sort((a, b) => b.month - a.month),
  });
}

// ==================== 前端 HTML 頁面 ====================

const ADMIN_PAGE = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>龍淵裂影 - Key 管理</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f0c29;
    color: #eee;
    padding: 20px;
    min-height: 100vh;
  }
  .wrap { max-width: 1000px; margin: 0 auto; }
  h1 {
    background: linear-gradient(135deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-size: 28px;
    margin-bottom: 24px;
  }
  .stat-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 16px;
  }
  .stat-card .num {
    font-size: 32px;
    font-weight: 700;
    background: linear-gradient(135deg, #38ef7d, #11998e);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .stat-card .label {
    font-size: 13px;
    color: #aaa;
    margin-top: 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: rgba(255,255,255,0.05);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 20px;
  }
  th, td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    font-size: 14px;
  }
  th { background: rgba(255,255,255,0.05); color: #aaa; font-weight: 600; }
  .healthy { color: #38ef7d; }
  .unhealthy { color: #ff6b6b; }
  .key-cell { font-family: monospace; font-size: 13px; }
  .btn {
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    background: rgba(102,126,234,0.3);
    color: #fff;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }
  .btn:hover { background: rgba(102,126,234,0.6); }
  .btn-danger { background: rgba(255,107,107,0.3); }
  .btn-danger:hover { background: rgba(255,107,107,0.6); }
  h2 {
    font-size: 18px;
    margin: 24px 0 12px;
    color: #ccc;
  }
  .token-bar {
    background: rgba(255,255,255,0.05);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 20px;
  }
  .token-bar input {
    background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.1);
    color: #fff;
    padding: 8px 12px;
    border-radius: 6px;
    margin-right: 8px;
    width: 240px;
  }
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    background: #11998e;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: none;
    z-index: 1000;
  }
  .toast.show { display: block; animation: fadeIn 0.3s; }
  @keyframes fadeIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
</style>
</head>
<body>
<div class="wrap">
  <h1>龍淵裂影 - Key 管理後台</h1>

  <div class="token-bar">
    <input id="tokenInput" placeholder="輸入管理員 token" />
    <button class="btn" onclick="setToken()">驗證</button>
    <button class="btn" onclick="loadAll()">重新整理</button>
  </div>

  <div class="stat-row" id="stats"></div>

  <h2>TikHub Keys</h2>
  <table id="tikhubTable">
    <thead><tr>
      <th>ID</th><th>Key</th><th>狀態</th><th>失敗</th><th>本月用量</th><th>最後成功</th><th>錯誤</th><th>操作</th>
    </tr></thead>
    <tbody></tbody>
  </table>

  <h2>RapidAPI Keys</h2>
  <table id="rapidapiTable">
    <thead><tr>
      <th>ID</th><th>Host</th><th>Key</th><th>狀態</th><th>失敗</th><th>本月用量</th><th>最後成功</th><th>錯誤</th><th>操作</th>
    </tr></thead>
    <tbody></tbody>
  </table>
</div>
<div class="toast" id="toast"></div>

<script>
let TOKEN = localStorage.getItem('admin_token') || '';

function setToken() {
  TOKEN = document.getElementById('tokenInput').value.trim();
  localStorage.setItem('admin_token', TOKEN);
  showToast('Token 已設定');
  loadAll();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show';
  setTimeout(() => t.className = 'toast', 2000);
}

async function api(path, method = 'GET', body = null) {
  const resp = await fetch(path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN), {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
    body: body ? JSON.stringify(body) : null,
  });
  if (resp.status === 401) {
    showToast('Token 錯誤');
    return null;
  }
  return resp.json();
}

async function loadAll() {
  if (!TOKEN) {
    showToast('請先輸入 token');
    return;
  }

  const [keys, stats] = await Promise.all([
    api('/api/admin/keys'),
    api('/api/admin/stats'),
  ]);

  if (stats) {
    document.getElementById('stats').innerHTML = \`
      <div class="stat-card"><div class="num">\${stats.todayTotal}</div><div class="label">今日用量</div></div>
      <div class="stat-card"><div class="num">\${stats.monthTotal}</div><div class="label">本月用量 (\${stats.month})</div></div>
      <div class="stat-card"><div class="num">\${keys.summary.healthyTikhub}/\${keys.summary.totalTikhub}</div><div class="label">TikHub 健康</div></div>
      <div class="stat-card"><div class="num">\${keys.summary.healthyRapidapi}/\${keys.summary.totalRapidapi}</div><div class="label">RapidAPI 健康</div></div>
    \`;
  }

  if (keys) {
    const renderRow = (k, isRapid) => {
      const cls = k.healthy ? 'healthy' : 'unhealthy';
      const status = k.healthy ? '✓ 健康' : '✗ 失敗';
      const lastSuccess = k.lastSuccess ? new Date(k.lastSuccess).toLocaleString('zh-TW') : '-';
      const err = k.lastError ? new Date(k.lastError).toLocaleString('zh-TW') : '-';
      const host = isRapid ? \`<td>\${k.host}</td>\` : '';
      return \`<tr>
        <td>\${k.id}</td>
        \${host}
        <td class="key-cell">\${k.key}</td>
        <td class="\${cls}">\${status}</td>
        <td>\${k.failCount}</td>
        <td>\${k.usedThisMonth}</td>
        <td>\${lastSuccess}</td>
        <td>\${err}</td>
        <td><button class="btn" onclick="resetKey('\${k.id}')">重置</button></td>
      </tr>\`;
    };

    document.querySelector('#tikhubTable tbody').innerHTML =
      keys.tikhub.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:#888">尚未設定 TikHub Key</td></tr>'
      : keys.tikhub.map(k => renderRow(k, false)).join('');
    document.querySelector('#rapidapiTable tbody').innerHTML =
      keys.rapidapi.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:#888">尚未設定 RapidAPI Key</td></tr>'
      : keys.rapidapi.map(k => renderRow(k, true)).join('');
  }
}

async function resetKey(id) {
  if (!confirm('重置 ' + id + '？')) return;
  const r = await api('/api/admin/reset', 'POST', { id });
  if (r && r.success) {
    showToast('已重置');
    loadAll();
  }
}

if (TOKEN) document.getElementById('tokenInput').value = TOKEN;
loadAll();
setInterval(loadAll, 30000);  // 每 30 秒自動重新整理
</script>
</body>
</html>`;

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>龍淵裂影 - 影片下載</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .container {
    background: rgba(255,255,255,0.95);
    border-radius: 20px;
    padding: 40px;
    width: 100%;
    max-width: 520px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .logo {
    text-align: center;
    margin-bottom: 32px;
  }
  .logo h1 {
    font-size: 28px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
  }
  .logo p {
    color: #666;
    font-size: 14px;
  }
  .input-group {
    margin-bottom: 20px;
  }
  .input-group label {
    display: block;
    font-size: 13px;
    color: #555;
    margin-bottom: 8px;
    font-weight: 500;
  }
  .input-group input {
    width: 100%;
    padding: 14px 16px;
    border: 2px solid #e0e0e0;
    border-radius: 12px;
    font-size: 15px;
    transition: border-color 0.2s;
    outline: none;
  }
  .input-group input:focus {
    border-color: #667eea;
  }
  .platforms {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
  }
  .platform-tag {
    background: #f0eeff;
    color: #667eea;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }
  .btn {
    width: 100%;
    padding: 15px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.2s;
  }
  .btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(102,126,234,0.4);
  }
  .btn:active { transform: translateY(0); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .result {
    margin-top: 24px;
    display: none;
  }
  .result.show { display: block; }
  .result-card {
    background: #f8f7ff;
    border-radius: 14px;
    padding: 20px;
    border: 1px solid #e8e5ff;
  }
  .result-card h3 {
    font-size: 15px;
    color: #333;
    margin-bottom: 12px;
    word-break: break-word;
  }
  .result-card img {
    width: 100%;
    border-radius: 8px;
    margin-bottom: 12px;
    max-height: 200px;
    object-fit: cover;
  }
  .result-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .meta-tag {
    background: #667eea22;
    color: #667eea;
    padding: 3px 10px;
    border-radius: 8px;
    font-size: 12px;
  }
  .download-btn {
    display: block;
    width: 100%;
    padding: 13px;
    background: linear-gradient(135deg, #11998e, #38ef7d);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }
  .download-btn:hover { opacity: 0.9; }
  .error-card {
    background: #fff0f0;
    border: 1px solid #ffcccc;
    border-radius: 14px;
    padding: 20px;
    color: #c0392b;
    font-size: 14px;
    text-align: center;
  }
  .loading {
    text-align: center;
    padding: 20px;
    color: #667eea;
    font-size: 14px;
  }
  .loading::after {
    content: '';
    animation: dots 1.5s infinite;
  }
  @keyframes dots {
    0%, 20% { content: ''; }
    40% { content: '.'; }
    60% { content: '..'; }
    80%, 100% { content: '...'; }
  }
  .footer {
    text-align: center;
    margin-top: 20px;
    font-size: 12px;
    color: #999;
  }
</style>
</head>
<body>
<div class="container">
  <div class="logo">
    <h1>龍淵裂影</h1>
    <p>抖音 · 小紅書 · IG · Threads · 蝦皮短影音</p>
  </div>

  <div class="input-group">
    <label>貼上影片網址</label>
    <input type="text" id="urlInput" placeholder="例如：https://www.douyin.com/video/..." />
  </div>

  <div class="platforms">
    <span class="platform-tag">抖音</span>
    <span class="platform-tag">小紅書</span>
    <span class="platform-tag">IG</span>
    <span class="platform-tag">Threads</span>
    <span class="platform-tag">蝦皮</span>
    <span class="platform-tag">TikTok</span>
  </div>

  <button class="btn" id="parseBtn" onclick="parseUrl()">取得下載</button>

  <div class="result" id="resultArea"></div>

  <div class="footer">龍淵裂影 · 僅供學習使用</div>
</div>

<script>
async function parseUrl() {
  const input = document.getElementById('urlInput').value.trim();
  const btn = document.getElementById('parseBtn');
  const result = document.getElementById('resultArea');

  if (!input) {
    alert('請先貼上網址');
    return;
  }

  btn.disabled = true;
  btn.textContent = '解析中';
  result.className = 'result';
  result.innerHTML = '<div class="loading">正在解析</div>';
  result.className = 'result show';

  try {
    const resp = await fetch('/api/video-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input }),
    });
    const data = await resp.json();

    if (data.success) {
      const title = data.title || '影片';
      const platform = data.platform || '';
      const duration = data.duration ? Math.floor(data.duration / 1000) + '秒' : '';
      const uploader = data.uploader ? '@' + data.uploader : '';

      let html = '<div class="result-card">';
      html += '<h3>' + title + '</h3>';
      if (data.thumbnail) {
        html += '<img src="' + data.thumbnail + '" alt="縮圖" onerror="this.style.display=\\'none\\'">';
      }
      html += '<div class="result-meta">';
      html += '<span class="meta-tag">' + platform + '</span>';
      if (duration) html += '<span class="meta-tag">' + duration + '</span>';
      if (uploader) html += '<span class="meta-tag">' + uploader + '</span>';
      html += '</div>';
      html += '<a class="download-btn" href="/api/dl-stream?url=' + encodeURIComponent(data.url) + '&filename=' + encodeURIComponent(title + '.mp4') + '" download>下載影片</a>';
      html += '</div>';
      result.innerHTML = html;
    } else {
      let errHtml = '<div class="error-card"><div style="font-size:15px;margin-bottom:8px;font-weight:600;">' + (data.error || '解析失敗') + '</div>';
      if (data.error_hint) {
        errHtml += '<div style="font-size:13px;color:#666;text-align:left;line-height:1.6;margin-top:8px;padding-top:8px;border-top:1px solid #ffcccc;">' + data.error_hint + '</div>';
      }
      errHtml += '</div>';
      result.innerHTML = errHtml;
    }
  } catch (e) {
    result.innerHTML = '<div class="error-card">網路錯誤，請稍後重試</div>';
  }

  btn.disabled = false;
  btn.textContent = '取得下載';
}

// 按 Enter 送出
document.getElementById('urlInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') parseUrl();
});
</script>
</body>
</html>`;

// ==================== Worker 入口 ====================

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const path = new URL(request.url).pathname;

    if (path === "/api/video-info") return handleVideoInfo(request, env);
    if (path === "/api/dl-stream")  return handleDlStream(request);
    if (path === "/api/admin/keys") return handleAdminKeys(request, env);
    if (path === "/api/admin/usage") return handleAdminUsage(request, env);
    if (path === "/api/admin/reset") return handleAdminReset(request, env);
    if (path === "/api/admin/stats") return handleAdminStats(request, env);
    if (path === "/admin") return new Response(ADMIN_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (path === "/" || path === "/index.html") {
      return new Response(HTML_PAGE, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return json({ error: "找不到頁面" }, 404);
  },
};
