// 改善点の表（feedback。suite-004）の結合のテスト（本物の PostgreSQL）：本文は1〜2000文字・アプリの key は空か1〜40文字・
// 送った人を消すと、改善点は残り送った人だけ空になる。窓口はまだないので、表に直に書いて確かめる（窓口は suite-004 の2つ目の PR）。
import "@hono/zod-openapi";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";

const database = useTestDatabase();

describe("改善点の表", () => {
  let accountId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    const app = buildApp(database, testConfig());
    accountId = (await loginAs(app, { displayName: "送る人" })).account.id;
  });

  /**
   * 改善点を表に直に足す。
   * @param body 本文
   * @param appKey アプリの key
   * @returns 足した行の ID
   */
  async function insert(body: string, appKey: string | null = "match"): Promise<string> {
    const result = await database.pool.query<{ id: string }>(
      "INSERT INTO feedback (account_id, app_key, body) VALUES ($1, $2, $3) RETURNING id",
      [accountId, appKey, body],
    );
    return result.rows[0]?.id ?? "";
  }

  it("本文は1〜2000文字、アプリの key は空か1〜40文字だけが入る", async () => {
    await expect(insert("名簿をたたみたい")).resolves.toBeTruthy();
    await expect(insert("あ".repeat(2000), null)).resolves.toBeTruthy();
    await expect(insert("")).rejects.toThrow(/feedback_body_check/u);
    await expect(insert("あ".repeat(2001))).rejects.toThrow(/feedback_body_check/u);
    await expect(insert("本文", "")).rejects.toThrow(/feedback_app_key_check/u);
    await expect(insert("本文", "a".repeat(41))).rejects.toThrow(/feedback_app_key_check/u);
  });

  it("送った人を消すと、改善点は残り、送った人だけ空になる", async () => {
    const id = await insert("印刷の字を小さく");
    await database.pool.query("DELETE FROM account WHERE id = $1", [accountId]);
    const rows = await database.pool.query<{ account_id: string | null; body: string }>(
      "SELECT account_id, body FROM feedback WHERE id = $1",
      [id],
    );
    expect(rows.rows).toEqual([{ account_id: null, body: "印刷の字を小さく" }]);
  });
});
