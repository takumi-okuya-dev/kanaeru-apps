// 運用アカウントのホームと開いた記録（threads-012）の結合のテスト（本物の PostgreSQL・偽の Threads の API。外へ出ない）：
// ホームの材料の数・開いた日時を残す・つないでいればプロフィールを読み直す（名前・画像）・認証のエラーで接続し直しが要る状態にする・
// Threads が答えなくても開ける・一覧に接続の状態とユーザー名が出る・ほかの人の運用アカウントとない ID は 404。
import "@hono/zod-openapi";
import type { AccountHome, ThreadsAccount, ThreadsAccountList } from "@workspace/contracts/threads";
import { homeNextStep } from "@workspace/contracts/threads";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { call } from "../../../test/helpers/event.ts";
import { createDomainFeatures } from "../../kernel/features.ts";
import { createFakeThreads } from "./fake-threads.ts";
import type { FakeThreads } from "./fake-threads.ts";

const database = useTestDatabase();

/** 道の頭。 */
const BASE = "/api/v1/threads/accounts";

/** テストの鍵の束。 */
const KEY_RING = JSON.stringify({ "1": btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) });

/** 偽の Threads の宛先（どこでもよい。偽の fetch は源を見ない）。 */
const FAKE_BASE = "http://fake-threads.test";

describe("運用アカウントのホームと開いた記録", () => {
  let fake: FakeThreads;
  let app: TestApp;
  let cookie: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    fake = createFakeThreads();
    fake.addUser({
      id: "9001",
      username: "takumi_dev",
      name: "たくみ",
      pictureUrl: "https://cdn.example.test/a.jpg",
    });
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
   * @param name 名前
   * @returns 運用アカウント
   */
  async function createAccount(name = "運用"): Promise<ThreadsAccount> {
    const response = await call(app, cookie, BASE, "POST", { name });
    expect(response.status).toBe(201);
    return (await response.json()) as ThreadsAccount;
  }

  /**
   * つないだ運用アカウントを作る。
   * @returns 運用アカウント
   */
  async function connectedAccount(): Promise<ThreadsAccount & { token: string }> {
    const account = await createAccount();
    const token = fake.issueToken({ userId: "9001" });
    const response = await call(app, cookie, `${BASE}/${account.id}/connection`, "POST", {
      token,
    });
    expect(response.status).toBe(200);
    return { ...account, token };
  }

  /**
   * 開く。
   * @param accountId 運用アカウントの ID
   * @returns 応答
   */
  function open(accountId: string): Promise<Response> {
    return call(app, cookie, `${BASE}/${accountId}/open`, "POST");
  }

  it("ホームの材料の数を返し、足すと増える", async () => {
    const account = await createAccount();
    const empty = (await (
      await call(app, cookie, `${BASE}/${account.id}/home`)
    ).json()) as AccountHome;
    expect(empty.strategy.filledCount).toBe(0);
    expect(empty.strategy.total).toBeGreaterThan(0);
    expect(empty.promotions).toEqual({ totalCount: 0, targetableCount: 0 });
    expect(empty.research).toEqual({ referencePostCount: 0, keywordCount: 0 });
    expect(homeNextStep(empty, { connected: false, approvedCount: 0 }).target).toBe("strategy");

    const strategy = (await (
      await call(app, cookie, `${BASE}/${account.id}/strategy`)
    ).json()) as Record<string, unknown>;
    const { filledCount: _f, total: _t, updatedAt: _u, ...values } = strategy;
    expect(
      (
        await call(app, cookie, `${BASE}/${account.id}/strategy`, "PUT", {
          ...values,
          finalAction: "相談の予約",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(app, cookie, `${BASE}/${account.id}/promotions`, "POST", {
          title: "交流会",
          content: "毎月の交流会です。",
          targetLocation: "",
          targetPersona: "",
          targetAgeRange: "",
          cta: "",
          linkedUrl: "",
          priority: 0,
          validUntil: null,
          event: null,
          status: "paused",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call(app, cookie, `${BASE}/${account.id}/promotions`, "POST", {
          title: "相談会",
          content: "無料の相談会です。",
          targetLocation: "",
          targetPersona: "",
          targetAgeRange: "",
          cta: "",
          linkedUrl: "",
          priority: 0,
          validUntil: null,
          event: null,
          status: "active",
        })
      ).status,
    ).toBe(201);
    const home = (await (
      await call(app, cookie, `${BASE}/${account.id}/home`)
    ).json()) as AccountHome;
    expect(home.strategy.filledCount).toBe(1);
    expect(home.promotions).toEqual({ totalCount: 2, targetableCount: 1 });
    expect(homeNextStep(home, { connected: false, approvedCount: 0 }).target).toBe("research");
    expect(homeNextStep(home, { connected: false, approvedCount: 2 }).target).toBe("connect");
    expect(homeNextStep(home, { connected: true, approvedCount: 2 }).target).toBe("research");
  });

  it("開くと日時を残し、一覧で最後に開いたものが分かる", async () => {
    const first = await createAccount("一つ目");
    const second = await createAccount("二つ目");
    expect(first.lastOpenedAt).toBeNull();
    const opened = await open(second.id);
    expect(opened.status).toBe(200);
    const body = (await opened.json()) as ThreadsAccount;
    expect(body.lastOpenedAt).not.toBeNull();
    expect(body.updatedAt).toBe(second.updatedAt);
    const list = (await (await call(app, cookie, BASE)).json()) as ThreadsAccountList;
    const byId = new Map(list.accounts.map((a) => [a.id, a]));
    expect(byId.get(first.id)?.lastOpenedAt).toBeNull();
    expect(byId.get(second.id)?.lastOpenedAt).toBe(body.lastOpenedAt);
    expect(byId.get(first.id)?.connectionStatus).toBe("not_connected");
    expect(byId.get(first.id)?.username).toBeNull();
  });

  it("つないでいれば、開いたときにプロフィールを読み直す", async () => {
    const account = await connectedAccount();
    const afterConnect = (await (
      await call(app, cookie, `${BASE}/${account.id}`)
    ).json()) as ThreadsAccount;
    expect(afterConnect.username).toBe("takumi_dev");
    expect(afterConnect.profilePictureUrl).toBe("https://cdn.example.test/a.jpg");

    fake.addUser({
      id: "9001",
      username: "takumi_new",
      name: "たくみ（新）",
      pictureUrl: "https://cdn.example.test/b.jpg",
    });
    const body = (await (await open(account.id)).json()) as ThreadsAccount;
    expect(body.username).toBe("takumi_new");
    expect(body.displayName).toBe("たくみ（新）");
    expect(body.profilePictureUrl).toBe("https://cdn.example.test/b.jpg");
    expect(body.connectionStatus).toBe("connected");
  });

  it("トークンが使えなくなっていれば、接続し直しが要る状態にする", async () => {
    const account = await connectedAccount();
    fake.invalidate(account.token);
    const body = (await (await open(account.id)).json()) as ThreadsAccount;
    expect(body.connectionStatus).toBe("needs_reconnect");
    expect(body.lastOpenedAt).not.toBeNull();
  });

  it("Threads が答えなくても開ける（接続の状態は変えない）", async () => {
    const account = await connectedAccount();
    fake.failNext("me", { status: 500, body: { error: { message: "down" } } });
    const response = await open(account.id);
    expect(response.status).toBe(200);
    expect(((await response.json()) as ThreadsAccount).connectionStatus).toBe("connected");
  });

  it("ほかの人の運用アカウントと、ない ID は 404", async () => {
    const account = await createAccount();
    const other = (await loginAs(app, { displayName: "ほかの人" })).cookie;
    expect((await call(app, other, `${BASE}/${account.id}/open`, "POST")).status).toBe(404);
    expect((await call(app, other, `${BASE}/${account.id}/home`)).status).toBe(404);
    const missing = "01900000-0000-7000-8000-000000000000";
    expect((await open(missing)).status).toBe(404);
    expect((await call(app, cookie, `${BASE}/${missing}/home`)).status).toBe(404);
  });
});
