// 道具（MCP）から受付の窓口を呼ぶ端から端までのテスト（本物の PostgreSQL・core-021・AD-20）：
// 本人のチェックインだけが読める・範囲がないと見えない・窓口は札を受けない・記録に中身が残らない。
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { TEST_ORIGIN, buildApp, jsonRequest, testConfig } from "./helpers/app.ts";
import type { TestApp } from "./helpers/app.ts";
import {
  ORGANIZER_LINE_USER_ID_FOR_TEST,
  loginAs,
  testLineUserId,
  withCookie,
} from "./helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "./helpers/db.ts";
import { createEvent } from "./helpers/event.ts";
import { checkIn } from "./helpers/reception.ts";
import { mcpToolCall } from "../src/modules/account/schema.ts";
import type { McpTool } from "../src/kernel/mcp-tool.ts";
import { upsertVisibility } from "../src/modules/suite/index.ts";
import { DEMO_APP, DEMO_APP_KEY, DEMO_MODULE } from "./helpers/suite.ts";
import { z } from "@hono/zod-openapi";

const database = useTestDatabase();
const REDIRECT = "http://127.0.0.1:1455/callback";
const VERIFIER = "v".repeat(60);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const RESOURCE = `${TEST_ORIGIN}/api/mcp`;
const PROTOCOL = "2025-11-25";

/**
 * 利用者の札（MCP の窓口を呼ぶ札）を、同意の流れで1つ取る。
 * @param app API
 * @param cookie その利用者のログインのクッキー
 * @param scopes 同意する範囲
 * @returns アクセストークン
 */
async function tokenFor(app: TestApp, cookie: string, scopes: string[]): Promise<string> {
  const reg = await app.request(
    "/api/oauth/register",
    jsonRequest("POST", { client_name: "テスト", redirect_uris: [REDIRECT] }),
  );
  const clientId = ((await reg.json()) as { client_id: string }).client_id;
  const fields = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    state: "state-value-1234",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: RESOURCE,
  };
  const decision = await app.request(
    "/api/oauth/authorize/decision",
    withCookie(
      cookie,
      jsonRequest("POST", { ...fields, decision: "approve", granted_scopes: scopes }),
    ),
  );
  const redirected = new URL(((await decision.json()) as { redirectTo: string }).redirectTo);
  const token = await app.request("/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: redirected.searchParams.get("code") ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: VERIFIER,
      resource: RESOURCE,
    }).toString(),
  });
  return ((await token.json()) as { access_token: string }).access_token;
}

/**
 * JSON-RPC の要求を /api/mcp に送る。
 * @param app API
 * @param body 要求
 * @param token 札
 * @returns 応答の本文（JSON）
 */
async function rpc(app: TestApp, body: unknown, token: string): Promise<Record<string, unknown>> {
  const response = await app.request("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(async () => {
  await truncateAllTables(database);
});

describe("道具から受付の窓口を呼ぶ（本人のチェックイン）", () => {
  it("本人のチェックインだけを返し、チェックインのない人には null を返す。記録は残すが中身は残さない", async () => {
    const app = buildApp(
      database,
      testConfig({ testLoginEnabled: true, organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }),
    );
    const organizer = await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
    const event = await createEvent(app, organizer.cookie);

    const alice = await loginAs(app, { lineUserId: testLineUserId(), displayName: "アリス" });
    await checkIn(app, alice.cookie, event.id, { name: "アリス・テスト" });
    const bob = await loginAs(app, { lineUserId: testLineUserId(), displayName: "ボブ" });

    const aliceToken = await tokenFor(app, alice.cookie, ["reception:read"]);
    const bobToken = await tokenFor(app, bob.cookie, ["reception:read"]);

    const list = await rpc(
      app,
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      aliceToken,
    );
    const names = ((list.result as { tools: Array<{ name: string }> }).tools ?? []).map(
      (t) => t.name,
    );
    expect(names).toEqual(["reception_my_checkin"]);

    const mine = await rpc(
      app,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "reception_my_checkin", arguments: { eventId: event.id } },
      },
      aliceToken,
    );
    const mineText = (
      (mine.result as { content: Array<{ text: string }> }).content[0] ?? { text: "" }
    ).text;
    expect(mineText).toContain("アリス・テスト");

    const none = await rpc(
      app,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "reception_my_checkin", arguments: { eventId: event.id } },
      },
      bobToken,
    );
    const noneText = (
      (none.result as { content: Array<{ text: string }> }).content[0] ?? { text: "" }
    ).text;
    // チェックインのない人は checkin が null（初期値の名前は本人のもの）
    expect(noneText).toContain('"checkin":null');
    expect(mineText).not.toContain("ボブ");

    const records = await database.db
      .select()
      .from(mcpToolCall)
      .where(eq(mcpToolCall.toolName, "reception_my_checkin"));
    expect(records.length).toBe(2);
    expect(JSON.stringify(records)).not.toContain("アリス");
  });

  it("範囲に reception:read がなければ、受付の道具は一覧に出ず、呼んでも通らない", async () => {
    // 受付の範囲を含めない同意を作るため、道具を出す試験用のアプリ（demo。範囲は demo:read）を足す
    // （道具を出さないアプリの範囲は、同意で選べない。core-021 FR-022）
    const demoTool: McpTool = {
      name: "demo_ping",
      description: "試験用の道具",
      access: "read",
      requiredScope: `${DEMO_APP_KEY}:read`,
      inputSchema: z.object({}),
      run: () => Promise.resolve("ok"),
    };
    const app = buildApp(
      database,
      testConfig({ testLoginEnabled: true, organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }),
      {
        extraModules: { demo: { ...DEMO_MODULE, mcpTools: () => [demoTool] } },
        extraApps: [DEMO_APP],
      },
    );
    await upsertVisibility(database.db, DEMO_APP_KEY, "public");
    const organizer = await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
    const event = await createEvent(app, organizer.cookie);
    const carol = await loginAs(app, { lineUserId: testLineUserId() });
    await checkIn(app, carol.cookie, event.id, { name: "キャロル" });
    // 同意は試験用のアプリの範囲だけ（受付の範囲は含めない）
    const token = await tokenFor(app, carol.cookie, [`${DEMO_APP_KEY}:read`]);

    const list = await rpc(app, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, token);
    const names = (list.result as { tools: { name: string }[] }).tools.map((tool) => tool.name);
    expect(names).toContain("demo_ping");
    expect(names).not.toContain("reception_my_checkin");

    const call = await rpc(
      app,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "reception_my_checkin", arguments: { eventId: event.id } },
      },
      token,
    );
    expect(call.result).toBeUndefined();
    expect(call.error).toBeDefined();
  });

  it("窓口は札（Bearer）を受けない。道具の窓口の呼び出しは、内側の印だけで通る", async () => {
    const app = buildApp(
      database,
      testConfig({ testLoginEnabled: true, organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }),
    );
    const organizer = await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
    const event = await createEvent(app, organizer.cookie);
    const dave = await loginAs(app, { lineUserId: testLineUserId() });
    await checkIn(app, dave.cookie, event.id, { name: "ダーブ" });
    const token = await tokenFor(app, dave.cookie, ["reception:read"]);

    const asBearer = await app.request(`/api/v1/events/${event.id}/checkins/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(asBearer.status).toBe(401);

    const noAuth = await app.request(`/api/v1/events/${event.id}/checkins/me`);
    expect(noAuth.status).toBe(401);
  });
});
