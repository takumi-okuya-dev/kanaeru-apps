// Threads への接続の案内（threads-012）の結合のテスト：
// - 自分の別の運用アカウントがつないでいる Threads のアカウントは THREADS_ACCOUNT_REGISTERED、ほかの人のものは THREADS_ACCOUNT_TAKEN
// - ユーザー名だけが同じ運用アカウントは、持っているトークンで今の名前を読み直してから比べる（名前を手放していれば、つなげる）
import "@hono/zod-openapi";
import type { ThreadsAccount } from "@workspace/contracts/threads";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { createDomainFeatures } from "../../kernel/features.ts";
import { createFakeThreads } from "./fake-threads.ts";
import type { FakeThreads } from "./fake-threads.ts";

const database = useTestDatabase();

/** 運用アカウントの道の頭。 */
const BASE = "/api/v1/threads/accounts";

/** トークンを包む鍵の束（テストだけの値）。 */
const KEY_RING = JSON.stringify({ "1": btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) });

/** 偽の Threads の源。 */
const FAKE_BASE = "http://fake-threads.test";

describe("Threads への接続の案内", () => {
  let fake: FakeThreads;
  let app: TestApp;
  let cookie: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    fake = createFakeThreads();
    fake.addUser({ id: "9001", username: "takumi_dev", name: "たくみ" });
    app = buildApp(
      database,
      testConfig({
        tokenEncryption: { keyRing: KEY_RING, currentVersion: 1 },
        threadsApiBaseUrl: FAKE_BASE,
      }),
      { features: createDomainFeatures([]), fetch: fake.fetch },
    );
    cookie = (await loginAs(app, { displayName: "たくみ" })).cookie;
  });

  /**
   * 運用アカウントを作る。
   * @param who クッキー
   * @returns 運用アカウント
   */
  async function createAccount(who = cookie): Promise<ThreadsAccount> {
    const response = await call(app, who, BASE, "POST", { name: "運用" });
    expect(response.status).toBe(201);
    return (await response.json()) as ThreadsAccount;
  }

  /**
   * トークンを貼る。
   * @param accountId 運用アカウントの ID
   * @param token トークン
   * @param who クッキー
   * @returns 応答
   */
  function connect(accountId: string, token: string, who = cookie): Promise<Response> {
    return call(app, who, `${BASE}/${accountId}/connection`, "POST", { token });
  }

  /**
   * エラーの code を読む。
   * @param response 応答
   * @returns code
   */
  async function codeOf(response: Response): Promise<string> {
    return ((await response.json()) as ErrorBody).error.code;
  }

  /**
   * 運用アカウントのユーザー名を DB から読む。
   * @param id 運用アカウントの ID
   * @returns ユーザー名
   */
  async function usernameOf(id: string): Promise<string | null | undefined> {
    const rows = await database.pool.query<{ username: string | null }>(
      "SELECT username FROM threads_account WHERE id = $1",
      [id],
    );
    return rows.rows[0]?.username;
  }

  it("自分の別の運用アカウントがつないでいれば THREADS_ACCOUNT_REGISTERED、ほかの人なら THREADS_ACCOUNT_TAKEN", async () => {
    const first = await createAccount();
    expect((await connect(first.id, fake.issueToken({ userId: "9001" }))).status).toBe(200);

    const second = await createAccount();
    const mine = await connect(second.id, fake.issueToken({ userId: "9001" }));
    expect(mine.status).toBe(409);
    expect(await codeOf(mine)).toBe("THREADS_ACCOUNT_REGISTERED");

    const someone = (await loginAs(app, { displayName: "ほかの人" })).cookie;
    const theirs = await createAccount(someone);
    const taken = await connect(theirs.id, fake.issueToken({ userId: "9001" }), someone);
    expect(taken.status).toBe(409);
    expect(await codeOf(taken)).toBe("THREADS_ACCOUNT_TAKEN");
  });

  it("ユーザー名だけが同じ運用アカウントは、今の名前を読み直す。名前を手放していれば、つなげて前の名前を新しくする", async () => {
    const first = await createAccount();
    expect((await connect(first.id, fake.issueToken({ userId: "9001" }))).status).toBe(200);
    // 9001 が名前を変え、手放した名前を 9003 が取った
    fake.addUser({ id: "9001", username: "takumi_new", name: "たくみ" });
    fake.addUser({ id: "9003", username: "takumi_dev", name: "あとの人" });

    const someone = (await loginAs(app, { displayName: "あとの人" })).cookie;
    const theirs = await createAccount(someone);
    const response = await connect(theirs.id, fake.issueToken({ userId: "9003" }), someone);
    expect(response.status).toBe(200);
    expect(await usernameOf(first.id)).toBe("takumi_new");
    expect(await usernameOf(theirs.id)).toBe("takumi_dev");
  });

  it("名前を読み直せない（トークンが使えない）ときは、同じ名前のまま比べて断る", async () => {
    const first = await createAccount();
    const token = fake.issueToken({ userId: "9001" });
    expect((await connect(first.id, token)).status).toBe(200);
    fake.invalidate(token);
    fake.addUser({ id: "9003", username: "takumi_dev", name: "あとの人" });

    const second = await createAccount();
    const response = await connect(second.id, fake.issueToken({ userId: "9003" }));
    expect(response.status).toBe(409);
    expect(await codeOf(response)).toBe("THREADS_ACCOUNT_REGISTERED");
    expect(await usernameOf(first.id)).toBe("takumi_dev");
  });
});
