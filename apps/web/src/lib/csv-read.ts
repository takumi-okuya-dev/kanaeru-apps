// CSV を画面の中で読む（サーバーに送らない。booking-001 research R5）。新しい依存を足さず、ここの小さな関数で行う。
// - 文字コード：UTF-8（BOM あり・なし）で読めなければ Shift_JIS（Excel で保存した掲載サイトの CSV のため）
// - 切り方：RFC 4180（" の囲み・"" で " 1つ・囲みの中の改行・CRLF と LF）
// - 1行目を見出しにする。見出しが空の列は「（n列目）」、同じ見出しが重なれば「（n列目）」を足して見分ける
// 業務を知らない技術の道具なので、画面の共通に置く（AD-18・AD-29。booking と match が使う。core-014）。列の意味は使う領域が持つ。

/** 読んだ CSV。 */
export type ParsedCsv = {
  /** 見出し（列ごと。空や重なりは見分けられる名前にしたもの） */
  headers: string[];
  /** 見出しのあとの行（ファイルの中の行の番号と、列ごとの値） */
  rows: { line: number; cells: string[] }[];
};

/**
 * ファイルの中身を文字にする（UTF-8 で読めなければ Shift_JIS）。
 * @param buffer ファイルの中身
 * @returns 文字（先頭の BOM は外す）
 */
export function decodeCsv(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("shift_jis").decode(buffer);
  }
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

/**
 * CSV の文字を、行と欄に切る（空の行は飛ばす）。
 * @param text CSV の文字
 * @returns 行ごとの、ファイルの中の行の番号と欄の並び
 */
function splitRecords(text: string): { line: number; cells: string[] }[] {
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  const pushRecord = () => {
    cells.push(cell);
    if (cells.some((value) => value !== "")) records.push({ line: startLine, cells });
    cells = [];
    cell = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "") quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else if (char === "\r" && text[index + 1] === "\n") {
      // CRLF は次の LF で区切る
    } else if (char === "\n" || char === "\r") {
      pushRecord();
      line += 1;
      startLine = line;
    } else cell += char;
  }
  if (cell !== "" || cells.length > 0) pushRecord();
  return records;
}

/**
 * CSV の文字を読む（1行目を見出しにする）。
 * @param text CSV の文字（decodeCsv の答え）
 * @returns 見出しと行（中身がなければ見出しも行も空）
 */
export function parseCsv(text: string): ParsedCsv {
  const [head, ...rest] = splitRecords(text);
  if (!head) return { headers: [], rows: [] };
  const seen = new Set<string>();
  const headers = head.cells.map((raw, index) => {
    const trimmed = raw.trim();
    const name = trimmed === "" || seen.has(trimmed) ? `${trimmed}（${index + 1}列目）` : trimmed;
    seen.add(name);
    return name;
  });
  return { headers, rows: rest };
}

/**
 * 貼った文字を、1行に1人の名前に切る（空の行も行の番号を残して返す。前後の空白は消す）。
 * @param text 貼った文字
 * @returns 行の番号と名前
 */
export function splitPastedNames(text: string): { line: number; name: string }[] {
  return text
    .split(/\r\n|\r|\n/u)
    .map((name, index) => ({ line: index + 1, name: name.trim() }))
    .filter(
      (row, index, all) => row.name !== "" || all.slice(index).some((rest) => rest.name !== ""),
    );
}
