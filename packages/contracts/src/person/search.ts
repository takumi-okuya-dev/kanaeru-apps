// 人物メモの検索のそろえ方と、当たった位置（specs/person/001-notes/research.md R6・AD-31）。zod を読まない。
// そろえ方は「NFKC → カタカナをひらがなに → 小文字」。NFKC は字の数を変える（「ｶﾞ」が「ガ」になる）ので、もとの文を
// 書記素（見た目の1字。結合文字や半角の濁点を含む）ごとにそろえてつなぎ、そろえた文の位置からもとの文の位置へ戻す。
// API の保存（search_text）・探す言葉・当たった位置は、どれもこのそろえ方を使う（画面はもう一度探さない）。
// そろえ方を直す PR は、SEARCH_VERSION を上げ、作り直しの DB の変更を同じ PR に入れる。

/** そろえ方の版（search_version の列に持つ）。 */
export const SEARCH_VERSION = 1;

/** 書記素に分ける道具（ことばに頼らない分け方なので、ことばは決めない）。 */
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** カタカナ（ァ〜ヶ）の始めと終わりと、ひらがなとの差。 */
const KATAKANA_FIRST = 0x30a1;
const KATAKANA_LAST = 0x30f6;
const KANA_OFFSET = 0x60;

/**
 * カタカナをひらがなにする（ァ〜ヶ と、くり返しの ヽヾ。長音の ー はそのまま）。
 * @param value 文
 * @returns ひらがなにした文
 */
function toHiragana(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= KATAKANA_FIRST && code <= KATAKANA_LAST) || code === 0x30fd || code === 0x30fe) {
      result += String.fromCodePoint(code - KANA_OFFSET);
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * 1つの書記素をそろえる。
 * @param grapheme 書記素
 * @returns そろえた文
 */
function normalizeGrapheme(grapheme: string): string {
  return toHiragana(grapheme.normalize("NFKC")).toLowerCase();
}

/**
 * 検索のために文をそろえる（NFKC → カタカナをひらがなに → 小文字。書記素ごとにそろえてつなぐ）。
 * @param value 文
 * @returns そろえた文
 */
export function normalizeForSearch(value: string): string {
  let result = "";
  for (const { segment } of segmenter.segment(value)) result += normalizeGrapheme(segment);
  return result;
}

/**
 * 会った場の名前をそろえる（前後の空白を除き、間の空白の続きを1つにしてから normalizeForSearch。name_key に持つ）。
 * @param name 会った場の名前
 * @returns そろえた名前
 */
export function normalizeMeetingName(name: string): string {
  return normalizeForSearch(name.trim().replace(/\s+/gu, " "));
}

/**
 * タグをそろえる（会った場の名前と同じそろえ方。「AI」「ai」「ＡＩ」は同じタグ。tag_keys に持つ）。
 * @param tag タグ
 * @returns そろえたタグ
 */
export function normalizeTag(tag: string): string {
  return normalizeMeetingName(tag);
}

/** もとの文の中の当たった位置（UTF-16 の位置。もとの文の slice(start, end) が当たった所）。 */
export type SearchMatchRange = {
  /** 始め（含む） */
  start: number;
  /** 終わり（含まない） */
  end: number;
};

/**
 * もとの文の中で、探す言葉に当たる所を返す（そろえた文で探し、もとの文の書記素の境に戻す。重ならないように前から順に）。
 * @param original もとの文
 * @param query 探す言葉（そろえる前のもの）
 * @returns 当たった位置の並び（なければ空）
 */
export function findMatches(original: string, query: string): SearchMatchRange[] {
  const needle = normalizeForSearch(query);
  if (needle.length === 0) return [];
  // そろえた文の1文字ごとに、もとの文のどの書記素から来たか（始めと終わり）を持つ
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (const { segment, index } of segmenter.segment(original)) {
    const part = normalizeGrapheme(segment);
    normalized += part;
    for (let i = 0; i < part.length; i += 1) {
      starts.push(index);
      ends.push(index + segment.length);
    }
  }
  const matches: SearchMatchRange[] = [];
  let from = 0;
  for (;;) {
    const found = normalized.indexOf(needle, from);
    if (found < 0) break;
    const last = found + needle.length - 1;
    matches.push({ start: starts[found] ?? 0, end: ends[last] ?? original.length });
    from = found + needle.length;
  }
  return matches;
}

/**
 * LIKE の記号（% と _ と \）を逃がす（ESCAPE '\' と一緒に使う。記号を文字としてだけ当てる）。
 * @param value 探す言葉（そろえたもの）
 * @returns 逃がした言葉
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (char) => `\\${char}`);
}
