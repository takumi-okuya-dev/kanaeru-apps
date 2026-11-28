// 読書記録の欄の長さと数の上限（specs/reading/001-bookshelf-import/data-model.md・research.md）。
// DB の CHECK（apps/api/src/modules/reading/schema.ts）と同じ値。食い違いは schema.test.ts が見張る。
// 取りこみの件数・束・ファイルの大きさは、窓口と画面だけが使う（DB には CHECK を書かない）。
// 字はコードポイントで数える（絵文字も1字。DB の char_length と同じ）。

/** 本の欄の上限（字）。 */
export const READING_BOOK_LIMITS = {
  /** 書名（1字以上） */
  title: 300,
  /** 著者 */
  author: 300,
  /** 分かりたいこと（1字以上。空なら持たない） */
  want: 500,
} as const;

/** マーカーの欄の上限（字）。 */
export const READING_MARKER_LIMITS = {
  /** 章の名前（1字以上） */
  chapter: 200,
  /** マーカーの文（0字はコメントだけのもの） */
  text: 4_000,
  /** コメント（1字以上。空なら持たない） */
  comment: 4_000,
} as const;

/** 取りこみの上限（PRD 4.2・research R7）。 */
export const READING_IMPORT_LIMITS = {
  /** 1回の取りこみのマーカーの数 */
  markersPerImport: 5_000,
  /** 1つの束のマーカーの数 */
  markersPerBatch: 500,
  /** 1つの束の本文の大きさ（バイト。API の本文の上限 100KB に余白を取る） */
  batchBytes: 90 * 1024,
  /** 端末で読むファイルの大きさ（バイト） */
  fileBytes: 300 * 1024 * 1024,
} as const;

/**
 * 字の数（コードポイントで数える。絵文字も1字。DB の char_length と同じ）。
 * @param value 文字
 * @returns 字の数
 */
export function countChars(value: string): number {
  return [...value].length;
}
