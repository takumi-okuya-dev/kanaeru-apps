// 試合表の領域の表（docs/apps/match.md・specs/match/001-tables/data-model.md）。match の領域だけが読み書きする（AD-3・AD-25）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。表の名前は match_ で始める（AD-15）。
// 消し方（AD-19・AD-25。research R3）：試合表は持ち主のデータなので、持ち主の account を指す外部キーは CASCADE。組織に入れた
// 試合表を管理者に引き継ぐのは、退会の手順の match の段（match-002）が account を消す前に持ち主を替えて行う。つないだ交流会は
// SET NULL（交流会が消えても試合表は残る）。組織に入れる行は organization_member を指す複合の外部キーで CASCADE（AD-22）。
// 前に入れたレベルと受付の行は、持ち主・本人・試合表と一緒に消える（CASCADE）。
// 選択肢は text と CHECK。CHECK の code は約束（@workspace/contracts/match の options.ts）と同じ並びを文字で書く
// （DB の変更の SQL に値を埋めるため。sql.raw は使わない）。食い違いは schema.test.ts が見張る。
// ほかの領域の index.ts（道の定義を含む）を読むので、先に @hono/zod-openapi を読む（drizzle-kit がこの順で読むため。booking と同じ）。
import "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { MATCH_LEVELS } from "@workspace/contracts/match";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";
import { accountTable } from "../account/index.ts";
import { eventTable } from "../event/index.ts";
import { organizationMemberTable, organizationTable } from "../suite/index.ts";

/**
 * 試合表（最上位の記録。持ち主の account で持つ。AD-19・AD-25）。
 * 中身（名簿・組み合わせ・進み具合・設定）は1つのまとまり（JSON）で持ち、版の番号で食い違いを止める（AD-28）。
 * 中身の形は約束の zod で確かめてから書く（match-002。DB は「JSON の object であること」だけを確かめる）。
 */
export const matchTable = pgTable(
  "match_table",
  {
    id: primaryId(),
    /** 持ち主（消すと試合表も消える。組織に入れた試合表は、退会の段が先に管理者へ引き継ぐ） */
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** 名前（例：12/13(日) 練習会） */
    name: text("name").notNull(),
    /** 試合の日（日本時間の日付。90日の消す期限と、見るだけ・受付の札の期限の元） */
    playDate: date("play_date", { mode: "string" }).notNull(),
    /** 中身（名簿〈呼び名・レベル・当日の印〉・組み合わせ・進み具合・設定。氏名は持たない。Constitution II） */
    content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
    /** 版の番号（直すたびに1つ上げる。もとの版が違う送りは 409 MATCH_VERSION_CONFLICT。AD-28） */
    version: integer("version").notNull().default(1),
    /** 担当の端末の ID（端末が作る乱数。直せるのはこの端末だけ。空なら担当なし。AD-28） */
    editorDeviceId: text("editor_device_id"),
    /** 最後に受けた変更の ID（同じ変更がもう一度来たら、前と同じ答えを返す。AD-28） */
    lastChangeId: uuid("last_change_id"),
    /** くじの種（同じ名簿・同じ種なら同じ表。「別の組み合わせにする」で変える。AD-29） */
    seed: integer("seed").notNull().default(0),
    /** 見るだけの札の SHA-256（16進。札そのものは持たない。AD-26） */
    viewTokenHash: text("view_token_hash"),
    /** 見るだけの札の期限（その日の終わり。日本時間） */
    viewTokenExpiresAt: timestamptz("view_token_expires_at"),
    /** 受付の札の SHA-256（16進。見るだけとは別の札。AD-30） */
    joinTokenHash: text("join_token_hash"),
    /** 受付の札の期限（その日の終わり。日本時間） */
    joinTokenExpiresAt: timestamptz("join_token_expires_at"),
    /** 運営が受付を締めた時刻（空なら受付中か、受付の札がない） */
    joinClosedAt: timestamptz("join_closed_at"),
    /** 名簿を入れた受付の交流会（任意。交流会が消えたら空。AD-25） */
    eventId: uuid("event_id").references(() => eventTable.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    index("match_table_owner_account_id_play_date_idx").on(table.ownerAccountId, table.playDate),
    index("match_table_event_id_idx").on(table.eventId),
    uniqueIndex("match_table_view_token_hash_unique")
      .on(table.viewTokenHash)
      .where(sql`${table.viewTokenHash} is not null`),
    uniqueIndex("match_table_join_token_hash_unique")
      .on(table.joinTokenHash)
      .where(sql`${table.joinTokenHash} is not null`),
    check("match_table_name_check", sql`char_length(${table.name}) between 1 and 60`),
    check("match_table_version_check", sql`${table.version} >= 1`),
    check("match_table_content_check", sql`jsonb_typeof(${table.content}) = 'object'`),
    check(
      "match_table_editor_device_id_check",
      sql`${table.editorDeviceId} is null or char_length(${table.editorDeviceId}) between 1 and 64`,
    ),
  ],
);

/**
 * 試合表を組織に入れる（試合表ごとに1行。1つの組織まで。チームには入れない。AD-25）。
 * (organization_id, owner_account_id) は organization_member を指す複合の外部キーで CASCADE：持ち主が組織を抜ける・
 * 外される・組織が消えると、この行が消えて試合表は持ち主の個人のものに戻る（event_organization と同じ。AD-22・AD-23）。
 */
export const matchTableOrganization = pgTable(
  "match_table_organization",
  {
    matchTableId: uuid("match_table_id")
      .primaryKey()
      .references(() => matchTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull(),
    /** 入れた持ち主（match_table.owner_account_id と同じ値。退会の引き継ぎで一緒に替える） */
    ownerAccountId: uuid("owner_account_id").notNull(),
    /** 入れた時刻 */
    placedAt: timestamptz("placed_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "match_table_organization_member_fk",
      columns: [table.organizationId, table.ownerAccountId],
      foreignColumns: [organizationMemberTable.organizationId, organizationMemberTable.accountId],
    }).onDelete("cascade"),
    index("match_table_organization_organization_id_idx").on(table.organizationId),
  ],
);

/**
 * 前に入れたレベル（account のある人だけ覚える。CSV と手で入れた人は氏名を持たないので覚えない。AD-25）。
 * 相手（覚えている持ち主）は、運営の account か組織のどちらか1つ。相手と人の組ごとに1行。
 */
export const matchLevelMemory = pgTable(
  "match_level_memory",
  {
    id: primaryId(),
    /** 覚えている運営（個人の試合表のとき） */
    ownerAccountId: uuid("owner_account_id").references(() => accountTable.id, {
      onDelete: "cascade",
    }),
    /** 覚えている組織（組織に入れた試合表のとき） */
    organizationId: uuid("organization_id").references(() => organizationTable.id, {
      onDelete: "cascade",
    }),
    /** レベルを覚える人（LINE でチェックイン・申込みした人。消すとこの行も消える） */
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** レベル */
    level: text("level", { enum: MATCH_LEVELS }).notNull(),
    ...timestamps(),
  },
  (table) => [
    check(
      "match_level_memory_holder_check",
      sql`num_nonnulls(${table.ownerAccountId}, ${table.organizationId}) = 1`,
    ),
    check(
      "match_level_memory_level_check",
      sql`${table.level} in ('advanced', 'intermediate', 'beginner', 'novice')`,
    ),
    uniqueIndex("match_level_memory_owner_account_id_account_id_unique")
      .on(table.ownerAccountId, table.accountId)
      .where(sql`${table.ownerAccountId} is not null`),
    uniqueIndex("match_level_memory_organization_id_account_id_unique")
      .on(table.organizationId, table.accountId)
      .where(sql`${table.organizationId} is not null`),
    index("match_level_memory_account_id_idx").on(table.accountId),
  ],
);

/**
 * QR の受付（ログインなしで参加者が入れた呼び名とレベル。試合表の中身には直に書かず、1行ずつ足す。AD-30）。
 * 担当の端末が、つながったときに読んで名簿に足す。運営は直せる・消せる。試合表と一緒に消える。
 */
export const matchJoin = pgTable(
  "match_join",
  {
    id: primaryId(),
    matchTableId: uuid("match_table_id")
      .notNull()
      .references(() => matchTable.id, { onDelete: "cascade" }),
    /** 呼び名（1〜20文字） */
    nickname: text("nickname").notNull(),
    /** レベル */
    level: text("level", { enum: MATCH_LEVELS }).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("match_join_match_table_id_created_at_idx").on(table.matchTableId, table.createdAt),
    check("match_join_nickname_check", sql`char_length(${table.nickname}) between 1 and 20`),
    check(
      "match_join_level_check",
      sql`${table.level} in ('advanced', 'intermediate', 'beginner', 'novice')`,
    ),
  ],
);
