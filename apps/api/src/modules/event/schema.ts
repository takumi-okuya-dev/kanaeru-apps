// 交流会の領域の表（docs/apps/event.md）。event・event_staff・staff_invite・staff_invite_viewer・event_discount は event の領域だけが持つ（AD-3）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。金額は円の整数。
// event を指す外部キーは RESTRICT（交流会を消すのは退会の段だけで、子の行を先に消す）。受付係の account は CASCADE（本人のデータ。AD-7）。
// 持ち主（event.owner_account_id）と組織に入れる（event_organization）は event-002（AD-23）。
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
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
import { organizationMemberTable } from "../suite/index.ts";

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
    /**
     * 持ち主（作った人。組織に入れても変わらず、替わるのは退会の引き継ぎだけ。AD-19・AD-23）。
     * 退会では event の段が先に引き継ぐ・消すので RESTRICT（残れば account を消せない。research R2）。
     * 前の版のアプリが作った行は空で、運営者が一覧を開いたときに埋める（research R1）。埋め終えたら NOT NULL にする
     */
    ownerAccountId: uuid("owner_account_id").references(() => accountTable.id, {
      onDelete: "restrict",
    }),
    ...timestamps(),
  },
  (table) => [
    index("event_starts_at_idx").on(table.startsAt),
    index("event_owner_account_id_idx").on(table.ownerAccountId),
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
 * 招待のリンクを主催者として見た人と、見た時刻（交流会と人ごとに1行。見るたびに時刻を新しくする）。
 * 組織の管理者・編集者は、交流会の主催者として招待のリンクを見られる。降格・組織から外れる・交流会が組織から外れるなどで
 * 主催者でなくなった人が、主催者のときに見たリンク（見たあとに作り直していないもの）で受付係になるのを断るために使う。
 */
export const staffInviteViewer = pgTable(
  "staff_invite_viewer",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** 最後に見た時刻 */
    viewedAt: timestamptz("viewed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_invite_viewer_event_id_account_id_unique").on(
      table.eventId,
      table.accountId,
    ),
    index("staff_invite_viewer_account_id_idx").on(table.accountId),
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

/**
 * 交流会を組織に入れる（交流会ごとに1行。1つの組織まで。入れる・外すのは持ち主だけ。AD-23）。
 * (organization_id, owner_account_id) は organization_member を指す複合の外部キーで CASCADE：持ち主が組織を抜ける・
 * 外される・組織が消えると、この行が消えて交流会は持ち主の個人のものに戻る（threads_organization_account と同じ。AD-22）。
 */
export const eventOrganization = pgTable(
  "event_organization",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => event.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").notNull(),
    /** 入れた持ち主（event.owner_account_id と同じ値。退会の引き継ぎで一緒に替える） */
    ownerAccountId: uuid("owner_account_id").notNull(),
    /** 入れた時刻 */
    placedAt: timestamptz("placed_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "event_organization_member_fk",
      columns: [table.organizationId, table.ownerAccountId],
      foreignColumns: [organizationMemberTable.organizationId, organizationMemberTable.accountId],
    }).onDelete("cascade"),
    index("event_organization_organization_id_idx").on(table.organizationId),
  ],
);
