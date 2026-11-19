// 交流会の領域の表（docs/apps/event.md）。event・event_staff・staff_invite・event_discount は event の領域だけが持つ（AD-3）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。金額は円の整数。
// event を指す外部キーは RESTRICT（この版は交流会を消さない）。受付係の account は CASCADE（本人のデータ。AD-7）。
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";
import { accountTable } from "../account/index.ts";

/** 交流会（主催者が作る1回ごとの催し）。 */
export const event = pgTable(
  "event",
  {
    id: primaryId(),
    /** 名前 */
    name: text("name").notNull(),
    /** 始まりの日時 */
    startsAt: timestamptz("starts_at").notNull(),
    /** 会場 */
    venue: text("venue").notNull(),
    /** 参加費（円の整数・0以上） */
    fee: integer("fee").notNull(),
    /** GoogleフォームのURL（任意） */
    googleFormUrl: text("google_form_url"),
    /** LINEグループの招待リンク（任意） */
    lineGroupUrl: text("line_group_url"),
    /** アンケートが開いているか（AD-13。survey は getEventSummary で読む） */
    surveyOpen: boolean("survey_open").notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    index("event_starts_at_idx").on(table.startsAt),
    check("event_fee_check", sql`${table.fee} >= 0`),
  ],
);

/** 受付係（交流会と account の組。その交流会の中だけで効く。AD-5）。 */
export const eventStaff = pgTable(
  "event_staff",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** 受付係になった時刻 */
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("event_staff_event_id_account_id_unique").on(table.eventId, table.accountId),
    index("event_staff_account_id_idx").on(table.accountId),
  ],
);

/** 招待のリンク（交流会ごとに1本。作り直すと印が替わる。research R3）。 */
export const staffInvite = pgTable(
  "staff_invite",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "restrict" }),
    /** 招待の印（32 バイトの base64url） */
    token: text("token").notNull(),
    /** 作った時刻（作り直すと替わる） */
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_invite_event_id_unique").on(table.eventId),
    uniqueIndex("staff_invite_token_unique").on(table.token),
  ],
);

/**
 * 割引（交流会ごとに主催者が登録する名前と円の額。reception-002）。
 * 行は消さず、外すと archived_at を入れて新しいチェックインで選べなくする（チェックインは名前と額を写す。research R1）。
 * (event_id, id) の一意は、reception の checkin からの複合の外部キー（別の交流会の割引を指せない）のため。
 */
export const eventDiscount = pgTable(
  "event_discount",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "restrict" }),
    /** 名前（例：紹介割） */
    name: text("name").notNull(),
    /** 額（円の整数・1以上） */
    amount: integer("amount").notNull(),
    /** 紹介者の名前を聞くか */
    asksReferrer: boolean("asks_referrer").notNull().default(false),
    /** 使うのをやめた時刻（使っていれば null） */
    archivedAt: timestamptz("archived_at"),
    ...timestamps(),
  },
  (table) => [
    unique("event_discount_event_id_id_unique").on(table.eventId, table.id),
    check("event_discount_amount_check", sql`${table.amount} > 0`),
  ],
);
