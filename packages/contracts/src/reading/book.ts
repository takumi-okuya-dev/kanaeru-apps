// 読書記録の本の窓口の入出力の形（specs/reading/001-bookshelf-import/contracts/reading.md）。ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。
// 字はコードポイントで数える。ISBN は13桁に直し、書影の URL は openBD の書影の置き場所だけを受ける（AD-33）。
import { z } from "zod";
import { toIsbn13 } from "./isbn.ts";
import { READING_BOOK_LIMITS, countChars } from "./limits.ts";
import {
  READING_BOOK_STATUSES,
  READING_CATALOG_SOURCES,
  READING_COVER_URL_PREFIX,
  READING_SOURCES,
} from "./options.ts";

/**
 * 1字以上・上限までの文（前後の空白は除く）。
 * @param label 欄の名前（誤りの文に使う）
 * @param max 上限（字）
 * @returns zod の形
 */
function textField(label: string, max: number) {
  return z
    .string({ error: `${label}を入れてください。` })
    .trim()
    .min(1, { error: `${label}を入れてください。` })
    .refine((value) => countChars(value) <= max, {
      error: `${label}は${max}字までにしてください。`,
    });
}

/**
 * 任意の文（空や空白だけなら持たない＝null）。
 * @param label 欄の名前
 * @param max 上限（字）
 * @returns zod の形
 */
function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .refine((value) => countChars(value) <= max, {
      error: `${label}は${max}字までにしてください。`,
    })
    .transform((value) => (value === "" ? null : value))
    .nullish();
}

/** ISBN（10桁か13桁。13桁に直す）。 */
export const IsbnInput = z
  .string()
  .transform((value, ctx) => {
    const isbn = toIsbn13(value);
    if (isbn === null) {
      ctx.addIssue({
        code: "custom",
        message: "ISBN の形が違います。10桁か13桁で入れてください。",
      });
      return z.NEVER;
    }
    return isbn;
  })
  .nullish();

/** 書影の URL（openBD の書影の置き場所だけ）。 */
export const CoverUrlInput = z
  .string()
  .max(300)
  .refine((value) => value.startsWith(READING_COVER_URL_PREFIX), {
    error: "書影の URL は使えません。",
  })
  .nullish();

/** 読む場所（重ならない組）。 */
export const SourcesInput = z
  .array(z.enum(READING_SOURCES, { error: "読む場所を選び直してください。" }))
  .refine((values) => new Set(values).size === values.length, {
    error: "同じ読む場所が2つあります。",
  });

/** 本を足す入力。 */
export const BookCreateInput = z.strictObject({
  /** 書名 */
  title: textField("書名", READING_BOOK_LIMITS.title),
  /** 著者 */
  author: optionalText("著者", READING_BOOK_LIMITS.author),
  /** ISBN */
  isbn: IsbnInput,
  /** 書影の URL */
  coverUrl: CoverUrlInput,
  /** 書誌の出どころ */
  catalogSource: z.enum(READING_CATALOG_SOURCES),
  /** 分かりたいこと */
  want: optionalText("分かりたいこと", READING_BOOK_LIMITS.want),
  /** 読む場所 */
  sources: SourcesInput.optional(),
});

/** 本を足す入力の型。 */
export type BookCreateInput = z.infer<typeof BookCreateInput>;

/** 本を直す入力（送った欄だけ）。 */
export const BookUpdateInput = z.strictObject({
  /** 書名 */
  title: textField("書名", READING_BOOK_LIMITS.title).optional(),
  /** 著者 */
  author: optionalText("著者", READING_BOOK_LIMITS.author),
  /** 分かりたいこと */
  want: optionalText("分かりたいこと", READING_BOOK_LIMITS.want),
  /** 状態 */
  status: z.enum(READING_BOOK_STATUSES).optional(),
  /** 読む場所 */
  sources: SourcesInput.optional(),
});

/** 本を直す入力の型。 */
export type BookUpdateInput = z.infer<typeof BookUpdateInput>;

/** 本をまとめる入力（この本のマーカーを、まとめ先に寄せてこの本を消す）。 */
export const BookMergeInput = z.strictObject({
  /** まとめ先の本 */
  intoBookId: z.uuid({ error: "まとめる先の本を選んでください。" }),
});

/** 本をまとめる入力の型。 */
export type BookMergeInput = z.infer<typeof BookMergeInput>;

/** 本棚の1冊。 */
export const BookSummary = z.object({
  /** 本の ID */
  id: z.uuid(),
  /** 書名 */
  title: z.string(),
  /** 著者 */
  author: z.string().nullable(),
  /** 書影の URL */
  coverUrl: z.string().nullable(),
  /** 状態 */
  status: z.enum(READING_BOOK_STATUSES),
  /** 読む場所 */
  sources: z.array(z.enum(READING_SOURCES)),
  /** 消していないマーカーの数 */
  markerCount: z.number().int(),
  /** 最後に取りこんだ時刻（ISO 8601） */
  lastImportedAt: z.string().nullable(),
});

/** 本棚の1冊の型。 */
export type BookSummary = z.infer<typeof BookSummary>;

/** 本棚（読んでいる本が上・最後に取りこんだ順）。 */
export const BookList = z.object({ items: z.array(BookSummary) });

/** 本棚の型。 */
export type BookList = z.infer<typeof BookList>;
