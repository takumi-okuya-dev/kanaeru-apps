// 改善点（suite-004）の窓口の形：ログインした人が送る入力と、運営者が読む一覧（ふつうの zod。OpenAPI の名前は API の側で付ける）。
// 持つのは本文・アプリの key・送った人だけ（Constitution II）。本文に個人の情報を書かないよう、画面で案内する。
import { z } from "zod";
import { AppKeySchema } from "./suite.ts";

/** 本文の文字数の上限（DB の CHECK と同じ）。 */
export const FEEDBACK_BODY_MAX = 2000;

/** 1人が1日（日本時間）に送れる数。 */
export const FEEDBACK_DAILY_MAX = 20;

/** 改善点を送る入力。 */
export const FeedbackInput = z.strictObject({
  /** 本文（前後の空白を除いて1〜2000文字） */
  body: z
    .string()
    .trim()
    .min(1, { error: "困ったこと・ほしいことを書いてください。" })
    .max(FEEDBACK_BODY_MAX, { error: `${FEEDBACK_BODY_MAX}文字までにしてください。` }),
  /** どのアプリについてか（任意。台帳のアプリの key） */
  appKey: AppKeySchema.nullable().optional(),
});

/** 改善点を送る入力の型。 */
export type FeedbackInput = z.infer<typeof FeedbackInput>;

/** 送った答え。 */
export const FeedbackAccepted = z.object({
  /** 改善点の ID */
  id: z.uuid(),
});

/** 届いた改善点の1行（運営者が読む）。 */
export const FeedbackEntry = z.object({
  /** 改善点の ID */
  id: z.uuid(),
  /** 送った日時 */
  createdAt: z.iso.datetime({ offset: true }),
  /** どのアプリについてか（なければ null） */
  appKey: z.string().nullable(),
  /** アプリの名前（台帳にないアプリ・なければ null） */
  appName: z.string().nullable(),
  /** 本文 */
  body: z.string(),
  /** 送った人の表示名（退会した人は null） */
  sender: z.string().nullable(),
  /** 済みか */
  done: z.boolean(),
});

/** 届いた改善点の1行の型。 */
export type FeedbackEntry = z.infer<typeof FeedbackEntry>;

/** 届いた改善点の一覧（新しい順）。 */
export const FeedbackList = z.object({
  /** 改善点 */
  items: z.array(FeedbackEntry),
});

/** 届いた改善点の一覧の型。 */
export type FeedbackList = z.infer<typeof FeedbackList>;

/** 済みを付け外す入力。 */
export const FeedbackDoneInput = z.strictObject({
  /** 済みか */
  done: z.boolean(),
});

/** 改善点の領域のエラー（code・状態の番号・文言）。 */
export const FEEDBACK_ERRORS = {
  /** 1日に送れる数を超えた */
  DAILY_LIMIT: {
    code: "FEEDBACK_DAILY_LIMIT",
    status: 429,
    message: `改善点は1日に${FEEDBACK_DAILY_MAX}件まで送れます。明日また送ってください。`,
  },
} as const;
