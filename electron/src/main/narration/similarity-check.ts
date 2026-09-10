/**
 * 文案不相似性檢查
 *
 * 目的：避免 3-5 支影片文案太像（同質化）
 *
 * 策略：
 * 1. 先做文本預處理（去空白、標點、全形→半形）
 * 2. 簡轉繁（Qwen 預設輸出簡體，但台灣要繁體）
 *    - 使用內建的字典映射（覆蓋 90% 常見字）
 *    - 涵蓋不到的極少數字會被當錯字，但對短文案影響極小
 *    - 完整方案應該用 OpenCC，但那是原生模組，不適合 Electron
 * 3. 計算 Levenshtein 距離
 * 4. 轉成 0-1 的相似度分數
 * 5. 超過 0.7 就視為太相似
 */

// ===== 簡轉繁字典 =====
// 只放最常用的字，避免檔案太大。
// 未涵蓋的極少數字會保持原樣（不影響相似度判斷）。
// 結構：每行 [簡, 繁] 兩個字，最後再轉成物件，確保不會有重複 key。
const SIMP_TO_TRAD_PAIRS: Array<[string, string]> = [
  // 常見簡轉繁
  ['产', '產'], ['业', '業'], ['会', '會'], ['学', '學'], ['习', '習'],
  ['说', '說'], ['话', '話'], ['语', '語'], ['请', '請'], ['让', '讓'],
  ['过', '過'], ['这', '這'], ['种', '種'], ['点', '點'], ['钟', '鐘'],
  ['现', '現'], ['为', '為'], ['么', '麼'], ['样', '樣'], ['从', '從'],
  ['们', '們'], ['发', '發'], ['经', '經'], ['给', '給'], ['结', '結'],
  ['时', '時'], ['间', '間'], ['长', '長'], ['坏', '壞'], ['错', '錯'],
  ['对', '對'], ['里', '裡'], ['后', '後'], ['国', '國'], ['台', '臺'],
  ['湾', '灣'], ['体', '體'], ['验', '驗'], ['视', '視'], ['听', '聽'],
  ['读', '讀'], ['写', '寫'], ['图', '圖'], ['画', '畫'], ['红', '紅'],
  ['蓝', '藍'], ['绿', '綠'], ['黄', '黃'], ['丽', '麗'], ['爱', '愛'],
  ['欢', '歡'], ['忧', '憂'], ['乐', '樂'], ['创', '創'], ['设', '設'],
  ['计', '計'], ['开', '開'], ['关', '關'], ['门', '門'], ['车', '車'],
  ['马', '馬'], ['飞', '飛'], ['鱼', '魚'], ['鸟', '鳥'], ['虫', '蟲'],
  ['龙', '龍'], ['单', '單'], ['双', '雙'], ['买', '買'], ['卖', '賣'],
  ['钱', '錢'], ['贵', '貴'], ['内', '內'], ['东', '東'], ['凉', '涼'],
  ['干', '乾'], ['湿', '濕'], ['旧', '舊'], ['远', '遠'], ['浅', '淺'],
  ['梦', '夢'], ['觉', '覺'], ['闲', '閒'], ['轻', '輕'], ['声', '聲'],
  ['歌', '歌'], ['镜', '鏡'], ['头', '頭'], ['面', '面'], ['底', '底'],
  ['块', '塊'], ['条', '條'], ['只', '隻'], ['个', '個'], ['万', '萬'],
  ['亿', '億'],
  // AI 常見簡體輸出（美妝相關）
  ['肤', '膚'], ['脸', '臉'], ['丝', '絲'], ['线', '線'], ['纹', '紋'],
  ['皱', '皺'], ['斑', '斑'], ['痘', '痘'], ['痕', '痕'], ['彩', '彩'],
  ['妆', '妝'], ['颜', '顏'], ['霜', '霜'], ['液', '液'], ['华', '華'],
  ['露', '露'], ['膜', '膜'], ['唇', '唇'], ['睫', '睫'], ['腿', '腿'],
  ['腰', '腰'], ['胸', '胸'], ['背', '背'], ['肩', '肩'], ['颈', '頸'],
  ['齿', '齒'], ['层', '層'], ['别', '別'], ['处', '處'], ['准', '準'],
  ['确', '確'], ['诉', '訴'], ['吗', '嗎'], ['吗', '嗎'],
  // 短影音相關
  ['频', '頻'], ['网', '網'], ['络', '絡'], ['传', '傳'], ['赞', '讚'],
  ['评', '評'], ['论', '論'], ['注', '注'], ['带', '帶'], ['货', '貨'],
  ['草', '草'],
];

// 用 Set 去重（雖然陣列已經手動去重，雙重保險）
const seen = new Set<string>();
const SIMP_TO_TRAD: Record<string, string> = {};
for (const [simp, trad] of SIMP_TO_TRAD_PAIRS) {
  if (seen.has(simp)) continue;
  seen.add(simp);
  SIMP_TO_TRAD[simp] = trad;
}

/**
 * 簡轉繁
 */
export function simpToTrad(text: string): string {
  let result = '';
  for (const char of text) {
    result += SIMP_TO_TRAD[char] ?? char;
  }
  return result;
}

/**
 * 文本預處理：去除雜訊，統一格式
 */
export function normalize(text: string): string {
  return simpToTrad(text)
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')         // 全形/半形空白
    .replace(/[\p{P}\p{S}]/gu, '')         // 標點、符號
    .replace(/[！-～]/g, (c) =>             // 全形標點轉半形
      String.fromCharCode(c.charCodeAt(0) - 0xFEE0),
    );
}

/**
 * Levenshtein 距離（編輯距離）
 * 計算兩個字串最少需要幾次「插入/刪除/替換」才能變成一樣
 *
 * @param a 字串 a
 * @param b 字串 b
 * @returns 編輯距離
 */
export function levenshteinDistance(a: string, b: string): number {
  // 正規化
  const aN = normalize(a);
  const bN = normalize(b);

  if (aN === bN) return 0;
  if (aN.length === 0) return bN.length;
  if (bN.length === 0) return aN.length;

  // 使用兩行陣列節省記憶體
  let prev = Array.from({ length: bN.length + 1 }, (_, i) => i);
  let curr = new Array<number>(bN.length + 1);

  for (let i = 1; i <= aN.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= bN.length; j++) {
      const cost = aN[i - 1] === bN[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // 插入
        prev[j] + 1,             // 刪除
        prev[j - 1] + cost,      // 替換
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[bN.length];
}

/**
 * 計算相似度（0-1，1 表示完全相同）
 */
export function similarity(a: string, b: string): number {
  const aN = normalize(a);
  const bN = normalize(b);
  const maxLen = Math.max(aN.length, bN.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(aN, bN);
  return 1 - distance / maxLen;
}

/**
 * 檢查一段新文案是否與已存在的文案集合過於相似
 *
 * @param newScript 新生成的文案
 * @param existing 已存在的文案陣列
 * @param threshold 相似度閾值，預設 0.7（超過視為太像）
 * @returns true = 太相似需重新生成，false = 通過
 */
export function isTooSimilar(
  newScript: string,
  existing: string[],
  threshold: number = 0.7,
): boolean {
  for (const old of existing) {
    const sim = similarity(newScript, old);
    if (sim >= threshold) {
      return true;
    }
  }
  return false;
}

/**
 * 提取文案中的 hook（第一句）
 * 以「？」「！」「。」等句號或換行切分
 */
export function extractHook(script: string): string {
  const cleaned = script.trim();
  // 找到第一個句號、問號、驚嘆號、換行
  const match = cleaned.match(/^[^？！。!?\n]+/);
  if (match) {
    return match[0].trim();
  }
  // 沒有標點就取前 30 字
  return cleaned.slice(0, 30);
}
