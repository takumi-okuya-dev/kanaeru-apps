// CSV の道具（構成の決めごと AD-18：業務を知らず、状態を持たない技術の道具。core-004 R1）。
// Excel で開いても文字化けしないよう UTF-8 の BOM と CRLF にし、利用者が入れた値が式として動かないよう、
// = + - @ タブ CR で始まる欄の先頭に ' を足す（全角の ＝ ＋ － ＠ と、前の空白・改行のあとのものも同じに扱う）。業務の言葉やほかの包みを読まない（eslint.config.js で止める）。

/** BOM（Excel が UTF-8 と読むため）。 */
const BOM = "\uFEFF";

/** 行の区切り（Excel の既定）。 */
const CRLF = "\r\n";

/**
 * 表計算ソフトが式として読みうる先頭か。タブ・CR で始まるもののほか、全角の文字を半角にそろえ（NFKC）、
 * 前の空白・改行を除いたあとが = + - @ で始まるものも含める（日本語の表計算ソフトは全角の ＝ も式として読むことがあるため）。
 * @param value 欄の値
 * @returns 式として読みうるなら true
 */
function startsLikeFormula(value: string): boolean {
  return /^[\t\r]/.test(value) || /^[=+\-@]/.test(value.normalize("NFKC").trimStart());
}

/**
 * 1つの欄を CSV の形にする（式として読まれる先頭を打ち消し、要れば " で囲む）。
 * @param value 欄の値
 * @returns CSV の欄
 */
export function csvCell(value: string): string {
  const safe = startsLikeFormula(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * CSV を作る（BOM つき・CRLF・最後の行も CRLF で終える）。見出しも欄と同じ形にする。
 * @param header 見出しの行
 * @param rows 行（並びはそのまま。値は文字にしてから渡す）
 * @returns CSV の文字
 */
export function buildCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(","));
  return `${BOM}${lines.join(CRLF)}${CRLF}`;
}
