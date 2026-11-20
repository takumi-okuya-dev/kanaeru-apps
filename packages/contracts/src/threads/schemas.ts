// Threads の運用（threads）の窓口の入出力の形（API の入力の確かめ・OpenAPI の文書・画面の入力の確かめが、同じ形を使う）。
// ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。日時は時差つきの ISO 8601 だけ（Consistency Conventions）。
// 文字数の上限と既定値は limits.ts（めぐるから写したもの）。
import { z } from "zod";
import {
  CORE_RULES_MAX,
  DRAFT_BODY_MAX,
  NG_WORD_LIMIT,
  NG_WORD_MAX,
  PASTE_MAX_CHARS,
  POST_KIND_LENGTH_MAX,
  POST_KIND_LENGTH_MIN,
  POST_KIND_LENGTH_STEP,
  POST_KIND_RATIO_STEP,
  POST_LENGTH_TARGET_MAX,
  POST_LENGTH_TARGET_MIN,
  POST_LENGTH_TARGET_STEP,
  PROMPT_COUNT_MAX,
  PROMPT_COUNT_MIN,
  REJECT_NOTE_MAX,
  REVIEW_MAX_ITEMS,
  STRATEGY_TEXT_MAX,
} from "./limits.ts";
import { CONNECTION_STATUSES } from "./autopost.ts";
import { PostMention } from "./mention.ts";
import { REJECT_REASON_CODES, REVIEW_SKIP_REASONS } from "./review.ts";
import { STRATEGY_TEXT_KEYS, TONE_PRESET_VALUES } from "./strategy.ts";
import type { StrategyTextKey } from "./strategy.ts";

/** 運用アカウントの名前の文字数の上限。 */
export const THREADS_ACCOUNT_NAME_MAX = 50;

/** 1人が持てる運用アカウントの数（PRD B2【仮】）。 */
export const THREADS_ACCOUNT_LIMIT = 10;

/** 日時（時差つきの ISO 8601）。 */
const DateTime = z.iso.datetime({ offset: true });

/** 運用アカウントを作る・名前を直す入力。 */
export const ThreadsAccountInput = z.strictObject({
  name: z
    .string({ error: "アカウントの名前を入れてください。" })
    .trim()
    .min(1, { error: "アカウントの名前を入れてください。" })
    .max(THREADS_ACCOUNT_NAME_MAX, {
      error: `アカウントの名前は${THREADS_ACCOUNT_NAME_MAX}文字までにしてください。`,
    }),
});

/** 運用アカウントを作る・名前を直す入力の型。 */
export type ThreadsAccountInput = z.infer<typeof ThreadsAccountInput>;

/** 運用アカウントを消す入力（消すアカウントの名前をそのまま入れて確かめる。threads-012。めぐるの account-service.ts）。 */
export const ThreadsAccountDeleteInput = z.strictObject({
  confirmName: z
    .string({ error: "消すアカウントの名前を入れてください。" })
    .min(1, { error: "消すアカウントの名前を入れてください。" })
    .max(THREADS_ACCOUNT_NAME_MAX * 2, {
      error: "入れた名前がアカウントの名前と違います。",
    }),
});

/** 運用アカウントを消す入力の型。 */
export type ThreadsAccountDeleteInput = z.infer<typeof ThreadsAccountDeleteInput>;

/**
 * 消す前に入れた名前が、アカウントの名前と同じか（前後の空白は除いて比べる。API と画面で同じ比べ方）。
 * @param input 入れた名前
 * @param name アカウントの名前
 * @returns 同じなら true
 */
export function confirmNameMatches(input: string, name: string): boolean {
  return input.trim() === name.trim();
}

/** 投稿の案の状態ごとの数（承認済みは投稿中を含む）。 */
export const DraftCounts = z.object({
  needsReview: z.number().int(),
  approved: z.number().int(),
  rejected: z.number().int(),
  /** 投稿済み（threads-002） */
  published: z.number().int(),
  /** 投稿に失敗（threads-002） */
  publishFailed: z.number().int(),
});

/** 投稿の案の状態ごとの数の型。 */
export type DraftCounts = z.infer<typeof DraftCounts>;

/** 運用アカウント。 */
export const ThreadsAccount = z.object({
  id: z.guid(),
  name: z.string(),
  counts: DraftCounts,
  /** Threads への接続の状態（threads-012。アカウントの切り替えと一覧に出す） */
  connectionStatus: z.enum(CONNECTION_STATUSES),
  /** Threads のユーザー名（@ なし。未接続は null） */
  username: z.string().nullable(),
  /** Threads の表示名（未接続・読めていなければ null） */
  displayName: z.string().nullable(),
  /** Threads のプロフィールの画像の URL（読めていなければ null） */
  profilePictureUrl: z.string().nullable(),
  /** 最後に開いた日時（まだなら null） */
  lastOpenedAt: DateTime.nullable(),
  createdAt: DateTime,
  updatedAt: DateTime,
});

/** 運用アカウントの型。 */
export type ThreadsAccount = z.infer<typeof ThreadsAccount>;

/** 担当している運用アカウント（持ち主の表示名と組織の名前つき。threads-013）。 */
export const ThreadsAssignedAccount = ThreadsAccount.extend({
  ownerName: z.string(),
  organizationName: z.string(),
});

/** 担当している運用アカウントの型。 */
export type ThreadsAssignedAccount = z.infer<typeof ThreadsAssignedAccount>;

/** 運用アカウントの一覧。 */
export const ThreadsAccountList = z.object({
  accounts: z.array(ThreadsAccount),
  /** 担当している運用アカウント（ほかの人のもの。上限に数えない。threads-013） */
  assigned: z.array(ThreadsAssignedAccount).optional(),
  /** 持てる数の上限 */
  limit: z.number().int(),
});

/** 運用アカウントの一覧の型。 */
export type ThreadsAccountList = z.infer<typeof ThreadsAccountList>;

/** 戦略のテキストの欄の形（空は ""）。 */
const strategyText = z.string({ error: "文字で入れてください。" }).max(STRATEGY_TEXT_MAX, {
  error: `${STRATEGY_TEXT_MAX.toLocaleString("ja-JP")}文字までにしてください。`,
});

/** 戦略のテキストの欄の形の一覧。 */
const strategyTextShape = Object.fromEntries(
  STRATEGY_TEXT_KEYS.map((key) => [key, strategyText]),
) as Record<StrategyTextKey, typeof strategyText>;

/** 口調の形。 */
export const TonePresetSchema = z.enum(TONE_PRESET_VALUES, {
  error: "口調は、選択肢から選んでください。",
});

/**
 * 戦略を保存する入力（全部を置きかえる）。version は読んだときの版（まだ保存していなければ 0）。
 * 前の保存のあとにほかの画面で保存されていれば、版が合わずに断る。
 */
export const StrategyInput = z.strictObject({
  ...strategyTextShape,
  tonePreset: TonePresetSchema.nullable(),
  version: z.number().int().min(0),
});

/** 戦略を保存する入力の型。 */
export type StrategyInput = z.infer<typeof StrategyInput>;

/** 戦略。 */
export const Strategy = z.object({
  ...strategyTextShape,
  tonePreset: TonePresetSchema.nullable(),
  /** 版（まだ保存していなければ 0） */
  version: z.number().int(),
  /** 数える項目のうち、入れた数 */
  filledCount: z.number().int(),
  /** 数える項目の数 */
  total: z.number().int(),
  /** 最後に保存した日時（まだなら null） */
  updatedAt: DateTime.nullable(),
});

/** 戦略の型。 */
export type Strategy = z.infer<typeof Strategy>;

/** 1投稿の文字数の目標と、短文・中文・長文の文字数と割合（めぐる 014 FR-140）。 */
export const PostLengthSettings = z
  .strictObject({
    target: z
      .number({ error: "数で入れてください。" })
      .int({ error: "整数で入れてください。" })
      .min(POST_LENGTH_TARGET_MIN, { error: `${POST_LENGTH_TARGET_MIN}以上にしてください。` })
      .max(POST_LENGTH_TARGET_MAX, { error: `${POST_LENGTH_TARGET_MAX}以下にしてください。` })
      .multipleOf(POST_LENGTH_TARGET_STEP, {
        error: `${POST_LENGTH_TARGET_STEP}きざみにしてください。`,
      }),
    shortLength: kindLength(),
    mediumLength: kindLength(),
    longLength: kindLength(),
    shortRatio: kindRatio(),
    mediumRatio: kindRatio(),
    longRatio: kindRatio(),
  })
  .superRefine((value, ctx) => {
    if (value.shortRatio + value.mediumRatio + value.longRatio !== 100) {
      ctx.addIssue({
        code: "custom",
        path: ["longRatio"],
        message: "短文・中文・長文の割合は、合わせて100にしてください。",
      });
    }
    for (const key of ["shortLength", "mediumLength", "longLength"] as const) {
      if (value[key] > value.target) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "文字数は、1投稿の文字数の目標以下にしてください。",
        });
      }
    }
  });

/** 1投稿の文字数の設定の型。 */
export type PostLengthSettings = z.infer<typeof PostLengthSettings>;

/**
 * 短文・中文・長文の文字数の形。
 * @returns zod の形
 */
function kindLength() {
  return z
    .number({ error: "数で入れてください。" })
    .int({ error: "整数で入れてください。" })
    .min(POST_KIND_LENGTH_MIN, { error: `${POST_KIND_LENGTH_MIN}以上にしてください。` })
    .max(POST_KIND_LENGTH_MAX, { error: `${POST_KIND_LENGTH_MAX}以下にしてください。` })
    .multipleOf(POST_KIND_LENGTH_STEP, { error: `${POST_KIND_LENGTH_STEP}きざみにしてください。` });
}

/**
 * 短文・中文・長文の割合の形。
 * @returns zod の形
 */
function kindRatio() {
  return z
    .number({ error: "数で入れてください。" })
    .int({ error: "整数で入れてください。" })
    .min(0, { error: "0以上にしてください。" })
    .max(100, { error: "100以下にしてください。" })
    .multipleOf(POST_KIND_RATIO_STEP, { error: `${POST_KIND_RATIO_STEP}きざみにしてください。` });
}

/** プロンプトの設定（作る件数と文字数）。 */
export const PromptSettings = z.strictObject({
  count: z
    .number({ error: "数で入れてください。" })
    .int({ error: "整数で入れてください。" })
    .min(PROMPT_COUNT_MIN, { error: `${PROMPT_COUNT_MIN}件以上にしてください。` })
    .max(PROMPT_COUNT_MAX, { error: `${PROMPT_COUNT_MAX}件以下にしてください。` }),
  length: PostLengthSettings,
});

/** プロンプトの設定の型。 */
export type PromptSettings = z.infer<typeof PromptSettings>;

/** プロンプトに実際に入れたものの要約（めぐるの promptSummarySchema と同じ欄）。 */
export const PromptSummary = z.object({
  strategyFilledCount: z.number().int(),
  promotionCount: z.number().int(),
  referencePostCount: z.number().int(),
  recentDraftCount: z.number().int(),
  length: z.number().int(),
  /** 入れた投稿のルールの行数（規約のルールは数えない） */
  coreRuleCount: z.number().int(),
  /** 入れた NG ワードの数 */
  ngWordCount: z.number().int(),
  /** 入れた却下の案の数 */
  rejectedCount: z.number().int(),
  /** 投稿の時間枠の数 */
  dailyPostCount: z.number().int(),
  /** 入れた低調の投稿の数 */
  poorPostCount: z.number().int(),
  /** 入れた伸びた傾向の数 */
  trendCount: z.number().int(),
});

/** プロンプトに入れたものの要約の型。 */
export type PromptSummary = z.infer<typeof PromptSummary>;

/** 作ったプロンプト。 */
export const GeneratedPrompt = z.object({
  /** プロンプトの全文 */
  prompt: z.string(),
  /** 長いときに2回に分けて貼る文（長くなければ1つ） */
  parts: z.array(z.string()),
  /** 入れたものの要約 */
  summary: PromptSummary,
  /** 作る件数 */
  count: z.number().int(),
});

/** 作ったプロンプトの型。 */
export type GeneratedPrompt = z.infer<typeof GeneratedPrompt>;

/** 投稿のルールを保存する入力。 */
export const CoreRulesInput = z.strictObject({
  coreRules: z.string({ error: "文字で入れてください。" }).max(CORE_RULES_MAX, {
    error: `投稿のルールは${CORE_RULES_MAX.toLocaleString("ja-JP")}文字までにしてください。`,
  }),
});

/** 投稿のルールを保存する入力の型。 */
export type CoreRulesInput = z.infer<typeof CoreRulesInput>;

/** NG ワードを足す入力（まとめて。threads-011。画面は改行・「、」で区切った語を送る）。 */
export const NgWordsInput = z.strictObject({
  words: z
    .array(
      z
        .string({ error: "NGワードを入れてください。" })
        .trim()
        .min(1, { error: "NGワードを入れてください。" })
        .max(NG_WORD_MAX, { error: `NGワードは1語${NG_WORD_MAX}文字までにしてください。` }),
    )
    .min(1, { error: "NGワードを入れてください。" })
    .max(NG_WORD_LIMIT, { error: `NGワードは${NG_WORD_LIMIT}語までです。` }),
});

/** NG ワードを足す入力の型。 */
export type NgWordsInput = z.infer<typeof NgWordsInput>;

/** NG ワード。 */
export const NgWord = z.object({ id: z.guid(), word: z.string() });

/** NG ワードの型。 */
export type NgWord = z.infer<typeof NgWord>;

/** NG ワードを足した結果。 */
export const NgWordsResult = z.object({
  /** 足した語（入れた順） */
  added: z.array(NgWord),
  /** もうあったので足さなかった語（入れたまま） */
  duplicates: z.array(z.string()),
  /** 足した語を含むため、承認待ちに戻した承認済みの案の数 */
  reopenedCount: z.number().int(),
});

/** NG ワードを足した結果の型。 */
export type NgWordsResult = z.infer<typeof NgWordsResult>;

/** 投稿のルールと NG ワード。 */
export const PostingRules = z.object({
  coreRules: z.string(),
  /** 足した古い順 */
  ngWords: z.array(NgWord),
});

/** 投稿のルールと NG ワードの型。 */
export type PostingRules = z.infer<typeof PostingRules>;

/** 投稿の案の状態（DB の CHECK と同じ並び。投稿中・投稿済み・投稿に失敗は threads-002 で足した）。 */
export const DRAFT_STATUSES = [
  "needs_review",
  "approved",
  "rejected",
  "publishing",
  "published",
  "publish_failed",
] as const;

/** 投稿の案の状態の型。 */
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** 投稿の案の状態の見える名前。 */
export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  needs_review: "承認待ち",
  approved: "承認済み",
  rejected: "却下",
  publishing: "投稿中",
  published: "投稿済み",
  publish_failed: "投稿に失敗",
};

/** 一覧で選べる状態（並びの順。承認済みは投稿中を含み、投稿の順に並ぶ）。 */
export const DRAFT_LIST_STATUSES = [
  "needs_review",
  "approved",
  "published",
  "publish_failed",
  "rejected",
] as const;

/** 一覧で選べる状態の型。 */
export type DraftListStatus = (typeof DRAFT_LIST_STATUSES)[number];

/** 投稿に失敗した理由。 */
export const PUBLISH_ERRORS = [
  "network",
  "threads_server",
  "invalid_request",
  "container_error",
  "unknown",
] as const;

/** 投稿に失敗した理由の型。 */
export type PublishError = (typeof PUBLISH_ERRORS)[number];

/** 投稿に失敗した理由の見える名前。 */
export const PUBLISH_ERROR_LABELS: Record<PublishError, string> = {
  network: "通信の失敗",
  threads_server: "Threads 側の一時的な失敗",
  invalid_request: "Threads が投稿を受け付けなかった",
  container_error: "Threads での投稿の準備の失敗",
  unknown: "わからない失敗",
};

/** 投稿の直前の確かめで承認待ちに戻した理由。 */
export const BLOCKED_REASONS = ["ng_word", "over_threads_limit"] as const;

/** 投稿の直前の確かめで承認待ちに戻した理由の型。 */
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

/** 投稿の案。 */
export const PostDraft = z.object({
  id: z.guid(),
  batchId: z.guid(),
  position: z.number().int(),
  body: z.string(),
  status: z.enum(DRAFT_STATUSES),
  /** 版（直す・承認するときに送り返す） */
  version: z.number().int(),
  /** 承認・却下した日時（承認待ちは null） */
  reviewedAt: DateTime.nullable(),
  /** 却下の理由（却下のときだけ） */
  rejectReasons: z.array(z.enum(REJECT_REASON_CODES)).nullable(),
  /** 却下のメモ（却下のときだけ） */
  rejectNote: z.string().nullable(),
  /** 「次に投稿する」を付けた日時（承認済みのときだけ） */
  prioritizedAt: DateTime.nullable(),
  /** 前の時刻から持ち越した（承認済みのときだけ） */
  carryover: z.boolean(),
  /** 投稿した日時（投稿済みのときだけ） */
  publishedAt: DateTime.nullable(),
  /** Threads の投稿の URL（投稿済みで、取れたときだけ） */
  threadsPermalink: z.string().nullable(),
  /** 投稿に失敗した日時と理由（投稿に失敗のときだけ） */
  publishFailedAt: DateTime.nullable(),
  publishError: z.enum(PUBLISH_ERRORS).nullable(),
  /** 投稿の直前の確かめで承認待ちに戻した理由と、当たった NG ワード（承認待ちのときだけ） */
  blockedReason: z.enum(BLOCKED_REASONS).nullable(),
  blockedWords: z.array(z.string()).nullable(),
  /** 時間差のメンション（threads-007。付けていなければ null） */
  mention: PostMention.nullable(),
  /** ためたあとに人が本文を直した日時（threads-011。直していなければ null） */
  editedAt: DateTime.nullable(),
  /** 作った人・最後に直した人の表示名（threads-013。組織に入っている運用アカウントの一覧だけ。前の行は null） */
  createdByName: z.string().nullable().optional(),
  updatedByName: z.string().nullable().optional(),
  createdAt: DateTime,
  updatedAt: DateTime,
});

/** 投稿の案の型。 */
export type PostDraft = z.infer<typeof PostDraft>;

/** 投稿の案の一覧の問い合わせ。 */
export const DraftListQuery = z.object({
  status: z.enum(DRAFT_LIST_STATUSES, { error: "状態は、選択肢から選んでください。" }),
  /** 投稿済みの続きを読むときの、前の応答の nextCursor（threads-011） */
  before: z.string().max(200).optional(),
});

/** 投稿の案の一覧の問い合わせの型。 */
export type DraftListQuery = z.infer<typeof DraftListQuery>;

/** 投稿の案の一覧。 */
export const DraftList = z.object({
  /** 承認待ちはためた新しいまとまりが先（まとまりの中は貼った順）、承認済みは投稿の順（投稿中が先）、投稿済み・投稿に失敗・却下は新しい順 */
  drafts: z.array(PostDraft),
  /** 承認済みの案の ID から、投稿の予定の時刻へ（自動投稿がオフ・止まっているときと、承認済みでない一覧は空） */
  schedule: z.record(z.string(), DateTime),
  /** 似ている度合いを比べる相手（同じアカウントの承認待ち・承認済み〈投稿中を含む〉・却下〈新しい500件〉の案。状態にかかわらず同じ） */
  compareWith: z.array(
    z.object({ id: z.guid(), body: z.string(), status: z.enum(DRAFT_STATUSES) }),
  ),
  /** 投稿済みの続きを読むときに before に渡す値（続きがない・投稿済みでない一覧は null。threads-011） */
  nextCursor: z.string().nullable(),
});

/** 投稿の案の一覧の型。 */
export type DraftList = z.infer<typeof DraftList>;

/** 外の AI の答えを貼って、案をまとめてためる入力。 */
export const DraftBatchInput = z.strictObject({
  /** 送るたびに画面が作る ID（送り直しでは同じ値。二重にためない） */
  clientRequestId: z.guid({ error: "形が合いません。" }),
  text: z
    .string({ error: "貼り付ける文を入れてください。" })
    .max(PASTE_MAX_CHARS, {
      error: `1回に貼れるのは${PASTE_MAX_CHARS.toLocaleString("ja-JP")}文字までです。`,
    })
    .refine((text) => text.trim() !== "", { error: "貼り付ける文を入れてください。" }),
});

/** 案をまとめてためる入力の型。 */
export type DraftBatchInput = z.infer<typeof DraftBatchInput>;

/** 案をまとめてためた結果。 */
export const DraftBatchResult = z.object({
  batchId: z.guid(),
  /** ためた件数（threads-011） */
  draftCount: z.number().int(),
  /** 区切り（@@@）が見つかったか（なければ全体を1件にした） */
  delimiterFound: z.boolean(),
  /** そのうち Threads の上限を超える件数（threads-011） */
  overLimitCount: z.number().int(),
  /** ためた案（送り直しでは、まだ承認待ちのものだけ） */
  drafts: z.array(PostDraft),
});

/** 案をまとめてためた結果の型。 */
export type DraftBatchResult = z.infer<typeof DraftBatchResult>;

/** 投稿の案の本文を直す入力。 */
export const DraftUpdateInput = z.strictObject({
  body: z
    .string({ error: "本文を入れてください。" })
    .trim()
    .min(1, { error: "本文を入れてください。" })
    .max(DRAFT_BODY_MAX, {
      error: `本文は${DRAFT_BODY_MAX.toLocaleString("ja-JP")}文字までにしてください。`,
    }),
  version: z.number().int().min(1),
});

/** 投稿の案の本文を直す入力の型。 */
export type DraftUpdateInput = z.infer<typeof DraftUpdateInput>;

/** 承認・却下・承認待ちに戻す操作。 */
export const REVIEW_ACTIONS = ["approve", "reject", "reopen"] as const;

/** 承認・却下の入力。 */
export const ReviewInput = z
  .strictObject({
    action: z.enum(REVIEW_ACTIONS, { error: "操作は、選択肢から選んでください。" }),
    /**
     * 操作ごとに画面が作る ID（threads-011。送り直しでは同じ値）。同じ ID の送り直しで、もうその操作で変わった案は
     * 変えたものとして返す（二重に記録しない）。省略すると送り直しを見分けない
     */
    requestId: z.guid({ error: "形が合いません。" }).optional(),
    /** 規約に注意の案を、確かめたうえで承認する（承認のときだけ。threads-011） */
    confirmPolicyCaution: z.boolean().optional(),
    items: z
      .array(z.strictObject({ id: z.guid(), version: z.number().int().min(1) }))
      .min(1, { error: "案を選んでください。" })
      .max(REVIEW_MAX_ITEMS, { error: `一度に選べるのは${REVIEW_MAX_ITEMS}件までです。` }),
    /** 却下の理由（却下のときだけ） */
    reasons: z.array(z.enum(REJECT_REASON_CODES)).optional(),
    /** 却下のメモ（却下のときだけ） */
    note: z
      .string()
      .trim()
      .max(REJECT_NOTE_MAX, { error: `メモは${REJECT_NOTE_MAX}文字までにしてください。` })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action !== "reject") return;
    if ((value.reasons?.length ?? 0) === 0 && !value.note) {
      ctx.addIssue({
        code: "custom",
        path: ["reasons"],
        message: "却下の理由を選ぶか、メモを書いてください。",
      });
    }
  });

/** 承認・却下の入力の型。 */
export type ReviewInput = z.infer<typeof ReviewInput>;

/** 承認・却下で、状態を変えなかった案と理由（threads-011）。 */
export const ReviewSkipped = z.object({ id: z.guid(), reason: z.enum(REVIEW_SKIP_REASONS) });

/** 状態を変えなかった案の型。 */
export type ReviewSkipped = z.infer<typeof ReviewSkipped>;

/**
 * 承認・却下の結果（threads-011：まとめての操作は1件ずつ確かめ、できるものだけ変える）。
 * drafts は変えた案（同じ requestId の送り直しで、もう変わっていた案を含む）。skipped は変えなかった案と理由。counts は変えたあとの数。
 */
export const ReviewResult = z.object({
  drafts: z.array(PostDraft),
  skipped: z.array(ReviewSkipped),
  counts: DraftCounts,
});

/** 承認・却下の結果の型。 */
export type ReviewResult = z.infer<typeof ReviewResult>;

/** 案をまとめて消す入力（threads-011。承認待ちと却下だけを消し、ほかの ID は無視する）。 */
export const DraftDeleteInput = z.strictObject({
  ids: z
    .array(z.guid())
    .min(1, { error: "案を選んでください。" })
    .max(REVIEW_MAX_ITEMS, { error: `一度に選べるのは${REVIEW_MAX_ITEMS}件までです。` }),
});

/** 案をまとめて消す入力の型。 */
export type DraftDeleteInput = z.infer<typeof DraftDeleteInput>;

/** 消した数（まとめて消す・ためたのを取り消す）。 */
export const DeletedCount = z.object({ deletedCount: z.number().int() });

/** 消した数の型。 */
export type DeletedCount = z.infer<typeof DeletedCount>;

/** 選んだ承認待ちの案に、「いつも付ける」の人で時間差のメンションをまとめて付ける入力（threads-011。めぐるの POST …/post-drafts/mentions）。 */
export const MentionBulkInput = z.strictObject({
  items: z
    .array(z.strictObject({ id: z.guid(), version: z.number().int().min(1) }))
    .min(1, { error: "案を選んでください。" })
    .max(REVIEW_MAX_ITEMS, { error: `一度に選べるのは${REVIEW_MAX_ITEMS}件までです。` }),
});

/** まとめて付ける入力の型。 */
export type MentionBulkInput = z.infer<typeof MentionBulkInput>;

/** まとめて付けられなかった理由（ない・承認待ちでないか版が合わない・付けられる「いつも付ける」の人がいない）。 */
export const MENTION_BULK_SKIP_REASONS = ["NOT_FOUND", "STALE", "NO_PEOPLE"] as const;

/** まとめて付けた結果。 */
export const MentionBulkResult = z.object({
  /** 付けた案 */
  drafts: z.array(PostDraft),
  skipped: z.array(z.object({ id: z.guid(), reason: z.enum(MENTION_BULK_SKIP_REASONS) })),
});

/** まとめて付けた結果の型。 */
export type MentionBulkResult = z.infer<typeof MentionBulkResult>;
