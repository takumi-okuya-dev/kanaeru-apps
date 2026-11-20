// OAuth の接続と Meta の Webhook（threads-010）の結合のテスト（本物の PostgreSQL・偽の Threads。外へ出ない）：
// 機能の印が切なら 404・使えるか・始める（認可の URL）・戻り（画面へ渡すだけ）・完了（同じ人だけ・1回だけ・許可しなかった・つなぐ）・
// 連携の解除（署名・古い知らせ・フォームの形でも組み立ての csrf を通る）・データの削除（運用アカウントを消す・送り直し・状況）・定期の仕事のやり直し。
import "@hono/zod-openapi";
import { listApps } from "@workspace/contracts/core";
import type { Connection, ThreadsAccount } from "@workspace/contracts/threads";
import { createSecretBox } from "@workspace/secret-box";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { call } from "../../../test/helpers/event.ts";
import { createDomainFeatures } from "../../kernel/features.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { createJobRequestCheck } from "../../kernel/job-auth.ts";
import { createLogger } from "../../kernel/logger.ts";
import { createMetaApp, signRequestForTest } from "../../kernel/meta-app.ts";
import { createFakeThreads } from "./fake-threads.ts";
import type { FakeThreads } from "./fake-threads.ts";
import { THREADS_OAUTH_FEATURE, runOauthMaintenance, threadsUserHash } from "./oauth.ts";

const database = useTestDatabase();
const BASE = "/api/v1/threads";
const KEY_RING = JSON.stringify({ "1": btoa(String.fromCharCode(...new Uint8Array(32).fill(6))) });
const FAKE_BASE = "http://fake-threads.test";
const APP_SECRET = "a".repeat(32);
const THREADS_APP = { appId: "123456", appSecret: APP_SECRET };
const WEB = testConfig().webUrl;

describe("OAuth の接続と Meta の Webhook", () => {
  let fake: FakeThreads;
  let app: TestApp;
  let cookie: string;
  let accountId: string;

  /**
   * 組み立てる。
   * @param features 入にする機能の印
   * @returns API
   */
  function build(features: string[]): TestApp {
    return buildApp(
      database,
      testConfig({
        tokenEncryption: { keyRing: KEY_RING, currentVersion: 1 },
        threadsApiBaseUrl: FAKE_BASE,
        threadsApp: THREADS_APP,
      }),
      { features: createDomainFeatures(features), fetch: fake.fetch },
    );
  }

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    fake = createFakeThreads();
    fake.addUser({ id: "9001", username: "takumi_dev", name: "たくみ" });
    app = build([THREADS_OAUTH_FEATURE]);
    cookie = (await loginAs(app)).cookie;
    accountId = (
      (await (
        await call(app, cookie, `${BASE}/accounts`, "POST", { name: "運用" })
      ).json()) as ThreadsAccount
    ).id;
  });

  /**
   * フォームの形で Webhook を送る（Meta と同じく Origin なし）。
   * @param path 道
   * @param signedRequest signed_request
   * @returns 応答
   */
  async function webhook(path: string, signedRequest: string): Promise<Response> {
    return await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ signed_request: signedRequest }).toString(),
    });
  }

  /**
   * 始めて、偽の認可の画面から戻ったときの state と code を得る。
   * @returns state と code
   */
  async function authorize(): Promise<{ state: string; code: string }> {
    const started = await call(
      app,
      cookie,
      `${BASE}/accounts/${accountId}/oauth/start`,
      "POST",
      {},
    );
    expect(started.status).toBe(200);
    const { authorizeUrl } = (await started.json()) as { authorizeUrl: string };
    const url = new URL(authorizeUrl);
    expect(url.origin).toBe(FAKE_BASE);
    expect(url.searchParams.get("client_id")).toBe("123456");
    expect(url.searchParams.get("redirect_uri")).toBe(`${WEB}/api/v1/threads/oauth/callback`);
    const back = await fake.app.request(`/oauth/authorize${url.search}`);
    const location = new URL(back.headers.get("location") ?? "");
    return {
      state: location.searchParams.get("state") ?? "",
      code: location.searchParams.get("code") ?? "",
    };
  }

  /**
   * 接続を読む。
   * @returns 接続
   */
  async function connection(): Promise<Connection> {
    return (await (
      await call(app, cookie, `${BASE}/accounts/${accountId}/connection`)
    ).json()) as Connection;
  }

  it("機能の印 threads.oauth が切なら、どの窓口も 404。使えるかは false", async () => {
    app = build([]);
    expect(await (await call(app, cookie, `${BASE}/oauth/availability`)).json()).toEqual({
      available: false,
    });
    expect(
      (await call(app, cookie, `${BASE}/accounts/${accountId}/oauth/start`, "POST", {})).status,
    ).toBe(404);
    expect((await app.request(`${BASE}/oauth/callback?state=a&code=b`)).status).toBe(404);
    expect((await webhook(`${BASE}/webhooks/data-deletion`, "x.y")).status).toBe(404);
  });

  it("始めて、戻りは画面へ渡すだけ。完了で長期のトークンに替えてつなぐ。state は1回だけ・同じ人だけ", async () => {
    expect(await (await call(app, cookie, `${BASE}/oauth/availability`)).json()).toEqual({
      available: true,
    });
    const { state, code } = await authorize();
    // 戻り：DB にも Threads にも触らず、画面の完了の画面へ
    const back = await app.request(`${BASE}/oauth/callback?state=${state}&code=${code}`);
    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toBe(
      `${WEB}/threads/oauth/complete?state=${state}&code=${code}`,
    );
    const denied = await app.request(`${BASE}/oauth/callback?state=${state}&error=access_denied`);
    expect(denied.headers.get("location")).toContain("error=cancelled");

    // ほかの人は完了できない（state は使い切る）
    const other = (await loginAs(app, { lineUserId: `U${"6".repeat(32)}` })).cookie;
    const stolen = await call(app, other, `${BASE}/oauth/complete`, "POST", { state, code });
    expect(stolen.status).toBe(400);

    const second = await authorize();
    const done = await call(app, cookie, `${BASE}/oauth/complete`, "POST", second);
    expect(await done.json()).toEqual({
      redirectTo: `/threads/accounts/${accountId}/settings?oauth=connect`,
    });
    expect(await connection()).toMatchObject({ status: "connected", username: "takumi_dev" });
    // 同じ state はもう使えない
    expect((await call(app, cookie, `${BASE}/oauth/complete`, "POST", second)).status).toBe(400);
    // 許可しなかった
    const third = await authorize();
    const cancelled = await call(app, cookie, `${BASE}/oauth/complete`, "POST", {
      state: third.state,
      error: "cancelled",
    });
    expect(((await cancelled.json()) as { redirectTo: string }).redirectTo).toContain(
      "oauth=cancelled",
    );
    // code が違う
    const fourth = await authorize();
    const failed = await call(app, cookie, `${BASE}/oauth/complete`, "POST", {
      state: fourth.state,
      code: "WRONG",
    });
    expect(((await failed.json()) as { redirectTo: string }).redirectTo).toContain("oauth=failed");
    const activity = (await (
      await call(app, cookie, `${BASE}/accounts/${accountId}/activity?kind=settings`)
    ).json()) as { items: { action: string }[] };
    expect(activity.items.map((item) => item.action)).toContain("threads_connected");
  });

  it("連携の解除：署名が違えば 400。認可より前の知らせは当てない。あとの知らせで接続し直しが要るにする", async () => {
    const pair = await authorize();
    await call(app, cookie, `${BASE}/oauth/complete`, "POST", pair);
    expect(
      (
        await webhook(
          `${BASE}/webhooks/uninstall`,
          signRequestForTest("b".repeat(32), { user_id: "9001" }),
        )
      ).status,
    ).toBe(400);
    expect((await webhook(`${BASE}/webhooks/uninstall`, "broken")).status).toBe(400);
    const old = signRequestForTest(APP_SECRET, {
      algorithm: "HMAC-SHA256",
      user_id: "9001",
      issued_at: Math.floor(Date.now() / 1000) - 3600,
    });
    expect((await webhook(`${BASE}/webhooks/uninstall`, old)).status).toBe(200);
    expect((await connection()).status).toBe("connected");
    const fresh = signRequestForTest(APP_SECRET, {
      algorithm: "HMAC-SHA256",
      user_id: "9001",
      issued_at: Math.floor(Date.now() / 1000) + 60,
    });
    expect((await webhook(`${BASE}/webhooks/uninstall`, fresh)).status).toBe(200);
    expect((await connection()).status).toBe("needs_reconnect");
  });

  it("データの削除：運用アカウントを消し、状況の URL と確認のコードを返す。送り直しは同じコード", async () => {
    const pair = await authorize();
    await call(app, cookie, `${BASE}/oauth/complete`, "POST", pair);
    const signed = signRequestForTest(APP_SECRET, { algorithm: "HMAC-SHA256", user_id: "9001" });
    const response = await webhook(`${BASE}/webhooks/data-deletion`, signed);
    expect(response.status).toBe(200);
    const receipt = (await response.json()) as { url: string; confirmation_code: string };
    expect(receipt.url).toBe(`${WEB}/threads/data-deletion/${receipt.confirmation_code}`);
    expect((await call(app, cookie, `${BASE}/accounts/${accountId}`)).status).toBe(404);
    const again = (await (await webhook(`${BASE}/webhooks/data-deletion`, signed)).json()) as {
      confirmation_code: string;
    };
    expect(again.confirmation_code).toBe(receipt.confirmation_code);
    const status = await app.request(`${BASE}/data-deletion/${receipt.confirmation_code}`);
    expect(await status.json()).toMatchObject({ status: "completed" });
    expect((await app.request(`${BASE}/data-deletion/${"0".repeat(32)}`)).status).toBe(404);
    expect((await webhook(`${BASE}/webhooks/data-deletion`, "x.y")).status).toBe(400);
    const stored = await database.pool.query<{ threads_user_id: string | null }>(
      "SELECT threads_user_id FROM threads_deletion_request",
    );
    expect(stored.rows).toEqual([{ threads_user_id: null }]);
  });

  it("連携の解除：つないだ運用アカウントがなくても記録し、許可の画面から戻る途中の接続を止める（threads-012）", async () => {
    const pair = await authorize();
    // 完了より後の時刻の知らせ（完了の途中で連携を解いた）
    const revoked = signRequestForTest(APP_SECRET, {
      algorithm: "HMAC-SHA256",
      user_id: "9001",
      issued_at: Math.floor(Date.now() / 1000) + 60,
    });
    expect((await webhook(`${BASE}/webhooks/uninstall`, revoked)).status).toBe(200);
    const recorded = await database.pool.query<{ threads_user_hash: string }>(
      "SELECT threads_user_hash FROM threads_revocation",
    );
    expect(recorded.rows).toEqual([{ threads_user_hash: threadsUserHash("9001") }]);
    expect(recorded.rows[0]?.threads_user_hash).not.toContain("9001");
    const done = await call(app, cookie, `${BASE}/oauth/complete`, "POST", pair);
    expect(((await done.json()) as { redirectTo: string }).redirectTo).toBe(
      `/threads/accounts/${accountId}/settings?oauth=THREADS_AUTH_REVOKED`,
    );
    expect((await connection()).status).toBe("not_connected");
  });

  it("データの削除の要求が終わっていない・接続を始めたあとに終わったなら、OAuth の接続を断る（threads-012）", async () => {
    await database.pool.query(
      `INSERT INTO threads_deletion_request (confirmation_code, request_fingerprint, threads_user_id, threads_user_hash, status, received_at, last_attempted_at)
       VALUES ($1, 'fp1', '9001', $2, 'pending', now(), now())`,
      ["a".repeat(32), threadsUserHash("9001")],
    );
    const first = await authorize();
    const pending = await call(app, cookie, `${BASE}/oauth/complete`, "POST", first);
    expect(((await pending.json()) as { redirectTo: string }).redirectTo).toContain(
      "oauth=THREADS_DATA_DELETION_REQUESTED",
    );
    expect((await connection()).status).toBe("not_connected");

    // 接続を始めたあとに終わった（ID は消えてハッシュだけが残る）
    const second = await authorize();
    // 終わった時刻は、アプリと同じ時計で入れる（本番も completed_at はアプリの時計。DB の now() と混ぜると数ミリ秒前後する）
    await database.pool.query(
      "UPDATE threads_deletion_request SET status = 'completed', completed_at = $1, threads_user_id = NULL",
      [new Date()],
    );
    const completed = await call(app, cookie, `${BASE}/oauth/complete`, "POST", second);
    expect(((await completed.json()) as { redirectTo: string }).redirectTo).toContain(
      "oauth=THREADS_DATA_DELETION_REQUESTED",
    );

    // 接続を始める前に終わったものは止めない
    await database.pool.query(
      "UPDATE threads_deletion_request SET completed_at = now() - interval '1 hour'",
    );
    const third = await authorize();
    const ok = await call(app, cookie, `${BASE}/oauth/complete`, "POST", third);
    expect(((await ok.json()) as { redirectTo: string }).redirectTo).toContain("oauth=connect");
    expect((await connection()).status).toBe("connected");
  });

  it("データの削除が終わっても、Threads のユーザーの ID のハッシュは残す（threads-012）", async () => {
    const signed = signRequestForTest(APP_SECRET, { algorithm: "HMAC-SHA256", user_id: "777" });
    expect((await webhook(`${BASE}/webhooks/data-deletion`, signed)).status).toBe(200);
    const rows = await database.pool.query<{ status: string; hash: string | null }>(
      "SELECT status, threads_user_hash AS hash FROM threads_deletion_request",
    );
    expect(rows.rows).toEqual([{ status: "completed", hash: threadsUserHash("777") }]);
  });

  it("定期の仕事：15分を過ぎた連携の解除の知らせと、終わって24時間を過ぎた削除のハッシュを消す（threads-012）", async () => {
    await database.pool.query(
      `INSERT INTO threads_revocation (threads_user_hash, issued_at, received_at)
       VALUES ($1, now() - interval '20 minutes', now() - interval '20 minutes'), ($2, now(), now())`,
      [threadsUserHash("1"), threadsUserHash("2")],
    );
    await database.pool.query(
      `INSERT INTO threads_deletion_request (confirmation_code, request_fingerprint, threads_user_hash, status, received_at, last_attempted_at, completed_at)
       VALUES ($1, 'old', $3, 'completed', now() - interval '2 days', now() - interval '2 days', now() - interval '25 hours'),
              ($2, 'new', $4, 'completed', now(), now(), now())`,
      ["b".repeat(32), "c".repeat(32), threadsUserHash("3"), threadsUserHash("4")],
    );
    const deps: DomainRouteDeps = {
      db: database.db,
      logger: createLogger({ level: "silent", pretty: false }),
      features: createDomainFeatures([THREADS_OAUTH_FEATURE]),
      config: { ...testConfig(), threadsApiBaseUrl: FAKE_BASE },
      fetch: fake.fetch,
      secretBox: createSecretBox(KEY_RING, 1),
      isJobRequest: createJobRequestCheck(undefined),
      apps: listApps(),
      metaApp: createMetaApp(THREADS_APP),
    };
    await runOauthMaintenance(deps, new Date());
    const revocations = await database.pool.query<{ threads_user_hash: string }>(
      "SELECT threads_user_hash FROM threads_revocation",
    );
    expect(revocations.rows).toEqual([{ threads_user_hash: threadsUserHash("2") }]);
    const deletions = await database.pool.query<{
      request_fingerprint: string;
      hash: string | null;
    }>(
      "SELECT request_fingerprint, threads_user_hash AS hash FROM threads_deletion_request ORDER BY request_fingerprint",
    );
    expect(deletions.rows).toEqual([
      { request_fingerprint: "new", hash: threadsUserHash("4") },
      { request_fingerprint: "old", hash: null },
    ]);
  });

  it("定期の仕事：止まったデータの削除をやり直し、切れた state を消す", async () => {
    await database.pool.query(
      `INSERT INTO threads_deletion_request (confirmation_code, request_fingerprint, threads_user_id, status, received_at, last_attempted_at)
       VALUES ($1, 'fp', '424242', 'failed', now() - interval '1 hour', now() - interval '1 hour')`,
      ["f".repeat(32)],
    );
    await authorize();
    await database.pool.query(
      "UPDATE threads_oauth_state SET expires_at = now() - interval '1 minute'",
    );
    const deps: DomainRouteDeps = {
      db: database.db,
      logger: createLogger({ level: "silent", pretty: false }),
      features: createDomainFeatures([THREADS_OAUTH_FEATURE]),
      config: { ...testConfig(), threadsApiBaseUrl: FAKE_BASE },
      fetch: fake.fetch,
      secretBox: createSecretBox(KEY_RING, 1),
      isJobRequest: createJobRequestCheck(undefined),
      apps: listApps(),
      metaApp: createMetaApp(THREADS_APP),
    };
    expect(await runOauthMaintenance(deps, new Date())).toBe(1);
    const rows = await database.pool.query<{ status: string }>(
      "SELECT status FROM threads_deletion_request",
    );
    expect(rows.rows).toEqual([{ status: "completed" }]);
    const states = await database.pool.query("SELECT 1 FROM threads_oauth_state");
    expect(states.rowCount).toBe(0);
  });
});
