// Threads への接続と自動投稿（threads-002）の窓口の入出力の形と、画面とAPIで同じ文言。
// めぐるの specs/005-auto-post・010-token-account-add・012-accounts-before-connect の形を、kanaeru の約束（ふつうの zod・日本語の誤りの文）に写した。
import { z } from "zod";
import { AUTOPOST_SLOT_LIMIT, AUTOPOST_SLOT_WINDOW_MINUTES, TOKEN_MAX_LENGTH } from "./limits.ts";
import { minutesToTime, validatePostingSchedule } from "./schedule.ts";
import type { PostingScheduleValidation } from "./schedule.ts";

/** 日時（時差つきの ISO 8601）。 */
const DateTime = z.iso.datetime({ offset: true });

/** Threads への接続の状態（未接続・接続済み・接続し直しが要る）。 */
export const CONNECTION_STATUSES = ["not_connected", "connected", "needs_reconnect"] as const;

/** Threads への接続の状態の型。 */
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Threads への接続の状態の見える名前。 */
export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  not_connected: "未接続",
  connected: "接続済み",
  needs_reconnect: "接続し直しが要る",
};

/** 権限が足りないものの案内（つなげるが、その機能は使えない）。 */
export const TOKEN_WARNINGS = [
  "no_publish_permission",
  "no_insights_permission",
  "no_replies_permission",
] as const;

/** 権限が足りないものの案内の型。 */
export type TokenWarning = (typeof TOKEN_WARNINGS)[number];

/** 権限が足りないものの案内の文。 */
export const TOKEN_WARNING_LABELS: Record<TokenWarning, string> = {
  no_publish_permission:
    "投稿の権限（threads_content_publish）がないため、自動投稿はできません。Meta のアプリで権限を足して、トークンを作り直してください。",
  no_insights_permission:
    "反応を読む権限（threads_manage_insights）がないため、反応の分析はできません。",
  no_replies_permission:
    "返信の権限（threads_manage_replies）がないため、時間差のメンションはできません。",
};

/** Threads への接続（トークンの値は返さない）。 */
export const Connection = z.object({
  status: z.enum(CONNECTION_STATUSES),
  /** Threads のユーザー名（@ なし。未接続は null） */
  username: z.string().nullable(),
  /** Threads の表示名 */
  displayName: z.string().nullable(),
  /** トークンの期限（未接続は null） */
  expiresAt: DateTime.nullable(),
  /** 接続し直しが要る理由の補い（短期トークンだったかもしれない） */
  reconnectHint: z.enum(["short_lived_token"]).nullable(),
  /** 反応を読む権限がない */
  insightsDenied: z.boolean(),
  /** 返信の権限がない */
  repliesDenied: z.boolean(),
});

/** Threads への接続の型。 */
export type Connection = z.infer<typeof Connection>;

/** トークンを貼ってつなぐ入力（はじめての接続・接続し直しのどちらも。どちらかは今の状態で決める）。 */
export const ConnectInput = z.strictObject({
  token: z
    .string({ error: "トークンを貼ってください。" })
    .trim()
    .min(1, { error: "トークンを貼ってください。" })
    .max(TOKEN_MAX_LENGTH, { error: "トークンが長すぎます。貼った文を確かめてください。" }),
});

/** トークンを貼ってつなぐ入力の型。 */
export type ConnectInput = z.infer<typeof ConnectInput>;

/** つないだ結果。 */
export const ConnectResult = z.object({
  /** connect：はじめてつないだ・reconnect：つなぎ直した */
  kind: z.enum(["connect", "reconnect"]),
  connection: Connection,
  /** 権限が足りないものの案内 */
  warnings: z.array(z.enum(TOKEN_WARNINGS)),
});

/** つないだ結果の型。 */
export type ConnectResult = z.infer<typeof ConnectResult>;

/** "HH:MM" の形。 */
const SlotTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  error: "時刻は「08:30」の形で入れてください。",
});

/** 投稿の設定。 */
export const PostingSchedule = z.object({
  enabled: z.boolean(),
  /** "HH:MM"（日本時間）の早い順 */
  slotTimes: z.array(z.string()),
  /** 前後10分の中でずらすか */
  jitter: z.boolean(),
  /** 版（まだ保存していなければ 0） */
  version: z.number().int(),
});

/** 投稿の設定の型。 */
export type PostingSchedule = z.infer<typeof PostingSchedule>;

/** 投稿の設定の決まり（画面の案内に出す）。 */
export const PostingScheduleLimits = z.object({
  /** 時刻の数の上限 */
  slots: z.number().int(),
  /** ずらすときの、時刻どうしの間（分） */
  minGapMinutes: z.number().int(),
  /** ずらす幅（前後の分） */
  jitterMinutes: z.number().int(),
  /** 選べる時刻の幅（"HH:MM"。両端を含む） */
  earliest: z.string(),
  latest: z.string(),
});

/** 投稿の設定と決まり。 */
export const PostingScheduleView = z.object({
  schedule: PostingSchedule,
  limits: PostingScheduleLimits,
});

/** 投稿の設定と決まりの型。 */
export type PostingScheduleView = z.infer<typeof PostingScheduleView>;

/** 投稿の設定を保存する入力（並び・重複・間・幅は validatePostingSchedule で確かめる）。 */
export const PostingScheduleSaveInput = z
  .strictObject({
    enabled: z.boolean({ error: "オンかオフを選んでください。" }),
    slotTimes: z.array(SlotTime).max(AUTOPOST_SLOT_LIMIT * 2, { error: "時刻が多すぎます。" }),
    jitter: z.boolean({ error: "ずらすかを選んでください。" }),
    /** 読んだときの版（まだ保存していなければ 0） */
    version: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    const problem = postingScheduleProblem(
      validatePostingSchedule(value, { window: AUTOPOST_SLOT_WINDOW_MINUTES }),
    );
    if (problem) ctx.addIssue({ code: "custom", path: [problem.path], message: problem.message });
  });

/** 投稿の設定を保存する入力の型。 */
export type PostingScheduleSaveInput = z.infer<typeof PostingScheduleSaveInput>;

/**
 * 投稿の設定の確かめの結果を、欄と日本語の文にする（画面と API で同じ文を出す）。
 * @param validation validatePostingSchedule の結果
 * @returns 欄（enabled か slotTimes）と文。通っていれば null
 */
export function postingScheduleProblem(
  validation: PostingScheduleValidation,
): { path: "enabled" | "slotTimes"; message: string } | null {
  if (validation.ok) return null;
  const times = (validation.times ?? []).join("・");
  const [earliest, latest] = AUTOPOST_SLOT_WINDOW_MINUTES.map(minutesToTime);
  switch (validation.reason) {
    case "invalid_time":
      return {
        path: "slotTimes",
        message: `時刻「${times}」の形が違います。「08:30」の形で入れてください。`,
      };
    case "outside_window":
      return {
        path: "slotTimes",
        message: `${times} は選べません。夜間（0時〜8時）は DB が止まるため、${earliest}〜${latest} の中から選んでください。`,
      };
    case "too_many":
      return { path: "slotTimes", message: `時刻は${AUTOPOST_SLOT_LIMIT}個までです。` };
    case "duplicate":
      return { path: "slotTimes", message: `同じ時刻（${times}）が2つあります。` };
    case "required":
      return {
        path: "enabled",
        message: "自動投稿をオンにするときは、時刻を1つ以上入れてください。",
      };
    case "too_close":
      return {
        path: "slotTimes",
        message: `ずらすときは、時刻どうしを30分以上あけてください（${times}）。`,
      };
  }
}

/** 投稿の権限の確かめの結果（自動投稿をオンにしたときだけ）。 */
export const ThreadsCheck = z.object({
  status: z.enum(["ok", "needs_reconnect", "not_connected", "no_publish_permission", "unknown"]),
  /** 直前24時間の投稿の数と上限（ok のときだけ） */
  quotaUsage: z.number().int().nullable(),
  quotaTotal: z.number().int().nullable(),
});

/** 投稿の権限の確かめの結果の型。 */
export type ThreadsCheck = z.infer<typeof ThreadsCheck>;

/** 投稿の権限の確かめの結果の文（投稿できる状態のときは threadsCheckOkMessage。めぐるの THREADS_CHECK_MESSAGES。threads-012）。 */
export const THREADS_CHECK_MESSAGES: Record<Exclude<ThreadsCheck["status"], "ok">, string> = {
  needs_reconnect: "Threads との接続が切れています。トークンを貼り直して、つなぎ直してください。",
  not_connected: "Threads につなぐと確かめられます。",
  no_publish_permission:
    "Threads へ投稿する権限がありません。Meta のアプリで投稿の権限を足して、トークンを作り直してください。",
  unknown: "Threads との接続を確かめられませんでした。少し待ってから、もう一度お試しください。",
};

/**
 * 投稿できる状態だったときの文（直近24時間の投稿の数と上限）。
 * @param quotaUsage 直近24時間の投稿の数（読めなければ null）
 * @param quotaTotal 上限（読めなければ null）
 * @returns 文
 */
export function threadsCheckOkMessage(
  quotaUsage: number | null,
  quotaTotal: number | null,
): string {
  if (quotaUsage === null || quotaTotal === null) return "投稿できる状態です。";
  return `投稿できる状態です（直近24時間の投稿 ${quotaUsage}/${quotaTotal}件）。`;
}

/** 投稿の設定を保存した結果。 */
export const PostingScheduleSaved = z.object({
  schedule: PostingSchedule,
  /** オンにしたときの確かめの結果（オフの保存では null） */
  connectionCheck: ThreadsCheck.nullable(),
});

/** 投稿の設定を保存した結果の型。 */
export type PostingScheduleSaved = z.infer<typeof PostingScheduleSaved>;

/** 自動投稿が止まっている理由。 */
export const STOPPED_REASONS = ["not_connected", "needs_reconnect", "rate_limited"] as const;

/** 自動投稿の状態。 */
export const AutoPostState = z.object({
  enabled: z.boolean(),
  slotCount: z.number().int(),
  /** 止まっている理由（止まっていなければ null） */
  stoppedReason: z.enum(STOPPED_REASONS).nullable(),
});

/** 自動投稿の状態の型。 */
export type AutoPostState = z.infer<typeof AutoPostState>;

/** 自動投稿の知らせ（保存せず、読むたびに今の状態から決める）。 */
export const AutoPostNotice = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not_connected") }),
  z.object({ kind: z.literal("needs_reconnect") }),
  z.object({ kind: z.literal("rate_limited"), until: DateTime }),
  z.object({
    kind: z.literal("publish_failed"),
    count: z.number().int(),
    latestError: z.enum([
      "network",
      "threads_server",
      "invalid_request",
      "container_error",
      "unknown",
    ]),
    latestAt: DateTime,
  }),
  z.object({
    kind: z.literal("blocked"),
    count: z.number().int(),
    latestReason: z.enum(["ng_word", "over_threads_limit"]),
    latestWords: z.array(z.string()),
  }),
  z.object({ kind: z.literal("no_approved"), nextSlotAt: DateTime.nullable() }),
]);

/** 自動投稿の知らせの型。 */
export type AutoPostNotice = z.infer<typeof AutoPostNotice>;

/** 自動投稿の状態・次の投稿・知らせ。 */
export const AutoPostStatus = z.object({
  autoPost: AutoPostState,
  /** 次に投稿する時刻と案（予定がない・承認済みがないときは null） */
  next: z
    .object({ at: DateTime, draft: z.object({ id: z.guid(), excerpt: z.string() }) })
    .nullable(),
  approvedCount: z.number().int(),
  /** 承認済みの数 ÷ 1日の時刻の数（切り捨て）。時刻が0なら null */
  daysLeft: z.number().int().nullable(),
  notices: z.array(AutoPostNotice),
});

/** 自動投稿の状態・次の投稿・知らせの型。 */
export type AutoPostStatus = z.infer<typeof AutoPostStatus>;

/** 「次に投稿する」を付ける・外す入力。 */
export const PriorityInput = z.strictObject({
  prioritized: z.boolean(),
  /** 読んだときの版 */
  version: z.number().int().min(1),
});

/** 「次に投稿する」を付ける・外す入力の型。 */
export type PriorityInput = z.infer<typeof PriorityInput>;

/** 定期の仕事の1回の結果（ログと確かめに使う。本文・トークンを含まない）。 */
export const JobRunSummary = z.object({
  published: z.number().int(),
  retried: z.number().int(),
  carriedOver: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  blocked: z.number().int(),
  deferred: z.number().int(),
  waiting: z.number().int(),
  rechecked: z.number().int(),
  refreshed: z.number().int(),
  /** 取りこんだ反応とフォロワーの数（threads-003） */
  metrics: z.number().int(),
  /** 出した時間差のメンションの返信の数（threads-007） */
  mentions: z.number().int(),
});

/** 定期の仕事の1回の結果の型。 */
export type JobRunSummary = z.infer<typeof JobRunSummary>;
