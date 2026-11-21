// 予約の領域の表（docs/apps/booking.md・specs/booking/001-roster/data-model.md）。booking の領域だけが読み書きする（AD-3・AD-23）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。表の名前は booking_ で始める（AD-15）。
// 消し方（research R11）：名簿は交流会の持ち主のデータ（AD-19）なので、交流会を指す外部キーは CASCADE（event の退会の段が
// 組織に入れていない交流会を消すと、名簿も消える）。入れた人・ちがう人にした人は SET NULL、行のアカウント（本人の申込み）は
// CASCADE、当てたチェックインは SET NULL（AD-23）、まとめた先の行は SET NULL（research R7）。
// 選択肢は text と CHECK。CHECK の code は約束（@workspace/contracts/booking の options.ts と、媒体は reception の options.ts）と
// 同じ並びを文字で書く（DB の変更の SQL に値を埋めるため。sql.raw は使わない）。食い違いは schema.test.ts が見張る。
// 使い方・入口・状態の値は今使うものだけ。足すときは CHECK を広げる（今の行はどれも通るので1回でよい。research R1・R2）。
// 約束の zod の形は @hono/zod-openapi を読んだあとに作られたものだけが .openapi() を持つ。このファイルは約束の値を先に読み、
// そのあとで reception の index.ts（道の定義を含む）を読むので、先に @hono/zod-openapi を読む（drizzle-kit がこの順で読むため）。
import "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  BOOKING_MODES,
  ENTRY_KINDS,
  ENTRY_STATUSES,
  NOTICE_KINDS,
  NOTICE_METHODS,
  NOTICE_RESULTS,
  OFFER_STATUSES,
  QUOTA_SOURCES,
  VISIBILITIES,
} from "@workspace/contracts/booking";
import { APPLICATION_SOURCES } from "@workspace/contracts/reception";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";
import { accountTable } from "../account/index.ts";
import { eventTable } from "../event/index.ts";
import { checkinTable } from "../reception/index.ts";
import { organizationTable } from "../suite/index.ts";

/** 交流会ごとの予約の設定（行がなければ受付だけ。research R1）。 */
export const bookingSetting = pgTable(
  "booking_setting",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => eventTable.id, { onDelete: "cascade" }),
    /** 使い方（受付だけ・名簿を使う・自前で申込みを受ける） */
    mode: text("mode", { enum: BOOKING_MODES }).notNull(),
    /** 申込みページの受付を開いているか（既定は閉じる。始まりを過ぎたら読むときに閉じたものとして扱う。booking-003 R1） */
    accepting: boolean("accepting").notNull().default(false),
    /** 申込みページの見せる範囲（誰でも・部員だけ。booking-003 R8） */
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("public"),
    /** 定員（空＝定員なし。booking-004 research R1） */
    capacity: integer("capacity"),
    /** 一度満員になって、媒体の枠を押さえるのをやめた時刻（booking-004 research R2） */
    quotaReleasedAt: timestamptz("quota_released_at"),
    /** 予約を中止した時刻（booking-004 research R11） */
    cancelledAt: timestamptz("cancelled_at"),
    /** 最後に知らせた（か使い始めた）交流会の日時（空なら比べない。booking-004 research R10） */
    notifiedStartsAt: timestamptz("notified_starts_at"),
    /** 最後に知らせた（か使い始めた）場所 */
    notifiedVenue: text("notified_venue"),
    /** 定期の仕事が日時や場所の変更に初めて気づいた時刻 */
    changeDetectedAt: timestamptz("change_detected_at"),
    /** 当日の空きを知らせた時刻（交流会ごとに1回。booking-004 research R7） */
    sameDayNotifiedAt: timestamptz("same_day_notified_at"),
    ...timestamps(),
  },
  (table) => [
    check("booking_setting_mode_check", sql`${table.mode} in ('reception', 'roster', 'self_page')`),
    check("booking_setting_visibility_check", sql`${table.visibility} in ('public', 'members')`),
    check(
      "booking_setting_capacity_check",
      sql`${table.capacity} is null or ${table.capacity} between 1 and 1000`,
    ),
  ],
);

/** 申込み（名簿の1行）。 */
export const bookingEntry = pgTable(
  "booking_entry",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventTable.id, { onDelete: "cascade" }),
    /** 名前（前後の空白を消したもの） */
    name: text("name").notNull(),
    /** 媒体（受付の申し込みの媒体） */
    applicationSource: text("application_source", { enum: APPLICATION_SOURCES }).notNull(),
    /** 入口（手で足す・取り込み・飛び入り・自前のページ） */
    entryKind: text("entry_kind", { enum: ENTRY_KINDS }).notNull(),
    /** 状態（確定・キャンセル待ち・打診中・取り消し。booking-004） */
    status: text("status", { enum: ENTRY_STATUSES }).notNull().default("confirmed"),
    /** 申し込んだ日時（手で足す・取り込み・飛び入りでは、行を作った時刻。research R16） */
    appliedAt: timestamptz("applied_at").defaultNow().notNull(),
    /** 入れた人（そのアカウントが消えたら null） */
    enteredBy: uuid("entered_by").references(() => accountTable.id, { onDelete: "set null" }),
    /** メモ（任意） */
    memo: text("memo"),
    /** 本人のアカウント（自前のページで LINE ログインして申し込んだ人。消すと申込みも消える） */
    accountId: uuid("account_id").references(() => accountTable.id, { onDelete: "cascade" }),
    /** 手で当てたチェックイン（チェックインを取り消すと null。AD-23） */
    checkinId: uuid("checkin_id").references(() => checkinTable.id, { onDelete: "set null" }),
    /**
     * まとめた先の行（まとめられた行は消さずに残し、名簿・人数・当てから隠す。取り込みの「すでにある」だけは数える。
     * research R7。まとめた先の行が消えたら null に戻り、取り消しの行として名簿に出る）
     */
    mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => bookingEntry.id, {
      onDelete: "set null",
    }),
    /** メールで申し込んだ人の連絡のメールアドレス（小文字。主催者に見せない・ログに出さない。booking-003 R10） */
    contactEmail: text("contact_email"),
    /** メールで申し込んだ人の札の SHA-256（16進。見る・取り消すのリンク。booking-003 R10） */
    entryTokenHash: text("entry_token_hash"),
    ...timestamps(),
  },
  (table) => [
    index("booking_entry_event_id_applied_at_idx").on(table.eventId, table.appliedAt),
    index("booking_entry_entered_by_idx").on(table.enteredBy),
    index("booking_entry_account_id_idx").on(table.accountId),
    index("booking_entry_event_id_status_idx").on(table.eventId, table.status),
    index("booking_entry_merged_into_id_idx").on(table.mergedIntoId),
    uniqueIndex("booking_entry_checkin_id_unique")
      .on(table.checkinId)
      .where(sql`${table.checkinId} is not null`),
    uniqueIndex("booking_entry_event_id_account_id_unique")
      .on(table.eventId, table.accountId)
      .where(sql`${table.accountId} is not null`),
    uniqueIndex("booking_entry_event_id_contact_email_unique")
      .on(table.eventId, table.contactEmail)
      .where(sql`${table.contactEmail} is not null`),
    uniqueIndex("booking_entry_entry_token_hash_unique")
      .on(table.entryTokenHash)
      .where(sql`${table.entryTokenHash} is not null`),
    check(
      "booking_entry_contact_email_check",
      sql`${table.contactEmail} is null or char_length(${table.contactEmail}) <= 254`,
    ),
    check(
      "booking_entry_application_source_check",
      sql`${table.applicationSource} in ('connpass', 'peatix', 'direct', 'other')`,
    ),
    check(
      "booking_entry_entry_kind_check",
      sql`${table.entryKind} in ('manual', 'import', 'walk_in', 'self_page')`,
    ),
    check(
      "booking_entry_status_check",
      sql`${table.status} in ('confirmed', 'waitlisted', 'offered', 'cancelled')`,
    ),
  ],
);

/** 受付係が「ちがう人」にした、チェックインと名簿の行の組（候補に出さない。research R8）。 */
export const bookingDismissal = pgTable(
  "booking_dismissal",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventTable.id, { onDelete: "cascade" }),
    checkinId: uuid("checkin_id")
      .notNull()
      .references(() => checkinTable.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => bookingEntry.id, { onDelete: "cascade" }),
    /** した人（そのアカウントが消えたら null） */
    dismissedBy: uuid("dismissed_by").references(() => accountTable.id, { onDelete: "set null" }),
    /** した時刻 */
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("booking_dismissal_checkin_id_entry_id_unique").on(table.checkinId, table.entryId),
    index("booking_dismissal_event_id_idx").on(table.eventId),
    index("booking_dismissal_entry_id_idx").on(table.entryId),
    index("booking_dismissal_dismissed_by_idx").on(table.dismissedBy),
  ],
);

/** 持ち主ごとの CSV の列の対応（見出しの並び → 名前の列・媒体。research R6）。 */
export const bookingImportMapping = pgTable(
  "booking_import_mapping",
  {
    id: primaryId(),
    /** 交流会の持ち主 */
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** 見出しの並び（JSON.stringify(headers)） */
    headerKey: text("header_key").notNull(),
    /** 名前の列の見出し */
    nameColumn: text("name_column").notNull(),
    /** 選んだ媒体 */
    applicationSource: text("application_source", { enum: APPLICATION_SOURCES }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("booking_import_mapping_owner_account_id_header_key_unique").on(
      table.ownerAccountId,
      table.headerKey,
    ),
    check(
      "booking_import_mapping_application_source_check",
      sql`${table.applicationSource} in ('connpass', 'peatix', 'direct', 'other')`,
    ),
  ],
);

// ---- 知らせ（booking-002。specs/booking/002-notify/data-model.md・AD-24） ----
// 公式アカウントの鍵は秘密の箱（@workspace/secret-box）で包んで持ち、画面には末尾4文字だけを出す。紐づけの札は SHA-256 だけ。
// 知らせの記録は、本文・宛先・トークン・札を持たない。消し方：持ち主（組織・アカウント）を消すと設定・紐づけ・札が消える。
// 参加者のアカウントを消すと、その人の紐づけ・連絡のメールアドレスが消える。申込みを消すと記録が消え、設定を消すと記録の設定が空になる。

/** バイトの列（包んだ鍵。Postgres の bytea）。 */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/** LINE 公式アカウントの設定（組織か個人に0か1行。LINE の値は、そろって空か、そろって入っている。research R8）。 */
export const bookingLineChannel = pgTable(
  "booking_line_channel",
  {
    id: primaryId(),
    /** 個人の持ち主 */
    holderAccountId: uuid("holder_account_id").references(() => accountTable.id, {
      onDelete: "cascade",
    }),
    /** 組織の持ち主 */
    holderOrganizationId: uuid("holder_organization_id").references(() => organizationTable.id, {
      onDelete: "cascade",
    }),
    /** Messaging API のチャネル ID（数字。秘密ではない） */
    lineChannelId: text("line_channel_id"),
    /** チャネルシークレットの暗号文（ひもづけ `<id>:secret`） */
    channelSecretCiphertext: bytea("channel_secret_ciphertext"),
    /** 包むたびに作る12バイト */
    channelSecretIv: bytea("channel_secret_iv"),
    /** 包んだ鍵の版 */
    channelSecretKeyVersion: smallint("channel_secret_key_version"),
    /** シークレットの末尾4文字（画面に出す。research R9） */
    channelSecretTail: text("channel_secret_tail"),
    /** チャネルアクセストークンの暗号文（ひもづけ `<id>:token`） */
    accessTokenCiphertext: bytea("access_token_ciphertext"),
    /** 包むたびに作る12バイト */
    accessTokenIv: bytea("access_token_iv"),
    /** 包んだ鍵の版 */
    accessTokenKeyVersion: smallint("access_token_key_version"),
    /** アクセストークンの末尾4文字 */
    accessTokenTail: text("access_token_tail"),
    /** ボット情報のベーシック ID（友だち追加のリンク。research R10） */
    basicId: text("basic_id"),
    /**
     * ボット情報の userId（公式アカウントそのものの ID。Webhook の destination と同じ）。アクセストークンだけを入れ直して
     * 別の公式アカウントに替わったことを見つける（替われば紐づけを消す）。前の版で入れた行は空（research R10）
     */
    botUserId: text("bot_user_id"),
    /** メールの返信先（任意） */
    replyToEmail: text("reply_to_email"),
    ...timestamps(),
  },
  (table) => [
    check(
      "booking_line_channel_holder_check",
      sql`num_nonnulls(${table.holderAccountId}, ${table.holderOrganizationId}) = 1`,
    ),
    check(
      "booking_line_channel_line_check",
      sql`num_nulls(${table.lineChannelId}, ${table.channelSecretCiphertext}, ${table.channelSecretIv}, ${table.channelSecretKeyVersion}, ${table.channelSecretTail}, ${table.accessTokenCiphertext}, ${table.accessTokenIv}, ${table.accessTokenKeyVersion}, ${table.accessTokenTail}) in (0, 9)`,
    ),
    uniqueIndex("booking_line_channel_holder_account_id_unique")
      .on(table.holderAccountId)
      .where(sql`${table.holderAccountId} is not null`),
    uniqueIndex("booking_line_channel_holder_organization_id_unique")
      .on(table.holderOrganizationId)
      .where(sql`${table.holderOrganizationId} is not null`),
    // 同じ公式アカウントを2つの設定に入れない（Webhook と紐づけが2つに分かれるため）
    uniqueIndex("booking_line_channel_line_channel_id_unique")
      .on(table.lineChannelId)
      .where(sql`${table.lineChannelId} is not null`),
  ],
);

/** 紐づけ（参加者のアカウントと、公式アカウントの友だち。送り先は lineUserId だけ。AD-24）。 */
export const bookingLineLink = pgTable(
  "booking_line_link",
  {
    id: primaryId(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => bookingLineChannel.id, { onDelete: "cascade" }),
    /** 公式アカウントから見える LINE のユーザー ID（LINE ログインの sub ではない） */
    lineUserId: text("line_user_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("booking_line_link_channel_id_account_id_unique").on(
      table.channelId,
      table.accountId,
    ),
    uniqueIndex("booking_line_link_channel_id_line_user_id_unique").on(
      table.channelId,
      table.lineUserId,
    ),
    index("booking_line_link_account_id_idx").on(table.accountId),
    check("booking_line_link_line_user_id_check", sql`${table.lineUserId} ~ '^U[0-9a-f]{32}$'`),
  ],
);

/** 紐づけの札（友だち追加のあいさつのリンク。SHA-256 だけ・7日・1回だけ。research R3）。 */
export const bookingLineLinkToken = pgTable(
  "booking_line_link_token",
  {
    id: primaryId(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => bookingLineChannel.id, { onDelete: "cascade" }),
    /** 友だち追加した人（公式アカウントから見える LINE のユーザー ID） */
    lineUserId: text("line_user_id").notNull(),
    /** 札の SHA-256（16進） */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    usedAt: timestamptz("used_at"),
    usedByAccountId: uuid("used_by_account_id").references(() => accountTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("booking_line_link_token_token_hash_unique").on(table.tokenHash),
    index("booking_line_link_token_channel_id_line_user_id_idx").on(
      table.channelId,
      table.lineUserId,
    ),
    index("booking_line_link_token_used_by_account_id_idx").on(table.usedByAccountId),
    check(
      "booking_line_link_token_line_user_id_check",
      sql`${table.lineUserId} ~ '^U[0-9a-f]{32}$'`,
    ),
  ],
);

/** 参加者の連絡のメールアドレス（予約の知らせのためだけ・任意・本人が消せる・主催者に見せない。Constitution II）。 */
export const bookingContact = pgTable(
  "booking_contact",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** メールアドレス（小文字にそろえたもの） */
    email: text("email").notNull(),
    ...timestamps(),
  },
  (table) => [check("booking_contact_email_check", sql`char_length(${table.email}) <= 254`)],
);

/** 知らせの記録（相手・種類・手段・結果・時刻だけ。本文と宛先は持たない。research R12）。 */
export const bookingNotice = pgTable(
  "booking_notice",
  {
    id: primaryId(),
    /** 相手の申込み（確かめのメッセージは空） */
    entryId: uuid("entry_id").references(() => bookingEntry.id, { onDelete: "cascade" }),
    /** 使った公式アカウントの設定（消えたら空） */
    channelId: uuid("channel_id").references(() => bookingLineChannel.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: NOTICE_KINDS }).notNull(),
    method: text("method", { enum: NOTICE_METHODS }).notNull(),
    result: text("result", { enum: NOTICE_RESULTS }).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("booking_notice_entry_id_idx").on(table.entryId),
    index("booking_notice_channel_id_created_at_idx").on(table.channelId, table.createdAt),
    check(
      "booking_notice_kind_check",
      sql`${table.kind} in ('confirmed', 'waitlisted', 'offered', 'offer_expired', 'changed', 'cancelled_event', 'same_day', 'test')`,
    ),
    check("booking_notice_method_check", sql`${table.method} in ('line', 'email', 'none')`),
    check(
      "booking_notice_result_check",
      sql`${table.result} in ('sent', 'off', 'not_allowed', 'no_destination', 'failed', 'unavailable')`,
    ),
    check("booking_notice_entry_check", sql`(${table.kind} = 'test') = (${table.entryId} is null)`),
  ],
);

// ---- 自前の申込みページ（booking-003。specs/booking/003-apply/data-model.md・AD-23） ----
// 案内の同意は、同意した人と相手（組織か交流会の持ち主のどちらか1つ）の組。確認の待ちは、メールで申し込む人の名前・アドレス・
// 札の SHA-256（24時間）。消し方：同意は本人・相手のどちらを消しても消える。確認の待ちは交流会と一緒に消える。

/** 案内の同意（相手は組織か持ち主のどちらか1つ。booking-003 research R5）。 */
export const bookingConsent = pgTable(
  "booking_consent",
  {
    id: primaryId(),
    /** 同意した人 */
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** 相手の組織 */
    organizationId: uuid("organization_id").references(() => organizationTable.id, {
      onDelete: "cascade",
    }),
    /** 相手の個人の持ち主 */
    ownerAccountId: uuid("owner_account_id").references(() => accountTable.id, {
      onDelete: "cascade",
    }),
    /** 同意した時刻 */
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "booking_consent_holder_check",
      sql`num_nonnulls(${table.organizationId}, ${table.ownerAccountId}) = 1`,
    ),
    uniqueIndex("booking_consent_account_id_organization_id_unique")
      .on(table.accountId, table.organizationId)
      .where(sql`${table.organizationId} is not null`),
    uniqueIndex("booking_consent_account_id_owner_account_id_unique")
      .on(table.accountId, table.ownerAccountId)
      .where(sql`${table.ownerAccountId} is not null`),
    index("booking_consent_organization_id_idx").on(table.organizationId),
    index("booking_consent_owner_account_id_idx").on(table.ownerAccountId),
  ],
);

/** メールで申し込む確認の待ち（札は SHA-256 だけ・24時間。booking-003 research R10）。 */
export const bookingEmailRequest = pgTable(
  "booking_email_request",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventTable.id, { onDelete: "cascade" }),
    /** 入れた名前（前後の空白を消したもの） */
    name: text("name").notNull(),
    /** 入れたメールアドレス（小文字） */
    email: text("email").notNull(),
    /** 確認の札の SHA-256（16進） */
    tokenHash: text("token_hash").notNull(),
    /** 期限（作ってから24時間） */
    expiresAt: timestamptz("expires_at").notNull(),
    /** 作った時刻（同じアドレスの10分の縛り） */
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("booking_email_request_token_hash_unique").on(table.tokenHash),
    index("booking_email_request_event_id_email_idx").on(table.eventId, table.email),
    check("booking_email_request_email_check", sql`char_length(${table.email}) <= 254`),
  ],
);

// ---- 定員・媒体の枠・キャンセル待ち・打診（booking-004。specs/booking/004-waitlist/data-model.md・AD-3） ----
// 媒体の枠は交流会と一緒に消える。打診は交流会・申込みと一緒に消え、手で打診した主催者を消すと空になる。
// 待っている打診は申込みごとに1つ（部分の一意。同時に走ったときの二重目の守り。research R5）。

/** 媒体の枠（直接を除く媒体ごとに1つ。booking-004 research R1）。 */
export const bookingQuota = pgTable(
  "booking_quota",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventTable.id, { onDelete: "cascade" }),
    /** 媒体（直接を除く） */
    applicationSource: text("application_source", { enum: QUOTA_SOURCES }).notNull(),
    /** 席の数 */
    seats: integer("seats").notNull(),
    /** 媒体の管理ページの URL（任意） */
    manageUrl: text("manage_url"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("booking_quota_event_id_application_source_unique").on(
      table.eventId,
      table.applicationSource,
    ),
    check(
      "booking_quota_application_source_check",
      sql`${table.applicationSource} in ('connpass', 'peatix', 'other')`,
    ),
    check("booking_quota_seats_check", sql`${table.seats} between 1 and 1000`),
    check(
      "booking_quota_manage_url_check",
      sql`${table.manageUrl} is null or (char_length(${table.manageUrl}) <= 500 and ${table.manageUrl} ~ '^https?://')`,
    ),
  ],
);

/** 打診と返事の期限（booking-004 research R5・R6・R8）。 */
export const bookingOffer = pgTable(
  "booking_offer",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventTable.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => bookingEntry.id, { onDelete: "cascade" }),
    /** 状態（待っている・参加・辞退・期限切れ・取り下げ） */
    status: text("status", { enum: OFFER_STATUSES }).notNull().default("pending"),
    /** 返事の期限 */
    deadline: timestamptz("deadline").notNull(),
    /** メールの人の返事の札の SHA-256（16進） */
    tokenHash: text("token_hash"),
    /** 手で打診した主催者（自動は空） */
    offeredBy: uuid("offered_by").references(() => accountTable.id, { onDelete: "set null" }),
    /** 参加・辞退・期限切れ・取り下げの時刻 */
    respondedAt: timestamptz("responded_at"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("booking_offer_entry_id_pending_unique")
      .on(table.entryId)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex("booking_offer_token_hash_unique")
      .on(table.tokenHash)
      .where(sql`${table.tokenHash} is not null`),
    index("booking_offer_status_deadline_idx").on(table.status, table.deadline),
    index("booking_offer_event_id_idx").on(table.eventId),
    index("booking_offer_offered_by_idx").on(table.offeredBy),
    check(
      "booking_offer_status_check",
      sql`${table.status} in ('pending', 'accepted', 'declined', 'expired', 'withdrawn')`,
    ),
  ],
);
