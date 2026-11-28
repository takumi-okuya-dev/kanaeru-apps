// 読書記録の領域の表（docs/apps/reading.md・specs/reading/001-bookshelf-import/data-model.md）。reading の領域だけが読み書きする（AD-3・AD-32）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。表の名前は reading_ で始める（AD-15）。
// 持ち主（使う人）の account を指す外部キーは CASCADE（AD-7・AD-19）。退会の前の手順は持たない（account と同じトランザクションで消える）。
// マーカーは、持ち主を含む複合の外部キーで本を指し、持ち主の違う本にマーカーを付けさせない（research R11）。
// 長さと選択肢の CHECK は約束（@workspace/contracts/reading）と同じ値を文字で書く（DB の変更の SQL に値を埋めるため。
// sql.raw は使わない）。食い違いは schema.test.ts が見張る。字は char_length（コードポイント）で数える。
// 読む場所（sources）の重なりは CHECK では書けないので、約束（zod）で止める（DB は選択肢の中で3つまで）。
// ほかの領域の index.ts（道の定義を含む）を読むので、先に @hono/zod-openapi を読む（drizzle-kit がこの順で読むため）。
import "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";
import { accountTable } from "../account/index.ts";

/** 本（最上位の記録。使う人の account で持つ。AD-19・AD-32）。同じ本を2冊持ってもよい（まとめるのは使う人。FR-008）。 */
export const readingBook = pgTable(
  "reading_book",
  {
    id: primaryId(),
    /** 持ち主（使う人。消すと本も消える） */
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** 書名 */
    title: text("title").notNull(),
    /** 著者 */
    author: text("author"),
    /** ISBN（13桁の数字。10桁は13桁に直して持つ） */
    isbn: text("isbn"),
    /** 書影の URL（openBD の書影の置き場所だけ。AD-33） */
    coverUrl: text("cover_url"),
    /** 書誌の出どころ（ndl・openbd・manual。作ったあと変えない。約束の READING_CATALOG_SOURCES） */
    catalogSource: text("catalog_source").notNull(),
    /** 分かりたいこと（PRD FR-R2） */
    want: text("want"),
    /** 状態（reading・finished・dropped。約束の READING_BOOK_STATUSES） */
    status: text("status").notNull().default("reading"),
    /** 読む場所（kindle・goodnotes・other の重ならない組。約束の READING_SOURCES） */
    sources: text("sources")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** 最後に取りこんだ時刻（取りこみの束を受けるたびに新しくする。本棚の並び。FR-007） */
    lastImportedAt: timestamptz("last_imported_at"),
    ...timestamps(),
  },
  (table) => [
    unique("reading_book_id_owner_unique").on(table.id, table.ownerAccountId),
    index("reading_book_owner_shelf_idx").on(
      table.ownerAccountId,
      table.status,
      table.lastImportedAt.desc().nullsLast(),
      table.createdAt.desc(),
    ),
    check("reading_book_title_check", sql`char_length(${table.title}) between 1 and 300`),
    check("reading_book_author_check", sql`char_length(${table.author}) between 1 and 300`),
    check("reading_book_isbn_check", sql`${table.isbn} ~ '^[0-9]{13}$'`),
    check(
      "reading_book_cover_url_check",
      sql`left(${table.coverUrl}, 24) = 'https://cover.openbd.jp/' and char_length(${table.coverUrl}) <= 300`,
    ),
    check(
      "reading_book_catalog_source_check",
      sql`${table.catalogSource} in ('ndl', 'openbd', 'manual')`,
    ),
    check("reading_book_want_check", sql`char_length(${table.want}) between 1 and 500`),
    check("reading_book_status_check", sql`${table.status} in ('reading', 'finished', 'dropped')`),
    check(
      "reading_book_sources_check",
      sql`${table.sources} <@ array['kindle', 'goodnotes', 'other']::text[] and cardinality(${table.sources}) <= 3`,
    ),
  ],
);

/**
 * マーカー（本の中で使う人が引いた1か所。コメントだけのものもある）。
 * 取りこみ直しで重ならないよう、重なりを見分ける鍵（API が作る SHA-256）で本ごとに一意にする（AD-32・research R3）。
 * 消したマーカーは行を残して deleted_at を入れる（取りこみ直しで戻さないため。research R4）。
 */
export const readingMarker = pgTable(
  "reading_marker",
  {
    id: primaryId(),
    /** 本 */
    bookId: uuid("book_id").notNull(),
    /** 持ち主（本と同じ。消すとマーカーも消える） */
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => accountTable.id, { onDelete: "cascade" }),
    /** どこから取りこんだか（goodnotes・kindle・paste。約束の READING_MARKER_SOURCES） */
    source: text("source").notNull(),
    /** 章の名前 */
    chapter: text("chapter"),
    /** ページ */
    page: integer("page"),
    /** 位置（Kindle の位置。reading-002） */
    location: integer("location"),
    /** 本の中の並びの番号（画面が作る。ページ × 100,000 ＋ ページの中の上からの順） */
    position: bigint("position", { mode: "number" }).notNull(),
    /** マーカーの文（空はコメントだけのもの） */
    text: text("text").notNull().default(""),
    /** コメント */
    comment: text("comment"),
    /** コメントを読書記録で直したか（直したら取りこみ直しで上書きしない。research R4） */
    commentEdited: boolean("comment_edited").notNull().default(false),
    /** あとで調べる（? の印。PRD FR-R11） */
    question: boolean("question").notNull().default(false),
    /** ? の印を画面で付け外したか（付け外したら取りこみ直しで上書きしない。research R4） */
    questionEdited: boolean("question_edited").notNull().default(false),
    /** 重なりを見分ける鍵（そろえた文とページか位置の SHA-256。API が作る。research R3） */
    dedupeKey: char("dedupe_key", { length: 64 }).notNull(),
    /** 消した時刻（消したマーカーは一覧に出さず、取りこみ直しでも戻さない） */
    deletedAt: timestamptz("deleted_at"),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      name: "reading_marker_book_fk",
      columns: [table.bookId, table.ownerAccountId],
      foreignColumns: [readingBook.id, readingBook.ownerAccountId],
    }).onDelete("cascade"),
    unique("reading_marker_book_dedupe_key_unique").on(table.bookId, table.dedupeKey),
    index("reading_marker_book_position_idx").on(table.bookId, table.deletedAt, table.position),
    index("reading_marker_owner_idx").on(table.ownerAccountId),
    check("reading_marker_source_check", sql`${table.source} in ('goodnotes', 'kindle', 'paste')`),
    check("reading_marker_chapter_check", sql`char_length(${table.chapter}) between 1 and 200`),
    check("reading_marker_page_check", sql`${table.page} >= 1`),
    check("reading_marker_location_check", sql`${table.location} >= 1`),
    check("reading_marker_text_check", sql`char_length(${table.text}) <= 4000`),
    check("reading_marker_comment_check", sql`char_length(${table.comment}) between 1 and 4000`),
    check(
      "reading_marker_text_or_comment_check",
      sql`${table.text} <> '' or ${table.comment} is not null`,
    ),
    check("reading_marker_dedupe_key_check", sql`${table.dedupeKey} ~ '^[0-9a-f]{64}$'`),
  ],
);
