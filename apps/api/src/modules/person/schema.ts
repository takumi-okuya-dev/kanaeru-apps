// 人物メモの領域の表（docs/apps/person.md・specs/person/001-notes/data-model.md）。person の領域だけが読み書きする（AD-3・AD-31）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。表の名前は person_ で始める（AD-15）。
// 持ち主（使う人）の account を指す外部キーは CASCADE（AD-7・AD-31）。退会の前の手順は持たない（account と同じトランザクションで消える）。
// 人と会った場の組は、持ち主を含む複合の外部キーで、持ち主の違う人と会った場を結ばせない（AD-31）。
// 長さと選択肢の CHECK は約束（@workspace/contracts/person）と同じ値を文字で書く（DB の変更の SQL に値を埋めるため。
// sql.raw は使わない）。食い違いは schema.test.ts が見張る。字は char_length（コードポイント）で数える。
// タグ1つの長さは、配列の要素ごとの CHECK を書けないので約束（zod）だけで確かめる（DB は空の要素がないことと数だけ）。
// ほかの領域の index.ts（道の定義を含む）を読むので、先に @hono/zod-openapi を読む（drizzle-kit がこの順で読むため）。
import "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";
import { accountTable } from "../account/index.ts";
import { eventTable } from "../event/index.ts";

/**
 * 人のメモ（最上位の記録。使う人の account で持つ。AD-19・AD-31）。
 * メモの相手は PaletKit の利用者と結び付けない（相手の account の ID を持たない。AD-2）。
 */
export const personNote = pgTable(
  "person_note",
  {
    id: primaryId(),
    /** 持ち主（使う人。消すとメモも消える） */
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** フルネーム（要る） */
    fullName: text("full_name").notNull(),
    /** よみ */
    reading: text("reading"),
    /** LINE の名前（表示名） */
    lineName: text("line_name"),
    /** 見た目の特徴（短い文。顔写真の代わり） */
    appearance: text("appearance"),
    /** X のアカウント名 */
    accountX: text("account_x"),
    /** connpass のアカウント名 */
    accountConnpass: text("account_connpass"),
    /** GitHub のアカウント名 */
    accountGithub: text("account_github"),
    /** LinkedIn のアカウント名 */
    accountLinkedin: text("account_linkedin"),
    /** LINE ID */
    accountLine: text("account_line"),
    /** そのほかの URL（http・https だけ） */
    accountUrl: text("account_url"),
    /** タグ（書いた形。数の上限は置かない） */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** タグをそろえた形（タグで絞るときに使う。tags と同じ数） */
    tagKeys: text("tag_keys")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** 話したこと（書き足しの見出しを含む） */
    talk: text("talk").notNull().default(""),
    /** 次に話したいこと */
    nextTopic: text("next_topic").notNull().default(""),
    /** 検索のためにそろえた文（API が保存のたびに作る。AD-31） */
    searchText: text("search_text").notNull(),
    /** そろえ方の版（そろえ方を直す PR は、作り直しの DB の変更を同じ PR に入れる） */
    searchVersion: smallint("search_version").notNull(),
    /** 版の番号（書き直し・書き足しで1つ上げる。もとの版が違う書き直しは 409） */
    version: integer("version").notNull().default(1),
    /** 人を足したときの、画面が作った ID（送り直しで二重にしない） */
    createRequestId: uuid("create_request_id"),
    /** 最後に受けた書き足しの ID（同じ書き足しがもう一度来たら、書かずに今の値を返す） */
    lastAppendId: uuid("last_append_id"),
    ...timestamps(),
  },
  (table) => [
    unique("person_note_id_owner_unique").on(table.id, table.ownerAccountId),
    uniqueIndex("person_note_owner_create_request_unique")
      .on(table.ownerAccountId, table.createRequestId)
      .where(sql`${table.createRequestId} is not null`),
    index("person_note_owner_updated_at_idx").on(table.ownerAccountId, table.updatedAt.desc()),
    check("person_note_full_name_check", sql`char_length(${table.fullName}) between 1 and 100`),
    check("person_note_reading_check", sql`char_length(${table.reading}) <= 100`),
    check("person_note_line_name_check", sql`char_length(${table.lineName}) <= 100`),
    check("person_note_appearance_check", sql`char_length(${table.appearance}) <= 200`),
    check(
      "person_note_accounts_check",
      sql`char_length(${table.accountX}) <= 200 and char_length(${table.accountConnpass}) <= 200 and char_length(${table.accountGithub}) <= 200 and char_length(${table.accountLinkedin}) <= 200 and char_length(${table.accountLine}) <= 200 and char_length(${table.accountUrl}) <= 200`,
    ),
    check("person_note_account_url_check", sql`${table.accountUrl} ~* '^https?://'`),
    check(
      "person_note_tags_check",
      sql`cardinality(${table.tagKeys}) = cardinality(${table.tags}) and array_position(${table.tags}, null) is null and array_position(${table.tagKeys}, null) is null`,
    ),
    check("person_note_talk_check", sql`char_length(${table.talk}) <= 20000`),
    check("person_note_next_topic_check", sql`char_length(${table.nextTopic}) <= 2000`),
  ],
);

/**
 * 会った場（使う人の一覧の1件。1件に何人もつながる。AD-31）。
 * 作り方（source）は作ったあと変えない。event のものは交流会を指し、作ったときの名前と日付の写しを持つ（交流会が消えたら空。AD-25 と同じ）。
 */
export const personMeeting = pgTable(
  "person_meeting",
  {
    id: primaryId(),
    /** 持ち主（使う人。消すと会った場も消える） */
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** 作り方（manual：手で書いた・event：PaletKit の交流会から。約束の PERSON_MEETING_SOURCES） */
    source: text("source").notNull(),
    /** 名前（event のときは、作ったときの交流会の名前の写し） */
    name: text("name").notNull(),
    /** 名前をそろえたもの（手で書いた会った場の一意と、検索に使う） */
    nameKey: text("name_key").notNull(),
    /** 会った日（日本時間の日付。event のときは、作ったときの交流会の日付の写し） */
    metOn: date("met_on", { mode: "string" }).notNull(),
    /** PaletKit の交流会（任意。交流会が消えたら空） */
    eventId: uuid("event_id").references(() => eventTable.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    unique("person_meeting_id_owner_unique").on(table.id, table.ownerAccountId),
    uniqueIndex("person_meeting_owner_event_unique")
      .on(table.ownerAccountId, table.eventId)
      .where(sql`${table.eventId} is not null`),
    uniqueIndex("person_meeting_owner_manual_unique")
      .on(table.ownerAccountId, table.nameKey, table.metOn)
      .where(sql`${table.source} = 'manual'`),
    index("person_meeting_owner_met_on_idx").on(table.ownerAccountId, table.metOn.desc()),
    index("person_meeting_event_id_idx").on(table.eventId),
    check("person_meeting_source_check", sql`${table.source} in ('manual', 'event')`),
    check(
      "person_meeting_event_source_check",
      sql`${table.source} = 'event' or ${table.eventId} is null`,
    ),
    check("person_meeting_name_check", sql`char_length(${table.name}) between 1 and 100`),
    // そろえた名前は空にしない（空だと、同じ日の手で書いた会った場がまとまってしまう）。NFKC で字が増えうるので上限は広く取る
    check("person_meeting_name_key_check", sql`char_length(${table.nameKey}) between 1 and 400`),
  ],
);

/** 人と会った場の組（同じ組は1つだけ。持ち主の違う人と会った場は、複合の外部キーが結ばせない）。 */
export const personNoteMeeting = pgTable(
  "person_note_meeting",
  {
    /** 人 */
    noteId: uuid("note_id").notNull(),
    /** 会った場 */
    meetingId: uuid("meeting_id").notNull(),
    /** 持ち主（人と会った場の両方と同じ） */
    ownerAccountId: uuid("owner_account_id").notNull(),
    /** 結んだ時刻 */
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "person_note_meeting_pkey", columns: [table.noteId, table.meetingId] }),
    foreignKey({
      name: "person_note_meeting_note_fk",
      columns: [table.noteId, table.ownerAccountId],
      foreignColumns: [personNote.id, personNote.ownerAccountId],
    }).onDelete("cascade"),
    foreignKey({
      name: "person_note_meeting_meeting_fk",
      columns: [table.meetingId, table.ownerAccountId],
      foreignColumns: [personMeeting.id, personMeeting.ownerAccountId],
    }).onDelete("cascade"),
    index("person_note_meeting_meeting_id_idx").on(table.meetingId),
  ],
);
