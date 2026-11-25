// 外部メディアの掲載文（threads-008）の窓口の入出力の形（ふつうの zod・日本語の誤りの文）。
// めぐるの packages/shared/src/schemas.ts の「外部媒体展開（specs/021）」を写した。版は「まだ作っていない」を 0 にする。
import { z } from "zod";
import { URL_MAX } from "./limits.ts";
import { IMAGE_STYLES, LISTING_STATUSES, MEDIA } from "./media-types.ts";
import { Promotion, PromotionEventSchema } from "./research-schemas.ts";
import { countChars, isHttpUrl } from "./text.ts";

/** 媒体の形。 */
export const MediaSchema = z.enum(MEDIA, { error: "媒体は、選択肢から選んでください。" });

/** 掲載の状況の形。 */
export const ListingStatusSchema = z.enum(LISTING_STATUSES, {
  error: "状況は、選択肢から選んでください。",
});

/** 自動で直した内容。 */
export const ListingFixSchema = z.object({
  field: z.string(),
  excerpt: z.string(),
  reason: z.string(),
});

/** GET …/external-media の応答（宣伝と、行のある媒体の状況）。 */
export const ExternalMediaList = z.object({
  promotions: z.array(
    z.object({
      id: z.guid(),
      title: z.string(),
      event: PromotionEventSchema.nullable(),
      listings: z.array(
        z.object({
          media: MediaSchema,
          status: ListingStatusSchema,
          postedUrl: z.string().nullable(),
        }),
      ),
    }),
  ),
});

/** 外部メディアの一覧の型。 */
export type ExternalMediaList = z.infer<typeof ExternalMediaList>;

/** 媒体ごとの掲載文と状況。 */
export const Listing = z.object({
  status: ListingStatusSchema,
  postedUrl: z.string().nullable(),
  imageStyle: z.enum(IMAGE_STYLES),
  /** 欄の値（まだ作っていなければ null） */
  fields: z.record(z.string(), z.string()).nullable(),
  fixes: z.array(ListingFixSchema),
  generatedAt: z.string().nullable(),
  /** 作ったときの宣伝の版 */
  sourceVersion: z.number().int().nullable(),
  /** 版（まだ行がなければ 0） */
  version: z.number().int(),
});

/** 掲載文と状況の型。 */
export type Listing = z.infer<typeof Listing>;

/** GET …/external-media/{promotionId}/{media} の応答。 */
export const ListingDetail = z.object({
  promotion: Promotion,
  media: MediaSchema,
  listing: Listing,
  /** 媒体の既定値（事務局名・連絡先など） */
  defaults: z.record(z.string(), z.string()),
  /** 作ったあとに宣伝が直された */
  sourceChanged: z.boolean(),
});

/** 掲載文の画面の中身の型。 */
export type ListingDetail = z.infer<typeof ListingDetail>;

/** POST …/generate の入力（読んだ版）。 */
export const ListingGenerateInput = z.object({ version: z.number().int().min(0) });

/** PUT …/external-media/{promotionId}/{media} の入力（欄の key と上限は、API が媒体の決まりで確かめる）。 */
export const ListingUpdateInput = z.object({
  version: z.number().int().min(0),
  status: ListingStatusSchema.optional(),
  postedUrl: z
    .string()
    .trim()
    .refine((value) => value === "" || (countChars(value) <= URL_MAX && isHttpUrl(value)), {
      error: "http:// か https:// で始まる URL にしてください。",
    })
    .optional(),
  imageStyle: z.enum(IMAGE_STYLES).optional(),
  fields: z.record(z.string(), z.string()).optional(),
});

/** 掲載文の保存の入力の型。 */
export type ListingUpdateInput = z.infer<typeof ListingUpdateInput>;

/** 媒体の既定値（1つの媒体）。 */
export const MediaDefaults = z.object({
  media: MediaSchema,
  values: z.record(z.string(), z.string()),
  /** 版（まだ保存していなければ 0） */
  version: z.number().int(),
});

/** GET …/media-defaults の応答。 */
export const MediaDefaultsList = z.object({ items: z.array(MediaDefaults) });

/** PUT …/media-defaults/{media} の入力。 */
export const MediaDefaultsInput = z.object({
  version: z.number().int().min(0),
  values: z.record(
    z.string(),
    z.string().max(500, { error: "既定値は500文字までにしてください。" }),
  ),
});

/** 媒体の既定値の入力の型。 */
export type MediaDefaultsInput = z.infer<typeof MediaDefaultsInput>;
