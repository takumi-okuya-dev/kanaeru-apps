// 交流会の持ち主の結合のテスト（本物の PostgreSQL。event-002）：作った人が持ち主になる・持ち主のない今の交流会を
// 運営者が一覧を開いたときに運営者のものにする（research R1）。
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent } from "../../../test/helpers/event.ts";

const database = useTestDatabase();

/**
 * 交流会の持ち主を DB から読む。
 * @param eventId 交流会の ID
 * @returns 持ち主の account の ID（なければ null）
 */
async function ownerOf(eventId: string): Promise<string | null> {
  const result = await database.pool.query<{ owner: string | null }>(
    "SELECT owner_account_id AS owner FROM event WHERE id = $1",
    [eventId],
  );
  return result.rows[0]?.owner ?? null;
}

describe("交流会の持ち主", () => {
  let app: TestApp;
  let operator: { cookie: string; account: { id: string } };
  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }));
    operator = await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
  });

  it("作った人が持ち主になる", async () => {
    const created = await createEvent(app, operator.cookie);
    expect(await ownerOf(created.id)).toBe(operator.account.id);
  });

  it("持ち主のない交流会は、運営者が一覧を開くと運営者のものになる。ほかの人が開いても変わらない", async () => {
    const created = await createEvent(app, operator.cookie);
    await database.pool.query("UPDATE event SET owner_account_id = NULL WHERE id = $1", [
      created.id,
    ]);
    const other = await loginAs(app);
    expect((await call(app, other.cookie, "/api/v1/events")).status).toBe(200);
    expect(await ownerOf(created.id)).toBeNull();

    expect((await call(app, operator.cookie, "/api/v1/events")).status).toBe(200);
    expect(await ownerOf(created.id)).toBe(operator.account.id);
  });
});
