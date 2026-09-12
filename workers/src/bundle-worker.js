// ==================== 龍淵裂影 Worker Bundle ====================

// Frontend HTML (lazy loaded)
const FRONTEND_HTML = (function(){const _=`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>龍淵裂影 — 無水印影片下載</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif;
    background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
    min-height: 100vh; padding: 20px; color: #fff;
  }
  .container { max-width: 720px; margin: 0 auto; padding: 24px 0; }
  h1 {
    text-align: center; font-size: 36px; margin-bottom: 8px;
    background: linear-gradient(90deg, #f093fb 0%, #f5576c 50%, #4facfe 100%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .sub { text-align: center; color: #aaa; margin-bottom: 32px; font-size: 14px; }
  .card {
    background: rgba(255,255,255,0.08); backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.12); border-radius: 20px;
    padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #ddd; }
  textarea {
    width: 100%; min-height: 100px; padding: 14px;
    background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 12px; color: #fff; font-size: 15px;
    font-family: inherit; resize: vertical; transition: border 0.2s;
  }
  textarea:focus { outline: none; border-color: #f5576c; }
  textarea::placeholder { color: #666; }
  .btn-row { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
  button {
    flex: 1; min-width: 140px; padding: 14px 24px; border: none;
    border-radius: 12px; font-size: 16px; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
  }
  .btn-primary {
    background: linear-gradient(135deg, #f5576c 0%, #f093fb 100%); color: #fff;
  }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(245,87,108,0.4); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .btn-secondary {
    background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2);
  }
  .btn-secondary:hover { background: rgba(255,255,255,0.15); }
  .result { margin-top: 24px; padding: 20px; background: rgba(0,0,0,0.2);
    border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); }
  .result.success { border-color: rgba(76,175,80,0.4); }
  .result.error { border-color: rgba(244,67,54,0.4); }
  .result h3 { margin-bottom: 12px; font-size: 16px; }
  .result img { max-width: 100%; border-radius: 8px; margin: 12px 0; }
  .result video { max-width: 100%; border-radius: 8px; margin: 12px 0; max-height: 400px; }
  .result a {
    display: inline-block; margin-top: 12px; padding: 10px 20px;
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    color: #000; text-decoration: none; border-radius: 8px; font-weight: 700;
  }
  .platform-badge {
    display: inline-block; padding: 4px 12px; border-radius: 20px;
    font-size: 12px; font-weight: 700; margin-bottom: 8px;
  }
  .badge-douyin { background: #fe2c55; color: #fff; }
  .badge-xiaohongshu { background: #ff2442; color: #fff; }
  .badge-tiktok { background: #000; color: #fff; border: 1px solid #fff; }
  .badge-threads { background: #000; color: #fff; border: 1px solid #fff; }
  .badge-unknown { background: #666; color: #fff; }
  .loading { text-align: center; padding: 20px; }
  .spinner {
    display: inline-block; width: 30px; height: 30px;
    border: 3px solid rgba(255,255,255,0.2); border-top-color: #f5576c;
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .hint { margin-top: 16px; padding: 12px; background: rgba(79,172,254,0.1);
    border-left: 3px solid #4facfe; border-radius: 4px; font-size: 13px; color: #aaa; }
  .footer { text-align: center; margin-top: 32px; color: #666; font-size: 12px; }
  .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
    padding: 12px 24px; background: rgba(0,0,0,0.85); border-radius: 24px;
    font-size: 14px; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 1000; }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
<div class="container">
  <h1>🐉 龍淵裂影</h1>
  <p class="sub">無水印影片下載工具 · 支援抖音 / 小紅書 / TikTok / Threads</p>

  <div class="card">
    <label for="url">貼上影片網址</label>
    <textarea id="url" placeholder="\u652f\u63f4\u683c\u5f0f\uff1a&#10;https://v.douyin.com/xxxxx/&#10;https://www.xiaohongshu.com/discovery/item/xxxxx&#10;https://www.tiktok.com/@xxx/video/xxxxx&#10;&#10;\u8cbc\u4e0a\u5f8c\u6309\u300c\u89e3\u6790\u300d"></textarea>

    <div class="btn-row">
      <button class="btn-primary" id="parseBtn" onclick="parseVideo()">🔍 解析</button>
      <button class="btn-secondary" onclick="clearAll()">🗑 清空</button>
    </div>

    <div id="result"></div>

    <div class="hint">
      💡 <b>使用說明</b>：在抖音/小紅書/TikTok/Threads App 內「分享 → 複製連結」，回到這裡貼上即可。<br>
      ⚠️ 短時間內大量解析可能會被平台擋，請稍等再試。
    </div>
  </div>

  <p class="footer">Powered by Cloudflare Workers · API at /api/video-info</p>
</div>
<div id="toast" class="toast"></div>

<script>
const API = window.location.origin;

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function detectBadge(platform) {
  const map = { douyin: 'badge-douyin', xiaohongshu: 'badge-xiaohongshu', tiktok: 'badge-tiktok', threads: 'badge-threads' };
  const label = { douyin: '抖音', xiaohongshu: '小紅書', tiktok: 'TikTok', threads: 'Threads', youtube: 'YouTube' };
  return '<span class="platform-badge ' + (map[platform] || 'badge-unknown') + '">' + (label[platform] || platform) + '</span>';
}

async function parseVideo() {
  const url = document.getElementById('url').value.trim();
  const resultDiv = document.getElementById('result');
  const btn = document.getElementById('parseBtn');

  if (!url) { toast('請先貼上影片網址'); return; }

  btn.disabled = true;
  resultDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p style="margin-top:12px;">解析中，請稍候...</p></div>';

  try {
    const resp = await fetch(API + '/api/video-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await resp.json();

    if (data.success) {
      const titleSafe = escapeHtml(data.title || '影片');
      const uploaderSafe = data.uploader ? escapeHtml(data.uploader) : '';
      const referer = data.platform === 'douyin' ? 'https://www.douyin.com/' : 'https://www.xiaohongshu.com/';
      const dlUrl = API + '/api/dl-stream?url=' + encodeURIComponent(data.url) + '&referer=' + encodeURIComponent(referer) + '&filename=' + encodeURIComponent((data.title || 'video') + '.mp4');
      const thumbHtml = data.thumbnail ? '<img src="' + escapeHtml(data.thumbnail) + '" alt="">' : '';
      resultDiv.innerHTML = '<div class="result success">' +
        detectBadge(data.platform) +
        '<h3>' + titleSafe + '</h3>' +
        (uploaderSafe ? '<p style="color:#aaa;font-size:14px;">👤 ' + uploaderSafe + '</p>' : '') +
        thumbHtml +
        '<video controls src="' + escapeHtml(data.url) + '" preload="metadata"></video>' +
        '<br><a href="' + dlUrl + '" download>⬇️ 下載影片 (MP4)</a>' +
        '</div>';
      toast('解析成功！');
    } else {
      resultDiv.innerHTML = '<div class="result error">' +
        detectBadge(data.platform) +
        '<h3>❌ ' + escapeHtml(data.error || '解析失敗') + '</h3>' +
        (data.error_hint ? '<p style="color:#aaa;font-size:13px;margin-top:8px;">💡 ' + escapeHtml(data.error_hint) + '</p>' : '') +
        '<p style="color:#aaa;font-size:13px;margin-top:12px;">請確認連結是否公開、或換一條試試。</p>' +
        '</div>';
    }
  } catch (e) {
    resultDiv.innerHTML = '<div class="result error"><h3>❌ 網路錯誤</h3><p style="color:#aaa;">' + escapeHtml(e.message) + '</p></div>';
  } finally {
    btn.disabled = false;
  }
}

function clearAll() {
  document.getElementById('url').value = '';
  document.getElementById('result').innerHTML = '';
}

// Ctrl+Enter 快速解析
document.getElementById('url').addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') parseVideo();
});
</script>
</body>
</html>`;return _;})();

// SM3
const SM3_IV=[0x7380166F,0x4914B2B9,0x172442D7,0xDA8A0600,0xA96F30BC,0x163138AA,0xE38DEE4D,0xB0FB0E4E];
const SM3_TJ=(()=>{const T=new Uint32Array(64);for(let j=0;j<16;j++)T[j]=134686340;for(let j=16;j<64;j++){let a=T[j-16]^T[j-9]^(T[j-3]<<15|T[j-3]>>>17);a^=a<<17;a^=a>>>9;a^=a<<8;T[j]=T[j-16]^a^T[j-6]^(T[j-3]<<23|T[j-3]>>>9)^(T[j-10]<<13|T[j-10]>>>19);}return T;})();
function rotl(x,n){return(x<<n)|(x>>>32-n);}
function sm3Compress(V,block){const W=new Uint32Array(68);for(let i=0;i<16;i++)W[i]=(block[i*4]<<24)|(block[i*4+1]<<16)|(block[i*4+2]<<8)|block[i*4+3];for(let i=16;i<68;i++){const x=W[i-16]^W[i-9]^rotl(W[i-3],15);W[i]=(x^rotl(W[i-13],7)^rotl(W[i-6],19)^W[i-6]>>>0)>>>0;}const W1=new Uint32Array(64);for(let i=0;i<64;i++)W1[i]=W[i]^W[i+4];let A=V[0],B=V[1],C=V[2],D=V[3],E=V[4],F=V[5],G=V[6],H=V[7];for(let j=0;j<64;j++){const A12=rotl(A,12);const SS1=rotl((rotl(A,12)+E+SM3_TJ[j])>>>0,7);const SS2=(SS1^A12)>>>0;const TT1=j<16?((A^B^C)+D+SS2+W1[j])>>>0:((A&B|A&C|B&C)+D+SS2+W[j])>>>0;const TT2=j<16?((E^F^G)+H+SS1+W[j])>>>0:((E&F|~E&G)+H+SS1+W[j])>>>0;D=C;C=rotl(B,9);B=A;A=TT1;H=G;G=rotl(F,19);F=E;E=(TT2^rotl(TT1,9)^rotl(TT2,17))>>>0;}V[0]^=A;V[1]^=B;V[2]^=C;V[3]^=D;V[4]^=E;V[5]^=F;V[6]^=G;V[7]^=H;}
function sm3(input){const bytes=typeof input==="string"?new TextEncoder().encode(input):input;const len=bytes.length;const bitLen=len*8;const padLen=(((len+8)>>6)+1)<<4;const buf=new Uint8Array(padLen*4);buf.set(bytes);buf[len]=128;const hi=Math.floor(bitLen/0x100000000),lo=bitLen>>>0;buf[padLen*4-4]=(hi>>>24)&255;buf[padLen*4-3]=(hi>>>16)&255;buf[padLen*4-2]=(hi>>>8)&255;buf[padLen*4-1]=hi&255;buf[padLen*4-8]=(lo>>>24)&255;buf[padLen*4-7]=(lo>>>16)&255;buf[padLen*4-6]=(lo>>>8)&255;buf[padLen*4-5]=lo&255;const V=new Uint32Array(SM3_IV);for(let i=0;i<padLen*4;i+=64)sm3Compress(V,buf.subarray(i,i+64));return Array.from(new Uint8Array(V.buffer),b=>b.toString(16).padStart(2,"0")).join("");}

// RC4
function rc4Encrypt(key,plaintext){const S=new Uint8Array(256);for(let i=0;i<256;i++)S[i]=i;let j=0;for(let i=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;[S[i],S[j]]=[S[j],S[i]];}const out=new Uint8Array(plaintext.length);let i=0;j=0;for(let k=0;k<plaintext.length;k++){i=(i+1)&255;j=(j+S[i])&255;[S[i],S[j]]=[S[j],S[i]];out[k]=plaintext.charCodeAt(k)^S[(S[i]+S[j])&255];}return out;}
function toCharStr(bytes){return Array.from(bytes,b=>String.fromCharCode(b)).join("");}
function toCharArray(s){const arr=[];for(let i=0;i<s.length;i++)arr.push(s.charCodeAt(i));return arr;}
function generateRandomBytes(length){const result=[];for(let i=0;i<length;i++){const rd=Math.floor(Math.random()*10000);result.push((rd&255&170)|1);result.push((rd&255&85)|2);result.push(((rd>>8)&170)|5);result.push(((rd>>8)&85)|40);}return toCharStr(new Uint8Array(result));}

// a-bogus tables
const BIG_ARRAY=[121,243,55,234,103,36,47,228,30,231,106,6,115,95,78,101,250,207,198,50,139,227,220,105,97,143,34,28,194,215,18,100,159,160,43,8,169,217,180,120,247,45,90,11,27,197,46,3,84,72,5,68,62,56,221,75,144,79,73,161,178,81,64,187,134,117,186,118,16,241,130,71,89,147,122,129,65,40,88,150,110,219,199,255,181,254,48,4,195,248,208,32,116,167,69,201,17,124,125,104,96,83,80,127,236,108,154,126,204,15,20,135,112,158,13,1,188,164,210,237,222,98,212,77,253,42,170,202,26,22,29,182,251,10,173,152,58,138,54,141,185,33,157,31,252,132,233,235,102,196,191,223,240,148,39,123,92,82,128,109,57,24,38,113,209,245,2,119,153,229,189,214,230,174,232,63,52,205,86,140,66,175,111,171,246,133,238,193,99,60,74,91,225,51,76,37,145,211,166,151,213,206,0,200,244,176,218,44,184,172,49,216,93,168,53,21,183,41,67,85,224,155,226,242,87,177,146,70,190,12,162,19,137,114,25,165,163,192,23,59,9,94,179,107,35,7,142,131,239,203,149,136,61,249,14,156];
const ALPHABET_0="Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe";
const ALPHABET_1="ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe";
const SORT_INDEX=[18,20,52,26,30,34,58,38,40,53,42,21,27,54,55,31,35,57,39,41,43,22,28,32,60,36,23,29,33,37,44,45,59,46,47,48,49,50,24,25,65,66,70,71];
const SORT_INDEX_2=[18,20,26,30,34,38,40,42,21,27,31,35,39,41,43,22,28,32,36,23,29,33,37,44,45,46,47,48,49,50,24,25,52,53,54,55,57,58,59,60,65,66,70,71];
const DEFAULT_UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function sm3ToArray(input){return input.match(/.{2}/g).map(b=>parseInt(b,16));}
function transformBytes(valuesList){const arr=BIG_ARRAY.slice();const result=[];let indexB=arr[1],initialValue=0,valueE=0;const arrayLen=arr.length;for(let index=0;index<valuesList.length;index++){let sumInitial;if(index===0){initialValue=arr[indexB];sumInitial=indexB+initialValue;arr[1]=initialValue;arr[indexB]=indexB;}else{sumInitial=initialValue+valueE;}const sumInitialIdx=sumInitial%arrayLen;const valueF=arr[sumInitialIdx];result.push(valuesList[index]^valueF);const nextIdx=(index+2)%arrayLen;valueE=arr[nextIdx];const newSumInitialIdx=(indexB+valueE)%arrayLen;initialValue=arr[newSumInitialIdx];[arr[newSumInitialIdx],arr[nextIdx]]=[arr[nextIdx],arr[newSumInitialIdx]];indexB=newSumInitialIdx;}return result;}
function base64Encode(bytes,selectedAlphabet){const alphabet=selectedAlphabet===0?ALPHABET_0:ALPHABET_1;let output="";for(let i=0;i<bytes.length;i+=3){const b1=bytes[i],b2=bytes[i+1]||0,b3=bytes[i+2]||0;const combined=(b1<<16)|(b2<<8)|b3;output+=alphabet[(combined>>18)&63];output+=alphabet[(combined>>12)&63];output+=i+1<bytes.length?alphabet[(combined>>6)&63]:"";output+=i+2<bytes.length?alphabet[combined&63]:"";}while(output.length%4!==0)output+="=";return output;}
function abogusEncode(values,selectedAlphabet){const alphabet=selectedAlphabet===0?ALPHABET_0:ALPHABET_1;let out="";for(let i=0;i<values.length;i+=3){const v1=values[i],v2=values[i+1]||0,v3=values[i+2]||0;const n=(v1<<16)|(v2<<8)|v3;out+=alphabet[(n&0xfc0000)>>18];out+=alphabet[(n&0x03f000)>>12];out+=i+1<values.length?alphabet[(n&0x0fc0)>>6]:"";out+=i+2<values.length?alphabet[n&0x3f]:"";}while(out.length%4!==0)out+="=";return out;}
function generateFingerprint(){const rand=(min,max)=>Math.floor(Math.random()*(max-min+1))+min;return `${rand(1024,1920)}|${rand(768,1080)}|${rand(1024,1920)+rand(24,32)}|${rand(768,1080)+rand(75,90)}|0|${[0,30][rand(0,1)]}|0|0|${rand(1024,1920)}|${rand(768,1080)}|${rand(1280,1920)}|${rand(800,1080)}|${rand(1024,1920)}|${rand(768,1080)}|24|24|Win32`;}

function generateABogus(params,body="",userAgent=DEFAULT_UA){
  const abDir={8:3,18:44,66:0,69:0,70:0,71:0};
  const startEncryption=Date.now();
  const paramsHash1=sm3(params+"cus");
  const array1=sm3ToArray(paramsHash1);
  const bodyHash1=sm3((body||"")+"cus");
  const array2=sm3ToArray(bodyHash1);
  const rc4Ua=rc4Encrypt([1,14],userAgent);
  const uaB64=base64Encode(rc4Ua,1);
  const array3=sm3ToArray(uaB64);
  const endEncryption=Date.now();
  abDir[20]=(startEncryption>>24)&255;abDir[21]=(startEncryption>>16)&255;abDir[22]=(startEncryption>>8)&255;abDir[23]=startEncryption&255;abDir[24]=Math.floor(startEncryption/0x100000000);abDir[25]=Math.floor(startEncryption/0x10000000000);
  const options=[0,1,14];abDir[26]=(options[0]>>24)&255;abDir[27]=(options[0]>>16)&255;abDir[28]=(options[0]>>8)&255;abDir[29]=options[0]&255;abDir[30]=Math.floor(options[1]/256)&255;abDir[31]=options[1]%256;abDir[32]=(options[1]>>24)&255;abDir[33]=(options[1]>>16)&255;abDir[34]=(options[2]>>24)&255;abDir[35]=(options[2]>>16)&255;abDir[36]=(options[2]>>8)&255;abDir[37]=options[2]&255;
  abDir[38]=array1[21];abDir[39]=array1[22];abDir[40]=array2[21];abDir[41]=array2[22];abDir[42]=array3[23];abDir[43]=array3[24];
  abDir[44]=(endEncryption>>24)&255;abDir[45]=(endEncryption>>16)&255;abDir[46]=(endEncryption>>8)&255;abDir[47]=endEncryption&255;abDir[48]=abDir[8];abDir[49]=Math.floor(endEncryption/0x100000000);abDir[50]=Math.floor(endEncryption/0x10000000000);
  abDir[51]=0;abDir[52]=0;abDir[53]=0;abDir[54]=0;abDir[55]=0;
  abDir[56]=6383;abDir[57]=6383&255;abDir[58]=(6383>>8)&255;abDir[59]=(6383>>16)&255;abDir[60]=(6383>>24)&255;
  const fp=generateFingerprint();abDir[64]=fp.length;abDir[65]=fp.length;
  const sortedValues=SORT_INDEX.map(i=>abDir[i]||0);
  const fpArray=toCharArray(fp);
  let abXor=0;SORT_INDEX_2.forEach((key,idx)=>{const val=abDir[key]||0;abXor=idx===0?val:abXor^val;});
  const allValues=[...sortedValues,...fpArray,abXor];
  const transformed=transformBytes(allValues);
  const randomPrefix=generateRandomBytes(3).split("").map(c=>c.charCodeAt(0));
  const finalValues=[...randomPrefix,...transformed];
  return abogusEncode(finalValues,0);
}

// Utils
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Content-Type":"application/json; charset=utf-8"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:CORS});}
function detectPlatform(text){const u=text.toLowerCase();if(u.includes("v.douyin.com")||u.includes("iesdouyin.com")||u.includes("douyin.com"))return"douyin";if(u.includes("zjcdn.com")||u.includes("byteicdn.com"))return"douyin";if(u.includes("xiaohongshu.com")||u.includes("xhslink.com"))return"xiaohongshu";if(u.includes("tiktok.com")||u.includes("vm.tiktok"))return"tiktok";if(u.includes("threads.com")||u.includes("threads.net"))return"threads";if(u.includes("youtube.com")||u.includes("youtu.be"))return"youtube";return"unknown";}
function extractUrl(raw){const m=raw.match(/https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/);return m?m[0].replace(/[,，。、)\]}>]+$/,""):raw.trim();}
function stripWatermark(url){return url.replace(/watermark=1/g,"watermark=0").replace(/\u002F/g,"/").replace(/\\\//g,"/");}

// Douyin
const UA_DY="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
async function parseDouyin(rawText){
  const url=extractUrl(rawText);
  if(/zjcdn\.com|byteicdn\.com|\.mp4\?|mime_type=video/i.test(url)){
    return {success:true,url:url,title:"\u6296\u97f3\u5f71\u7247 (\u76f4\u9023\u7db2\u5740)",thumbnail:"",duration:0,platform:"douyin",uploader:""};
  }
  const UA_M="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  try{
    // 用 mobile UA 跟隨重定向（最多 5 次）
    let finalUrl=url;
    for(let i=0;i<5;i++){
      const r2=await fetch(finalUrl,{headers:{"User-Agent":UA_M,"Accept":"text/html","Referer":"https://www.google.com/"},redirect:"follow"});
      const loc=r2.url;
      if(!loc||loc===finalUrl||i===4)break;
      finalUrl=loc;
    }
    // 從 URL 提取視頻 ID
    let awemeId=null;
    const idMatch=finalUrl.match(/\/video\/(\d{15,21})/);
    if(idMatch){awemeId=idMatch[1];}
    if(!awemeId){const mu=finalUrl.match(/modal_id[=:](\d{15,21})/);if(mu)awemeId=mu[1];}
    if(!awemeId){const iu=finalUrl.match(/item\/(\d{15,21})/);if(iu)awemeId=iu[1];}
    if(!awemeId)return{success:false,platform:"douyin",error:"\u627e\u4e0d\u5230\u5f71\u7247ID\uff0c\u8bf7\u8d34\u6296\u97f3\u201c\u5206\u4eab\u2192\u590d\u5236\u94fe\u63a5\u201d\u90a3\u6bb5\u6587\u5b57",error_hint:"URL: "+finalUrl};

    // 用 mobile 頁面拿影片
    const mp=`https://m.douyin.com/share/video/${awemeId}/`;
    const mr=await fetch(mp,{headers:{"User-Agent":UA_M,"Accept":"text/html","Referer":"https://www.douyin.com/"}});
    const html=await mr.text();

    // 從 _ROUTER_DATA 或 window.__INITIAL_STATE__ 提取影片
    let videoUri=null;
    let title="";
    let cover="";
    const rd=html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\});\s*<\/script>/s);
    if(rd){
      try{
        const obj=JSON.parse(rd[1]);
        const video=obj?.videoInfo?.video||obj?.aweme?.detail?.video||{};
        videoUri=video.uri||video.videoId||"";
        title=video.desc||"";
        cover=video.cover||video.poster||"";
      }catch(e){}
    }
    if(!videoUri){
      const pu=html.match(/"play_addr"\s*:\s*\{[^}]*?"uri"\s*:\s*"([^"]+)"/s);
      if(pu)videoUri=pu[1];
    }
    if(!videoUri){
      const vurl=html.match(/(v[0-9]+-[a-z]+-[a-z0-9]+\.douyinvod\.com\/[^"'\s]+)/);
      if(vurl)videoUri=vurl[1];
    }
    if(!videoUri)return{success:false,platform:"douyin",error:"\u7121\u6cd5\u83b7\u53d6\u5f71\u7247\u7f51\u5740\uff0c\u8bf7\u5c1d\u8bd5\u66f4\u591a\u7b56\u7565",error_hint:awemeId};

    // 構造無水印播放 URL
    let playUrl="";
    if(videoUri.startsWith("http")){
      playUrl=videoUri;
    } else {
      const playRes=await fetch(`https://m.douyin.com/aweme/v1/play/?video_id=${videoUri}&vr=1&aid=6383&platform=mobile&os=ios&uctest=1&aweme_id=${awemeId}`,{headers:{"User-Agent":UA_M,"Referer":mp}});
      const playText=await playRes.text();
      const pUrl=playText.match(/https?:\/\/[^\s"']+/);
      playUrl=pUrl?pUrl[0].split("&line=")[0]:"";
    }
    if(!playUrl)return{success:false,platform:"douyin",error:"\u83b7\u53d6\u64ad\u653e\u5730\u5740\u5931\u8d25",error_hint:videoUri};
    return{success:true,url:playUrl.replace(/playwm/,"play"),title:title||`\u6296\u97f3\u5f71\u7247 ${awemeId}`,thumbnail:cover,duration:0,platform:"douyin",uploader:""};
  }catch(e){return{success:false,platform:"douyin",error:"\u89e3\u6790\u5931\u8d25",error_hint:e.message};}
}

// Xiaohongshu
async function parseXiaohongshu(rawText){
  const url=extractUrl(rawText);
  // 處理 xhslink 短網址 - 跟隨重定向
  let finalUrl=url;
  if(/xhslink\.com/.test(url)){
    for(let i=0;i<5;i++){
      const r=await fetch(finalUrl,{headers:{"User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"},redirect:"follow"});
      finalUrl=r.url;
      if(!finalUrl||finalUrl===url||i===4)break;
    }
    if(!/xiaohongshu\.com/.test(finalUrl))finalUrl=url;
  }
  const ua="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  try{
    const r=await fetch(url,{headers:{"User-Agent":ua},redirect:"follow"});
    const html=await r.text();
    const m=html.match(/window\\.__INITIAL_STATE__\\s*=\\s*(\\{.+?\\});\\s*</);
    if(!m)return{success:false,platform:"xiaohongshu",error:"\u627e\u4e0d\u5230\u9875\u9762\u6570\u636e,\u8bf7\u8bd5\u8bf7\u8d34\u5b57\u7b26\u5185\u5bb9"};
    const text=m[1].replace(/\\\u002F/g,"/").replace(/\\\\\\//g,"/").replace(/\\\\"/g,'"');
    let videoUrl=(text.match(/"(?:masterUrl|videoUrl)":"(https?:\/\/[^"]+\\.mp4[^"]*)"/)||[])[1]||"";
    if(!videoUrl)videoUrl=(html.match(/(https?:\/\/sns-video[^"\'\\s]+\\.mp4)/)||[])[1]||"";
    if(!videoUrl)return{success:false,platform:"xiaohongshu",error:"\u65e0\u6cd5\u83b7\u53d6\u5f71\u7247\u94fe\u63a5",error_hint:"\u5c0f\u7ea2\u4e66\u672a\u767b\u5f55\u8bf7\u6c42\u53d7\u9650"};
    const title=(text.match(/"(?:title|desc)":"([^"]+)"/)||[])[1]||"\小\红\书\影\片";
    const cover=(text.match(/"imageDefault":"([^"]+)"/)||[])[1]||"";
    const author=(text.match(/"nickname":"([^"]+)"/)||[])[1]||"";
    return{success:true,url:videoUrl,title,thumbnail:cover,duration:0,platform:"xiaohongshu",uploader:author};
  }catch(e){return{success:false,platform:"xiaohongshu",error:"\u89e3\u6790\u5931\u8d25",error_hint:e.message};}
}

// TikTok

async function parseThreads(rawText){
  const url=extractUrl(rawText);
  const UA_M="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  try{
    let finalUrl=url;
    for(let i=0;i<5;i++){
      const r=await fetch(finalUrl,{headers:{"User-Agent":UA_M},redirect:"follow"});
      const loc=r.url;
      if(!loc||loc===finalUrl||i===4)break;
      finalUrl=loc;
    }
    // 從 URL 提取 post ID
    const postId=finalUrl.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1];
    if(!postId)return{success:false,platform:"threads",error:"\u65e0\u6cd5\u63d0\u53d6Threads\u5bc4\u5e38ID",error_hint:finalUrl};

    // Threads GraphQL API
    const apiUrl=`https://www.threads.net/api/graphql?doc_hash=6232757736925962&locale=zh_TW`;
    const body=`av=00000000000000000000000000000000&__user=00000000000000000000000000000000&__a=1&__req=1&__hs=19792.HB%3Aplatform_headless_pkg.2.1..0.0&__ccg=GOOD&__hosp=00000000000000000000000000000000&__cp=__cp&__crr=__crr&__d=__d&__comerr_url=https%3A%2F%2Fwww.threads.net%2F&__jssesw=1&lsd=__lsd&jazoest=__jazoest&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=ThreadsGraphQLDocument&variables=${encodeURIComponent(JSON.stringify({postID:postId,uceDefault:false}))}`;
    const api=await fetch(apiUrl,{method:"POST",headers:{"User-Agent":UA_M,"Content-Type":"application/x-www-form-urlencoded","X-FB-LSD":"__lsd","X-IG-App-ID":"238260118674367","Referer":finalUrl},body:body});
    const data=await api.json();
    const videoUrl=data?.data?.containing_thread?.thread?.video_url||data?.data?.xdt_sharepyv2_thread?.video_url||"";
    const caption=data?.data?.containing_thread?.thread?.caption||data?.data?.xdt_sharepyv2_thread?.caption||"";
    const cover=data?.data?.containing_thread?.thread?.cover_url||data?.data?.xdt_sharepyv2_thread?.cover_media?.image?.uri||"";
    if(!videoUrl)return{success:false,platform:"threads",error:"\u65e0\u6cd5\u83b7\u53d6Threads\u5f71\u7247\u7f51\u5740\uff0c\u8bf7\u68c0\u67e5\u662f\u5426\u4e3a\u516c\u5f00\u89c6\u9891",error_hint:postId};
    return{success:true,url:videoUrl,title:caption||"Threads \u5f71\u7247",thumbnail:cover,duration:0,platform:"threads",uploader:""};
  }catch(e){return{success:false,platform:"threads",error:"\u89e3\u6790\u5931\u8d25",error_hint:e.message};}
}

async function parseTikTok(rawText){
  const url=extractUrl(rawText);
  const UA_M="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  try{
    let finalUrl=url;
    for(let i=0;i<5;i++){
      const r=await fetch(finalUrl,{headers:{"User-Agent":UA_M},redirect:"follow"});
      const loc=r.url;
      if(!loc||loc===finalUrl||i===4)break;
      finalUrl=loc;
    }
    let videoId=null;
    const vu=finalUrl.match(/\/video\/(\d+)/);
    if(vu)videoId=vu[1];
    if(!videoId)return{success:false,platform:"tiktok",error:"\u65e0\u6cd5\u4eceURL\u63d0\u53d6\u89c6\u9891ID",error_hint:finalUrl};

    const html=(await (await fetch(finalUrl,{headers:{"User-Agent":UA_M}})).text());
    const m=html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/);
    if(!m)return{success:false,platform:"tiktok",error:"\u627e\u4e0d\u5230TikTok\u9875\u9762\u6570\u636e"};
    const data=JSON.parse(m[1].replace(/undefined/g,"null"));
    const item=data?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.itemInfo?.itemStruct;
    if(!item)return{success:false,platform:"tiktok",error:"\u9875\u9762\u7ed3\u6784\u53d8\u5316"};
    const playUrl=item.video?.playAddr?.[0]||item.video?.downloadAddr?.[0]||"";
    return{success:true,url:playUrl,title:item.desc||"TikTok \u5f71\u7247",thumbnail:item.video?.cover?.[0]||"",duration:item.video?.duration||0,platform:"tiktok",uploader:item.author?.nickname||""};
  }catch(e){return{success:false,platform:"tiktok",error:"\u89e3\u6790\u5931\u8d25",error_hint:e.message};}
}

// Main router
async function handleVideoInfo(request){
  if(request.method!=="POST")return json({success:false,error:"\u8bf7\u4f7f\u7528POST"},405);
  let body;try{body=await request.json();}catch{return json({success:false,error:"JSON\u683c\u5f0f\u9519\u8bef"},400);}
  const raw=body.url?.trim();if(!raw)return json({success:false,error:"\u8bf7\u63d0\u4f9b\u7f51\u5740"},400);
  const platform=detectPlatform(raw);
  let result;
  switch(platform){
    case"douyin":result=await parseDouyin(raw);break;
    case"xiaohongshu":result=await parseXiaohongshu(raw);break;
    case"tiktok":result=await parseTikTok(raw);break;
    case"threads":result=await parseThreads(raw);break;
    case"youtube":result={success:false,platform:"youtube",error:"YouTube不支援直接下載,請用yt-dlp"};break;
    default:result={success:false,platform:"unknown",error:"不支援的平台",error_hint:"目前支援：抖音、小紅書、TikTok、Threads、YouTube"};
  }
  return json(result,result.success?200:400);
}

// Proxy download
async function handleDlStream(request){
  const target=new URL(request.url).searchParams.get("url");
  const referer=new URL(request.url).searchParams.get("referer")||"https://www.douyin.com/";
  const filename=new URL(request.url).searchParams.get("filename")||"video.mp4";
  if(!target)return new Response("missing url",{status:400});
  try{
    const upstream=await fetch(target,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36","Referer":referer}});
    if(!upstream.ok||!upstream.body)return new Response("upstream "+upstream.status,{status:502});
    const headers=new Headers();
    headers.set("Content-Type",upstream.headers.get("Content-Type")||"video/mp4");
    headers.set("Access-Control-Allow-Origin","*");
    headers.set("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    const cl=upstream.headers.get("Content-Length");if(cl)headers.set("Content-Length",cl);
    return new Response(upstream.body,{status:200,headers});
  }catch(e){return new Response("proxy error: "+e.message,{status:500});}
}

// Entry
function handle(request){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  const path=new URL(request.url).pathname;
  if(path==="/health")return json({status:"ok",service:"longyuan-video-api",timestamp:new Date().toISOString(),message:"\u5de5\u4f5c\u5668\u5df2\u555f\u7528\uff01\u89e3\u6790\u5b8c\u6210\u3002",platforms:["douyin","xiaohongshu","tiktok","youtube"]});
  if(path==="/"||path==="/index.html")return new Response(FRONTEND_HTML,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Access-Control-Allow-Origin":"*"}});
  if(path==="/api/info")return json({name:"longyuan-video-api",version:"1.0.0",platforms:{douyin:"\u5df2\u4e0a\u7ebf",xiaohongshu:"\u5df2\u4e0a\u7ebf",tiktok:"\u5df2\u4e0a\u7ebf",youtube:"\u4e0d\u652f\u6301\u4e0b\u8f7d"},usage:"POST /api/video-info body: { url: <\u5f71\u7247\u7f51\u5740> }}"});
  if(path==="/api/video-info")return handleVideoInfo(request);
  if(path==="/api/dl-stream")return handleDlStream(request);
  return json({error:"Not Found",path},404);
}

addEventListener("fetch",e=>e.respondWith(handle(e.request)));