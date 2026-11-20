// 反応の分析（threads-003）の窓口の入出力の形と、画面と API で同じ文言。めぐるの specs/006-performance-feedback を写した。
import { z } from "zod";
import { FEEDBACK_MEMO_MAX } from "./limits.ts";

/** 日時（時差つきの ISO 8601）。 */
const DateTime = z.iso.datetime({ offset: true });

/** 反応の取りこみの状態（pending はまだ1度も取りこんでいない）。 */
export const METRICS_STATES = [
  "pending",
  "updating",
  "confirmed",
  "late_confirmed",
  "unmeasurable",
] as const;

/** 反応の取りこみの状態の型。 */
export type MetricsState = (typeof METRICS_STATES)[number];

/** 反応の取りこみの状態の見える名前。 */
export const METRICS_STATE_LABELS: Record<MetricsState, string> = {
  pending: "取りこみ待ち",
  updating: "途中（7日で確定）",
  confirmed: "確定",
  late_confirmed: "遅れて確定",
  unmeasurable: "計れない",
};

/** 判定。 */
export const JUDGMENTS = ["good", "normal", "poor"] as const;

/** 判定の型。 */
export type Judgment = (typeof JUDGMENTS)[number];

/** 判定の見える名前。 */
export const JUDGMENT_LABELS: Record<Judgment, string> = {
  good: "好調",
  normal: "普通",
  poor: "低調",
};

/** 一覧の絞りこみ（すべて・好調・普通・低調・判定待ち）。 */
export const PERFORMANCE_TABS = ["all", "good", "normal", "poor", "pending"] as const;

/** 一覧の絞りこみの型。 */
export type PerformanceTab = (typeof PERFORMANCE_TABS)[number];

/** 一覧の絞りこみの見える名前。 */
export const PERFORMANCE_TAB_LABELS: Record<PerformanceTab, string> = {
  all: "すべて",
  good: "好調",
  normal: "普通",
  poor: "低調",
  pending: "判定待ち",
};

/** 反応の6つの数（返らなかった数は null）。 */
export const MetricValues = z.object({
  views: z.number().int().nullable(),
  likes: z.number().int().nullable(),
  replies: z.number().int().nullable(),
  reposts: z.number().int().nullable(),
  quotes: z.number().int().nullable(),
  shares: z.number().int().nullable(),
});

/** 反応の6つの数の型。 */
export type MetricValues = z.infer<typeof MetricValues>;

/** 反応の6つの数の見える名前（並びの順）。 */
export const METRIC_LABELS: { key: keyof MetricValues; label: string }[] = [
  { key: "views", label: "閲覧" },
  { key: "likes", label: "いいね" },
  { key: "replies", label: "返信" },
  { key: "reposts", label: "リポスト" },
  { key: "quotes", label: "引用" },
  { key: "shares", label: "シェア" },
];

/** 投稿ごとの反応。 */
export const PerformanceItem = z.object({
  id: z.guid(),
  body: z.string(),
  publishedAt: DateTime,
  threadsPermalink: z.string().nullable(),
  state: z.enum(METRICS_STATES),
  metrics: MetricValues.nullable(),
  lastFetchedAt: DateTime.nullable(),
  /** 最後に取りこんだときの、投稿からの経過（時間） */
  lastElapsedHours: z.number().int().nullable(),
  /** 確定する日の目安（確定していなければ） */
  confirmAt: DateTime.nullable(),
  judgment: z.enum(JUDGMENTS).nullable(),
  /** 基準値に対する倍率（判定したときだけ） */
  ratio: z.number().nullable(),
  unmeasurableReason: z.enum(["not_found", "no_media_id"]).nullable(),
  /** 改善のメモ（低調で確定したときだけ） */
  feedback: z
    .object({
      memo: z.string().nullable(),
      includeInPrompt: z.boolean(),
      /** 次のプロンプトに入る（新しい低調の投稿の5件の中） */
      inNextPrompt: z.boolean(),
      version: z.number().int(),
    })
    .nullable(),
});

/** 投稿ごとの反応の型。 */
export type PerformanceItem = z.infer<typeof PerformanceItem>;

/** 反応の画面の上の集計。 */
export const PerformanceSummary = z.object({
  /** 基準値（確定した新しい30件の閲覧の中央値。5件に足りなければ null） */
  baseline: z.number().nullable(),
  baselineSampleCount: z.number().int(),
  baselineIsZero: z.boolean(),
  lastFetchedAt: DateTime.nullable(),
  insightsDenied: z.boolean(),
  connectionStatus: z.enum(["not_connected", "connected", "needs_reconnect"]),
  counts: z.object({
    all: z.number().int(),
    good: z.number().int(),
    normal: z.number().int(),
    poor: z.number().int(),
    pending: z.number().int(),
  }),
});

/** 反応の画面の上の集計の型。 */
export type PerformanceSummary = z.infer<typeof PerformanceSummary>;

/** 反応の画面。 */
export const PerformanceView = z.object({
  summary: PerformanceSummary,
  /** 投稿した新しい順（最大 PERFORMANCE_LIST_MAX 件） */
  items: z.array(PerformanceItem),
});

/** 反応の画面の型。 */
export type PerformanceView = z.infer<typeof PerformanceView>;

/** 反応の一覧の問い合わせ。 */
export const PerformanceQuery = z.object({
  tab: z.enum(PERFORMANCE_TABS, { error: "絞りこみは、選択肢から選んでください。" }).default("all"),
});

/** 反応の一覧で返す件数の上限（めぐるのページ送りの代わり）。 */
export const PERFORMANCE_LIST_MAX = 200;

/** 改善のメモと「次のプロンプトに入れる」を保存する入力。 */
export const FeedbackInput = z.strictObject({
  memo: z
    .string({ error: "文字で入れてください。" })
    .trim()
    .max(FEEDBACK_MEMO_MAX, { error: `メモは${FEEDBACK_MEMO_MAX}文字までにしてください。` })
    .nullable(),
  includeInPrompt: z.boolean(),
  /** 読んだときの版 */
  version: z.number().int().min(1),
});

/** 改善のメモを保存する入力の型。 */
export type FeedbackInput = z.infer<typeof FeedbackInput>;

/** 書き出しの種類（posts：投稿ごと・snapshots：取りこみごと）。 */
export const PerformanceExportQuery = z.object({
  kind: z.enum(["posts", "snapshots"], { error: "種類は、選択肢から選んでください。" }),
});
