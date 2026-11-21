// 公式アカウントとメールの設定の結合のテスト（booking-002 US1・research S4〜S6・S9）：管理者が保存すると末尾だけ・答えとログと DB に
// 平文がない・入れ直し・チャネル ID を変えると紐づけが消える・足りない値・使えないトークン・届かない・秘密の箱がない・権限・
// 返信先・LINE の値を消す・確かめのメッセージ（紐づいていない・送った・止めている・許可リストにない・送れなかった）と今月の数。
import { Writable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import {
  SAMPLE_ACCESS_TOKEN,
  SAMPLE_CHANNEL_SECRET,
  SAMPLE_LINE_INPUT,
  followAndLink,
  lineUser,
  notifyBase,
  notifyConfig,
  saveLine,
} from "../../../test/helpers/booking-notify.ts";
import type { SettingsBody } from "../../../test/helpers/booking-notify.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";
import { createLogger } from "../../kernel/logger.ts";

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

describe("公式アカウントとメールの設定", () => {
  let app: TestApp;
  let log: ReturnType<typeof captureLogger>;
  let admin: Awaited<ReturnType<typeof loginAs>>;
  let editor: Awaited<ReturnType<typeof loginAs>>;
  let member: Awaited<ReturnType<typeof loginAs>>;
  let outsider: Awaited<ReturnType<typeof loginAs>>;
  let organizationId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    log = captureLogger();
    app = buildApp(database, notifyConfig(), { logger: log.logger });
    admin = await loginAs(app, { displayName: "管理者" });
    editor = await loginAs(app, { displayName: "編集者" });
    member = await loginAs(app, { displayName: "メンバー" });
    outsider = await loginAs(app, { displayName: "外の人" });
    organizationId = await setUpOrganization(app, admin.cookie, [
      { cookie: editor.cookie, accountId: editor.account.id, role: "editor" },
      { cookie: member.cookie, accountId: member.account.id, role: "member" },
    ]);
  });

  it("設定がなければ LINE は null。送り主の名前とあいさつの見本と今の送り方を返す", async () => {
    const response = await call(app, admin.cookie, notifyBase(organizationId));
    expect(response.status).toBe(200);
    const body = (await response.json()) as SettingsBody;
    expect(body.line).toBeNull();
    expect(body.holder).toEqual({ kind: "organization", id: organizationId, name: "飲食チーム" });
    expect(body.mail).toEqual({ senderName: "飲食チーム（kanaeru）", replyToEmail: null });
    expect(body.greetingPreview).toContain("飲食チーム");
    expect(body.deliveryMode).toBe("on");
    expect(body.myLink).toEqual({ linked: false });
  });

  it("管理者が入れると末尾4文字だけが返り、答え・ログ・DB に平文がない", async () => {
    const body = await saveLine(app, admin.cookie, organizationId);
    expect(body.line).toMatchObject({
      lineChannelId: "1234567890",
      channelSecretTail: SAMPLE_CHANNEL_SECRET.slice(-4),
      accessTokenTail: SAMPLE_ACCESS_TOKEN.slice(-4),
      basicId: "@fake",
      linkedCount: 0,
      sentThisMonth: 0,
    });
    expect(body.line?.webhookUrl).toBe(
      `http://localhost:5173/api/v1/booking/webhooks/line/${body.line?.channelId}`,
    );
    const text = JSON.stringify(body);
    expect(text).not.toContain(SAMPLE_CHANNEL_SECRET);
    expect(text).not.toContain(SAMPLE_ACCESS_TOKEN);
    expect(log.text()).not.toContain(SAMPLE_CHANNEL_SECRET);
    expect(log.text()).not.toContain(SAMPLE_ACCESS_TOKEN);
    const stored = await database.pool.query<{ row: string }>(
      "SELECT row_to_json(c)::text AS row FROM booking_line_channel c",
    );
    const row = stored.rows[0]?.row ?? "";
    expect(row).not.toContain(SAMPLE_CHANNEL_SECRET);
    expect(row).not.toContain(SAMPLE_ACCESS_TOKEN);
  });

  it("包んだ値を別の行に写しても開けない（ひもづけは設定の ID）", async () => {
    const org = await saveLine(app, admin.cookie, organizationId);
    const personal = await saveLine(app, outsider.cookie, undefined, {
      ...SAMPLE_LINE_INPUT,
      lineChannelId: "2234567890",
      accessToken: `${"other".repeat(8)}abcd`,
    });
    // 組織の暗号文を個人の行に写すと、個人の行の Webhook は開けず 404 になる
    await database.pool.query(
      `UPDATE booking_line_channel p SET access_token_ciphertext = o.access_token_ciphertext,
         access_token_iv = o.access_token_iv FROM booking_line_channel o WHERE p.id = $1 AND o.id = $2`,
      [personal.line?.channelId, org.line?.channelId],
    );
    const response = await app.request(
      `/api/v1/booking/webhooks/line/${personal.line?.channelId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-line-signature": "x" },
        body: "{}",
      },
    );
    expect(response.status).toBe(404);
  });

  it("入れ直す：トークンだけ・チャネル ID を変えると紐づけが消える", async () => {
    const first = await saveLine(app, admin.cookie, organizationId);
    await followAndLink(app, admin.cookie, first.line?.channelId ?? "", lineUser("a"));
    const rotated = await saveLine(app, admin.cookie, organizationId, {
      accessToken: `${"rotated".repeat(5)}9876`,
    });
    expect(rotated.line?.accessTokenTail).toBe("9876");
    expect(rotated.line?.channelSecretTail).toBe(SAMPLE_CHANNEL_SECRET.slice(-4));
    expect(rotated.line?.linkedCount).toBe(1);
    // チャネル ID だけを変えようとすると、シークレットとトークンを求める
    const partial = await call(app, admin.cookie, `${notifyBase(organizationId)}/line`, "PUT", {
      lineChannelId: "9999999999",
    });
    expect(partial.status).toBe(400);
    const fields = ((await partial.json()) as { error: { fields: { path: string }[] } }).error
      .fields;
    expect(fields.map((field) => field.path).sort()).toEqual(["accessToken", "channelSecret"]);
    const changed = await saveLine(app, admin.cookie, organizationId, {
      ...SAMPLE_LINE_INPUT,
      lineChannelId: "9999999999",
    });
    expect(changed.line?.linkedCount).toBe(0);
    expect(changed.line?.channelId).toBe(first.line?.channelId);
  });

  it("アクセストークンだけを別の公式アカウントのものに入れ直すと、紐づけと札が消える", async () => {
    const first = await saveLine(app, admin.cookie, organizationId);
    await followAndLink(app, admin.cookie, first.line?.channelId ?? "", lineUser("a"));
    const switched = await saveLine(app, admin.cookie, organizationId, {
      accessToken: `otherbot${"x".repeat(30)}`,
    });
    expect(switched.line?.basicId).toBe("@fake2");
    expect(switched.line?.linkedCount).toBe(0);
    const bot = await database.pool.query<{ bot_user_id: string | null }>(
      "SELECT bot_user_id FROM booking_line_channel",
    );
    expect(bot.rows).toEqual([{ bot_user_id: `U${"e".repeat(32)}` }]);
  });

  it("前の版で入れた行（ボットの userId が空）は、ベーシック ID が替わったら紐づけを消し、同じなら残す", async () => {
    const first = await saveLine(app, admin.cookie, organizationId);
    await followAndLink(app, admin.cookie, first.line?.channelId ?? "", lineUser("a"));
    await database.pool.query("UPDATE booking_line_channel SET bot_user_id = NULL");
    const same = await saveLine(app, admin.cookie, organizationId, {
      accessToken: `${"rotated".repeat(5)}9876`,
    });
    expect(same.line?.linkedCount).toBe(1);
    await database.pool.query("UPDATE booking_line_channel SET bot_user_id = NULL");
    const switched = await saveLine(app, admin.cookie, organizationId, {
      accessToken: `otherbot${"x".repeat(30)}`,
    });
    expect(switched.line?.linkedCount).toBe(0);
  });

  it("シークレットだけの保存は、書くときに押さえた行のボット情報を残す（同時にトークンを入れ替えても古い値で上書きしない）", async () => {
    await saveLine(app, admin.cookie, organizationId);
    // シークレットだけの保存が読んだあと・書く前に、ほかの管理者がトークンを別の公式アカウントのものに入れ替えたとする
    let interleave: (() => Promise<unknown>) | undefined = () =>
      database.pool.query(
        "UPDATE booking_line_channel SET basic_id = '@fake2', bot_user_id = $1",
        [`U${"e".repeat(32)}`],
      );
    const racing = {
      ...database,
      db: new Proxy(database.db, {
        get(target, property, receiver) {
          const value: unknown = Reflect.get(target, property, receiver);
          if (property !== "transaction" || !interleave || typeof value !== "function") {
            return value;
          }
          const run = interleave;
          interleave = undefined;
          return async (...args: unknown[]) => {
            await run();
            return (value as (...inner: unknown[]) => unknown).apply(target, args);
          };
        },
      }),
    };
    const racingApp = buildApp(racing, notifyConfig(), { logger: log.logger });
    const response = await call(racingApp, admin.cookie, `${notifyBase(organizationId)}/line`, "PUT", {
      channelSecret: "d".repeat(32),
    });
    expect(response.status).toBe(200);
    const bot = await database.pool.query<{ basic_id: string; bot_user_id: string }>(
      "SELECT basic_id, bot_user_id FROM booking_line_channel",
    );
    expect(bot.rows).toEqual([{ basic_id: "@fake2", bot_user_id: `U${"e".repeat(32)}` }]);
  });

  it("同じチャネル ID は、ほかの持ち主の設定に入れられない（409）", async () => {
    await saveLine(app, admin.cookie, organizationId);
    const taken = await call(
      app,
      outsider.cookie,
      `${notifyBase()}/line`,
      "PUT",
      SAMPLE_LINE_INPUT,
    );
    expect(taken.status).toBe(409);
    expect(((await taken.json()) as { error: { code: string } }).error.code).toBe(
      "BOOKING_LINE_CHANNEL_TAKEN",
    );
    const read = (await (await call(app, outsider.cookie, notifyBase())).json()) as SettingsBody;
    expect(read.line).toBeNull();
  });

  it("初めは3つとも要る。使えないトークンは 400、LINE に届かないと 502。どちらも保存しない", async () => {
    const missing = await call(app, admin.cookie, `${notifyBase(organizationId)}/line`, "PUT", {
      accessToken: SAMPLE_ACCESS_TOKEN,
    });
    expect(missing.status).toBe(400);
    const invalid = await call(app, admin.cookie, `${notifyBase(organizationId)}/line`, "PUT", {
      ...SAMPLE_LINE_INPUT,
      accessToken: `invalid${"x".repeat(30)}`,
    });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: { code: string } }).error.code).toBe(
      "BOOKING_LINE_TOKEN_INVALID",
    );
    // 本物の送り手で、LINE が 5xx を返す
    const realApp = buildApp(database, notifyConfig({ fakeOnly: false, mode: "off" }), {
      fetch: () => Promise.resolve(new Response("{}", { status: 503 })),
    });
    const unreachable = await call(
      realApp,
      admin.cookie,
      `${notifyBase(organizationId)}/line`,
      "PUT",
      SAMPLE_LINE_INPUT,
    );
    expect(unreachable.status).toBe(502);
    const read = (await (
      await call(app, admin.cookie, notifyBase(organizationId))
    ).json()) as SettingsBody;
    expect(read.line).toBeNull();
  });

  it("本番では、送り方が off でもボット情報だけは読み、ベーシック ID を持つ（メッセージは送らない）", async () => {
    const urls: string[] = [];
    const realApp = buildApp(database, notifyConfig({ fakeOnly: false, mode: "off" }), {
      fetch: (input) => {
        urls.push(input instanceof Request ? input.url : input.toString());
        return Promise.resolve(Response.json({ basicId: "@abc1234" }));
      },
    });
    const body = await saveLine(realApp, admin.cookie, organizationId);
    expect(body.line?.basicId).toBe("@abc1234");
    expect(urls).toEqual(["https://api.line.me/v2/bot/info"]);
  });

  it("鍵の束の設定がなければ 503", async () => {
    const noBox = buildApp(database, notifyConfig({}, { tokenEncryption: undefined }));
    const response = await call(
      noBox,
      admin.cookie,
      `${notifyBase(organizationId)}/line`,
      "PUT",
      SAMPLE_LINE_INPUT,
    );
    expect(response.status).toBe(503);
  });

  it("組織の設定は管理者だけ。編集者・メンバー・外の人は読む・書く・確かめるのどれも 403", async () => {
    await saveLine(app, admin.cookie, organizationId);
    for (const person of [editor, member, outsider]) {
      for (const [path, method, body] of [
        ["", "GET", undefined],
        ["/line", "PUT", SAMPLE_LINE_INPUT],
        ["/line", "DELETE", undefined],
        ["/mail", "PUT", { replyToEmail: null }],
        ["/test", "POST", undefined],
      ] as const) {
        const response = await call(
          app,
          person.cookie,
          `${notifyBase(organizationId)}${path}`,
          method,
          body,
        );
        expect(response.status, `${method} ${path}`).toBe(403);
      }
    }
    const unknown = await call(
      app,
      admin.cookie,
      notifyBase("0193a1b2-0000-7000-8000-000000000000"),
    );
    expect(unknown.status).toBe(403);
  });

  it("個人の設定は本人のものだけ。個人の答えに、自分が管理者の組織が出る", async () => {
    const mine = (await (await call(app, admin.cookie, notifyBase())).json()) as SettingsBody;
    expect(mine.holder).toEqual({ kind: "personal", id: admin.account.id, name: "管理者" });
    expect(mine.adminOrganizations).toEqual([{ id: organizationId, name: "飲食チーム" }]);
    const editorView = (await (
      await call(app, editor.cookie, notifyBase())
    ).json()) as SettingsBody;
    expect(editorView.adminOrganizations).toEqual([]);
    await saveLine(app, admin.cookie);
    const other = (await (await call(app, outsider.cookie, notifyBase())).json()) as SettingsBody;
    expect(other.line).toBeNull();
    expect((await call(app, "", notifyBase())).status).toBe(401);
  });

  it("返信先を入れて消す。形が違えば 400。LINE の値がなくても入れられる", async () => {
    const saved = await call(app, admin.cookie, `${notifyBase(organizationId)}/mail`, "PUT", {
      replyToEmail: "Reply@Example.com",
    });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as SettingsBody;
    expect(body.mail.replyToEmail).toBe("reply@example.com");
    expect(body.line).toBeNull();
    const bad = await call(app, admin.cookie, `${notifyBase(organizationId)}/mail`, "PUT", {
      replyToEmail: "reply",
    });
    expect(bad.status).toBe(400);
    const cleared = await call(app, admin.cookie, `${notifyBase(organizationId)}/mail`, "PUT", {
      replyToEmail: null,
    });
    expect(((await cleared.json()) as SettingsBody).mail.replyToEmail).toBeNull();
  });

  it("LINE の値を消すと、紐づけも消え、返信先は残る", async () => {
    const saved = await saveLine(app, admin.cookie, organizationId);
    await call(app, admin.cookie, `${notifyBase(organizationId)}/mail`, "PUT", {
      replyToEmail: "reply@example.com",
    });
    await followAndLink(app, member.cookie, saved.line?.channelId ?? "", lineUser("b"));
    const response = await call(app, admin.cookie, `${notifyBase(organizationId)}/line`, "DELETE");
    const body = (await response.json()) as SettingsBody;
    expect(body.line).toBeNull();
    expect(body.mail.replyToEmail).toBe("reply@example.com");
    const links = await database.pool.query("SELECT 1 FROM booking_line_link");
    expect(links.rowCount).toBe(0);
  });

  describe("自分に確かめのメッセージを送る", () => {
    it("LINE の値がなければ 409、紐づいていなければ送らずに案内する", async () => {
      const notSet = await call(app, admin.cookie, `${notifyBase(organizationId)}/test`, "POST");
      expect(notSet.status).toBe(409);
      await saveLine(app, admin.cookie, organizationId);
      const response = await call(app, admin.cookie, `${notifyBase(organizationId)}/test`, "POST");
      expect(await response.json()).toMatchObject({ result: "not_linked" });
    });

    it("紐づいていれば本人にだけ送り、今月の数が増える。記録に本文と宛先がない", async () => {
      const saved = await saveLine(app, admin.cookie, organizationId);
      await followAndLink(app, admin.cookie, saved.line?.channelId ?? "", lineUser("c"));
      const response = await call(app, admin.cookie, `${notifyBase(organizationId)}/test`, "POST");
      expect(await response.json()).toMatchObject({ result: "sent" });
      const body = (await (
        await call(app, admin.cookie, notifyBase(organizationId))
      ).json()) as SettingsBody;
      expect(body.line?.sentThisMonth).toBe(1);
      expect(body.myLink.linked).toBe(true);
      const notices = await database.pool.query<{ row: string }>(
        "SELECT row_to_json(n)::text AS row FROM booking_notice n",
      );
      expect(notices.rows).toHaveLength(1);
      expect(notices.rows[0]?.row).not.toContain(lineUser("c"));
      expect(log.text()).not.toContain(lineUser("c"));
    });

    it("off なら止めている、許可リストになければ本人の ID を返す", async () => {
      const saved = await saveLine(app, admin.cookie, organizationId);
      await followAndLink(app, admin.cookie, saved.line?.channelId ?? "", lineUser("d"));
      const offApp = buildApp(database, notifyConfig({ mode: "off" }));
      const off = await call(offApp, admin.cookie, `${notifyBase(organizationId)}/test`, "POST");
      expect(await off.json()).toMatchObject({ result: "off" });
      const allowApp = buildApp(
        database,
        notifyConfig({ mode: "allowlist", allowlist: [lineUser("e")] }),
      );
      const blocked = await call(
        allowApp,
        admin.cookie,
        `${notifyBase(organizationId)}/test`,
        "POST",
      );
      expect(await blocked.json()).toMatchObject({
        result: "not_allowed",
        lineUserId: lineUser("d"),
      });
      const passApp = buildApp(
        database,
        notifyConfig({ mode: "allowlist", allowlist: [lineUser("d")] }),
      );
      const passed = await call(
        passApp,
        admin.cookie,
        `${notifyBase(organizationId)}/test`,
        "POST",
      );
      expect(await passed.json()).toMatchObject({ result: "sent" });
    });

    it("本物の送り手で off なら、LINE の API を1回も呼ばない。LINE が受け取らなければ送れなかった", async () => {
      const saved = await saveLine(app, admin.cookie, organizationId);
      await followAndLink(app, admin.cookie, saved.line?.channelId ?? "", lineUser("a"));
      const called: string[] = [];
      const offReal = buildApp(database, notifyConfig({ fakeOnly: false, mode: "off" }), {
        fetch: (input) => {
          called.push(input instanceof Request ? input.url : input.toString());
          return Promise.resolve(new Response("{}"));
        },
      });
      const off = await call(offReal, admin.cookie, `${notifyBase(organizationId)}/test`, "POST");
      expect(await off.json()).toMatchObject({ result: "off" });
      expect(called).toEqual([]);
      const failingReal = buildApp(database, notifyConfig({ fakeOnly: false, mode: "on" }), {
        fetch: () => Promise.resolve(new Response("{}", { status: 403 })),
      });
      const failed = await call(
        failingReal,
        admin.cookie,
        `${notifyBase(organizationId)}/test`,
        "POST",
      );
      expect(await failed.json()).toMatchObject({ result: "failed" });
    });
  });
});
