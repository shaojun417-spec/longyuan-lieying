// ============================================================
// 抖音 a-bogus 簽名（純算版，Worker 內運行）
//
// 來源：renmu123/biliLive-tools 的 TypeScript 移植（來自 hua0512/rust-srec）
// 改動：去掉 npm 依賴（自寫 SM3，RC4 用原生實作，型別移除）
//
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

/** SM3：接受字串或 Uint8Array，回傳 32 bytes hex */
function sm3(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const len = bytes.length;
  const bitLen = len * 8;

  // padding
  const padLen = (((len + 8) >> 6) + 1) << 4;
  const buf = new Uint8Array(padLen * 4);
  buf.set(bytes);
  buf[len] = 0x80;
  // 大端序寫入長度
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

// ---------------- RC4 加密 ----------------

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

// ---------------- 字串/位元組 ----------------

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

// ---------------- CryptoUtility ----------------

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

// ---------------- 瀏覽器指紋 ----------------

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

// ---------------- ABogus ----------------

const SORT_INDEX = [
  18, 20, 52, 26, 30, 34, 58, 38, 40, 53, 42, 21, 27, 54, 55, 31, 35, 57, 39, 41, 43, 22, 28,
  32, 60, 36, 23, 29, 33, 37, 44, 45, 59, 46, 47, 48, 49, 50, 24, 25, 65, 66, 70, 71,
];

const SORT_INDEX_2 = [
  18, 20, 26, 30, 34, 38, 40, 42, 21, 27, 31, 35, 39, 41, 43, 22, 28, 32, 36, 23, 29, 33, 37,
  44, 45, 46, 47, 48, 49, 50, 24, 25, 52, 53, 54, 55, 57, 58, 59, 60, 65, 66, 70, 71,
];

const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export function generateABogus(params, body = "", userAgent = DEFAULT_UA) {
  const abDir = {
    8: 3,
    18: 44,
    66: 0,
    69: 0,
    70: 0,
    71: 0,
  };

  const startEncryption = Date.now();

  // SM3(SM3(params+"cus")) — 雙重雜湊
  const paramsHash1 = sm3(params + "cus");
  const array1 = sm3ToArray(paramsHash1);

  const bodyHash1 = sm3((body || "") + "cus");
  const array2 = sm3ToArray(bodyHash1);

  // RC4(UA) → base64 → SM3
  const rc4Ua = rc4Encrypt([0x00, 0x01, 0x0e], userAgent);
  const uaB64 = base64Encode(rc4Ua, 1);
  const array3 = sm3ToArray(uaB64);

  const endEncryption = Date.now();

  // 動態填充
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
