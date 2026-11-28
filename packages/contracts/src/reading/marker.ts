// 読書記録のマーカーの窓口の入出力の形（specs/reading/001-bookshelf-import/contracts/reading.md）。
// 取りこみは束ごとに1〜500件。鍵は API が作り直すので、入力に鍵は持たない（research R3）。本の形（Book）もここに置く（マーカーを含むため）。
import { z } from "zod";
import { BookSummary } from "./book.ts";
import { READING_IMPORT_LIMITS, READING_MARKER_LIMITS, countChars } from "./limits.ts";
import { READING_MARKER_SOURCES } from "./options.ts";

/** 章の名前（任意。空なら持たない）。 */
const Chapter = z
  .string()
  .trim()
  .refine((value) => countChars(value) <= READING_MARKER_LIMITS.chapter, {
    error: `章の名前は${READING_MARKER_LIMITS.chapter}字までにしてください。`,
  })
  .transform((value) => (value === "" ? null : value))
  .nullish();

/** コメント（任意。空なら持たない）。 */
const Comment = z
  .string()
  .trim()
  .refine((value) => countChars(value) <= READING_MARKER_LIMITS.comment, {
    error: `コメントは${READING_MARKER_LIMITS.comment}字までにしてください。`,
  })
  .transform((value) => (value === "" ? null : value))
  .nullish();

/** 取りこむ1件。 */
export const MarkerImportItem = z
  .strictObject({
    /** マーカーの文（空はコメントだけのもの） */
    text: z.string().refine((value) => countChars(value) <= READING_MARKER_LIMITS.text, {
      error: `マーカーの文は${READING_MARKER_LIMITS.text}字までです。`,
    }),
    /** コメント */
    comment: Comment,
    /** 章の名前 */
    chapter: Chapter,
    /** ページ */
    page: z.number().int().min(1).nullish(),
    /** 位置 */
    location: z.number().int().min(1).nullish(),
    /** 本の中の並びの番号 */
    position: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    /** あとで調べるの印 */
    question: z.boolean(),
  })
  .refine((item) => item.text.trim() !== "" || (item.comment ?? null) !== null, {
    error: "マーカーの文かコメントのどちらかが要ります。",
  });

/** 取りこむ1件の型。 */
export type MarkerImportItem = z.infer<typeof MarkerImportItem>;

/** 取りこみの1つの束。 */
export const MarkerImportInput = z.strictObject({
  /** どこから取りこんだか */
  source: z.enum(READING_MARKER_SOURCES),
  /** マーカー（1〜500件） */
  markers: z
    .array(MarkerImportItem)
    .min(1, { error: "取りこむマーカーがありません。" })
    .max(READING_IMPORT_LIMITS.markersPerBatch, {
      error: `一度に送れるのは${READING_IMPORT_LIMITS.markersPerBatch}件までです。`,
    }),
});

/** 取りこみの1つの束の型。 */
export type MarkerImportInput = z.infer<typeof MarkerImportInput>;

/** 取りこみの束の結果。 */
export const MarkerImportResult = z.object({
  /** 新しく入った数 */
  inserted: z.number().int(),
  /** コメントか印が新しくなった数 */
  updated: z.number().int(),
  /** 変わらなかった数（前に入っていた・消したもの） */
  unchanged: z.number().int(),
});

/** 取りこみの束の結果の型。 */
export type MarkerImportResult = z.infer<typeof MarkerImportResult>;

/** マーカーを直す入力（送った欄だけ）。 */
export const MarkerUpdateInput = z.strictObject({
  /** コメント（null で消す） */
  comment: Comment,
  /** あとで調べるの印 */
  question: z.boolean().optional(),
  /** 章の名前（null で消す） */
  chapter: Chapter,
});

/** マーカーを直す入力の型。 */
export type MarkerUpdateInput = z.infer<typeof MarkerUpdateInput>;

/** マーカー。 */
export const Marker = z.object({
  /** マーカーの ID */
  id: z.uuid(),
  /** どこから取りこんだか */
  source: z.enum(READING_MARKER_SOURCES),
  /** 章の名前 */
  chapter: z.string().nullable(),
  /** ページ */
  page: z.number().int().nullable(),
  /** 位置 */
  location: z.number().int().nullable(),
  /** 本の中の並びの番号 */
  position: z.number().int(),
  /** マーカーの文 */
  text: z.string(),
  /** コメント */
  comment: z.string().nullable(),
  /** あとで調べるの印 */
  question: z.boolean(),
});

/** マーカーの型。 */
export type Marker = z.infer<typeof Marker>;

/** 本（マーカーつき。消していないものを本の中の順に）。 */
export const Book = BookSummary.extend({
  /** ISBN */
  isbn: z.string().nullable(),
  /** 分かりたいこと */
  want: z.string().nullable(),
  /** 書誌の出どころ */
  catalogSource: z.string(),
  /** マーカー */
  markers: z.array(Marker),
});

/** 本の型。 */
export type Book = z.infer<typeof Book>;

/** 本をまとめた結果。 */
export const BookMergeResult = z.object({
  /** まとめ先の本 */
  book: Book,
  /** 寄せたマーカーの数 */
  movedCount: z.number().int(),
  /** 同じマーカーがあって1つにした数 */
  duplicateCount: z.number().int(),
});

/** 本をまとめた結果の型。 */
export type BookMergeResult = z.infer<typeof BookMergeResult>;

/** 本の鍵の一覧（消したものも含む。画面が新しいマーカーの数を数える。research R7）。 */
export const MarkerKeyList = z.object({ keys: z.array(z.string()) });

/** 本の鍵の一覧の型。 */
export type MarkerKeyList = z.infer<typeof MarkerKeyList>;
