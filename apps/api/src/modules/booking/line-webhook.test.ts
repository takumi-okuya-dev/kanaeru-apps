// LINE の Webhook と紐づけの結合のテスト（booking-002 US2・research S1〜S3・S7・S11・S13）。
import { Writable } from "node:stream";
import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import {
  SAMPLE_CHANNEL_SECRET,
  SAMPLE_LINE_INPUT,
  lineEvent,
  lineUser,
  linkTokenOf,
  notifyBase,
  notifyConfig,
  postWebhook,
  readOutbox,
  saveLine,
} from "../../../test/helpers/booking-notify.ts";
import type { SettingsBody } from "../../../test/helpers/booking-notify.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import { createOrganization } from "../../../test/helpers/organization.ts";
import { createLogger } from "../../kernel/logger.ts";
import { LINE_WEBHOOK_PER_CHANNEL_MAX } from "./routes-webhook.ts";

const database = useTestDatabase();

/**
 * ログを文字にためる道具を作る。
 * @returns ログの道具と、たまった文字を返す関数
 */
function captureLogger() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return {
    logger: createLogger({ level: "debug", pretty: false }, stream),
    text: () => chunks.join(""),
  };
}

/**
 * 札の数。
 * @returns 使っていない札の数と、すべての札の数
 */
async function tokenCounts(): Promise<{ unused: number; all: number }> {
  const result = await database.pool.query<{ unused: string; all: string }>(
    "SELECT count(*) FILTER (WHERE used_at IS NULL) AS unused, count(*) AS all FROM booking_line_link_token",
  );
  return { unused: Number(result.rows[0]?.unused), all: Number(result.rows[0]?.all) };
}

describe("LINE の Webhook", () => {
  let app: TestApp;
  let log: ReturnType<typeof captureLogger>;
  let admin: Awaited<ReturnType<typeof loginAs>>;
  let organizationId: string;
  let channelId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    log = captureLogger();
    app = buildApp(database, notifyConfig(), { logger: log.logger });
    admin = await loginAs(app, { displayName: "管理者" });
    organizationId = await createOrganization(app, admin.cookie);
    channelId = (await saveLine(app, admin.cookie, organizationId)).line?.channelId ?? "";
  });

  it("署名の合う友だち追加に、札つきのリンクのあいさつを返事で送る。DB には SHA-256 だけ。ログに本文・ID・札がない", async () => {
    const body = lineEvent("follow", lineUser("a"));
    const response = await postWebhook(app, channelId, body);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    const [greeting] = await readOutbox(app, admin.cookie);
    expect(greeting?.method).toBe("line_reply");
    expect(greeting?.to).toBe("reply-aaaa");
    expect(greeting?.text).toContain("飲食チーム");
    expect(greeting?.text).toContain("http://localhost:5173/line-link/");
    const token = linkTokenOf(greeting?.text ?? "");
    const stored = await database.pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM booking_line_link_token",
    );
    expect(stored.rows).toEqual([{ token_hash: createHash("sha256").update(token).digest("hex") }]);
    const logged = log.text();
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(lineUser("a"));
    expect(logged).not.toContain(body);
    expect(logged).not.toContain(SAMPLE_CHANNEL_SECRET);
  });

  it("署名がない・違う・別のシークレットなら、本文のない 400 で何もしない", async () => {
    const body = lineEvent("follow", lineUser("a"));
    for (const secret of [null, "f".repeat(32)]) {
      const response = await postWebhook(app, channelId, body, secret);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe("");
    }
    const tampered = await app.request(`/api/v1/booking/webhooks/line/${channelId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": "AAAA" },
      body,
    });
    expect(tampered.status).toBe(400);
    expect(await readOutbox(app, admin.cookie)).toEqual([]);
    expect((await tokenCounts()).all).toBe(0);
  });

  it("署名は届いたままの本文で比べる（空白・鍵の順が違っても通り、JSON にし直した本文の署名では通らない）", async () => {
    const raw = `{ "events" : [ { "source": { "userId": "${lineUser("a")}", "type": "user" }, "replyToken": "reply-aaaa", "type": "follow" } ], "destination": "${lineUser("f")}" }`;
    const response = await postWebhook(app, channelId, raw);
    expect(response.status).toBe(200);
    expect(await readOutbox(app, admin.cookie)).toHaveLength(1);
    // JSON.stringify し直した本文の署名を、届いたままの本文に付けると通らない
    const reserialized = JSON.stringify(JSON.parse(raw));
    expect(reserialized).not.toBe(raw);
    const signature = createHmac("sha256", SAMPLE_CHANNEL_SECRET)
      .update(reserialized)
      .digest("base64");
    const mismatched = await app.request(`/api/v1/booking/webhooks/line/${channelId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signature },
      body: raw,
    });
    expect(mismatched.status).toBe(400);
  });

  it("ほかの設定（B）のシークレットで署名した本文を、A の道に送ると 400 で何もしない", async () => {
    const other = await loginAs(app, { displayName: "別の主催者" });
    const secretB = "f".repeat(32);
    const channelB = (
      await saveLine(app, other.cookie, undefined, {
        ...SAMPLE_LINE_INPUT,
        lineChannelId: "2234567890",
        channelSecret: secretB,
      })
    ).line?.channelId;
    const body = lineEvent("follow", lineUser("a"));
    expect((await postWebhook(app, channelId, body, secretB)).status).toBe(400);
    expect((await tokenCounts()).all).toBe(0);
    // B の道なら通る
    expect((await postWebhook(app, channelB ?? "", body, secretB)).status).toBe(200);
  });

  it("友だち追加の送り直し（isRedelivery）では、札を作り直さず、あいさつも送らない", async () => {
    await postWebhook(app, channelId, lineEvent("follow", lineUser("a")));
    const redelivered = JSON.parse(lineEvent("follow", lineUser("a"))) as {
      events: { deliveryContext: { isRedelivery: boolean } }[];
    };
    for (const event of redelivered.events) event.deliveryContext.isRedelivery = true;
    expect((await postWebhook(app, channelId, JSON.stringify(redelivered))).status).toBe(200);
    expect(await tokenCounts()).toEqual({ unused: 1, all: 1 });
    const outbox = await readOutbox(app, admin.cookie);
    expect(outbox).toHaveLength(1);
    // 前に届いたリンクは使えるまま
    const token = linkTokenOf(outbox[0]?.text ?? "");
    expect((await call(app, admin.cookie, `/api/v1/booking/line-links/${token}`)).status).toBe(200);
  });

  it("本文の送り先（destination）が設定の公式アカウントと違えば、取り違えとして 400 で何もしない", async () => {
    const body = JSON.stringify({
      ...(JSON.parse(lineEvent("follow", lineUser("a"))) as object),
      destination: lineUser("e"),
    });
    expect((await postWebhook(app, channelId, body)).status).toBe(400);
    expect((await tokenCounts()).all).toBe(0);
    expect(log.text()).toContain("送り先が設定の公式アカウントと違います");
  });

  it(`署名の合う知らせは、設定ごとに60秒に ${LINE_WEBHOOK_PER_CHANNEL_MAX} 回まで。超えたら 429 と Retry-After`, async () => {
    const body = JSON.stringify({ destination: lineUser("f"), events: [] });
    for (let index = 0; index < LINE_WEBHOOK_PER_CHANNEL_MAX; index += 1) {
      expect((await postWebhook(app, channelId, body)).status).toBe(200);
    }
    const limited = await postWebhook(app, channelId, body);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    // 署名の合わない知らせは数えずに 400
    expect((await postWebhook(app, channelId, body, "f".repeat(32))).status).toBe(400);
  });

  it("署名が合っても JSON でない・形が違えば 400。大きすぎる本文は署名の前に 400", async () => {
    expect((await postWebhook(app, channelId, "not json")).status).toBe(400);
    expect((await postWebhook(app, channelId, JSON.stringify({ events: "x" }))).status).toBe(400);
    const big = JSON.stringify({ events: [], pad: "x".repeat(70 * 1024) });
    expect((await postWebhook(app, channelId, big)).status).toBe(400);
  });

  it("知らない設定・形の違う ID・LINE の値のない設定は 404", async () => {
    const body = lineEvent("follow", lineUser("a"));
    expect((await postWebhook(app, "0193a1b2-0000-7000-8000-000000000000", body)).status).toBe(404);
    expect((await postWebhook(app, "not-a-uuid", body)).status).toBe(404);
    await call(app, admin.cookie, `${notifyBase(organizationId)}/line`, "DELETE");
    expect((await postWebhook(app, channelId, body)).status).toBe(404);
  });

  it("送り方が off なら、あいさつを送らず札も作らない（200 は返す）", async () => {
    const offApp = buildApp(database, notifyConfig({ mode: "off" }));
    const response = await postWebhook(offApp, channelId, lineEvent("follow", lineUser("a")));
    expect(response.status).toBe(200);
    expect(await readOutbox(offApp, admin.cookie)).toEqual([]);
    expect((await tokenCounts()).all).toBe(0);
  });

  it("allowlist でも、あいさつは許可リストに関係なく送る（research R4）", async () => {
    const allowApp = buildApp(database, notifyConfig({ mode: "allowlist", allowlist: [] }));
    await postWebhook(allowApp, channelId, lineEvent("follow", lineUser("a")));
    expect(await readOutbox(allowApp, admin.cookie)).toHaveLength(1);
  });

  it("ほかの種類・グループからの知らせは、200 で何もしない", async () => {
    expect((await postWebhook(app, channelId, lineEvent("message", lineUser("a")))).status).toBe(
      200,
    );
    const group = JSON.stringify({
      events: [{ type: "follow", replyToken: "r", source: { type: "group", groupId: "C1" } }],
    });
    expect((await postWebhook(app, channelId, group)).status).toBe(200);
    expect((await postWebhook(app, channelId, JSON.stringify({ events: [] }))).status).toBe(200);
    expect(await readOutbox(app, admin.cookie)).toEqual([]);
  });

  it("友だち追加の再送では、前の使っていない札が消える", async () => {
    await postWebhook(app, channelId, lineEvent("follow", lineUser("a")));
    await postWebhook(app, channelId, lineEvent("follow", lineUser("a")));
    expect(await tokenCounts()).toEqual({ unused: 1, all: 1 });
    const [latest, older] = await readOutbox(app, admin.cookie);
    const stale = await call(
      app,
      admin.cookie,
      `/api/v1/booking/line-links/${linkTokenOf(older?.text ?? "")}`,
    );
    expect(stale.status).toBe(404);
    const fresh = await call(
      app,
      admin.cookie,
      `/api/v1/booking/line-links/${linkTokenOf(latest?.text ?? "")}`,
    );
    expect(fresh.status).toBe(200);
  });

  it("ブロックで紐づけと使っていない札が消える（何度来ても同じ）", async () => {
    await postWebhook(app, channelId, lineEvent("follow", lineUser("a")));
    const [greeting] = await readOutbox(app, admin.cookie);
    await call(
      app,
      admin.cookie,
      `/api/v1/booking/line-links/${linkTokenOf(greeting?.text ?? "")}`,
      "POST",
    );
    await postWebhook(app, channelId, lineEvent("follow", lineUser("b")));
    expect((await tokenCounts()).unused).toBe(1);
    for (const user of [lineUser("a"), lineUser("b"), lineUser("a")]) {
      expect((await postWebhook(app, channelId, lineEvent("unfollow", user))).status).toBe(200);
    }
    const links = await database.pool.query("SELECT 1 FROM booking_line_link");
    expect(links.rowCount).toBe(0);
    expect((await tokenCounts()).unused).toBe(0);
  });
});

describe("紐づけ", () => {
  let app: TestApp;
  let admin: Awaited<ReturnType<typeof loginAs>>;
  let participant: Awaited<ReturnType<typeof loginAs>>;
  let channelId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, notifyConfig());
    admin = await loginAs(app, { displayName: "管理者" });
    participant = await loginAs(app, { displayName: "参加者" });
    const organizationId = await createOrganization(app, admin.cookie);
    channelId = (await saveLine(app, admin.cookie, organizationId)).line?.channelId ?? "";
  });

  /**
   * 友だち追加して、あいさつの札を返す。
   * @param userId LINE のユーザー ID
   * @returns 札
   */
  async function follow(userId: string): Promise<string> {
    await postWebhook(app, channelId, lineEvent("follow", userId));
    const [greeting] = await readOutbox(app, admin.cookie);
    return linkTokenOf(greeting?.text ?? "");
  }

  it("札の中身を読み、紐づける。紐づいた人数が増え、同じ札は 409。本人が開き直すと「もう紐づいています」", async () => {
    const token = await follow(lineUser("a"));
    const preview = await call(app, participant.cookie, `/api/v1/booking/line-links/${token}`);
    expect(await preview.json()).toMatchObject({
      holderName: "飲食チーム",
      state: "valid",
      linkedToMe: false,
      lineDisplayName: "LINE の友だち",
    });
    const linked = await call(
      app,
      participant.cookie,
      `/api/v1/booking/line-links/${token}`,
      "POST",
    );
    expect(linked.status).toBe(200);
    expect(await linked.json()).toEqual({ holderName: "飲食チーム" });
    const again = await call(
      app,
      participant.cookie,
      `/api/v1/booking/line-links/${token}`,
      "POST",
    );
    expect(again.status).toBe(409);
    const reopened = await call(app, participant.cookie, `/api/v1/booking/line-links/${token}`);
    expect(await reopened.json()).toMatchObject({
      state: "used",
      linkedToMe: true,
      lineDisplayName: null,
    });
    const others = await call(app, admin.cookie, `/api/v1/booking/line-links/${token}`);
    expect(await others.json()).toMatchObject({ state: "used", linkedToMe: false });
    const settings = (await (
      await call(app, admin.cookie, notifyBase(await orgIdOf()))
    ).json()) as SettingsBody;
    expect(settings.line?.linkedCount).toBe(1);
  });

  /**
   * 設定の組織の ID。
   * @returns 組織の ID
   */
  async function orgIdOf(): Promise<string> {
    const result = await database.pool.query<{ id: string }>(
      "SELECT holder_organization_id AS id FROM booking_line_channel",
    );
    return result.rows[0]?.id ?? "";
  }

  it("紐づけたら、その LINE に「◯◯さんのアカウントと紐づきました。心当たりがなければブロック」を送る", async () => {
    const token = await follow(lineUser("a"));
    await call(app, participant.cookie, `/api/v1/booking/line-links/${token}`, "POST");
    const [notice] = await readOutbox(app, admin.cookie);
    expect(notice?.method).toBe("line_push");
    expect(notice?.to).toBe(lineUser("a"));
    expect(notice?.text).toContain("kanaeru の参加者さんのアカウントと紐づきました");
    expect(notice?.text).toContain("心当たりがなければ、このアカウントをブロックしてください");
    // 送り方が off なら送らない（紐づけはできる）
    const offApp = buildApp(database, notifyConfig({ mode: "off" }));
    const second = await follow(lineUser("b"));
    const linked = await call(offApp, admin.cookie, `/api/v1/booking/line-links/${second}`, "POST");
    expect(linked.status).toBe(200);
    expect(await readOutbox(offApp, admin.cookie)).toEqual([]);
  });

  it("同じ札を同時に2回送っても、紐づけは1つだけ（もう1回は 409）", async () => {
    const token = await follow(lineUser("a"));
    const path = `/api/v1/booking/line-links/${token}`;
    const statuses = (
      await Promise.all([
        call(app, participant.cookie, path, "POST"),
        call(app, admin.cookie, path, "POST"),
      ])
    ).map((response) => response.status);
    expect(statuses.sort()).toEqual([200, 409]);
    const links = await database.pool.query("SELECT 1 FROM booking_line_link");
    expect(links.rowCount).toBe(1);
  });

  it("期限切れは 410、知らない札・形の違う札は 404。未ログインは 401", async () => {
    const token = await follow(lineUser("a"));
    await database.pool.query(
      "UPDATE booking_line_link_token SET expires_at = now() - interval '1 second'",
    );
    const preview = await call(app, participant.cookie, `/api/v1/booking/line-links/${token}`);
    expect(await preview.json()).toMatchObject({ state: "expired" });
    expect(
      (await call(app, participant.cookie, `/api/v1/booking/line-links/${token}`, "POST")).status,
    ).toBe(410);
    expect(
      (await call(app, participant.cookie, `/api/v1/booking/line-links/${"x".repeat(43)}`)).status,
    ).toBe(404);
    expect(
      (await call(app, participant.cookie, "/api/v1/booking/line-links/bad!", "POST")).status,
    ).toBe(404);
    expect((await call(app, "", `/api/v1/booking/line-links/${token}`)).status).toBe(401);
  });

  it("同じアカウント・同じ LINE の友だちの前の紐づけを置きかえる（1つの公式アカウントに1人1つ）", async () => {
    await call(
      app,
      participant.cookie,
      `/api/v1/booking/line-links/${await follow(lineUser("a"))}`,
      "POST",
    );
    await call(
      app,
      participant.cookie,
      `/api/v1/booking/line-links/${await follow(lineUser("b"))}`,
      "POST",
    );
    await call(
      app,
      admin.cookie,
      `/api/v1/booking/line-links/${await follow(lineUser("b"))}`,
      "POST",
    );
    const links = await database.pool.query<{ line_user_id: string; account_id: string }>(
      "SELECT line_user_id, account_id FROM booking_line_link ORDER BY line_user_id",
    );
    expect(links.rows).toEqual([{ line_user_id: lineUser("b"), account_id: admin.account.id }]);
  });
});

describe("開発の窓口（偽の送り手が覚えたもの）", () => {
  it("試験用のログインが入で偽の送り手のときだけ。本物の送り手・試験用のログインが切なら 404", async () => {
    await truncateAllTables(database);
    const app = buildApp(database, notifyConfig());
    const user = await loginAs(app);
    expect((await call(app, user.cookie, "/api/v1/booking/dev/notify-outbox")).status).toBe(200);
    const real = buildApp(database, notifyConfig({ fakeOnly: false }));
    expect((await call(real, user.cookie, "/api/v1/booking/dev/notify-outbox")).status).toBe(404);
    const noTestLogin = buildApp(database, testConfig({ testLoginEnabled: false }));
    expect((await call(noTestLogin, user.cookie, "/api/v1/booking/dev/notify-outbox")).status).toBe(
      404,
    );
  });
});
