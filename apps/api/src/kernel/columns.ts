// 表の定義で共通に使う列（docs/rules/coding.md 6-4）。
// 主キーは uuid（既定値 uuidv7()）、時刻は timestamptz、created_at・updated_at は NOT NULL DEFAULT now()。
import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * 主キーの列（uuid。DB が uuidv7() で作る）。
 * @returns 列の定義
 */
export function primaryId() {
  return uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`);
}

/**
 * 時刻の列（timestamptz）。
 * @param name DB の列の名前
 * @returns 列の定義
 */
export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true });
}

/**
 * 作った時刻と直した時刻の列。updated_at はアプリが書くときに直す。
 * 直すときも、作ったときと同じ DB の時計（now()）で入れる。アプリの時計で入れると、DB の時計とずれたとき、
 * 直した時刻が作った時刻より前になる（DB の変更は要らない：列の既定の値は変えていない）。
 * @returns 列の定義
 */
export function timestamps() {
  return {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .$onUpdate(() => sql`now()`)
      .notNull(),
  };
}
