// 探すときのそろえ方と、当たった所（specs/reading/002-kindle-search/research.md R5）。zod を読まない。
// そろえ方は NFKC → カタカナをひらがなに → 小文字。当たった所は、もとの文の中の位置で返す（NFKC は字の数を変えるので、
// そろえた文の位置でもとの文を切らない）。人物メモと同じ考え方を、読書記録の約束に置く（領域どうしで共通にしない。AD-18）。

/**
 * 1字をそろえる（NFKC → カタカナをひらがなに → 小文字）。
 * @param char 1字（コードポイント）
 * @returns そろえた字（字の数が変わることがある）
 */
function normalizeChar(char: string): string {
  return char
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/gu, (kana) => String.fromCodePoint((kana.codePointAt(0) as number) - 0x60))
    .toLowerCase();
}

/**
 * 探すために文をそろえる。
 * @param value 文
 * @returns そろえた文
 */
export function normalizeForSearch(value: string): string {
  return [...value].map(normalizeChar).join("");
}

/** 当たった所（もとの文の中の位置。UTF-16 の単位）。 */
export type SearchMatch = {
  /** 始まり */
  start: number;
  /** 終わり（含まない） */
  end: number;
};

/**
 * もとの文の中で、言葉に当たった所を探す（そろえて比べ、もとの文の位置で返す）。
 * @param original もとの文
 * @param query 探す言葉（空なら当たらない）
 * @returns 当たった所（重ならないもの。前から順）
 */
export function findMatches(original: string, query: string): SearchMatch[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === "") return [];
  // そろえた字ごとに、もとの文のどの位置から来たかを持つ
  let normalized = "";
  const origin: number[] = [];
  let offset = 0;
  for (const char of original) {
    const piece = normalizeChar(char);
    for (let i = 0; i < piece.length; i += 1) origin.push(offset);
    normalized += piece;
    offset += char.length;
  }
  origin.push(offset);
  const matches: SearchMatch[] = [];
  let from = 0;
  while (from <= normalized.length - needle.length) {
    const at = normalized.indexOf(needle, from);
    if (at === -1) break;
    const start = origin[at] as number;
    const endIndex = at + needle.length;
    // 終わりは、そろえた字の続きの終わりにあるもとの字の終わり
    let end = origin[endIndex] as number;
    if (end <= start) end = start + 1;
    matches.push({ start, end });
    from = endIndex;
  }
  return matches;
}

/**
 * LIKE の印（%・_・\）を逃がす（ESCAPE '\' と一緒に使う）。
 * @param value 文
 * @returns 逃がした文
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (char) => `\\${char}`);
}
