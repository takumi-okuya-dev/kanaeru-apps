// 予約の領域の表（docs/apps/booking.md・specs/booking/001-roster/data-model.md）。booking の領域だけが読み書きする（AD-3・AD-23）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。表の名前は booking_ で始める（AD-15）。
// 消し方（research R11）：名簿は交流会の持ち主のデータ（AD-19）なので、交流会を指す外部キーは CASCADE（event の退会の段が
// 組織に入れていない交流会を消すと、名簿も消える）。入れた人・ちがう人にした人は SET NULL、行のアカウント（本人の申込み）は
// CASCADE、当てたチェックインは SET NULL（AD-23）。
// 選択肢は text と CHECK。CHECK の code は約束（@workspace/contracts/booking の options.ts と、媒体は reception の options.ts）と
// 同じ並びを文字で書く（DB の変更の SQL に値を埋めるため。sql.raw は使わない）。食い違いは schema.test.ts が見張る。
// 使い方・入口・状態の値は今使うものだけ。足すときは CHECK を広げる（今の行はどれも通るので1回でよい。research R1・R2）。
// 約束の zod の形は @hono/zod-openapi を読んだあとに作られたものだけが .openapi() を持つ。このファイルは約束の値を先に読み、
// そのあとで reception の index.ts（道の定義を含む）を読むので、先に @hono/zod-openapi を読む（drizzle-kit がこの順で読むため）。
import "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { BOOKING_MODES, ENTRY_KINDS, ENTRY_STATUSES } from "@workspace/contracts/booking";
import { APPLICATION_SOURCES } from "@workspace/contracts/reception";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";
import { accountTable } from "../account/index.ts";
import { eventTable } from "../event/index.ts";
import { checkinTable } from "../reception/index.ts";

/** 交流会ごとの予約の設定（行がなければ受付だけ。research R1）。 */
export const bookingSetting = pgTable(
  "booking_setting",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => eventTable.id, { onDelete: "cascade" }),
    /** 使い方（受付だけ・名簿を使う） */
    mode: text("mode", { enum: BOOKING_MODES }).notNull(),
    ...timestamps(),
  },
  (table) => [check("booking_setting_mode_check", sql`${table.mode} in ('reception', 'roster')`)],
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
    /** 入口（手で足す・取り込み・飛び入り） */
    entryKind: text("entry_kind", { enum: ENTRY_KINDS }).notNull(),
    /** 状態（確定・取り消し） */
    status: text("status", { enum: ENTRY_STATUSES }).notNull().default("confirmed"),
    /** 申し込んだ日時（手で足す・取り込み・飛び入りでは、行を作った時刻。research R16） */
    appliedAt: timestamptz("applied_at").defaultNow().notNull(),
    /** 入れた人（そのアカウントが消えたら null） */
    enteredBy: uuid("entered_by").references(() => accountTable.id, { onDelete: "set null" }),
    /** メモ（任意） */
    memo: text("memo"),
    /** 本人のアカウント（自前のページの申込み。この版では空。消すと申込みも消える） */
    accountId: uuid("account_id").references(() => accountTable.id, { onDelete: "cascade" }),
    /** 手で当てたチェックイン（チェックインを取り消すと null。AD-23） */
    checkinId: uuid("checkin_id").references(() => checkinTable.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    index("booking_entry_event_id_applied_at_idx").on(table.eventId, table.appliedAt),
    index("booking_entry_entered_by_idx").on(table.enteredBy),
    index("booking_entry_account_id_idx").on(table.accountId),
    uniqueIndex("booking_entry_checkin_id_unique")
      .on(table.checkinId)
      .where(sql`${table.checkinId} is not null`),
    uniqueIndex("booking_entry_event_id_account_id_unique")
      .on(table.eventId, table.accountId)
      .where(sql`${table.accountId} is not null`),
    check(
      "booking_entry_application_source_check",
      sql`${table.applicationSource} in ('connpass', 'peatix', 'direct', 'other')`,
    ),
    check(
      "booking_entry_entry_kind_check",
      sql`${table.entryKind} in ('manual', 'import', 'walk_in')`,
    ),
    check("booking_entry_status_check", sql`${table.status} in ('confirmed', 'cancelled')`),
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
