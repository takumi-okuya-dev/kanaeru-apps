// 見本のデータ（pnpm db:seed とテストが使う）。何度入れても増えない（同じ題は一意の索引で足さない）。
import type { Db } from "../../src/kernel/db.ts";
import { note } from "../../src/modules/notes/index.ts";

/** 見本のメモ（すべて仮の中身）。 */
export const SAMPLE_NOTES = [
  {
    title: "はじめに読むこと",
    body: "このメモは見本です。消しても、pnpm db:seed でまた入ります。",
  },
  { title: "買い物", body: "牛乳\n卵\nパン" },
  { title: "次にやること", body: "" },
] as const;

/**
 * 見本のデータを入れる。
 * @param db DB
 * @returns 足したメモの数
 */
export async function seedSampleData(db: Db): Promise<number> {
  const rows = await db
    .insert(note)
    .values([...SAMPLE_NOTES])
    .onConflictDoNothing()
    .returning({ id: note.id });
  return rows.length;
}
