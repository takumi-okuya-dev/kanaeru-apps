// Threads の運用（threads）の領域の表（docs/apps/threads.md）。表はどれも threads の領域だけが持つ（AD-3）。
// 表の名前は threads_ で始める（AD-15）。主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。
// 最上位の記録（threads_account）が持ち主の account_id を持ち、権限はそこから決める（AD-19）。持ち主だけが書く記録なので、
// アカウントを消すと一緒に消える（ON DELETE CASCADE。AD-7）。下の表は運用アカウントと一緒に消える。
// めぐるの threads スキーマの accounts・strategy_designs・draft_batches・post_drafts・ng_words を写した
// （threads-001 の範囲の列から始め、threads-002 で Threads への接続と自動投稿の列と表を足した。足すだけで、前の版のアプリでも壊れない）。
// 選択肢は text と CHECK（Consistency Conventions「選択肢」）。CHECK の値は約束（@workspace/contracts/threads）と同じ並びを
// 文字で書く（sql.raw は使わない）。食い違いは threads.test.ts が見張る。
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  POST_LENGTH_DEFAULTS,
  PROMOTION_RATIO_DEFAULT,
  PROMPT_COUNT_DEFAULT,
} from "@workspace/contracts/threads";
import type { PromotionEvent } from "@workspace/contracts/threads";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";
import { accountTable } from "../account/index.ts";
import { organizationMemberTable, teamMemberTable, teamTable } from "../suite/index.ts";

/** バイトの列（包んだトークン。Postgres の bytea）。 */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/** 運用アカウント（運用する Threads のアカウント1つ分）。名前だけで作れ、Threads への接続はあとで足す。 */
export const threadsAccount = pgTable(
  "threads_account",
  {
    id: primaryId(),
    /** 持ち主（kanaeru のアカウント） */
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** アカウントの名前（前後の空白を除いて1〜50文字） */
    name: text("name").notNull(),
    /** プロンプトで作る件数 */
    promptPostCount: smallint("prompt_post_count").notNull().default(PROMPT_COUNT_DEFAULT),
    /** 1投稿の文字数の目標と、短文・中文・長文の文字数と割合 */
    postLengthTarget: smallint("post_length_target").notNull().default(POST_LENGTH_DEFAULTS.target),
    shortLength: smallint("short_length").notNull().default(POST_LENGTH_DEFAULTS.shortLength),
    mediumLength: smallint("medium_length").notNull().default(POST_LENGTH_DEFAULTS.mediumLength),
    longLength: smallint("long_length").notNull().default(POST_LENGTH_DEFAULTS.longLength),
    shortRatio: smallint("short_ratio").notNull().default(POST_LENGTH_DEFAULTS.shortRatio),
    mediumRatio: smallint("medium_ratio").notNull().default(POST_LENGTH_DEFAULTS.mediumRatio),
    longRatio: smallint("long_ratio").notNull().default(POST_LENGTH_DEFAULTS.longRatio),
    /** 投稿のルール（1行に1つ。プロンプトに入れる） */
    coreRules: text("core_rules").notNull().default(""),
    /** Threads への接続の状態（threads-002）。未接続の間は Threads のユーザーとユーザー名が null */
    connectionStatus: text("connection_status", {
      enum: ["not_connected", "connected", "needs_reconnect"],
    })
      .notNull()
      .default("not_connected"),
    /** Threads のユーザー ID（kanaeru の中で1つの運用アカウントにだけつなげる。PRD B8） */
    threadsUserId: text("threads_user_id"),
    /** Threads のユーザー名（@ なし）と表示名 */
    username: text("username"),
    displayName: text("display_name"),
    /** 接続の世代（接続し直し・トークンの延長・切断で1つ増える。書きこみの条件にして、その間の接続の変化を上書きしない） */
    connectionGeneration: bigint("connection_generation", { mode: "number" }).notNull().default(0),
    /** 接続し直しが要る理由の補い（short_lived_token だけ） */
    reconnectHint: text("reconnect_hint"),
    /** 反応を読む権限・返信の権限がないと分かった日時（つなぎ直すと消す） */
    insightsDeniedAt: timestamptz("insights_denied_at"),
    repliesDeniedAt: timestamptz("replies_denied_at"),
    /** 宣伝の投稿の割合（％。threads-004） */
    promotionRatioPercent: smallint("promotion_ratio_percent")
      .notNull()
      .default(PROMOTION_RATIO_DEFAULT),
    /** Threads のプロフィールの画像の URL（つないだとき・開いたときに読み直す。threads-012） */
    profilePictureUrl: text("profile_picture_url"),
    /** 最後に開いた日時（/threads で最後に使った運用アカウントへ移るのに使う。threads-012） */
    lastOpenedAt: timestamptz("last_opened_at"),
    /** プロンプトの材料（宣伝・リサーチ・投稿のルール）を最後に変えた日時（消したときも含む。threads-012） */
    promotionsChangedAt: timestamptz("promotions_changed_at"),
    researchChangedAt: timestamptz("research_changed_at"),
    coreRulesChangedAt: timestamptz("core_rules_changed_at"),
    /** 持ち主の退会で、組織の管理者が引き継いだ日時と、前の持ち主の表示名（新しい持ち主に1回だけ知らせ、知らせたら名前を消す。threads-013） */
    handedOverAt: timestamptz("handed_over_at"),
    handoverFromName: text("handover_from_name"),
    ...timestamps(),
  },
  (table) => [
    index("threads_account_account_id_idx").on(table.accountId),
    uniqueIndex("threads_account_threads_user_id_unique").on(table.threadsUserId),
    check(
      "threads_account_connection_status_check",
      sql`${table.connectionStatus} in ('not_connected', 'connected', 'needs_reconnect')`,
    ),
    check(
      "threads_account_connection_consistency",
      sql`(${table.connectionStatus} = 'not_connected' AND ${table.threadsUserId} IS NULL AND ${table.username} IS NULL)
        OR (${table.connectionStatus} <> 'not_connected' AND ${table.threadsUserId} IS NOT NULL AND ${table.username} IS NOT NULL)`,
    ),
    check(
      "threads_account_promotion_ratio_range",
      sql`${table.promotionRatioPercent} BETWEEN 0 AND 100`,
    ),
    check(
      "threads_account_reconnect_hint_check",
      sql`${table.reconnectHint} IS NULL OR ${table.reconnectHint} = 'short_lived_token'`,
    ),
    check("threads_account_name_length", sql`char_length(${table.name}) BETWEEN 1 AND 50`),
    check(
      "threads_account_prompt_post_count_range",
      sql`${table.promptPostCount} BETWEEN 1 AND 50`,
    ),
    check("threads_account_core_rules_length", sql`char_length(${table.coreRules}) <= 2000`),
    check(
      "threads_account_post_length_target_range",
      sql`${table.postLengthTarget} BETWEEN 50 AND 500`,
    ),
    check(
      "threads_account_post_kind_length_range",
      sql`${table.shortLength} BETWEEN 10 AND ${table.postLengthTarget} AND ${table.mediumLength} BETWEEN 10 AND ${table.postLengthTarget} AND ${table.longLength} BETWEEN 10 AND ${table.postLengthTarget}`,
    ),
    check(
      "threads_account_post_kind_ratio_range",
      sql`${table.shortRatio} BETWEEN 0 AND 100 AND ${table.mediumRatio} BETWEEN 0 AND 100 AND ${table.longRatio} BETWEEN 0 AND 100 AND ${table.shortRatio} + ${table.mediumRatio} + ${table.longRatio} = 100`,
    ),
  ],
);

/**
 * 戦略（運用アカウントと1対1。最初の保存で作る）。テキストの欄は空を ""（入れていない）で持つ。
 * 版（version）は保存のたびに1つ増え、ほかの画面の保存を上書きしないために使う。
 */
export const threadsStrategy = pgTable(
  "threads_strategy",
  {
    threadsAccountId: uuid("threads_account_id")
      .primaryKey()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    purposeOrigin: text("purpose_origin").notNull().default(""),
    purposeSelf: text("purpose_self").notNull().default(""),
    purposeOthers: text("purpose_others").notNull().default(""),
    purposeFuture: text("purpose_future").notNull().default(""),
    purposeStance: text("purpose_stance").notNull().default(""),
    activityAxis: text("activity_axis").notNull().default(""),
    finalAction: text("final_action").notNull().default(""),
    targetPersona: text("target_persona").notNull().default(""),
    realWorries: text("real_worries").notNull().default(""),
    desiredSelfImage: text("desired_self_image").notNull().default(""),
    perceivedImage: text("perceived_image").notNull().default(""),
    contentThemeMix: text("content_theme_mix").notNull().default(""),
    antiPersona: text("anti_persona").notNull().default(""),
    benchmarkAccounts: text("benchmark_accounts").notNull().default(""),
    funnelDesign: text("funnel_design").notNull().default(""),
    postGenres: text("post_genres").notNull().default(""),
    dmReplyTemplate: text("dm_reply_template").notNull().default(""),
    inquiryQualityTips: text("inquiry_quality_tips").notNull().default(""),
    toneNotes: text("tone_notes").notNull().default(""),
    differentiation: text("differentiation").notNull().default(""),
    successMetrics: text("success_metrics").notNull().default(""),
    profileBioDraft: text("profile_bio_draft").notNull().default(""),
    pinnedPostDraft1: text("pinned_post_draft_1").notNull().default(""),
    pinnedPostDraft2: text("pinned_post_draft_2").notNull().default(""),
    pinnedPostDraft3: text("pinned_post_draft_3").notNull().default(""),
    /** 口調（選んでいなければ null） */
    tonePreset: text("tone_preset"),
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    check(
      "threads_strategy_tone_preset_check",
      sql`${table.tonePreset} in ('energetic_casual', 'polite_warm', 'formal', 'casual_frank', 'introspective_calm', 'passionate', 'humorous')`,
    ),
  ],
);

/** 外の AI の答えを1回貼ってためた、投稿の案のまとまり。同じ送り直し（clientRequestId）は1つだけ。 */
export const threadsDraftBatch = pgTable(
  "threads_draft_batch",
  {
    id: primaryId(),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    /** 画面が送るたびに作る ID（送り直しでは同じ値） */
    clientRequestId: uuid("client_request_id").notNull(),
    draftCount: smallint("draft_count").notNull(),
    /** 区切り（@@@）が見つかったか */
    delimiterFound: boolean("delimiter_found").notNull(),
    /** ためたときのプロンプトの材料の版（戦略を保存した日時と、宣伝・リサーチ・投稿のルールを変えた日時。前のまとまりは null。threads-012） */
    strategyUpdatedAt: timestamptz("strategy_updated_at"),
    promotionsChangedAt: timestamptz("promotions_changed_at"),
    researchChangedAt: timestamptz("research_changed_at"),
    coreRulesChangedAt: timestamptz("core_rules_changed_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("threads_draft_batch_threads_account_id_client_request_id_unique").on(
      table.threadsAccountId,
      table.clientRequestId,
    ),
    check("threads_draft_batch_draft_count_range", sql`${table.draftCount} BETWEEN 1 AND 50`),
  ],
);

/**
 * 投稿の案。状態は承認待ち（needs_review）・承認済み（approved）・却下（rejected）。
 * 承認・却下した日時と却下の理由は、状態と食い違わないよう CHECK で縛る（めぐるの post_drafts_review_state を写した）。
 */
export const threadsPostDraft = pgTable(
  "threads_post_draft",
  {
    id: primaryId(),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => threadsDraftBatch.id, { onDelete: "cascade" }),
    /** まとまりの中での順番（貼った文の順。0 から） */
    position: smallint("position").notNull(),
    /** 本文（ログに出さない） */
    body: text("body").notNull(),
    status: text("status", {
      enum: ["needs_review", "approved", "rejected", "publishing", "published", "publish_failed"],
    })
      .notNull()
      .default("needs_review"),
    version: integer("version").notNull().default(1),
    reviewedAt: timestamptz("reviewed_at"),
    rejectReasons: text("reject_reasons").array(),
    rejectNote: text("reject_note"),
    /** 「次に投稿する」を付けた日時（threads-002。承認済みのときだけ） */
    prioritizedAt: timestamptz("prioritized_at"),
    /** 持ち越した試み（次の時刻に1回だけもう一度試す。承認済みのときだけ） */
    carryoverAttemptId: uuid("carryover_attempt_id").references(
      (): AnyPgColumn => threadsPublishAttempt.id,
      { onDelete: "set null" },
    ),
    /** 投稿した日時と Threads の投稿の ID・URL（投稿済みのときだけ） */
    publishedAt: timestamptz("published_at"),
    threadsMediaId: text("threads_media_id"),
    threadsPermalink: text("threads_permalink"),
    /** 投稿の URL の取り直しに最後に失敗した日時（失敗し続ける投稿を後回しにする） */
    permalinkCheckedAt: timestamptz("permalink_checked_at"),
    /** 投稿に失敗した日時と理由 */
    publishFailedAt: timestamptz("publish_failed_at"),
    publishError: text("publish_error"),
    /** 投稿した時点の時刻（0時からの分）・持ち越しか・次に投稿するを付けていたか（反応の分析に使う） */
    publishedSlotMinute: smallint("published_slot_minute"),
    publishedCarryover: boolean("published_carryover"),
    publishedPrioritized: boolean("published_prioritized"),
    /** 投稿の直前の確かめで承認待ちに戻した日時・理由・当たった NG ワード */
    blockedAt: timestamptz("blocked_at"),
    blockedReason: text("blocked_reason"),
    blockedWords: text("blocked_words").array(),
    /** 最後に状態を変えた承認・却下の操作の ID（threads-011。同じ操作の送り直しを見分ける。直す・戻すで消す） */
    lastReviewRequestId: uuid("last_review_request_id"),
    /** ためたあとに人が本文を直した日時（threads-011。前後の空白だけの違いは直したことにしない） */
    bodyEditedAt: timestamptz("body_edited_at"),
    /** 誰がしたか（threads-013。作った人・最後に直した人・承認／却下した人。退会した人は null。今ある行は null） */
    createdByAccountId: uuid("created_by_account_id").references(() => accountTable.id, {
      onDelete: "set null",
    }),
    updatedByAccountId: uuid("updated_by_account_id").references(() => accountTable.id, {
      onDelete: "set null",
    }),
    reviewedByAccountId: uuid("reviewed_by_account_id").references(() => accountTable.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("threads_post_draft_batch_id_position_unique").on(table.batchId, table.position),
    index("threads_post_draft_threads_account_id_status_idx").on(
      table.threadsAccountId,
      table.status,
      table.reviewedAt.desc(),
    ),
    check(
      "threads_post_draft_position_range",
      sql`${table.position} >= 0 AND ${table.position} < 50`,
    ),
    check("threads_post_draft_body_length", sql`char_length(${table.body}) BETWEEN 1 AND 2000`),
    check("threads_post_draft_reject_note_length", sql`char_length(${table.rejectNote}) <= 200`),
    // 投稿の順（threads-002）と、投稿済みの一覧（新しい順）
    index("threads_post_draft_queue_idx").on(
      table.threadsAccountId,
      table.status,
      table.prioritizedAt.desc().nullsLast(),
      table.reviewedAt,
      table.id,
    ),
    index("threads_post_draft_published_idx").on(
      table.threadsAccountId,
      table.status,
      table.publishedAt.desc(),
      table.id,
    ),
    check(
      "threads_post_draft_status_check_v2",
      sql`${table.status} in ('needs_review', 'approved', 'rejected', 'publishing', 'published', 'publish_failed')`,
    ),
    check(
      "threads_post_draft_publish_error_check",
      sql`${table.publishError} IS NULL OR ${table.publishError} in ('network', 'threads_server', 'invalid_request', 'container_error', 'unknown')`,
    ),
    check(
      "threads_post_draft_blocked_reason_check",
      sql`${table.blockedReason} IS NULL OR ${table.blockedReason} in ('ng_word', 'over_threads_limit')`,
    ),
    check(
      "threads_post_draft_blocked_state",
      sql`(${table.blockedAt} IS NULL AND ${table.blockedReason} IS NULL AND ${table.blockedWords} IS NULL)
        OR (${table.status} = 'needs_review' AND ${table.blockedAt} IS NOT NULL AND ${table.blockedReason} IS NOT NULL)`,
    ),
    check(
      "threads_post_draft_published_slot_minute_range",
      sql`${table.publishedSlotMinute} IS NULL OR ${table.publishedSlotMinute} BETWEEN 0 AND 1439`,
    ),
    check(
      "threads_post_draft_threads_media_state",
      sql`(${table.threadsMediaId} IS NULL AND ${table.threadsPermalink} IS NULL) OR ${table.status} = 'published'`,
    ),
    check(
      "threads_post_draft_threads_permalink_length",
      sql`char_length(${table.threadsPermalink}) <= 2000`,
    ),
    check(
      "threads_post_draft_reject_reasons_valid",
      sql`${table.rejectReasons} IS NULL OR (cardinality(${table.rejectReasons}) >= 1
        AND array_position(${table.rejectReasons}, NULL) IS NULL
        AND ${table.rejectReasons} <@ ARRAY['similar', 'tone', 'thin', 'inaccurate', 'too_promotional', 'policy']::text[])`,
    ),
    // 状態ごとに、承認・却下・投稿の記録と投稿の順の列を縛る（めぐるの post_drafts_review_state を写した。threads-002 で広げた）
    check(
      "threads_post_draft_review_state_v2",
      sql`(${table.status} = 'needs_review' AND ${table.reviewedAt} IS NULL AND ${table.rejectReasons} IS NULL AND ${table.rejectNote} IS NULL
          AND ${table.prioritizedAt} IS NULL AND ${table.carryoverAttemptId} IS NULL
          AND ${table.publishedAt} IS NULL AND ${table.publishFailedAt} IS NULL AND ${table.publishError} IS NULL)
        OR (${table.status} IN ('approved', 'publishing') AND ${table.reviewedAt} IS NOT NULL AND ${table.rejectReasons} IS NULL AND ${table.rejectNote} IS NULL
          AND ${table.publishedAt} IS NULL AND ${table.publishFailedAt} IS NULL AND ${table.publishError} IS NULL)
        OR (${table.status} = 'rejected' AND ${table.reviewedAt} IS NOT NULL
          AND (coalesce(cardinality(${table.rejectReasons}), 0) >= 1 OR coalesce(btrim(${table.rejectNote}), '') <> '')
          AND ${table.prioritizedAt} IS NULL AND ${table.carryoverAttemptId} IS NULL
          AND ${table.publishedAt} IS NULL AND ${table.publishFailedAt} IS NULL AND ${table.publishError} IS NULL)
        OR (${table.status} = 'published' AND ${table.reviewedAt} IS NOT NULL AND ${table.rejectReasons} IS NULL AND ${table.rejectNote} IS NULL
          AND ${table.prioritizedAt} IS NULL AND ${table.carryoverAttemptId} IS NULL
          AND ${table.publishedAt} IS NOT NULL AND ${table.publishFailedAt} IS NULL AND ${table.publishError} IS NULL)
        OR (${table.status} = 'publish_failed' AND ${table.reviewedAt} IS NOT NULL AND ${table.rejectReasons} IS NULL AND ${table.rejectNote} IS NULL
          AND ${table.prioritizedAt} IS NULL AND ${table.carryoverAttemptId} IS NULL
          AND ${table.publishedAt} IS NULL AND ${table.publishFailedAt} IS NOT NULL AND ${table.publishError} IS NOT NULL)`,
    ),
  ],
);

/** NG ワード（運用アカウントごと。照合の形〈normalized〉で同じものは1つ）。 */
export const threadsNgWord = pgTable(
  "threads_ng_word",
  {
    id: primaryId(),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    /** 入れたまま（前後の空白を除く）。画面とプロンプトに出す */
    word: text("word").notNull(),
    /** 照合と同じものの判定に使う形（normalizeNgWord） */
    normalized: text("normalized").notNull(),
    /** 足した順（日時の並びに頼らない） */
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("threads_ng_word_threads_account_id_normalized_unique").on(
      table.threadsAccountId,
      table.normalized,
    ),
    check("threads_ng_word_word_length", sql`char_length(${table.word}) BETWEEN 1 AND 50`),
  ],
);

// ---- Threads への接続と自動投稿（threads-002。めぐるの specs/005・010・012 の表を写した）----

/**
 * Threads への接続（運用アカウントと1対1）。トークンは秘密の箱（AES-256-GCM。ひもづけは運用アカウントの ID）で包んで持つ。
 * トークンの平文・暗号文をログに出さない。
 */
export const threadsConnection = pgTable(
  "threads_connection",
  {
    threadsAccountId: uuid("threads_account_id")
      .primaryKey()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    accessTokenCiphertext: bytea("access_token_ciphertext").notNull(),
    /** 包むたびに作る12バイト */
    accessTokenIv: bytea("access_token_iv").notNull(),
    /** 包んだ鍵の版 */
    keyVersion: smallint("key_version").notNull(),
    scopes: text("scopes").array().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    issuedAt: timestamptz("issued_at").notNull(),
    /** 貼ってつないだ日時（延長では変えない） */
    authorizedAt: timestamptz("authorized_at").notNull(),
    /** 期限を確かめられなかったトークンの、確かめ直しの日時 */
    recheckAt: timestamptz("recheck_at"),
    ...timestamps(),
  },
  (table) => [
    index("threads_connection_recheck_at_idx")
      .on(table.recheckAt)
      .where(sql`${table.recheckAt} IS NOT NULL`),
  ],
);

/** トークンの確かめの失敗の日時（続いたら少し待たせる）。トークンの値は持たない。確かめの途中は pending。 */
export const threadsTokenCheckFailure = pgTable(
  "threads_token_check_failure",
  {
    id: primaryId(),
    /** 確かめた人（kanaeru のアカウント） */
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    failedAt: timestamptz("failed_at").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [
    index("threads_token_check_failure_account_id_failed_at_idx").on(
      table.accountId,
      table.failedAt,
    ),
    check(
      "threads_token_check_failure_reason_check",
      sql`${table.reason} in ('pending', 'invalid_format', 'invalid', 'short_lived', 'account_mismatch')`,
    ),
  ],
);

/** 投稿の設定（運用アカウントと1対1。最初の保存で作る）。 */
export const threadsPostingSchedule = pgTable(
  "threads_posting_schedule",
  {
    threadsAccountId: uuid("threads_account_id")
      .primaryKey()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    /** 1日に投稿する時刻（日本時間、0時からの分）。早い順・重複なし */
    slotMinutes: smallint("slot_minutes")
      .array()
      .notNull()
      .default(sql`'{}'::smallint[]`),
    jitter: boolean("jitter").notNull().default(true),
    /** この日時より後の予定だけを投稿する（設定の変更・つなぎ直しで今にする） */
    effectiveFrom: timestamptz("effective_from").notNull().defaultNow(),
    /** Threads の投稿の上限で止めたとき、次の日の0時（日本時間） */
    pausedUntil: timestamptz("paused_until"),
    /** 「投稿の直前に承認待ちへ戻した」の知らせを閉じた日時 */
    blockedNoticeSeenAt: timestamptz("blocked_notice_seen_at"),
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    index("threads_posting_schedule_enabled_idx")
      .on(table.enabled)
      .where(sql`${table.enabled}`),
    check("threads_posting_schedule_slot_count", sql`cardinality(${table.slotMinutes}) <= 10`),
    check(
      "threads_posting_schedule_slot_range",
      sql`0 <= ALL(${table.slotMinutes}) AND 1439 >= ALL(${table.slotMinutes})`,
    ),
    check(
      "threads_posting_schedule_enabled_requires_slots",
      sql`NOT ${table.enabled} OR cardinality(${table.slotMinutes}) >= 1`,
    ),
  ],
);

/** 投稿の試み（1つの時刻での、1つの運用アカウントの投稿の処理を1行で表す）。 */
export const threadsPublishAttempt = pgTable(
  "threads_publish_attempt",
  {
    id: primaryId(),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    /** ずらしたあとの予定の日時 */
    slotAt: timestamptz("slot_at").notNull(),
    /** 予定の日付（日本時間）と、設定の時刻（ずらす前） */
    slotDate: date("slot_date", { mode: "string" }).notNull(),
    slotMinute: smallint("slot_minute").notNull(),
    draftId: uuid("draft_id").references((): AnyPgColumn => threadsPostDraft.id, {
      onDelete: "set null",
    }),
    isCarryover: boolean("is_carryover").notNull().default(false),
    state: text("state", {
      enum: ["in_progress", "retry_wait", "succeeded", "failed", "carried_over", "skipped"],
    }).notNull(),
    skipReason: text("skip_reason"),
    retryCount: smallint("retry_count").notNull().default(0),
    nextRetryAt: timestamptz("next_retry_at"),
    /** 作った Threads のコンテナーの ID（公開を送る前に保存する） */
    containerId: text("container_id"),
    /** 公開を送った日時。これがあり結果がわからない間は、新しいコンテナーを作らない */
    publishRequestedAt: timestamptz("publish_requested_at"),
    lastError: text("last_error"),
    /** 処理している定期の仕事の持ち時間（待つときは、次に確かめる日時） */
    leaseUntil: timestamptz("lease_until"),
    /** 持ち時間を取った処理の札。試みの更新はこれが同じときだけ */
    leaseToken: uuid("lease_token"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("threads_publish_attempt_threads_account_id_slot_at_unique").on(
      table.threadsAccountId,
      table.slotAt,
    ),
    index("threads_publish_attempt_pending_idx")
      .on(table.state, table.nextRetryAt)
      .where(sql`${table.state} IN ('in_progress', 'retry_wait')`),
    index("threads_publish_attempt_threads_account_id_slot_date_idx").on(
      table.threadsAccountId,
      table.slotDate,
    ),
    check(
      "threads_publish_attempt_state_check",
      sql`${table.state} in ('in_progress', 'retry_wait', 'succeeded', 'failed', 'carried_over', 'skipped')`,
    ),
    check("threads_publish_attempt_slot_minute_range", sql`${table.slotMinute} BETWEEN 0 AND 1439`),
    check("threads_publish_attempt_retry_count_range", sql`${table.retryCount} BETWEEN 0 AND 3`),
    check(
      "threads_publish_attempt_skip_state",
      sql`(${table.state} = 'skipped' AND ${table.skipReason} IS NOT NULL AND ${table.draftId} IS NULL)
        OR (${table.state} <> 'skipped' AND ${table.skipReason} IS NULL)`,
    ),
    check(
      "threads_publish_attempt_skip_reason_check",
      sql`${table.skipReason} IS NULL OR ${table.skipReason} in ('no_drafts', 'needs_reconnect', 'rate_limited', 'daily_limit', 'auto_post_off')`,
    ),
    check(
      "threads_publish_attempt_last_error_check",
      sql`${table.lastError} IS NULL OR ${table.lastError} in ('network', 'threads_server', 'invalid_request', 'container_error', 'unknown')`,
    ),
    check(
      "threads_publish_attempt_retry_wait_state",
      sql`${table.state} <> 'retry_wait' OR ${table.nextRetryAt} IS NOT NULL`,
    ),
    check(
      "threads_publish_attempt_pending_has_draft",
      sql`${table.state} NOT IN ('in_progress', 'retry_wait') OR ${table.draftId} IS NOT NULL`,
    ),
  ],
);

// ---- 反応の分析（threads-003。めぐるの specs/006-performance-feedback の表を写した）----

/**
 * 反応の6つの数の列（返らなかった数は null）。
 * @returns 列
 */
const metricColumns = () => ({
  views: integer("views"),
  likes: integer("likes"),
  replies: integer("replies"),
  reposts: integer("reposts"),
  quotes: integer("quotes"),
  shares: integer("shares"),
});

/**
 * 投稿ごとの反応の今の値と判定（投稿済みの案と1対1。はじめて取りこんだときに作る）。
 * 状態は updating（24時間・3日まで）・confirmed（7日で確定）・late_confirmed（遅れて確定）・unmeasurable（投稿が見つからないなど）。
 * 判定（good・normal・poor）は確定したときに1回だけ入れる。低調の投稿は、改善のメモと「次のプロンプトに入れる」を持つ。
 */
export const threadsPostMetric = pgTable(
  "threads_post_metric",
  {
    draftId: uuid("draft_id")
      .primaryKey()
      .references(() => threadsPostDraft.id, { onDelete: "cascade" }),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    state: text("state", {
      enum: ["updating", "confirmed", "late_confirmed", "unmeasurable"],
    }).notNull(),
    ...metricColumns(),
    lastFetchedAt: timestamptz("last_fetched_at"),
    lastElapsedMinutes: integer("last_elapsed_minutes"),
    lastKind: text("last_kind", { enum: ["h24", "d3", "d7", "late"] }),
    confirmedAt: timestamptz("confirmed_at"),
    unmeasurableReason: text("unmeasurable_reason", { enum: ["not_found", "no_media_id"] }),
    judgment: text("judgment", { enum: ["good", "normal", "poor"] }),
    judgmentRatio: doublePrecision("judgment_ratio"),
    judgmentBaseline: doublePrecision("judgment_baseline"),
    judgedAt: timestamptz("judged_at"),
    /** 低調の投稿の傾向のメモ（200文字まで。次のプロンプトに入る） */
    feedbackMemo: text("feedback_memo"),
    includeInPrompt: boolean("include_in_prompt").notNull().default(true),
    feedbackVersion: integer("feedback_version").notNull().default(1),
    feedbackUpdatedAt: timestamptz("feedback_updated_at"),
    ...timestamps(),
  },
  (table) => [
    index("threads_post_metric_threads_account_id_state_idx").on(
      table.threadsAccountId,
      table.state,
    ),
    check(
      "threads_post_metric_state_check",
      sql`${table.state} in ('updating', 'confirmed', 'late_confirmed', 'unmeasurable')`,
    ),
    check(
      "threads_post_metric_last_kind_check",
      sql`${table.lastKind} IS NULL OR ${table.lastKind} in ('h24', 'd3', 'd7', 'late')`,
    ),
    check(
      "threads_post_metric_unmeasurable_reason",
      sql`(${table.state} = 'unmeasurable') = (${table.unmeasurableReason} IS NOT NULL)
        AND (${table.unmeasurableReason} IS NULL OR ${table.unmeasurableReason} in ('not_found', 'no_media_id'))`,
    ),
    check(
      "threads_post_metric_confirmed_at",
      sql`(${table.state} IN ('confirmed', 'late_confirmed')) = (${table.confirmedAt} IS NOT NULL)`,
    ),
    check(
      "threads_post_metric_judgment",
      sql`${table.judgment} IS NULL OR (${table.judgment} in ('good', 'normal', 'poor')
        AND ${table.state} IN ('confirmed', 'late_confirmed') AND ${table.judgmentRatio} IS NOT NULL AND ${table.judgmentBaseline} > 0)`,
    ),
    check(
      "threads_post_metric_feedback_memo_length",
      sql`char_length(${table.feedbackMemo}) <= 200`,
    ),
    check(
      "threads_post_metric_counts_nonnegative",
      sql`coalesce(${table.views}, 0) >= 0 AND coalesce(${table.likes}, 0) >= 0 AND coalesce(${table.replies}, 0) >= 0
        AND coalesce(${table.reposts}, 0) >= 0 AND coalesce(${table.quotes}, 0) >= 0 AND coalesce(${table.shares}, 0) >= 0`,
    ),
  ],
);

/** 取りこみの記録（1回の取りこみで1行。上書きしない）。時点（24時間・3日・7日・遅れて確定）ごとに1つ。 */
export const threadsPostMetricSnapshot = pgTable(
  "threads_post_metric_snapshot",
  {
    id: primaryId(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => threadsPostDraft.id, { onDelete: "cascade" }),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["h24", "d3", "d7", "late"] }).notNull(),
    /** slot：時点の幅の中で取った・daily：過ぎた時点を補った */
    method: text("method", { enum: ["slot", "daily"] }).notNull(),
    fetchedAt: timestamptz("fetched_at").notNull(),
    elapsedMinutes: integer("elapsed_minutes").notNull(),
    ...metricColumns(),
  },
  (table) => [
    uniqueIndex("threads_post_metric_snapshot_draft_id_kind_unique").on(table.draftId, table.kind),
    index("threads_post_metric_snapshot_threads_account_id_fetched_at_idx").on(
      table.threadsAccountId,
      table.fetchedAt,
    ),
    check(
      "threads_post_metric_snapshot_kind_check",
      sql`${table.kind} in ('h24', 'd3', 'd7', 'late')`,
    ),
    check("threads_post_metric_snapshot_method_check", sql`${table.method} in ('slot', 'daily')`),
  ],
);

/** フォロワーの数の記録（運用アカウントごとに1日〈日本時間〉1行）。 */
export const threadsFollowerSnapshot = pgTable(
  "threads_follower_snapshot",
  {
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    followersCount: integer("followers_count").notNull(),
    capturedAt: timestamptz("captured_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.threadsAccountId, table.snapshotDate] }),
    check("threads_follower_snapshot_count_nonnegative", sql`${table.followersCount} >= 0`),
  ],
);

// ---- 宣伝とリサーチ（threads-004。めぐるの promotions・reference_posts・research_keywords を写した）----

/** 宣伝したい内容（イベントの情報つき）。宣伝の対象（宣伝中で期限内）がプロンプトに入る。 */
export const threadsPromotion = pgTable(
  "threads_promotion",
  {
    id: primaryId(),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    targetLocation: text("target_location").notNull().default(""),
    targetPersona: text("target_persona").notNull().default(""),
    targetAgeRange: text("target_age_range").notNull().default(""),
    cta: text("cta").notNull().default(""),
    linkedUrl: text("linked_url").notNull().default(""),
    priority: smallint("priority").notNull().default(0),
    status: text("status", { enum: ["active", "paused", "ended"] })
      .notNull()
      .default("active"),
    validUntil: date("valid_until", { mode: "string" }),
    /** イベントの情報（なければ null。中身は約束の PromotionEventSchema で確かめる） */
    event: jsonb("event").$type<PromotionEvent>(),
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    index("threads_promotion_threads_account_id_idx").on(table.threadsAccountId),
    check("threads_promotion_title_length", sql`char_length(${table.title}) BETWEEN 1 AND 100`),
    check(
      "threads_promotion_content_length",
      sql`char_length(${table.content}) BETWEEN 1 AND 2000`,
    ),
    check(
      "threads_promotion_short_text_length",
      sql`char_length(${table.targetLocation}) <= 100 AND char_length(${table.targetPersona}) <= 100
        AND char_length(${table.targetAgeRange}) <= 100 AND char_length(${table.cta}) <= 100`,
    ),
    check("threads_promotion_linked_url_length", sql`char_length(${table.linkedUrl}) <= 2000`),
    check("threads_promotion_priority_range", sql`${table.priority} BETWEEN 0 AND 100`),
    check("threads_promotion_status_check", sql`${table.status} in ('active', 'paused', 'ended')`),
  ],
);

/** 参考の投稿（伸びている投稿。「なぜ良いか」と一緒にプロンプトに入る）。 */
export const threadsReferencePost = pgTable(
  "threads_reference_post",
  {
    id: primaryId(),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    keyword: text("keyword").notNull().default(""),
    postUrl: text("post_url").notNull().default(""),
    whyGood: text("why_good").notNull().default(""),
    platform: text("platform").notNull().default("threads"),
    postedDateMode: text("posted_date_mode").notNull().default("unknown"),
    postedDate: date("posted_date", { mode: "string" }),
    metricLikes: integer("metric_likes"),
    metricReplies: integer("metric_replies"),
    metricViews: integer("metric_views"),
    metricSaves: integer("metric_saves"),
    metricReposts: integer("metric_reposts"),
    metricFollowers: integer("metric_followers"),
    author: text("author").notNull().default(""),
    memo: text("memo").notNull().default(""),
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    index("threads_reference_post_threads_account_id_created_at_idx").on(
      table.threadsAccountId,
      table.createdAt.desc(),
    ),
    check("threads_reference_post_body_length", sql`char_length(${table.body}) BETWEEN 1 AND 2000`),
    check(
      "threads_reference_post_text_length",
      sql`char_length(${table.keyword}) <= 100 AND char_length(${table.postUrl}) <= 2000 AND char_length(${table.whyGood}) <= 2000
        AND char_length(${table.author}) <= 100 AND char_length(${table.memo}) <= 500`,
    ),
    check(
      "threads_reference_post_platform_check",
      sql`${table.platform} IN ('threads', 'instagram', 'tiktok', 'x', 'other')`,
    ),
    check(
      "threads_reference_post_posted_date_mode_check",
      sql`${table.postedDateMode} IN ('exact', 'week', 'month', '3months', 'unknown')`,
    ),
    check(
      "threads_reference_post_posted_date_matches_mode",
      sql`(${table.postedDateMode} = 'exact') = (${table.postedDate} IS NOT NULL)`,
    ),
    check(
      "threads_reference_post_metrics_nonnegative",
      sql`coalesce(${table.metricLikes}, 0) >= 0 AND coalesce(${table.metricReplies}, 0) >= 0 AND coalesce(${table.metricViews}, 0) >= 0
        AND coalesce(${table.metricSaves}, 0) >= 0 AND coalesce(${table.metricReposts}, 0) >= 0 AND coalesce(${table.metricFollowers}, 0) >= 0`,
    ),
  ],
);

/** リサーチのキーワード（照合の形で同じものは1つ）。 */
export const threadsResearchKeyword = pgTable(
  "threads_research_keyword",
  {
    id: primaryId(),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    /** 同じものの判定に使う形（normalizeKeyword） */
    keywordNormalized: text("keyword_normalized").notNull(),
    purpose: text("purpose").notNull().default(""),
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("threads_research_keyword_threads_account_id_keyword_normalized_unique").on(
      table.threadsAccountId,
      table.keywordNormalized,
    ),
    check(
      "threads_research_keyword_keyword_length",
      sql`char_length(${table.keyword}) BETWEEN 1 AND 100`,
    ),
    check("threads_research_keyword_purpose_length", sql`char_length(${table.purpose}) <= 100`),
  ],
);

// ---- 操作の記録（threads-005）----

/** 操作の記録（運用アカウントごと。90日を過ぎたものは定期の仕事が消す）。操作した人は持ち主（自動投稿は定期の仕事）。 */
export const threadsActivityLog = pgTable(
  "threads_activity_log",
  {
    id: primaryId(),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["review", "draft", "content", "settings", "autopost"] }).notNull(),
    action: text("action").notNull(),
    itemCount: integer("item_count").notNull().default(1),
    /** 対象の要約（本文の書き出しなど。30文字まで） */
    summary: text("summary"),
    /** した人（threads-013。退会した人・自動の操作・今ある行は null） */
    actorAccountId: uuid("actor_account_id").references(() => accountTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("threads_activity_log_actor_account_id_created_at_idx").on(
      table.actorAccountId,
      table.createdAt.desc(),
    ),
    index("threads_activity_log_threads_account_id_created_at_idx").on(
      table.threadsAccountId,
      table.createdAt.desc(),
    ),
    index("threads_activity_log_created_at_idx").on(table.createdAt),
    check(
      "threads_activity_log_kind_check",
      sql`${table.kind} in ('review', 'draft', 'content', 'settings', 'autopost')`,
    ),
    check("threads_activity_log_summary_length", sql`char_length(${table.summary}) <= 100`),
  ],
);

// ---- アルゴリズムの分析（threads-006。めぐるの analysis_settings・post_classifications を写した）----

/** 分析の設定（運用アカウントごとに1行。最初の保存で作る）。テーマは [{ id, name }] の並び（10個まで）。 */
export const threadsAnalysisSetting = pgTable(
  "threads_analysis_setting",
  {
    threadsAccountId: uuid("threads_account_id")
      .primaryKey()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    /** 伸びた傾向を投稿のプロンプトに入れるか */
    trendsInPrompt: boolean("trends_in_prompt").notNull().default(true),
    /** テーマ（中身は約束の AnalysisThemesInput で確かめる） */
    themes: jsonb("themes").$type<{ id: string; name: string }[]>().notNull().default([]),
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    check(
      "threads_analysis_setting_themes_array",
      sql`jsonb_typeof(${table.themes}) = 'array' AND jsonb_array_length(${table.themes}) <= 10`,
    ),
  ],
);

/** 投稿の内容の分類（投稿済みの案ごとに1行。書き出しの型とテーマ）。外の AI の答えを貼るか、手で付ける。 */
export const threadsPostClassification = pgTable(
  "threads_post_classification",
  {
    draftId: uuid("draft_id")
      .primaryKey()
      .references(() => threadsPostDraft.id, { onDelete: "cascade" }),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    openingType: text("opening_type", {
      enum: ["aruaru", "question", "assertion", "story", "number", "announce", "other"],
    }).notNull(),
    /** テーマの ID（分析の設定のテーマ。なしは null。テーマを消したら null に戻す） */
    themeId: text("theme_id"),
    source: text("source", { enum: ["ai", "manual"] }).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("threads_post_classification_threads_account_id_idx").on(table.threadsAccountId),
    check(
      "threads_post_classification_opening_type_check",
      sql`${table.openingType} in ('aruaru', 'question', 'assertion', 'story', 'number', 'announce', 'other')`,
    ),
    check("threads_post_classification_source_check", sql`${table.source} in ('ai', 'manual')`),
    check(
      "threads_post_classification_theme_id_format",
      sql`${table.themeId} IS NULL OR ${table.themeId} ~ '^t[0-9a-z]{1,8}$'`,
    ),
  ],
);

// ---- 時間差のメンション（threads-007。めぐるの mention_settings・mention_people・post_mentions を写した）----

/** ひとことと時間差（運用アカウントごとに1行。最初の保存で作る。なければ、ひとことは空・30分）。 */
export const threadsMentionSetting = pgTable(
  "threads_mention_setting",
  {
    threadsAccountId: uuid("threads_account_id")
      .primaryKey()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    message: text("message").notNull().default(""),
    delayMinutes: integer("delay_minutes").notNull().default(30),
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    check("threads_mention_setting_message_length", sql`char_length(${table.message}) <= 100`),
    check(
      "threads_mention_setting_delay_valid",
      sql`${table.delayMinutes} IN (10, 30, 60, 180, 360, 720, 1440)`,
    ),
  ],
);

/** メンションする人（持ち主が入れた Threads のユーザー名と呼び名。運用アカウントごとに20人まで）。 */
export const threadsMentionPerson = pgTable(
  "threads_mention_person",
  {
    id: primaryId(),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    label: text("label").notNull(),
    always: boolean("always").notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("threads_mention_person_threads_account_id_username_unique").on(
      table.threadsAccountId,
      table.username,
    ),
    check("threads_mention_person_username_valid", sql`${table.username} ~ '^[a-z0-9._]{1,30}$'`),
    check("threads_mention_person_label_length", sql`char_length(${table.label}) BETWEEN 1 AND 30`),
  ],
);

/** 案の時間差のメンション（案に0か1行。案を消したら消える）。返信は定期の仕事が出す（公開と同じく借りと送った日時で二重に出さない）。 */
export const threadsPostMention = pgTable(
  "threads_post_mention",
  {
    draftId: uuid("draft_id")
      .primaryKey()
      .references(() => threadsPostDraft.id, { onDelete: "cascade" }),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    usernames: text("usernames").array().notNull(),
    text: text("text").notNull(),
    /** 付けたときの時間差（分）。null は投稿済みの投稿に付けた（send_after を使う） */
    delayMinutes: integer("delay_minutes"),
    sendAfter: timestamptz("send_after"),
    state: text("state", { enum: ["pending", "sent", "canceled", "failed"] })
      .notNull()
      .default("pending"),
    failureReason: text("failure_reason", {
      enum: ["not_found", "post_failed", "no_permission", "expired", "ng_word", "limit", "error"],
    }),
    containerId: text("container_id"),
    publishRequestedAt: timestamptz("publish_requested_at"),
    replyMediaId: text("reply_media_id"),
    sentAt: timestamptz("sent_at"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamptz("next_attempt_at"),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamptz("lease_until"),
    ...timestamps(),
  },
  (table) => [
    index("threads_post_mention_pending_idx")
      .on(table.threadsAccountId, table.state)
      .where(sql`${table.state} = 'pending'`),
    index("threads_post_mention_threads_account_id_sent_at_idx").on(
      table.threadsAccountId,
      table.sentAt,
    ),
    check(
      "threads_post_mention_state_check",
      sql`${table.state} in ('pending', 'sent', 'canceled', 'failed')`,
    ),
    check(
      "threads_post_mention_failure_reason_check",
      sql`${table.failureReason} IS NULL OR ${table.failureReason} in ('not_found', 'post_failed', 'no_permission', 'expired', 'ng_word', 'limit', 'error')`,
    ),
    check(
      "threads_post_mention_failed_has_reason",
      sql`(${table.state} = 'failed') = (${table.failureReason} IS NOT NULL)`,
    ),
    check(
      "threads_post_mention_sent_has_time",
      sql`(${table.state} = 'sent') = (${table.sentAt} IS NOT NULL)`,
    ),
    check(
      "threads_post_mention_when",
      sql`${table.delayMinutes} IS NOT NULL OR ${table.sendAfter} IS NOT NULL`,
    ),
    check(
      "threads_post_mention_usernames_count",
      sql`cardinality(${table.usernames}) BETWEEN 1 AND 5`,
    ),
    check("threads_post_mention_text_length", sql`char_length(${table.text}) BETWEEN 1 AND 500`),
  ],
);

// ---- 外部メディアの掲載文（threads-008。めぐるの promotion_listings・media_defaults を写した）----

/** 宣伝×媒体の掲載文と状況（宣伝を消すと消える）。欄の値は約束の媒体の決まり（MEDIA_DEFINITIONS）で作る。 */
export const threadsPromotionListing = pgTable(
  "threads_promotion_listing",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => threadsPromotion.id, { onDelete: "cascade" }),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    media: text("media", {
      enum: ["kokuchpro", "peatix", "tsunagate", "jmty", "youtrust"],
    }).notNull(),
    status: text("status", { enum: ["not_started", "drafting", "posted", "stopped"] })
      .notNull()
      .default("not_started"),
    postedUrl: text("posted_url"),
    /** 欄の値（key → 値）。null はまだ作っていない */
    fields: jsonb("fields").$type<Record<string, string>>(),
    /** 自動で直した内容 */
    fixes: jsonb("fixes")
      .$type<{ field: string; excerpt: string; reason: string }[]>()
      .notNull()
      .default([]),
    imageStyle: text("image_style", { enum: ["illustration", "photo"] })
      .notNull()
      .default("illustration"),
    /** 作ったときの宣伝の版 */
    sourceVersion: integer("source_version"),
    generatedAt: timestamptz("generated_at"),
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.promotionId, table.media] }),
    index("threads_promotion_listing_threads_account_id_idx").on(table.threadsAccountId),
    check(
      "threads_promotion_listing_media_check",
      sql`${table.media} in ('kokuchpro', 'peatix', 'tsunagate', 'jmty', 'youtrust')`,
    ),
    check(
      "threads_promotion_listing_status_check",
      sql`${table.status} in ('not_started', 'drafting', 'posted', 'stopped')`,
    ),
    check(
      "threads_promotion_listing_image_style_check",
      sql`${table.imageStyle} in ('illustration', 'photo')`,
    ),
    check(
      "threads_promotion_listing_posted_url_valid",
      sql`${table.postedUrl} IS NULL OR (${table.postedUrl} ~ '^https?://' AND char_length(${table.postedUrl}) <= 2000)`,
    ),
  ],
);

/** 運用アカウント×媒体の既定値（事務局名・連絡先など。運用アカウントを消すと消える）。 */
export const threadsMediaDefault = pgTable(
  "threads_media_default",
  {
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    media: text("media", {
      enum: ["kokuchpro", "peatix", "tsunagate", "jmty", "youtrust"],
    }).notNull(),
    values: jsonb("values").$type<Record<string, string>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.threadsAccountId, table.media] }),
    check(
      "threads_media_default_media_check",
      sql`${table.media} in ('kokuchpro', 'peatix', 'tsunagate', 'jmty', 'youtrust')`,
    ),
  ],
);

// ---- OAuth の接続と Meta の Webhook（threads-010。めぐるの oauth_states・threads_deletion_requests を写した）----

/** OAuth の接続の state（ハッシュだけを持つ。10分で切れ、1回だけ使える）。定期の仕事が切れたものを消す。 */
export const threadsOauthState = pgTable(
  "threads_oauth_state",
  {
    /** state の SHA-256（16進） */
    stateHash: text("state_hash").primaryKey(),
    /** 接続を始めた kanaeru のアカウント（完了のときに同じ人かを確かめる） */
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    threadsAccountId: uuid("threads_account_id")
      .notNull()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("threads_oauth_state_expires_at_idx").on(table.expiresAt),
    check("threads_oauth_state_hash_format", sql`${table.stateHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

/** Meta のデータの削除の要求（確認のコードで状況を見せる。終わったら Threads のユーザーの ID を消す）。 */
export const threadsDeletionRequest = pgTable(
  "threads_deletion_request",
  {
    /** 確認のコード（推測できない乱数。16進32文字） */
    confirmationCode: text("confirmation_code").primaryKey(),
    /** 確かめた signed_request 全体の SHA-256（送り直しを1つにまとめる） */
    requestFingerprint: text("request_fingerprint").notNull(),
    /** Threads のユーザーの ID（終わったら null） */
    threadsUserId: text("threads_user_id"),
    /** Threads のユーザーの ID のハッシュ（終わったあと、接続を止めるために1日だけ残す。threads-012） */
    threadsUserHash: text("threads_user_hash"),
    status: text("status", { enum: ["pending", "completed", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    receivedAt: timestamptz("received_at").notNull(),
    lastAttemptedAt: timestamptz("last_attempted_at").notNull(),
    completedAt: timestamptz("completed_at"),
  },
  (table) => [
    uniqueIndex("threads_deletion_request_request_fingerprint_unique").on(table.requestFingerprint),
    index("threads_deletion_request_threads_user_hash_idx").on(table.threadsUserHash),
    check(
      "threads_deletion_request_status_check",
      sql`${table.status} in ('pending', 'completed', 'failed')`,
    ),
    check(
      "threads_deletion_request_completed",
      sql`(${table.status} = 'completed') = (${table.completedAt} IS NOT NULL)
        AND (${table.status} <> 'completed' OR ${table.threadsUserId} IS NULL)`,
    ),
    check(
      "threads_deletion_request_code_format",
      sql`${table.confirmationCode} ~ '^[0-9a-f]{32}$'`,
    ),
  ],
);

/**
 * Meta の連携の解除の知らせ（15分だけ持つ。threads-012。めぐるの threads_revocations を写した）。
 * つないでいる運用アカウントがなくても記録し、許可の画面から戻る途中の接続を止める。Threads のユーザーの ID はハッシュだけを持つ。
 */
export const threadsRevocation = pgTable(
  "threads_revocation",
  {
    id: primaryId(),
    /** Threads のユーザーの ID のハッシュ（SHA-256 の16進） */
    threadsUserHash: text("threads_user_hash").notNull(),
    /** Meta が知らせを出した時刻（なければ受け取った時刻） */
    issuedAt: timestamptz("issued_at").notNull(),
    receivedAt: timestamptz("received_at").notNull(),
  },
  (table) => [
    index("threads_revocation_threads_user_hash_issued_at_idx").on(
      table.threadsUserHash,
      table.issuedAt,
    ),
    index("threads_revocation_received_at_idx").on(table.receivedAt),
    check("threads_revocation_hash_format", sql`${table.threadsUserHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

// ---- チーム運用（threads-013。PRD 組織 5章。めぐるの team_accounts・memberships を、suite の組織の上に写した）----
// 組織とチーム（人・役割・招待・リーダー）は suite が持つ。threads が持つのは「チームに入れる」・担当・承認を任せるだけ（AD-22・threads-016）。
// どちらも organization_member(organization_id, account_id) と team_member(team_id, account_id) を指す複合の外部キーを CASCADE で持つので、
// 人が組織・チームから抜ける・チームや組織が消えると、suite がほかの領域を触らずに、その人の分が消える。

/** チームに入れた運用アカウント（1つの運用アカウントは組織の中の1つのチームにだけ入る。threads-016）。持ち主は threads_account.account_id のまま。 */
export const threadsOrganizationAccount = pgTable(
  "threads_organization_account",
  {
    threadsAccountId: uuid("threads_account_id")
      .primaryKey()
      .references(() => threadsAccount.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull(),
    /** 入れたチーム（threads-016。組織の中のチーム。持ち主はこのチームの人） */
    teamId: uuid("team_id").notNull(),
    /** 入れた持ち主（threads_account.account_id と同じ。持ち主が組織・チームから抜けると、この行が消える） */
    ownerAccountId: uuid("owner_account_id").notNull(),
    /** チームに見せる（オンのとき、チームの人と組織の管理者が投稿の案と戦略を読むだけで見られる。初めはオフ） */
    shared: boolean("shared").notNull().default(false),
    placedAt: timestamptz("placed_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "threads_organization_account_member_fk",
      columns: [table.organizationId, table.ownerAccountId],
      foreignColumns: [organizationMemberTable.organizationId, organizationMemberTable.accountId],
    }).onDelete("cascade"),
    // チームが消える・持ち主がチームから外れると、この行が消える（threads-016）
    foreignKey({
      name: "threads_organization_account_team_fk",
      columns: [table.teamId, table.organizationId],
      foreignColumns: [teamTable.id, teamTable.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "threads_organization_account_team_member_fk",
      columns: [table.teamId, table.ownerAccountId],
      foreignColumns: [teamMemberTable.teamId, teamMemberTable.accountId],
    }).onDelete("cascade"),
    index("threads_organization_account_organization_id_idx").on(table.organizationId),
    index("threads_organization_account_team_id_idx").on(table.teamId),
    // 担当が「同じチームに入れた運用アカウント」を外部キーで指すため
    uniqueIndex("threads_organization_account_id_team_id_unique").on(
      table.threadsAccountId,
      table.teamId,
    ),
  ],
);

/** 担当（管理者が、編集者と自分ごとに決める）と、持ち主が担当の人ごとに決める「承認を任せる」。 */
export const threadsAssignment = pgTable(
  "threads_assignment",
  {
    /** チームに入れた運用アカウント（チームから外れると、担当も消える。組織は入れた組織と同じものを書く） */
    threadsAccountId: uuid("threads_account_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    /** 運用アカウントを入れたチーム（担当の人はこのチームの人。threads-016） */
    teamId: uuid("team_id").notNull(),
    /** 担当の人 */
    accountId: uuid("account_id").notNull(),
    assignedAt: timestamptz("assigned_at").defaultNow().notNull(),
    /** 承認を任せる（承認・却下・承認を戻す・承認済みと却下の案を消す。初めはオフ） */
    delegated: boolean("delegated").notNull().default(false),
    delegatedAt: timestamptz("delegated_at"),
    /** 担当が付いた知らせを見た日時（Threads のはじめの画面に1回だけ出す） */
    noticeSeenAt: timestamptz("notice_seen_at"),
  },
  (table) => [
    primaryKey({ columns: [table.threadsAccountId, table.accountId] }),
    // 運用アカウントがチームから外れる・別のチームに移ると、担当も消える
    foreignKey({
      name: "threads_assignment_organization_account_fk",
      columns: [table.threadsAccountId, table.teamId],
      foreignColumns: [
        threadsOrganizationAccount.threadsAccountId,
        threadsOrganizationAccount.teamId,
      ],
    }).onDelete("cascade"),
    // 担当の人がチームから外れると、担当も消える（threads-016）
    foreignKey({
      name: "threads_assignment_team_member_fk",
      columns: [table.teamId, table.accountId],
      foreignColumns: [teamMemberTable.teamId, teamMemberTable.accountId],
    }).onDelete("cascade"),
    // 担当の人が組織から抜けると、担当も消える
    foreignKey({
      name: "threads_assignment_member_fk",
      columns: [table.organizationId, table.accountId],
      foreignColumns: [organizationMemberTable.organizationId, organizationMemberTable.accountId],
    }).onDelete("cascade"),
    index("threads_assignment_organization_id_account_id_idx").on(
      table.organizationId,
      table.accountId,
    ),
    index("threads_assignment_account_id_idx").on(table.accountId),
  ],
);
