// アカウントの窓口の結合のテスト（本物の PostgreSQL。LINE の verify は仮の出口に差しかえ、ネットワークに出ない）：
// LINE のログイン・クッキー・今の利用者・requireSession・ログアウト・主催者・アカウントを消す・試験用のログイン。
import { Writable } from "node:stream";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../kernel/logger.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { TEST_ORIGIN, buildApp, jsonRequest, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import {
  ORGANIZER_LINE_USER_ID_FOR_TEST,
  loginAs,
  testLineUserId,
  withCookie,
} from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import {
  currentAccount,
  isOrganizer,
  requireOrganizer,
  requireSession,
  unauthenticatedResponse,
} from "./index.ts";
import { LINE_VERIFY_URL } from "./line-verifier.ts";
import { hashSessionToken } from "./session.ts";

const database = useTestDatabase();

/** テストのチャネル ID。 */
const CHANNEL_ID = "1234567890";

/** 今の利用者の答え。 */
type View = { id: string; displayName: string; isOrganizer: boolean; registeredAt: string };

/** エラーの本文（使う所だけ）。 */
type ErrorBody = {
  error: { code: string; message: string; fields?: { path: string; message: string }[] };
};

/**
 * 仮の ID トークンを作る（中身の aud だけを API が読む。署名は仮の LINE が見る）。
 * @param sub LINE のユーザー ID（仮の LINE が答える）
 * @param name 表示名（仮の LINE が答える。なければ name なし）
 * @param aud チャネル ID
 * @returns ID トークン
 */
function fakeIdToken(sub: string, name?: string, aud = CHANNEL_ID): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode({ aud, sub, name })}.signature`;
}

/**
 * 仮の LINE の verify（ID トークンの中身をそのまま答える。"expired" の名前なら 400、"down" なら 503）。
 * @param input 宛先
 * @param init 要求の中身
 * @returns 答え
 */
const fakeLine: typeof fetch = (input, init) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url !== LINE_VERIFY_URL) return Promise.reject(new Error(`知らない宛先：${url}`));
  const form = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
  const payload = JSON.parse(
    Buffer.from(form.get("id_token")?.split(".")[1] ?? "", "base64url").toString("utf8"),
  ) as { sub: string; name?: string; aud: string };
  if (payload.name === "expired") {
    return Promise.resolve(
      Response.json(
        { error: "invalid_request", error_description: "IdToken expired." },
        { status: 400 },
      ),
    );
  }
  if (payload.name === "down") return Promise.resolve(new Response("down", { status: 503 }));
  return Promise.resolve(
    Response.json({
      iss: "https://access.line.me",
      sub: payload.sub,
      aud: form.get("client_id"),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...(payload.name ? { name: payload.name } : {}),
    }),
  );
};

/** テストだけの領域：ほかの領域が requireSession・currentAccount・requireOrganizer を使う形。 */
const consumer = {
  routes: (deps: DomainRouteDeps) =>
    new OpenAPIHono<ApiEnv>()
      .openapi(
        createRoute({
          method: "get",
          path: "/api/v1/test-only/whoami",
          middleware: [requireSession(deps)] as const,
          responses: {
            200: {
              description: "今の利用者",
              content: {
                "application/json": {
                  schema: z.object({
                    accountId: z.string(),
                    lineUserId: z.string(),
                    organizer: z.boolean(),
                  }),
                },
              },
            },
            401: unauthenticatedResponse,
          },
        }),
        (c) => {
          const account = currentAccount(c);
          return c.json({ ...account, organizer: isOrganizer(deps.config, account) }, 200);
        },
      )
      .openapi(
        createRoute({
          method: "get",
          path: "/api/v1/test-only/organizer-only",
          middleware: [requireSession(deps), requireOrganizer(deps)] as const,
          responses: { 200: { description: "主催者だけ" } },
        }),
        (c) => c.json({ ok: true }, 200),
      ),
};

/**
 * LINE でログインする。
 * @param app 組み立てた API
 * @param idToken ID トークン
 * @param origin 送る Origin
 * @returns 応答
 */
function lineLogin(app: TestApp, idToken: string, origin = TEST_ORIGIN): Promise<Response> {
  return Promise.resolve(
    app.request("/api/v1/auth/line", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ idToken }),
    }),
  );
}

/**
 * Set-Cookie から、Cookie の見出しの値（名前=値）を取り出す。
 * @param response 応答
 * @returns Cookie の見出しの値
 */
function cookieOf(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

/**
 * 表の行の数を数える。
 * @param table 表の名前（このファイルの決まった名前だけ）
 * @returns 行の数
 */
async function countRows(table: "account" | "session"): Promise<number> {
  const query =
    table === "account" ? "SELECT count(*) FROM account" : "SELECT count(*) FROM session";
  const result = await database.pool.query<{ count: string }>(query);
  return Number(result.rows[0]?.count);
}

describe("アカウントの窓口", () => {
  let app: TestApp;
  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(
      database,
      testConfig({
        lineChannelIds: [CHANNEL_ID],
        organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST,
      }),
      { fetch: fakeLine, extraModules: [consumer] },
    );
  });

  describe("LINE のログイン", () => {
    it("初めてならアカウントを作り、クッキーを出す。2回目は同じアカウントで、表示名を上書きする", async () => {
      const sub = testLineUserId();
      const first = await lineLogin(app, fakeIdToken(sub, "佐藤"));
      expect(first.status).toBe(200);
      const view = (await first.json()) as View;
      expect(view).toMatchObject({ displayName: "佐藤", isOrganizer: false });
      // 登録日は DB の時計で付く。DB とテストの時計は少しずれることがある（手元の容器・Cloud SQL と Cloud Run）ので、5秒までのずれを許す
      expect(Date.parse(view.registeredAt)).toBeLessThanOrEqual(Date.now() + 5_000);

      const setCookie = first.headers.get("set-cookie") ?? "";
      expect(setCookie).toMatch(/^kanaeru_session=[A-Za-z0-9_-]{43};/);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).toContain("Max-Age=2592000");
      // http の源（手元）では Secure を付けない
      expect(setCookie).not.toContain("Secure");

      const me = await app.request("/api/v1/accounts/me", withCookie(cookieOf(first)));
      expect(me.status).toBe(200);
      expect(await me.json()).toEqual(view);

      const second = await lineLogin(app, fakeIdToken(sub, "佐藤 花子"));
      const secondView = (await second.json()) as View;
      expect(secondView).toEqual({ ...view, displayName: "佐藤 花子" });
      expect(cookieOf(second)).not.toBe(cookieOf(first));
      expect(await countRows("account")).toBe(1);
      expect(await countRows("session")).toBe(2);
    });

    it("name のない ID トークンは、初めてなら表示名を空に、あれば変えない", async () => {
      const sub = testLineUserId();
      const first = (await (await lineLogin(app, fakeIdToken(sub))).json()) as View;
      expect(first.displayName).toBe("");
      await lineLogin(app, fakeIdToken(sub, "鈴木"));
      const third = (await (await lineLogin(app, fakeIdToken(sub))).json()) as View;
      expect(third.displayName).toBe("鈴木");
    });

    it("クッキーを持ったままログインし直すと、前のセッションを消す（前の札は 401）", async () => {
      const sub = testLineUserId();
      const first = cookieOf(await lineLogin(app, fakeIdToken(sub, "佐藤")));
      const again = await app.request("/api/v1/auth/line", {
        method: "POST",
        headers: { "content-type": "application/json", origin: TEST_ORIGIN, cookie: first },
        body: JSON.stringify({ idToken: fakeIdToken(sub, "佐藤") }),
      });
      expect(again.status).toBe(200);
      const second = cookieOf(again);
      expect(second).not.toBe(first);
      expect((await app.request("/api/v1/accounts/me", withCookie(first))).status).toBe(401);
      expect((await app.request("/api/v1/accounts/me", withCookie(second))).status).toBe(200);
      expect(await countRows("session")).toBe(1);

      // 試験用のログインでも同じ（別の人として入り直しても、前の人のセッションを残さない）
      const switched = await app.request(
        "/api/v1/auth/test-login",
        withCookie(
          second,
          jsonRequest("POST", { lineUserId: testLineUserId(), displayName: "別" }),
        ),
      );
      expect(switched.status).toBe(200);
      expect((await app.request("/api/v1/accounts/me", withCookie(second))).status).toBe(401);
      expect(await countRows("session")).toBe(1);
    });

    it("DB には札そのものを持たず、札の SHA-256 だけを持つ", async () => {
      const response = await lineLogin(app, fakeIdToken(testLineUserId(), "佐藤"));
      const token = cookieOf(response).split("=")[1] ?? "";
      const rows = await database.pool.query<{ token_hash: string }>(
        "SELECT token_hash FROM session",
      );
      expect(rows.rows).toEqual([{ token_hash: hashSessionToken(token) }]);
      expect(JSON.stringify(rows.rows)).not.toContain(token);
    });

    it("画面の源が https なら、__Host- の名前と Secure で出し、そのクッキーで読める", async () => {
      const secureApp = buildApp(
        database,
        testConfig({ webUrl: "https://app.example.com", lineChannelIds: [CHANNEL_ID] }),
        { fetch: fakeLine },
      );
      const response = await lineLogin(
        secureApp,
        fakeIdToken(testLineUserId(), "佐藤"),
        "https://app.example.com",
      );
      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toMatch(/^__Host-kanaeru_session=/);
      expect(setCookie).toContain("Secure");
      const me = await secureApp.request("/api/v1/accounts/me", {
        headers: { cookie: cookieOf(response) },
      });
      expect(me.status).toBe(200);
      // __Host- のない名前のクッキーは読まない
      const plain = cookieOf(response).replace("__Host-", "");
      expect(
        (await secureApp.request("/api/v1/accounts/me", { headers: { cookie: plain } })).status,
      ).toBe(401);
    });

    it("確かめられない ID トークン（別のチャネル・期限切れ）は 401 LINE_LOGIN_FAILED で、アカウントもセッションもできない", async () => {
      for (const token of [
        fakeIdToken(testLineUserId(), "佐藤", "9999999999"),
        fakeIdToken(testLineUserId(), "expired"),
        "not-a-jwt",
      ]) {
        const response = await lineLogin(app, token);
        expect(response.status).toBe(401);
        const body = (await response.json()) as ErrorBody;
        expect(body.error.code).toBe("LINE_LOGIN_FAILED");
        expect(response.headers.get("set-cookie")).toBeNull();
      }
      expect(await countRows("account")).toBe(0);
      expect(await countRows("session")).toBe(0);
    });

    it("LINE に届かないときは 502 LINE_UNREACHABLE", async () => {
      const response = await lineLogin(app, fakeIdToken(testLineUserId(), "down"));
      expect(response.status).toBe(502);
      expect(((await response.json()) as ErrorBody).error.code).toBe("LINE_UNREACHABLE");
    });

    it("画面が名前やユーザー ID を足して送っても受け取らない（400）", async () => {
      const response = await app.request(
        "/api/v1/auth/line",
        jsonRequest("POST", {
          idToken: fakeIdToken(testLineUserId(), "佐藤"),
          lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST,
        }),
      );
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).error.fields).toEqual([
        { path: "lineUserId", message: "この欄は受け取れません。" },
      ]);
      expect(await countRows("account")).toBe(0);
    });

    it("ID トークン・クッキーをログに書かない", async () => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          lines.push(chunk.toString());
          callback();
        },
      });
      const logged = buildApp(database, testConfig({ lineChannelIds: [CHANNEL_ID] }), {
        fetch: fakeLine,
        logger: createLogger({ level: "trace", pretty: false }, stream),
      });
      const ok = fakeIdToken(testLineUserId(), "佐藤");
      const expired = fakeIdToken(testLineUserId(), "expired");
      const response = await lineLogin(logged, ok);
      await lineLogin(logged, expired);
      const cookie = cookieOf(response);
      await logged.request("/api/v1/accounts/me", withCookie(cookie));
      const output = lines.join("");
      expect(output).toContain("LINE の ID トークンを確かめられませんでした");
      for (const secret of [ok, expired, cookie.split("=")[1] ?? "", "佐藤"]) {
        expect(output).not.toContain(secret);
      }
    });
  });

  describe("今の利用者（requireSession・currentAccount）", () => {
    it("クッキーがない・知らない札・形の違う札は 401 UNAUTHENTICATED と決まった文", async () => {
      for (const init of [
        {},
        withCookie(`kanaeru_session=${"A".repeat(43)}`),
        withCookie("kanaeru_session=short"),
      ]) {
        const response = await app.request("/api/v1/accounts/me", init);
        expect(response.status).toBe(401);
        const body = (await response.json()) as ErrorBody;
        expect(body.error).toMatchObject({
          code: "UNAUTHENTICATED",
          message: "ログインしていません。LINEでログインし直してください。",
        });
      }
    });

    it("ほかの領域は、requireSession を付けた道で currentAccount を読める", async () => {
      const { cookie, account } = await loginAs(app, { displayName: "佐藤" });
      const response = await app.request("/api/v1/test-only/whoami", withCookie(cookie));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { accountId: string; lineUserId: string };
      expect(body).toMatchObject({ accountId: account.id, organizer: false });
      expect(body.lineUserId).toMatch(/^U[0-9a-f]{32}$/);
      expect((await app.request("/api/v1/test-only/whoami")).status).toBe(401);
    });

    it("期限の切れたセッションは 401。その人が次にログインすると、切れた行は消える", async () => {
      const lineUserId = testLineUserId();
      const { cookie } = await loginAs(app, { lineUserId });
      await database.pool.query("UPDATE session SET expires_at = now() - interval '1 second'");
      expect((await app.request("/api/v1/accounts/me", withCookie(cookie))).status).toBe(401);
      expect(await countRows("session")).toBe(1);
      await loginAs(app, { lineUserId });
      expect(await countRows("session")).toBe(1);
    });

    it("ログアウトすると、そのクッキーは 401 になり、クッキーを消す。ログインしていなくても 204", async () => {
      const { cookie } = await loginAs(app);
      const response = await app.request(
        "/api/v1/auth/logout",
        withCookie(cookie, { method: "POST" }),
      );
      expect(response.status).toBe(204);
      expect(response.headers.get("set-cookie")).toMatch(/^kanaeru_session=;.*Max-Age=0/);
      expect((await app.request("/api/v1/accounts/me", withCookie(cookie))).status).toBe(401);
      expect(await countRows("session")).toBe(0);
      const again = await app.request("/api/v1/auth/logout", jsonRequest("POST", {}));
      expect(again.status).toBe(204);
    });
  });

  describe("主催者とアカウントを消す", () => {
    it("設定の主催者と同じ LINE のユーザー ID なら isOrganizer が true。設定がなければ誰も主催者でない", async () => {
      const organizer = await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
      expect(organizer.account.isOrganizer).toBe(true);
      const participant = await loginAs(app);
      expect(participant.account.isOrganizer).toBe(false);
      expect(
        (await app.request("/api/v1/test-only/organizer-only", withCookie(organizer.cookie)))
          .status,
      ).toBe(200);
      expect(
        (await app.request("/api/v1/test-only/organizer-only", withCookie(participant.cookie)))
          .status,
      ).toBe(403);

      const noOrganizer = buildApp(database, testConfig({ organizerLineUserId: undefined }));
      const again = await loginAs(noOrganizer, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
      expect(again.account.isOrganizer).toBe(false);
    });

    it("主催者はアカウントを消せる（セッションも消える）。もう一度は 404・形の違う ID は 404", async () => {
      const organizer = await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
      const participant = await loginAs(app);
      const remove = (id: string) =>
        app.request(`/api/v1/accounts/${id}`, withCookie(organizer.cookie, { method: "DELETE" }));
      expect((await remove(participant.account.id)).status).toBe(204);
      expect(
        (await app.request("/api/v1/accounts/me", withCookie(participant.cookie))).status,
      ).toBe(401);
      expect(await countRows("account")).toBe(1);
      expect(await countRows("session")).toBe(1);
      expect((await remove(participant.account.id)).status).toBe(404);
      expect((await remove("not-a-uuid")).status).toBe(404);
    });

    it("主催者でなければ 403 FORBIDDEN、ログインしていなければ 401 で、消えない", async () => {
      const participant = await loginAs(app);
      const other = await loginAs(app);
      const forbidden = await app.request(
        `/api/v1/accounts/${other.account.id}`,
        withCookie(participant.cookie, { method: "DELETE" }),
      );
      expect(forbidden.status).toBe(403);
      expect(((await forbidden.json()) as ErrorBody).error.code).toBe("FORBIDDEN");
      const anonymous = await app.request(`/api/v1/accounts/${other.account.id}`, {
        method: "DELETE",
        headers: { origin: TEST_ORIGIN },
      });
      expect(anonymous.status).toBe(401);
      expect(await countRows("account")).toBe(2);
    });
  });

  describe("退会（自分のアカウントを消す）", () => {
    it("本人が消すと、アカウントとセッションが消え、クッキーも消える。ほかの人は残る", async () => {
      const me = await loginAs(app);
      await loginAs(app);
      const response = await app.request(
        "/api/v1/accounts/me",
        withCookie(me.cookie, { method: "DELETE" }),
      );
      expect(response.status).toBe(204);
      expect(response.headers.get("set-cookie") ?? "").toMatch(/^kanaeru_session=;.*Max-Age=0/);
      expect((await app.request("/api/v1/accounts/me", withCookie(me.cookie))).status).toBe(401);
      expect(await countRows("account")).toBe(1);
      expect(await countRows("session")).toBe(1);
    });

    it("ログインしていなければ 401 で、何も消えない", async () => {
      await loginAs(app);
      const anonymous = await app.request("/api/v1/accounts/me", {
        method: "DELETE",
        headers: { origin: TEST_ORIGIN },
      });
      expect(anonymous.status).toBe(401);
      expect(await countRows("account")).toBe(1);
    });

    it("ほかの人が書きこむ記録（RESTRICT の外部キー）を持っていれば、409 ACCOUNT_OWNS_SHARED_RECORDS で消さない", async () => {
      const me = await loginAs(app);
      // 新しいアプリの「ほかの人が書きこむ記録」の代わり（このテストの間だけの表。AD-19）
      await database.pool.query(
        "CREATE TABLE test_shared_record (owner_id uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT)",
      );
      try {
        await database.pool.query("INSERT INTO test_shared_record (owner_id) VALUES ($1)", [
          me.account.id,
        ]);
        const response = await app.request(
          "/api/v1/accounts/me",
          withCookie(me.cookie, { method: "DELETE" }),
        );
        expect(response.status).toBe(409);
        expect(((await response.json()) as ErrorBody).error.code).toBe(
          "ACCOUNT_OWNS_SHARED_RECORDS",
        );
        expect((await app.request("/api/v1/accounts/me", withCookie(me.cookie))).status).toBe(200);
      } finally {
        await database.pool.query("DROP TABLE test_shared_record");
      }
    });
  });

  describe("試験用のログイン", () => {
    it("入なら、LINE のユーザー ID と表示名でアカウントを作るか探し、クッキーを出す", async () => {
      const lineUserId = testLineUserId();
      const first = await loginAs(app, { lineUserId, displayName: "試験" });
      const second = await loginAs(app, { lineUserId, displayName: "試験2" });
      expect(second.account).toEqual({ ...first.account, displayName: "試験2" });
    });

    it("切なら道を登録しない：合う入力も合わない入力も 404 で、窓口の文書にも出さない", async () => {
      const disabled = buildApp(
        database,
        testConfig({ testLoginEnabled: false, openApiDocEnabled: true }),
      );
      for (const body of [
        { lineUserId: testLineUserId(), displayName: "試験" },
        { lineUserId: "U1", displayName: "" },
      ]) {
        const response = await disabled.request(
          "/api/v1/auth/test-login",
          jsonRequest("POST", body),
        );
        expect(response.status).toBe(404);
        expect(((await response.json()) as ErrorBody).error.code).toBe("NOT_FOUND");
      }
      expect(await countRows("account")).toBe(0);
      const document = (await (await disabled.request("/api/openapi.json")).json()) as {
        paths: Record<string, unknown>;
      };
      expect(Object.keys(document.paths)).toContain("/api/v1/auth/line");
      expect(Object.keys(document.paths)).not.toContain("/api/v1/auth/test-login");
    });

    it("入力が合わなければ 400 と、欄のそばに出せる日本語の理由", async () => {
      const response = await app.request(
        "/api/v1/auth/test-login",
        jsonRequest("POST", { lineUserId: "U1", displayName: "" }),
      );
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).error.fields).toEqual([
        {
          path: "lineUserId",
          message: "LINE のユーザー ID は、U と16進（0〜9・a〜f）の32文字にしてください。",
        },
        { path: "displayName", message: "表示名を入れてください。" },
      ]);
    });
  });
});
