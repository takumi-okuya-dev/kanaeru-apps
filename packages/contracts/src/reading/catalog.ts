// 書誌の検索の窓口の入出力の形（AD-33・research R9）。検索の言葉は URL に載せず、POST の本文で受ける。
import { z } from "zod";
import { READING_CATALOG_SOURCES } from "./options.ts";

/** 書誌を探す入力（書名か ISBN）。 */
export const CatalogSearchInput = z.strictObject({
  /** 書名か ISBN */
  q: z
    .string({ error: "書名か ISBN を入れてください。" })
    .trim()
    .min(1, { error: "書名か ISBN を入れてください。" })
    .max(200, { error: "200字までで入れてください。" }),
});

/** 書誌を探す入力の型。 */
export type CatalogSearchInput = z.infer<typeof CatalogSearchInput>;

/** 書誌の候補。 */
export const CatalogItem = z.object({
  /** 書名 */
  title: z.string(),
  /** 著者 */
  author: z.string().nullable(),
  /** ISBN（13桁） */
  isbn: z.string().nullable(),
  /** 書影の URL（openBD にあるときだけ） */
  coverUrl: z.string().nullable(),
  /** 出どころ */
  source: z.enum(READING_CATALOG_SOURCES),
});

/** 書誌の候補の型。 */
export type CatalogItem = z.infer<typeof CatalogItem>;

/** 書誌の候補の一覧（20件まで）。 */
export const CatalogResult = z.object({ items: z.array(CatalogItem) });

/** 書誌の候補の一覧の型。 */
export type CatalogResult = z.infer<typeof CatalogResult>;
