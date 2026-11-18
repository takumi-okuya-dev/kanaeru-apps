// 共通の列（created_at・updated_at）の時刻は、どちらも DB の時計で入れる（アプリと DB の時計がずれても、直した時刻が作った時刻より前にならない）。
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { primaryId, timestamps } from "./columns.ts";

/** 確かめ用の表（DB には作らない）。 */
const sample = pgTable("sample", {
  id: primaryId(),
  name: text("name").notNull(),
  ...timestamps(),
});

describe("共通の列", () => {
  it("直すときの updated_at は、アプリの時刻でなく DB の now() で入れる", () => {
    const db = drizzle.mock({ casing: "snake_case" });
    const query = db.update(sample).set({ name: "直した" }).toSQL();
    expect(query.sql).toContain('"updated_at" = now()');
    expect(query.params).toEqual(["直した"]);
  });
});
