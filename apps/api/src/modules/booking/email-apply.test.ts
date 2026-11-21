// LINE を使わずにメールで申し込む結合のテスト（booking-003 US5・research R10・R11・S1・S2・S5〜S8・S12・S15）。
// 偽の送り手の確認のメールから札を読む。名前・アドレスはどれも架空のもの。
import { Writable } from "node:stream";
import "@hono/zod-openapi";
import type { EntryTokenView } from "@workspace/contracts/booking";
import { EMAIL_REQUESTS_PER_EVENT_MAX } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, readRoster } from "../../../test/helpers/booking.ts";
import { anonymous, entryTokenOf, openSelfPage } from "../../../test/helpers/booking-apply.ts";
import { notifyConfig, readOutbox } from "../../../test/helpers/booking-notify.ts";
import type { OutboxMessage } from "../../../test/helpers/booking-notify.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, placeEvent } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";
import { createLogger } from "../../kernel/logger.ts";

const database = useTestDatabase();

/** 見本のアドレス（架空）。 */
const GUEST = "guest@example.com";

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

describe("メールで申し込む", () => {
  let app: TestApp;
  let log: ReturnType<typeof captureLogger>;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    log = captureLogger();
    app = buildApp(database, notifyConfig(), { logger: log.logger });
    owner = await loginAs(app, { displayName: "高橋" });
    eventId = (await createEvent(app, owner.cookie, { name: "土曜の練習" })).id;
    base = bookingBase(eventId);
    await openSelfPage(app, owner.cookie, eventId);
  });

  /**
   * 確認のメールを頼む。
   * @param email メールアドレス
   * @param name 名前
   * @returns 応答
   */
  function requestMail(email = GUEST, name = "小林 はると"): Promise<Response> {
    return anonymous(app, `${base}/email-requests`, "POST", { name, email });
  }

  /**
   * 偽の送り手のメール（新しい順）。
   * @returns メール
   */
  async function mails(): Promise<OutboxMessage[]> {
    return (await readOutbox(app, owner.cookie)).filter((message) => message.method === "email");
  }

  /**
   * 確認のメールを頼み、届いたメールの札を返す。
   * @param email メールアドレス
   * @returns 札
   */
  async function requestToken(email = GUEST): Promise<string> {
    expect((await requestMail(email)).status).toBe(202);
    const [mail] = await mails();
    if (!mail) throw new Error("確認のメールがありません。");
    return entryTokenOf(mail.text);
  }

  it("確認のメールを送り（202）、DB には札の SHA-256 だけを持つ。GET では確定しない", async () => {
    const response = await requestMail();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    const [mail] = await mails();
    expect(mail).toMatchObject({ to: GUEST, subject: "【申込みの確認】土曜の練習" });
    expect(mail?.text).toContain("申込みを確定する");
    const token = entryTokenOf(mail?.text ?? "");
    // 32バイトの乱数の base64url（43文字。S1）
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await database.pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM booking_email_request",
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]?.token_hash).not.toBe(token);

    const view = await anonymous(app, `/api/v1/booking/entry-tokens/${token}`);
    expect(view.status).toBe(200);
    const body = (await view.json()) as EntryTokenView;
    expect(body).toMatchObject({
      state: "pending",
      name: "小林 はると",
      entry: null,
      confirmable: true,
    });
    expect(body.event.name).toBe("土曜の練習");
    expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(0);
  });

  it("確定すると名簿に自前・アカウントなしの行ができ、確定の知らせのメール（同じ札のリンク）を送る", async () => {
    const token = await requestToken();
    const confirmed = await anonymous(app, `/api/v1/booking/entry-tokens/${token}/confirm`, "POST");
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({
      state: "entry",
      entry: { status: "confirmed", cancellable: true },
    });
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries).toHaveLength(1);
    expect(roster.entries[0]).toMatchObject({ name: "小林 はると", entryKind: "self_page" });
    const [notice] = await mails();
    expect(notice?.subject).toBe("【申込みの確定】土曜の練習");
    expect(notice?.to).toBe(GUEST);
    expect(entryTokenOf(notice?.text ?? "")).toBe(token);
    // 2回押しても1行
    expect(
      (await anonymous(app, `/api/v1/booking/entry-tokens/${token}/confirm`, "POST")).status,
    ).toBe(200);
    expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(1);
    // 確定した待ちは、札で引けない形で残る（回数の縛りの記録。research R11）
    const requests = await database.pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM booking_email_request",
    );
    expect(requests.rows.map((row) => row.token_hash.startsWith("consumed:"))).toEqual([true]);
  });

  it("同じ札で取り消せる。始まりを過ぎたら 409", async () => {
    const token = await requestToken();
    await anonymous(app, `/api/v1/booking/entry-tokens/${token}/confirm`, "POST");
    const cancelled = await anonymous(app, `/api/v1/booking/entry-tokens/${token}/cancel`, "POST");
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({ entry: { status: "cancelled" } });
    expect((await readRoster(app, owner.cookie, eventId)).entries[0]?.status).toBe("cancelled");

    const second = (await createEvent(app, owner.cookie)).id;
    await openSelfPage(app, owner.cookie, second);
    expect(
      (
        await anonymous(app, `${bookingBase(second)}/email-requests`, "POST", {
          name: "小林",
          email: GUEST,
        })
      ).status,
    ).toBe(202);
    const [mail] = await mails();
    const other = entryTokenOf(mail?.text ?? "");
    await anonymous(app, `/api/v1/booking/entry-tokens/${other}/confirm`, "POST");
    await database.pool.query(
      "UPDATE event SET starts_at = now() - interval '1 hour' WHERE id = $1",
      [second],
    );
    const late = await anonymous(app, `/api/v1/booking/entry-tokens/${other}/cancel`, "POST");
    expect(late.status).toBe(409);
    expect(((await late.json()) as ErrorBody).error.code).toBe("BOOKING_CANCEL_CLOSED");
  });

  it("本人が取り消すと連絡のメールアドレスが消える。もう一度申し込むと新しい行になる（Constitution II）", async () => {
    const token = await requestToken();
    await anonymous(app, `/api/v1/booking/entry-tokens/${token}/confirm`, "POST");
    await anonymous(app, `/api/v1/booking/entry-tokens/${token}/cancel`, "POST");
    const stored = await database.pool.query<{ contact_email: string | null }>(
      "SELECT contact_email FROM booking_entry",
    );
    expect(stored.rows).toEqual([{ contact_email: null }]);
    // 回数の縛りのために残していた確認の待ちも消える
    expect((await database.pool.query("SELECT 1 FROM booking_email_request")).rowCount).toBe(0);
    // 札のページでは取り消しのまま見られる
    expect(
      await (await anonymous(app, `/api/v1/booking/entry-tokens/${token}`)).json(),
    ).toMatchObject({ entry: { status: "cancelled" } });
    await database.pool.query(
      "UPDATE booking_email_request SET created_at = now() - interval '11 minutes'",
    );
    const again = await requestToken();
    await anonymous(app, `/api/v1/booking/entry-tokens/${again}/confirm`, "POST");
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries.map((entry) => entry.status)).toEqual(["cancelled", "confirmed"]);
  });

  it("主催者が取り消した申込みは、もう一度申し込んで確定すると同じ行が確定に戻り、前の札は使えない", async () => {
    const first = await requestToken();
    await anonymous(app, `/api/v1/booking/entry-tokens/${first}/confirm`, "POST");
    const [entry] = (await readRoster(app, owner.cookie, eventId)).entries;
    const cancelled = await call(app, owner.cookie, `${base}/entries/${entry?.id}/status`, "PUT", {
      status: "cancelled",
    });
    expect(cancelled.status).toBe(200);
    await database.pool.query(
      "UPDATE booking_email_request SET created_at = now() - interval '11 minutes'",
    );
    const second = await requestToken();
    const confirmed = await anonymous(
      app,
      `/api/v1/booking/entry-tokens/${second}/confirm`,
      "POST",
    );
    expect(await confirmed.json()).toMatchObject({ entry: { status: "confirmed" } });
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries.map((item) => [item.id, item.status])).toEqual([
      [entry?.id, "confirmed"],
    ]);
    expect((await anonymous(app, `/api/v1/booking/entry-tokens/${first}`)).status).toBe(404);
  });

  it("確認の待ちのあとに、受付を閉じた・始まった・部員だけに変わったら確定できない（409・409・403）", async () => {
    const token = await requestToken();
    const confirm = () => anonymous(app, `/api/v1/booking/entry-tokens/${token}/confirm`, "POST");
    await openSelfPage(app, owner.cookie, eventId, { accepting: false });
    const closed = await confirm();
    expect(closed.status).toBe(409);
    expect(((await closed.json()) as ErrorBody).error.code).toBe("BOOKING_PAGE_CLOSED");
    await openSelfPage(app, owner.cookie, eventId);
    const organizationId = await setUpOrganization(app, owner.cookie, []);
    await placeEvent(app, owner.cookie, eventId, organizationId);
    await openSelfPage(app, owner.cookie, eventId, { visibility: "members" });
    const members = await confirm();
    expect(members.status).toBe(403);
    expect(((await members.json()) as ErrorBody).error.code).toBe("BOOKING_PAGE_MEMBERS_ONLY");
    await openSelfPage(app, owner.cookie, eventId);
    await database.pool.query(
      "UPDATE event SET starts_at = now() - interval '1 minute' WHERE id = $1",
      [eventId],
    );
    const started = await confirm();
    expect(started.status).toBe(409);
    expect(((await started.json()) as ErrorBody).error.code).toBe("BOOKING_PAGE_CLOSED");
    expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(0);
  });

  it("確認の前の札は、部員だけに変わった会の中身を返さない（403）。誰でもに戻せば読める", async () => {
    const token = await requestToken();
    const read = () => anonymous(app, `/api/v1/booking/entry-tokens/${token}`);
    const organizationId = await setUpOrganization(app, owner.cookie, []);
    await placeEvent(app, owner.cookie, eventId, organizationId);
    await openSelfPage(app, owner.cookie, eventId, { visibility: "members" });
    const hidden = await read();
    expect(hidden.status).toBe(403);
    const body = await hidden.text();
    expect(body).toContain("BOOKING_PAGE_MEMBERS_ONLY");
    expect(body).not.toContain("土曜の練習");
    await openSelfPage(app, owner.cookie, eventId);
    expect((await read()).status).toBe(200);
  });

  it("同じ札で同時に2回確定しても、申込みは1行", async () => {
    const token = await requestToken();
    const path = `/api/v1/booking/entry-tokens/${token}/confirm`;
    const statuses = (
      await Promise.all([anonymous(app, path, "POST"), anonymous(app, path, "POST")])
    ).map((response) => response.status);
    expect(statuses).toEqual([200, 200]);
    expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(1);
  });

  it("期限切れの確認の札は 410、知らない札・形の違う札は 404", async () => {
    const token = await requestToken();
    await database.pool.query(
      "UPDATE booking_email_request SET expires_at = now() - interval '1 minute'",
    );
    const expired = await anonymous(app, `/api/v1/booking/entry-tokens/${token}`);
    expect(expired.status).toBe(410);
    expect(
      (await anonymous(app, `/api/v1/booking/entry-tokens/${token}/confirm`, "POST")).status,
    ).toBe(410);
    expect((await anonymous(app, `/api/v1/booking/entry-tokens/${"x".repeat(43)}`)).status).toBe(
      404,
    );
    expect((await anonymous(app, "/api/v1/booking/entry-tokens/short")).status).toBe(404);
  });

  it("10分のうちの2回目は送らない（答えは同じ）。10分を過ぎたら新しい札で、前の札は使えない", async () => {
    const first = await requestToken();
    const again = await requestMail();
    expect(again.status).toBe(202);
    expect(await again.json()).toEqual({ accepted: true });
    expect(await mails()).toHaveLength(1);
    await database.pool.query(
      "UPDATE booking_email_request SET created_at = now() - interval '11 minutes'",
    );
    const second = await requestToken();
    expect(second).not.toBe(first);
    expect(await mails()).toHaveLength(2);
    expect((await anonymous(app, `/api/v1/booking/entry-tokens/${first}`)).status).toBe(404);
  });

  it("確定の直後にもう一度頼んでも、10分のうちは送らない（確定で待ちが消えても縛りは残る）", async () => {
    const first = await requestToken();
    await anonymous(app, `/api/v1/booking/entry-tokens/${first}/confirm`, "POST");
    const before = (await mails()).length;
    const again = await requestMail();
    expect(again.status).toBe(202);
    expect(await again.json()).toEqual({ accepted: true });
    expect(await mails()).toHaveLength(before);
    expect((await anonymous(app, `/api/v1/booking/entry-tokens/${first}`)).status).toBe(200);
    // 確定した待ちは札で引けない形で残り、直近1時間の上限にも数える
    const kept = await database.pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM booking_email_request",
    );
    expect(kept.rows.map((row) => row.token_hash.startsWith("consumed:"))).toEqual([true]);
  });

  it("すでに確定したアドレスも同じ答えで、新しい札で確定すると行は増えず前の札は使えない", async () => {
    const first = await requestToken();
    await anonymous(app, `/api/v1/booking/entry-tokens/${first}/confirm`, "POST");
    await database.pool.query(
      "UPDATE booking_email_request SET created_at = now() - interval '11 minutes'",
    );
    const response = await requestMail();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    const [mail] = await mails();
    const second = entryTokenOf(mail?.text ?? "");
    await anonymous(app, `/api/v1/booking/entry-tokens/${second}/confirm`, "POST");
    expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(1);
    expect((await anonymous(app, `/api/v1/booking/entry-tokens/${first}`)).status).toBe(404);
    expect((await anonymous(app, `/api/v1/booking/entry-tokens/${second}`)).status).toBe(200);
  });

  it("上限は直近1時間に作った待ちだけを数える。上限のときは、そのアドレスの待ちがあっても同じ 429", async () => {
    await database.pool.query(
      `INSERT INTO booking_email_request (event_id, name, email, token_hash, expires_at, created_at)
       SELECT $1, '見本', 'old' || n || '@example.com', md5(n::text) || md5((n + 1)::text),
              now() + interval '1 hour', now() - interval '2 hours'
       FROM generate_series(1, $2::int) AS n`,
      [eventId, EMAIL_REQUESTS_PER_EVENT_MAX],
    );
    // 2時間前の待ちは数えないので受け付ける
    expect((await requestMail()).status).toBe(202);
    await database.pool.query(
      "UPDATE booking_email_request SET created_at = now() - interval '1 minute'",
    );
    // 上限のときは、10分のうちに頼んだアドレスも、ほかのアドレスと同じ 429（答えの違いで待ちの有無が分からない）
    for (const email of [GUEST, "other@example.com"]) {
      const response = await requestMail(email);
      expect(response.status).toBe(429);
    }
  });

  it("期限切れの確認の待ちは、ほかの交流会のものも消える", async () => {
    const second = (await createEvent(app, owner.cookie)).id;
    await database.pool.query(
      `INSERT INTO booking_email_request (event_id, name, email, token_hash, expires_at)
       VALUES ($1, '見本', 'stale@example.com', md5('stale') || md5('x'), now() - interval '1 minute')`,
      [second],
    );
    expect((await requestMail()).status).toBe(202);
    const left = await database.pool.query<{ email: string }>(
      "SELECT email FROM booking_email_request",
    );
    expect(left.rows).toEqual([{ email: GUEST }]);
  });

  it("交流会ごとの確認の待ちが上限に達したら 429（メールは送らない）", async () => {
    await database.pool.query(
      `INSERT INTO booking_email_request (event_id, name, email, token_hash, expires_at)
       SELECT $1, '見本', 'guest' || n || '@example.com', md5(n::text) || md5((n + 1)::text),
              now() + interval '1 hour'
       FROM generate_series(1, $2::int) AS n`,
      [eventId, EMAIL_REQUESTS_PER_EVENT_MAX],
    );
    const response = await requestMail("last@example.com");
    expect(response.status).toBe(429);
    expect(((await response.json()) as ErrorBody).error.code).toBe("BOOKING_EMAIL_REQUEST_LIMIT");
    expect(await mails()).toHaveLength(0);
  });

  it("部員だけの回は 403、受付を閉じた会は 409（メールは送らない）。アドレスの形の誤りは 400", async () => {
    const organizationId = await setUpOrganization(app, owner.cookie, []);
    await placeEvent(app, owner.cookie, eventId, organizationId);
    await openSelfPage(app, owner.cookie, eventId, { visibility: "members" });
    expect((await requestMail()).status).toBe(403);
    await openSelfPage(app, owner.cookie, eventId, { accepting: false });
    expect((await requestMail()).status).toBe(409);
    expect((await requestMail("not-an-address")).status).toBe(400);
    expect(await mails()).toHaveLength(0);
  });

  it("名簿・CSV・当てる画面の答えとログに、メールアドレスと札が出ない", async () => {
    const token = await requestToken();
    await anonymous(app, `/api/v1/booking/entry-tokens/${token}/confirm`, "POST");
    for (const path of [`${base}/entries`, `${base}/entries/export`, `${base}/matches`]) {
      const text = await (await call(app, owner.cookie, path)).text();
      expect(text).not.toContain(GUEST);
      expect(text).not.toContain(token);
    }
    expect(log.text()).not.toContain(GUEST);
    expect(log.text()).not.toContain(token);
    expect(log.text()).not.toContain("小林");
  });

  it("まとめると、メールの申込みの連絡と札は残す行へ移り、同じ札で見られる（research R14）", async () => {
    const token = await requestToken();
    await anonymous(app, `/api/v1/booking/entry-tokens/${token}/confirm`, "POST");
    await call(app, owner.cookie, `${base}/entries`, "POST", {
      name: "小林はると",
      applicationSource: "other",
    });
    const roster = await readRoster(app, owner.cookie, eventId);
    const emailEntry = roster.entries.find((entry) => entry.entryKind === "self_page");
    const manual = roster.entries.find((entry) => entry.entryKind === "manual");
    const merged = await call(app, owner.cookie, `${base}/entries/merge`, "POST", {
      keepEntryId: manual?.id,
      removeEntryId: emailEntry?.id,
    });
    expect(merged.status).toBe(200);
    const view = await anonymous(app, `/api/v1/booking/entry-tokens/${token}`);
    expect(view.status).toBe(200);
    expect(await view.json()).toMatchObject({ state: "entry", name: "小林はると" });
  });
});
