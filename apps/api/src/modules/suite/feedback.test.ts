// 改善点の窓口の結合のテスト（本物の PostgreSQL。suite-004）：
// - 送る：ログインした人だけ（401）・本文1〜2000文字と strict（400）・台帳にない・見えないアプリは 400・
//   1人1日20件まで（429。同時に送っても超えない）
// - 一覧・済み：運営者だけ（403）・新しい順・アプリで絞る・まだのものだけ・済みの付け外し（日時は最初のまま）・ない ID は 404
// - 退会すると、その人の改善点は消える
import "@hono/zod-openapi";
import type { FeedbackEntry, FeedbackList } from "@workspace/contracts/suite";
import { beforeEach, describe, expect, it } from "vitest";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import { upsertVisibility } from "./index.ts";

const database = useTestDatabase();

/** 改善点の窓口の道。 */
const FEEDBACK = "/api/v1/suite/feedback";

describe("改善点の窓口", () => {
  let app: TestApp;
  let operator: string;
  let member: { cookie: string; account: { id: string } };

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }));
    operator = (await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST })).cookie;
    member = await loginAs(app, { displayName: "送る人" });
    // 改善点を送れるのは、その人に見えるアプリだけ（台帳で公開にしておく）
    await upsertVisibility(database.db, "match", "public");
    await upsertVisibility(database.db, "reception", "public");
  });

  /**
   * 運営者として一覧を読む。
   * @param query 絞り方（?app=… など）
   * @returns 一覧
   */
  async function list(query = ""): Promise<FeedbackList> {
    const response = await call(app, operator, `${FEEDBACK}${query}`);
    expect(response.status).toBe(200);
    return (await response.json()) as FeedbackList;
  }

  it("ログインした人は送れ、運営者は新しい順に読める。ログインなしは 401", async () => {
    const first = await call(app, member.cookie, FEEDBACK, "POST", {
      body: "  名簿を初めは閉じてほしい  ",
      appKey: "match",
    });
    expect(first.status).toBe(201);
    const second = await call(app, member.cookie, FEEDBACK, "POST", { body: "全体の要望" });
    expect(second.status).toBe(201);
    expect((await call(app, "", FEEDBACK, "POST", { body: "名前なし" })).status).toBe(401);
    const { items } = await list();
    expect(items.map((item) => item.body)).toEqual(["全体の要望", "名簿を初めは閉じてほしい"]);
    expect(items[1]).toMatchObject({
      appKey: "match",
      appName: "試合表",
      sender: "送る人",
      done: false,
    });
    expect(items[0]?.appKey).toBeNull();
  });

  it("本文が空・長すぎる・ほかの欄がある・台帳にないアプリは 400", async () => {
    for (const body of [
      { body: "   " },
      { body: "あ".repeat(2001) },
      { body: "要望", email: "a@example.com" },
      { body: "要望", appKey: "no-such-app" },
    ]) {
      expect((await call(app, member.cookie, FEEDBACK, "POST", body)).status).toBe(400);
    }
    expect((await list()).items).toEqual([]);
  });

  it("その人に見えないアプリ（運営者だけ）は 400。運営者は送れる", async () => {
    await upsertVisibility(database.db, "match", "operator_only");
    expect(
      (await call(app, member.cookie, FEEDBACK, "POST", { body: "要望", appKey: "match" })).status,
    ).toBe(400);
    expect(
      (await call(app, operator, FEEDBACK, "POST", { body: "要望", appKey: "match" })).status,
    ).toBe(201);
  });

  it("同時に送っても、1人1日20件を超えない", async () => {
    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        call(app, member.cookie, FEEDBACK, "POST", { body: `同時${index}` }),
      ),
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(20);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });

  it("1人1日20件まで。21件目は 429", async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = await call(app, member.cookie, FEEDBACK, "POST", { body: `要望${index}` });
      expect(response.status).toBe(201);
    }
    const over = await call(app, member.cookie, FEEDBACK, "POST", { body: "21件目" });
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: { code: string } }).error.code).toBe(
      "FEEDBACK_DAILY_LIMIT",
    );
  });

  it("運営者でない人は一覧も済みも 403", async () => {
    await call(app, member.cookie, FEEDBACK, "POST", { body: "要望" });
    const [item] = (await list()).items;
    expect((await call(app, member.cookie, FEEDBACK)).status).toBe(403);
    expect(
      (await call(app, member.cookie, `${FEEDBACK}/${item?.id}/done`, "PUT", { done: true }))
        .status,
    ).toBe(403);
  });

  it("済みを付け外し、まだのものだけ・アプリで絞れる。ない ID は 404", async () => {
    await call(app, member.cookie, FEEDBACK, "POST", { body: "試合表の要望", appKey: "match" });
    await call(app, member.cookie, FEEDBACK, "POST", { body: "受付の要望", appKey: "reception" });
    const target = (await list()).items.find((item) => item.appKey === "match");
    const done = await call(app, operator, `${FEEDBACK}/${target?.id}/done`, "PUT", { done: true });
    expect(done.status).toBe(200);
    expect(((await done.json()) as FeedbackEntry).done).toBe(true);
    // もう一度済みにしても、済みにした日時は最初のまま
    const first = await database.pool.query<{ done_at: Date }>(
      "SELECT done_at FROM feedback WHERE id = $1",
      [target?.id],
    );
    await call(app, operator, `${FEEDBACK}/${target?.id}/done`, "PUT", { done: true });
    const again = await database.pool.query<{ done_at: Date }>(
      "SELECT done_at FROM feedback WHERE id = $1",
      [target?.id],
    );
    expect(again.rows[0]?.done_at).toEqual(first.rows[0]?.done_at);
    expect((await list("?pending=true")).items.map((item) => item.body)).toEqual(["受付の要望"]);
    expect((await list("?app=match")).items.map((item) => item.body)).toEqual(["試合表の要望"]);
    const undo = await call(app, operator, `${FEEDBACK}/${target?.id}/done`, "PUT", {
      done: false,
    });
    expect(((await undo.json()) as FeedbackEntry).done).toBe(false);
    const missing = "0193a1b2-0000-7000-8000-000000000000";
    expect(
      (await call(app, operator, `${FEEDBACK}/${missing}/done`, "PUT", { done: true })).status,
    ).toBe(404);
  });

  it("送った人が退会すると、その人の改善点は消える。一覧は上限で切ったかを返す", async () => {
    await call(app, member.cookie, FEEDBACK, "POST", { body: "要望" });
    expect((await list()).truncated).toBe(false);
    await database.pool.query("DELETE FROM account WHERE id = $1", [member.account.id]);
    expect((await list()).items).toEqual([]);
  });
});
