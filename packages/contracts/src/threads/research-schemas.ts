// 宣伝とリサーチ（threads-004）の窓口の入出力の形（ふつうの zod・日本語の誤りの文）。
// めぐるの specs/002-strategy-profile・014-strategy-guidance・021-external-media の形を写した。
import { z } from "zod";
import {
  EXPLAIN_BATCH_MAX,
  KEYWORD_BATCH_MAX,
  PRIORITY_MAX,
  PRIORITY_MIN,
  PROMOTION_CONTENT_MAX,
  REFERENCE_AUTHOR_MAX,
  REFERENCE_BATCH_MAX,
  REFERENCE_BODY_MAX,
  REFERENCE_MEMO_MAX,
  REFERENCE_METRIC_MAX,
  REFERENCE_WHY_GOOD_MAX,
  SHORT_TEXT_MAX,
  URL_MAX,
} from "./limits.ts";
import { EVENT_FORMATS, PREFECTURES, isEventDateTime } from "./promotion-event.ts";
import { isValidYmd } from "./promotions.ts";
import {
  FRESHNESS_VALUES,
  POSTED_DATE_MODE_VALUES,
  REFERENCE_PLATFORM_VALUES,
} from "./research.ts";

/** 日時（時差つきの ISO 8601）。 */
const DateTime = z.iso.datetime({ offset: true });

/**
 * 任意の短い文字（空は ""）。
 * @param max 文字数の上限
 * @param label 欄の名前（誤りの文に使う）
 * @returns zod の形
 */
const optionalText = (max: number, label: string) =>
  z
    .string({ error: "文字で入れてください。" })
    .trim()
    .max(max, { error: `${label}は${max.toLocaleString("ja-JP")}文字までにしてください。` });

/**
 * 必ず入れる文字。
 * @param max 文字数の上限
 * @param label 欄の名前
 * @returns zod の形
 */
const requiredText = (max: number, label: string) =>
  z
    .string({ error: `${label}を入れてください。` })
    .trim()
    .min(1, { error: `${label}を入れてください。` })
    .max(max, { error: `${label}は${max.toLocaleString("ja-JP")}文字までにしてください。` });

/** http・https の URL（空は ""）。 */
const optionalUrl = z
  .string({ error: "文字で入れてください。" })
  .trim()
  .max(URL_MAX, { error: `URL は${URL_MAX}文字までにしてください。` })
  .refine((value) => value === "" || /^https?:\/\/\S+$/.test(value), {
    error: "http:// か https:// で始まる URL にしてください。",
  });

/**
 * 任意の文字（空は null）。
 * @param max 文字数の上限
 * @param label 欄の名前
 * @returns zod の形
 */
const nullableText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label}は${max}文字までにしてください。` })
    .nullable()
    .transform((value) => (value ? value : null));

/** 宣伝の状態。 */
export const PROMOTION_STATUSES = ["active", "paused", "ended"] as const;

/** 宣伝の状態の見える名前。 */
export const PROMOTION_STATUS_LABELS: Record<(typeof PROMOTION_STATUSES)[number], string> = {
  active: "宣伝中",
  paused: "止めている",
  ended: "終わった",
};

/** 宣伝のイベントの情報。日時は日本時間の「YYYY-MM-DDTHH:mm」。 */
export const PromotionEventSchema = z
  .strictObject({
    startAt: z.string().refine(isEventDateTime, { error: "始まりの日時を入れてください。" }),
    endAt: z.string().refine(isEventDateTime, { error: "終わりの日時の形が違います。" }).nullable(),
    format: z.enum(EVENT_FORMATS, { error: "会場かオンラインかを選んでください。" }),
    venueName: nullableText(100, "会場の名前"),
    prefecture: z.enum(PREFECTURES, { error: "都道府県は選択肢から選んでください。" }).nullable(),
    address: nullableText(200, "住所"),
    building: nullableText(100, "建物"),
    station: nullableText(60, "最寄りの駅"),
    capacity: z
      .number()
      .int()
      .min(1, { error: "定員は1以上にしてください。" })
      .max(100000)
      .nullable(),
    feeYen: z
      .number()
      .int()
      .min(0, { error: "参加費は0円以上にしてください。" })
      .max(1000000)
      .nullable(),
    feeNote: nullableText(500, "参加費のメモ"),
    cancelPolicy: nullableText(1000, "キャンセルの決まり"),
    audience: nullableText(300, "対象"),
    organizer: nullableText(100, "主催"),
  })
  .refine((value) => value.endAt === null || value.endAt >= value.startAt, {
    error: "終わりの日時は、始まりより後にしてください。",
    path: ["endAt"],
  });

/** 宣伝の入力。 */
export const PromotionInput = z.strictObject({
  title: requiredText(SHORT_TEXT_MAX, "タイトル"),
  content: requiredText(PROMOTION_CONTENT_MAX, "宣伝の内容"),
  targetLocation: optionalText(SHORT_TEXT_MAX, "地域"),
  targetPersona: optionalText(SHORT_TEXT_MAX, "届けたい人"),
  targetAgeRange: optionalText(SHORT_TEXT_MAX, "年代"),
  cta: optionalText(SHORT_TEXT_MAX, "してほしいこと"),
  linkedUrl: optionalUrl,
  priority: z
    .number({ error: "数で入れてください。" })
    .int()
    .min(PRIORITY_MIN, { error: `${PRIORITY_MIN}〜${PRIORITY_MAX}にしてください。` })
    .max(PRIORITY_MAX, { error: `${PRIORITY_MIN}〜${PRIORITY_MAX}にしてください。` }),
  status: z.enum(PROMOTION_STATUSES, { error: "状態は選択肢から選んでください。" }),
  /** 掲載の期限（YYYY-MM-DD。なければ null） */
  validUntil: z.string().refine(isValidYmd, { error: "日付の形が違います。" }).nullable(),
  event: PromotionEventSchema.nullable(),
});

/** 宣伝の入力の型。 */
export type PromotionInput = z.infer<typeof PromotionInput>;

/** 宣伝を直す入力（読んだ版つき）。 */
export const PromotionUpdateInput = PromotionInput.extend({ version: z.number().int().min(1) });

/** 宣伝を直す入力の型。 */
export type PromotionUpdateInput = z.infer<typeof PromotionUpdateInput>;

/** 宣伝。 */
export const Promotion = z.object({
  id: z.guid(),
  title: z.string(),
  content: z.string(),
  targetLocation: z.string(),
  targetPersona: z.string(),
  targetAgeRange: z.string(),
  cta: z.string(),
  linkedUrl: z.string(),
  priority: z.number().int(),
  status: z.enum(PROMOTION_STATUSES),
  validUntil: z.string().nullable(),
  event: PromotionEventSchema.nullable(),
  /** 掲載の期限を過ぎた */
  isExpired: z.boolean(),
  /** 宣伝の対象（宣伝中で期限内） */
  isTargetable: z.boolean(),
  version: z.number().int(),
  createdAt: DateTime,
  updatedAt: DateTime,
});

/** 宣伝の型。 */
export type Promotion = z.infer<typeof Promotion>;

/** 宣伝の一覧と、宣伝の投稿の割合。 */
export const PromotionList = z.object({
  items: z.array(Promotion),
  limit: z.number().int(),
  ratioPercent: z.number().int(),
});

/** 宣伝の一覧の型。 */
export type PromotionList = z.infer<typeof PromotionList>;

/** 宣伝の投稿の割合を保存する入力。 */
export const PromotionRatioInput = z.strictObject({
  ratioPercent: z
    .number({ error: "数で入れてください。" })
    .int({ error: "整数で入れてください。" })
    .min(0, { error: "0〜100にしてください。" })
    .max(100, { error: "0〜100にしてください。" }),
});

/** 参考の投稿の反応の数（わからなければ null）。 */
const metricValue = z
  .number({ error: "数で入れてください。" })
  .int({ error: "整数で入れてください。" })
  .min(0, { error: "0以上にしてください。" })
  .max(REFERENCE_METRIC_MAX)
  .nullable();

/** 参考の投稿の入力。 */
export const ReferencePostInput = z
  .strictObject({
    body: requiredText(REFERENCE_BODY_MAX, "本文"),
    keyword: optionalText(SHORT_TEXT_MAX, "キーワード"),
    postUrl: optionalUrl,
    whyGood: optionalText(REFERENCE_WHY_GOOD_MAX, "なぜ良いか"),
    platform: z.enum(REFERENCE_PLATFORM_VALUES, { error: "媒体は選択肢から選んでください。" }),
    postedDateMode: z.enum(POSTED_DATE_MODE_VALUES, {
      error: "投稿日は選択肢から選んでください。",
    }),
    /** YYYY-MM-DD（投稿日を「日付」で選んだときだけ） */
    postedDate: z.string().nullable(),
    metrics: z.strictObject({
      likes: metricValue,
      replies: metricValue,
      views: metricValue,
      saves: metricValue,
      reposts: metricValue,
      followers: metricValue,
    }),
    author: optionalText(REFERENCE_AUTHOR_MAX, "投稿者"),
    memo: optionalText(REFERENCE_MEMO_MAX, "メモ"),
  })
  .superRefine((value, ctx) => {
    if (value.postedDateMode === "exact") {
      if (!value.postedDate || !isValidYmd(value.postedDate)) {
        ctx.addIssue({ code: "custom", path: ["postedDate"], message: "投稿日を入れてください。" });
      }
    } else if (value.postedDate !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["postedDate"],
        message: "投稿日は「日付」を選んだときだけ入れます。",
      });
    }
  });

/** 参考の投稿の入力の型。 */
export type ReferencePostInput = z.infer<typeof ReferencePostInput>;

/** 参考の投稿を直す入力（読んだ版つき）。 */
export const ReferencePostUpdateInput = z.strictObject({
  post: ReferencePostInput,
  version: z.number().int().min(1),
});

/** 参考の投稿をまとめて足す入力。 */
export const ReferencePostBatchInput = z.strictObject({
  items: z
    .array(ReferencePostInput)
    .min(1, { error: "足す投稿を入れてください。" })
    .max(REFERENCE_BATCH_MAX, { error: `一度に足せるのは${REFERENCE_BATCH_MAX}件までです。` }),
});

/** 参考の投稿。 */
export const ReferencePost = z.object({
  id: z.guid(),
  body: z.string(),
  keyword: z.string(),
  postUrl: z.string(),
  whyGood: z.string(),
  platform: z.enum(REFERENCE_PLATFORM_VALUES),
  postedDateMode: z.enum(POSTED_DATE_MODE_VALUES),
  postedDate: z.string().nullable(),
  metrics: z.object({
    likes: z.number().int().nullable(),
    replies: z.number().int().nullable(),
    views: z.number().int().nullable(),
    saves: z.number().int().nullable(),
    reposts: z.number().int().nullable(),
    followers: z.number().int().nullable(),
  }),
  author: z.string(),
  memo: z.string(),
  freshness: z.enum(FRESHNESS_VALUES),
  /** 解説のプロンプトの【ID】に使う短い ID */
  shortId: z.string(),
  version: z.number().int(),
  createdAt: DateTime,
  updatedAt: DateTime,
});

/** 参考の投稿の型。 */
export type ReferencePost = z.infer<typeof ReferencePost>;

/** 参考の投稿の一覧。 */
export const ReferencePostList = z.object({
  items: z.array(ReferencePost),
  limit: z.number().int(),
});

/** 解説のプロンプト。 */
export const ExplainPrompt = z.object({
  /** プロンプト（解説がまだのものがなければ ""） */
  prompt: z.string(),
  items: z.array(z.object({ id: z.guid(), shortId: z.string() })),
  /** 解説がまだの数 */
  pendingCount: z.number().int(),
});

/** 解説のプロンプトの型。 */
export type ExplainPrompt = z.infer<typeof ExplainPrompt>;

/** 貼り戻した解説を保存する入力（画面で parseExplanations で読み取ったもの）。 */
export const ExplanationsInput = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: z.guid(),
        whyGood: requiredText(REFERENCE_WHY_GOOD_MAX, "解説"),
      }),
    )
    .min(1, { error: "保存する解説がありません。" })
    .max(EXPLAIN_BATCH_MAX, { error: `一度に保存できるのは${EXPLAIN_BATCH_MAX}件までです。` }),
});

/** 解説を保存した結果。 */
export const ExplanationsResult = z.object({
  saved: z.array(z.guid()),
  skipped: z.array(z.object({ id: z.guid(), reason: z.enum(["already_explained", "not_found"]) })),
});

/** リサーチのキーワードの入力。 */
export const ResearchKeywordInput = z.strictObject({
  keyword: requiredText(SHORT_TEXT_MAX, "キーワード"),
  purpose: optionalText(SHORT_TEXT_MAX, "狙い"),
});

/** リサーチのキーワードの入力の型。 */
export type ResearchKeywordInput = z.infer<typeof ResearchKeywordInput>;

/** リサーチのキーワードを直す入力（読んだ版つき）。 */
export const ResearchKeywordUpdateInput = ResearchKeywordInput.extend({
  version: z.number().int().min(1),
});

/** リサーチのキーワードをまとめて足す入力（画面で parseKeywordIdeas で読み取ったもの）。 */
export const ResearchKeywordBatchInput = z.strictObject({
  items: z
    .array(ResearchKeywordInput)
    .min(1, { error: "足すキーワードを選んでください。" })
    .max(KEYWORD_BATCH_MAX, { error: `一度に足せるのは${KEYWORD_BATCH_MAX}個までです。` }),
});

/** リサーチのキーワード。 */
export const ResearchKeyword = z.object({
  id: z.guid(),
  keyword: z.string(),
  purpose: z.string(),
  version: z.number().int(),
  createdAt: DateTime,
  updatedAt: DateTime,
});

/** リサーチのキーワードの型。 */
export type ResearchKeyword = z.infer<typeof ResearchKeyword>;

/** リサーチのキーワードの一覧。 */
export const ResearchKeywordList = z.object({
  items: z.array(ResearchKeyword),
  limit: z.number().int(),
});

/** キーワードの案のプロンプト。 */
export const KeywordIdeaPrompt = z.object({ prompt: z.string() });
