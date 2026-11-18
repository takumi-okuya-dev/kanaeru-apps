// メモの領域の表（docs/apps/notes.md）。主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。
// 同じ題（大文字と小文字の違いを含む）のメモは1つだけ（一意の索引で守る。2つの要求が同時に来ても2つにならない）。
import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "../../kernel/columns.ts";

/** メモ。 */
export const note = pgTable(
  "note",
  {
    id: primaryId(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    ...timestamps(),
  },
  (table) => [uniqueIndex("note_title_unique").on(sql`lower(${table.title})`)],
);
