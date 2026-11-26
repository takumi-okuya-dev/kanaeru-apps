// スイートの領域の表（docs/apps/suite.md）。app_setting は suite の領域だけが持ち、書く（AD-3・AD-16）。
// アプリごとに1行で、公開の状態（off・operator_only・public）を持つ。行がないアプリは operator_only。
// 売り方の列は、売り始めるときに足す（core-005 の仮決め）。主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。
// 組織（suite-001。AD-22）：organization・organization_member・organization_invite と、契約の持ち主の形（entitlement）も持つ。
// 書くのは suite だけ。ほかの領域は index.ts の organizationTable・organizationMemberTable を外部キーにだけ使う。
// organization_member.account_id は本人のデータなので ON DELETE CASCADE（AD-7）。アプリの「組織に入れる」・担当の表は、
// organization_member(organization_id, account_id) を指す複合の外部キーを CASCADE で持つ（人が抜けると、その人の分が消える）。
// 改善点（suite-004）：feedback はログインした人が送った改善点。送った人は SET NULL（退会しても本文は残し、つながりだけ外す）。
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";
import { accountTable } from "../account/index.ts";

/** バイトの列（包んだ招待の札。Postgres の bytea）。 */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/** アプリの台帳の行（アプリの key ごとに1つ）。 */
export const appSetting = pgTable(
  "app_setting",
  {
    id: primaryId(),
    /** アプリの key（packages/contracts/src/core/apps.list.ts の key） */
    appKey: text("app_key").notNull(),
    /** 公開の状態（off・operator_only・public） */
    visibility: text("visibility").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("app_setting_app_key_unique").on(table.appKey),
    check(
      "app_setting_visibility_check",
      sql`${table.visibility} in ('off', 'operator_only', 'public')`,
    ),
  ],
);

/** 組織（スイートに1つの人の集まり。名前だけを持ち、人と役割は organization_member）。 */
export const organization = pgTable(
  "organization",
  {
    id: primaryId(),
    /** 名前（前後の空白を除いて1〜50文字） */
    name: text("name").notNull(),
    /** 管理者が組織の画面を最後に見た日時（それより後に入った人を「新しい人」と1回だけ出す。FR-O55） */
    adminSeenAt: timestamptz("admin_seen_at"),
    ...timestamps(),
  },
  (table) => [check("organization_name_length", sql`char_length(${table.name}) BETWEEN 1 AND 50`)],
);

/** 組織の人（組織と account の組。役割と入った日時）。 */
export const organizationMember = pgTable(
  "organization_member",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** 役割（admin・editor・member。管理者は1組織に1人） */
    role: text("role", { enum: ["admin", "editor", "member"] }).notNull(),
    joinedAt: timestamptz("joined_at").defaultNow().notNull(),
    /** 最後にメンバーに下げた日時（これより前に付けたアプリの担当・任せるを効かせない。AD-22） */
    demotedAt: timestamptz("demoted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.accountId] }),
    index("organization_member_account_id_idx").on(table.accountId),
    uniqueIndex("organization_member_admin_unique")
      .on(table.organizationId)
      .where(sql`${table.role} = 'admin'`),
    check("organization_member_role_check", sql`${table.role} in ('admin', 'editor', 'member')`),
  ],
);

/**
 * 組織の中のチーム（suite-003）。名前だけを持ち、人とリーダーは team_member。組織が消えると消える。
 * (id, organization_id) の一意は、team_member とアプリの表が「同じ組織のチーム」を外部キーで指すため。
 */
export const team = pgTable(
  "team",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** 名前（前後の空白を除いて1〜30文字。同じ組織の中で重ならない） */
    name: text("name").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("team_id_organization_id_unique").on(table.id, table.organizationId),
    uniqueIndex("team_organization_id_name_unique").on(table.organizationId, table.name),
    check("team_name_length", sql`char_length(${table.name}) BETWEEN 1 AND 30`),
  ],
);

/**
 * チームの人（チームと組織の人の組。リーダーの印）。組織から抜けると organization_member への外部キーで消え、
 * チームが消えると team への外部キーで消える。アプリの「チームに入れる」・担当は、この表を指す外部キーを CASCADE で持つ。
 */
export const teamMember = pgTable(
  "team_member",
  {
    teamId: uuid("team_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    accountId: uuid("account_id").notNull(),
    /** リーダー（アプリの中で、このチームの担当の付け外しと運用状況を見られる。何人でもよい） */
    leader: boolean("leader").notNull().default(false),
    joinedAt: timestamptz("joined_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.accountId] }),
    foreignKey({
      name: "team_member_team_fk",
      columns: [table.teamId, table.organizationId],
      foreignColumns: [team.id, team.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "team_member_organization_member_fk",
      columns: [table.organizationId, table.accountId],
      foreignColumns: [organizationMember.organizationId, organizationMember.accountId],
    }).onDelete("cascade"),
    index("team_member_organization_id_account_id_idx").on(table.organizationId, table.accountId),
  ],
);

/**
 * 組織の招待のリンク（組織ごとに1本。何人でも使え、期限なし。作り直すと前のは使えない）。
 * 照らし合わせは札の SHA-256 で行う。管理者に出し直すための写しは、秘密の箱で包んで持つ（平文は持たない）。
 */
export const organizationInvite = pgTable(
  "organization_invite",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** 札の SHA-256（16進64文字） */
    tokenHash: text("token_hash").notNull(),
    /** 札を包んだ写し（秘密の箱がない環境では null。そのときは作り直したときだけ出す） */
    tokenCiphertext: bytea("token_ciphertext"),
    tokenIv: bytea("token_iv"),
    keyVersion: smallint("key_version"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("organization_invite_token_hash_unique").on(table.tokenHash)],
);

/**
 * 契約（売り始めるときに使う。今は持ち主の形だけ。AD-16・AD-22）。持ち主はアカウントか組織のどちらか1つ（CHECK）。
 * 料金・席数・期間・支払いの会社の ID の列は、売り始めるときに足す。どちらの持ち主も、消えたら契約も消える（CASCADE）。
 */
export const entitlement = pgTable(
  "entitlement",
  {
    id: primaryId(),
    /** 何に効くか（アプリの key） */
    appKey: text("app_key").notNull(),
    holderAccountId: uuid("holder_account_id").references(() => accountTable.id, {
      onDelete: "cascade",
    }),
    holderOrganizationId: uuid("holder_organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    ...timestamps(),
  },
  (table) => [
    check(
      "entitlement_holder_check",
      sql`(${table.holderAccountId} IS NULL) <> (${table.holderOrganizationId} IS NULL)`,
    ),
    index("entitlement_holder_account_id_idx").on(table.holderAccountId),
    index("entitlement_holder_organization_id_idx").on(table.holderOrganizationId),
  ],
);

/**
 * 改善点（ログインした人が送った、アプリの困りごと・ほしいこと。運営者だけが読む。suite-004）。
 * 送った人は退会すると空になる（本文は残す）。アプリの key は任意（どのアプリでもないとき空）。
 */
export const feedback = pgTable(
  "feedback",
  {
    id: primaryId(),
    /** 送った人（退会すると空） */
    accountId: uuid("account_id").references(() => accountTable.id, { onDelete: "set null" }),
    /** どのアプリについてか（packages/contracts/src/core/apps.list.ts の key。任意） */
    appKey: text("app_key"),
    /** 本文（1〜2000文字） */
    body: text("body").notNull(),
    /** 運営者が「済み」を付けた日時（まだなら空） */
    doneAt: timestamptz("done_at"),
    ...timestamps(),
  },
  (table) => [
    check("feedback_body_check", sql`char_length(${table.body}) between 1 and 2000`),
    check(
      "feedback_app_key_check",
      sql`${table.appKey} is null or char_length(${table.appKey}) between 1 and 40`,
    ),
    index("feedback_created_at_idx").on(table.createdAt),
    index("feedback_account_id_created_at_idx").on(table.accountId, table.createdAt),
  ],
);
