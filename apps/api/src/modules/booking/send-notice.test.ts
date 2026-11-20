// 予約の知らせを送る業務の関数の結合のテスト（booking-002 US3・research R5・R6・S8・S9）：当てはまる公式アカウント（組織・個人）・
// LINE → メール → なし・守り（off・許可リスト）・LINE が送れなかったときメールに切り替えない・本番でメールの送り手がなければ準備がない・
// 記録とログに本文と宛先がない。名簿の行のアカウントは、次の仕様（自前の申込み）で入るので、ここでは表に直に入れる。
import { Writable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import {
  followAndLink,
  lineUser,
  notifyConfig,
  saveLine,
} from "../../../test/helpers/booking-notify.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, placeEvent } from "../../../test/helpers/event.ts";
import { createOrganization } from "../../../test/helpers/organization.ts";
import type { Config } from "../../kernel/config.ts";
import { createLogger } from "../../kernel/logger.ts";
import type { Notifier } from "../../kernel/notifier.ts";
import { createNotifier } from "../../platform/notify/index.ts";
import { createSecretBox } from "@workspace/secret-box";
import { sendNotice } from "./notify.ts";
import type { NotifyDeps } from "./notify-settings.ts";

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

describe("予約の知らせを送る（sendNotice）", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let participant: Awaited<ReturnType<typeof loginAs>>;
  let organizationId: string;
  let orgEventId: string;
  let personalEventId: string;
  let orgChannelId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, notifyConfig());
    owner = await loginAs(app, { displayName: "持ち主" });
    participant = await loginAs(app, { displayName: "参加者" });
    organizationId = await createOrganization(app, owner.cookie);
    orgEventId = (await createEvent(app, owner.cookie, { name: "組織の交流会" })).id;
    expect((await placeEvent(app, owner.cookie, orgEventId, organizationId)).status).toBe(200);
    personalEventId = (await createEvent(app, owner.cookie, { name: "個人の交流会" })).id;
    orgChannelId = (await saveLine(app, owner.cookie, organizationId)).line?.channelId ?? "";
  });

  /**
   * 申込みを表に直に足す（アカウントつき）。
   * @param eventId 交流会の ID
   * @param accountId 本人のアカウント（なければ手で足した行）
   * @returns 申込みの ID
   */
  async function insertEntry(eventId: string, accountId: string | null): Promise<string> {
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO booking_entry (event_id, name, application_source, entry_kind, account_id)
       VALUES ($1, '山田 花子', 'other', 'manual', $2) RETURNING id`,
      [eventId, accountId],
    );
    return result.rows[0]?.id ?? "";
  }

  /**
   * 業務の関数に渡す道具を作る（組み立てと同じ形）。
   * @param notify 送り方
   * @param fetch 外への出口
   * @returns 道具とログ
   */
  function depsOf(
    notify: Partial<Config["notify"]> = {},
    fetch: typeof globalThis.fetch = () => Promise.reject(new Error("外へ出ようとしました")),
  ): { deps: NotifyDeps; notifier: Notifier; log: ReturnType<typeof captureLogger> } {
    const config = notifyConfig(notify);
    const log = captureLogger();
    const notifier = createNotifier({ policy: config.notify, fetch, logger: log.logger });
    const encryption = config.tokenEncryption;
    if (!encryption) throw new Error("鍵の束がありません。");
    return {
      deps: {
        db: database.db,
        logger: log.logger,
        config: { ...config },
        fetch,
        secretBox: createSecretBox(encryption.keyRing, encryption.currentVersion),
        notifier,
      },
      notifier,
      log,
    };
  }

  /**
   * 記録を読む。
   * @returns 記録（作った順）
   */
  async function notices() {
    const result = await database.pool.query<{
      entry_id: string | null;
      channel_id: string | null;
      kind: string;
      method: string;
      result: string;
      row: string;
    }>(
      "SELECT entry_id, channel_id, kind, method, result, row_to_json(n)::text AS row FROM booking_notice n ORDER BY created_at, id",
    );
    return result.rows;
  }

  it("組織に入れた交流会は、組織の公式アカウントと紐づいていれば LINE で送る", async () => {
    await followAndLink(app, participant.cookie, orgChannelId, lineUser("a"));
    const entryId = await insertEntry(orgEventId, participant.account.id);
    const { deps, notifier, log } = depsOf();
    const result = await sendNotice(deps, {
      entryId,
      kind: "confirmed",
      links: { calendar: "https://example.com/cal" },
    });
    expect(result).toEqual({ method: "line", result: "sent" });
    const [message] = notifier.fakeOutbox() ?? [];
    expect(message).toMatchObject({ method: "line_push", to: lineUser("a") });
    expect(message?.text).toContain("組織の交流会");
    expect(message?.text).toContain("カレンダーに追加：https://example.com/cal");
    const [notice] = await notices();
    expect(notice).toMatchObject({
      entry_id: entryId,
      channel_id: orgChannelId,
      kind: "confirmed",
      method: "line",
      result: "sent",
    });
    expect(notice?.row).not.toContain(lineUser("a"));
    expect(log.text()).not.toContain(lineUser("a"));
    expect(log.text()).not.toContain("組織の交流会");
  });

  it("個人の交流会は持ち主の個人の公式アカウントを使い、組織の紐づけは使わない", async () => {
    await followAndLink(app, participant.cookie, orgChannelId, lineUser("a"));
    const entryId = await insertEntry(personalEventId, participant.account.id);
    const { deps } = depsOf();
    expect(await sendNotice(deps, { entryId, kind: "confirmed" })).toEqual({
      method: "none",
      result: "no_destination",
    });
    const personalChannelId = (await saveLine(app, owner.cookie)).line?.channelId ?? "";
    await followAndLink(app, participant.cookie, personalChannelId, lineUser("b"));
    const second = depsOf();
    expect(await sendNotice(second.deps, { entryId, kind: "confirmed" })).toEqual({
      method: "line",
      result: "sent",
    });
    expect(second.notifier.fakeOutbox()?.[0]?.to).toBe(lineUser("b"));
  });

  it("紐づいていなければ、本人が入れたメールアドレスに送る（送り主の名前・返信先）", async () => {
    await call(
      app,
      owner.cookie,
      `/api/v1/booking/notify-settings/organizations/${organizationId}/mail`,
      "PUT",
      {
        replyToEmail: "reply@example.com",
      },
    );
    await call(app, participant.cookie, "/api/v1/booking/me/contact", "PUT", {
      email: "hanako@example.com",
    });
    const entryId = await insertEntry(orgEventId, participant.account.id);
    const { deps, notifier, log } = depsOf();
    expect(await sendNotice(deps, { entryId, kind: "waitlisted", waitlistPosition: 2 })).toEqual({
      method: "email",
      result: "sent",
    });
    const [mail] = notifier.fakeOutbox() ?? [];
    expect(mail).toMatchObject({
      method: "email",
      to: "hanako@example.com",
      subject: "【キャンセル待ちに入った】組織の交流会",
    });
    expect(mail?.text).toContain("キャンセル待ち（2番目）");
    expect(mail?.text).toContain("返信すると、飲食チームに届きます");
    expect((await notices())[0]?.row).not.toContain("hanako@example.com");
    expect(log.text()).not.toContain("hanako@example.com");
  });

  it("どちらもなければ、送らずに「送り先がない」と記録する（手で足した行も）", async () => {
    const { deps } = depsOf();
    const manual = await insertEntry(orgEventId, null);
    expect(await sendNotice(deps, { entryId: manual, kind: "cancelled_event" })).toEqual({
      method: "none",
      result: "no_destination",
    });
    const withAccount = await insertEntry(orgEventId, participant.account.id);
    expect(await sendNotice(deps, { entryId: withAccount, kind: "changed" })).toEqual({
      method: "none",
      result: "no_destination",
    });
    expect((await notices()).map((notice) => notice.result)).toEqual([
      "no_destination",
      "no_destination",
    ]);
  });

  it("off なら止めている、許可リストになければ許可リストにない。どちらもメールに切り替えない", async () => {
    await followAndLink(app, participant.cookie, orgChannelId, lineUser("a"));
    await call(app, participant.cookie, "/api/v1/booking/me/contact", "PUT", {
      email: "hanako@example.com",
    });
    const entryId = await insertEntry(orgEventId, participant.account.id);
    const off = depsOf({ mode: "off" });
    expect(await sendNotice(off.deps, { entryId, kind: "confirmed" })).toEqual({
      method: "line",
      result: "off",
    });
    const blocked = depsOf({ mode: "allowlist", allowlist: ["hanako@example.com"] });
    expect(await sendNotice(blocked.deps, { entryId, kind: "confirmed" })).toEqual({
      method: "line",
      result: "not_allowed",
    });
    expect(blocked.notifier.fakeOutbox()).toEqual([]);
    const allowed = depsOf({ mode: "allowlist", allowlist: [lineUser("a")] });
    expect(await sendNotice(allowed.deps, { entryId, kind: "confirmed" })).toEqual({
      method: "line",
      result: "sent",
    });
  });

  it("本物の送り手で off なら、LINE もメールも外へ出ない", async () => {
    await followAndLink(app, participant.cookie, orgChannelId, lineUser("a"));
    const entryId = await insertEntry(orgEventId, participant.account.id);
    const called: string[] = [];
    const { deps } = depsOf({ fakeOnly: false, mode: "off" }, (input) => {
      called.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(new Response("{}"));
    });
    expect(await sendNotice(deps, { entryId, kind: "offered", deadline: new Date() })).toEqual({
      method: "line",
      result: "off",
    });
    expect(called).toEqual([]);
  });

  it("LINE が送れなかったときは failed と記録し、メールに切り替えない", async () => {
    await followAndLink(app, participant.cookie, orgChannelId, lineUser("a"));
    await call(app, participant.cookie, "/api/v1/booking/me/contact", "PUT", {
      email: "hanako@example.com",
    });
    const entryId = await insertEntry(orgEventId, participant.account.id);
    const urls: string[] = [];
    const { deps } = depsOf({ fakeOnly: false, mode: "on" }, (input) => {
      urls.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(new Response("{}", { status: 429 }));
    });
    expect(await sendNotice(deps, { entryId, kind: "confirmed" })).toEqual({
      method: "line",
      result: "failed",
    });
    expect(urls).toEqual(["https://api.line.me/v2/bot/message/push"]);
  });

  it("本番でメールの送り手がなければ「メールの準備がない」と記録する", async () => {
    await call(app, participant.cookie, "/api/v1/booking/me/contact", "PUT", {
      email: "hanako@example.com",
    });
    const entryId = await insertEntry(orgEventId, participant.account.id);
    const { deps } = depsOf({ fakeOnly: false, mode: "on" });
    expect(await sendNotice(deps, { entryId, kind: "confirmed" })).toEqual({
      method: "email",
      result: "unavailable",
    });
  });

  it("知らない申込みは 404。申込みを消すと記録も消える", async () => {
    const { deps } = depsOf();
    await expect(
      sendNotice(deps, { entryId: "0193a1b2-0000-7000-8000-000000000000", kind: "confirmed" }),
    ).rejects.toMatchObject({ status: 404 });
    const entryId = await insertEntry(orgEventId, null);
    await sendNotice(deps, { entryId, kind: "confirmed" });
    await database.pool.query("DELETE FROM booking_entry WHERE id = $1", [entryId]);
    expect(await notices()).toEqual([]);
  });
});
