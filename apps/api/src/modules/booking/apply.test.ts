// LINE ログインで申し込む・申込みページ・部員だけの回・.ics の結合のテスト（booking-003 US1・US4・research R3〜R8・R12・R16・
// S8・S9・S14）。偽の送り手で確定の知らせを確かめる。名前・アドレスはどれも架空のもの。
import "@hono/zod-openapi";
import type { ApplyPage, ApplyResult, Roster } from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, readRoster } from "../../../test/helpers/booking.ts";
import { anonymous, apply, openSelfPage } from "../../../test/helpers/booking-apply.ts";
import {
  followAndLink,
  lineUser,
  notifyConfig,
  readOutbox,
  saveLine,
} from "../../../test/helpers/booking-notify.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff, placeEvent } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { checkIn } from "../../../test/helpers/reception.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

describe("自前の申込みページ（LINE ログインで申し込む）", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let participant: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, notifyConfig());
    owner = await loginAs(app, { displayName: "高橋" });
    participant = await loginAs(app, { displayName: "中村 さき" });
    eventId = (await createEvent(app, owner.cookie, { name: "土曜の練習", fee: 500 })).id;
    base = bookingBase(eventId);
  });

  /**
   * 交流会の始まりを過去にする。
   */
  async function startEvent(): Promise<void> {
    await database.pool.query(
      "UPDATE event SET starts_at = now() - interval '1 hour' WHERE id = $1",
      [eventId],
    );
  }

  it("ログインなしで、名前・日時・会場・参加費・主催・受付中を読める。席の残りの欄はない", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    const response = await anonymous(app, `${base}/page`);
    expect(response.status).toBe(200);
    const page = (await response.json()) as ApplyPage;
    expect(page).toMatchObject({
      event: { id: eventId, name: "土曜の練習", venue: "渋谷の会場", fee: 500 },
      hostName: "高橋",
      state: "open",
      visibility: "public",
      lineFriendUrl: null,
      viewer: { signedIn: false },
    });
    expect(page.calendar.icsPath).toBe(`${base}/calendar`);
    expect(new URL(page.calendar.googleUrl).searchParams.get("text")).toBe("土曜の練習");
    expect(Object.keys(page)).not.toContain("remaining");
  });

  it("使い方が自前でない・ない交流会は 404。受付を閉じていれば closed、始まりを過ぎたら started", async () => {
    const off = await anonymous(app, `${base}/page`);
    expect(off.status).toBe(404);
    expect(((await off.json()) as ErrorBody).error.code).toBe("BOOKING_PAGE_NOT_FOUND");
    const unknown = await anonymous(
      app,
      `${bookingBase("0193a1b2-0000-7000-8000-000000000999")}/page`,
    );
    expect(unknown.status).toBe(404);
    await openSelfPage(app, owner.cookie, eventId, { accepting: false });
    expect(((await (await anonymous(app, `${base}/page`)).json()) as ApplyPage).state).toBe(
      "closed",
    );
    await startEvent();
    expect(((await (await anonymous(app, `${base}/page`)).json()) as ApplyPage).state).toBe(
      "started",
    );
  });

  it("ログインした人には名前の初めの値（LINE の表示名）・自分の申込みなし・同意なしを返す", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    const page = (await (await call(app, participant.cookie, `${base}/page`)).json()) as ApplyPage;
    expect(page.viewer).toEqual({
      signedIn: true,
      defaultName: "中村 さき",
      myEntry: null,
      consented: false,
      lineLinked: false,
      hasContactEmail: false,
    });
  });

  it("申し込むと、名簿に入口「自前」・媒体「直接」・確定の行ができ、確定の知らせを記録する（201）", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    const response = await apply(app, participant.cookie, eventId, { name: " 中村 さき " });
    expect(response.status).toBe(201);
    const result = (await response.json()) as ApplyResult;
    expect(result.entry).toMatchObject({
      name: "中村 さき",
      status: "confirmed",
      cancellable: true,
    });
    expect(result.page.viewer).toMatchObject({ myEntry: { id: result.entry.id } });
    const roster: Roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries).toHaveLength(1);
    expect(roster.entries[0]).toMatchObject({
      name: "中村 さき",
      entryKind: "self_page",
      applicationSource: "direct",
      status: "confirmed",
    });
    const notices = await database.pool.query<{ kind: string; method: string; result: string }>(
      "SELECT kind, method, result FROM booking_notice WHERE entry_id = $1",
      [result.entry.id],
    );
    // LINE の紐づけもメールアドレスもないので、送り先がない
    expect(notices.rows).toEqual([{ kind: "confirmed", method: "none", result: "no_destination" }]);
  });

  it("2回申し込んでも行は1つ（2回目は 200 で同じ答え・知らせは送らない）", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    const first = (await (await apply(app, participant.cookie, eventId)).json()) as ApplyResult;
    const second = await apply(app, participant.cookie, eventId);
    expect(second.status).toBe(200);
    expect(((await second.json()) as ApplyResult).entry.id).toBe(first.entry.id);
    // 別の人が2つの端末で同時に押しても1行（設定の行を押さえて順に流す。S8）
    const other = await loginAs(app, { displayName: "森" });
    const both = await Promise.all([
      apply(app, other.cookie, eventId),
      apply(app, other.cookie, eventId),
    ]);
    expect(both.map((response) => response.status).sort()).toEqual([200, 201]);
    expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(2);
    const notices = await database.pool.query("SELECT 1 FROM booking_notice");
    expect(notices.rowCount).toBe(2);
  });

  it("取り消したあとに申し込み直すと、同じ行が確定に戻る", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    const first = (await (await apply(app, participant.cookie, eventId)).json()) as ApplyResult;
    const cancelled = await call(
      app,
      participant.cookie,
      `/api/v1/booking/me/entries/${first.entry.id}/cancel`,
      "POST",
    );
    expect(cancelled.status).toBe(200);
    const again = await apply(app, participant.cookie, eventId, { name: "中村 さき（2）" });
    expect(again.status).toBe(201);
    const result = (await again.json()) as ApplyResult;
    expect(result.entry).toMatchObject({ id: first.entry.id, status: "confirmed" });
    expect(result.entry.name).toBe("中村 さき（2）");
  });

  it("受付を閉じている・始まりを過ぎた交流会には申し込めない（409）", async () => {
    await openSelfPage(app, owner.cookie, eventId, { accepting: false });
    const closed = await apply(app, participant.cookie, eventId);
    expect(closed.status).toBe(409);
    expect(((await closed.json()) as ErrorBody).error.code).toBe("BOOKING_PAGE_CLOSED");
    await openSelfPage(app, owner.cookie, eventId);
    await startEvent();
    expect((await apply(app, participant.cookie, eventId)).status).toBe(409);
    expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(0);
  });

  it("ほかの源（Origin）からの申込み・メールで申し込むは 403（CSRF。S10）", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    const headers = {
      cookie: participant.cookie,
      origin: "https://evil.example.com",
      "content-type": "application/json",
    };
    const applied = await app.request(`${base}/apply`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "中村" }),
    });
    expect(applied.status).toBe(403);
    const mailed = await app.request(`${base}/email-requests`, {
      method: "POST",
      headers: { origin: "https://evil.example.com", "content-type": "application/json" },
      body: JSON.stringify({ name: "小林", email: "guest@example.com" }),
    });
    expect(mailed.status).toBe(403);
    expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(0);
  });

  it("名前が空・51文字は 400。ログインしていなければ 401", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    expect((await apply(app, participant.cookie, eventId, { name: " " })).status).toBe(400);
    expect((await apply(app, participant.cookie, eventId, { name: "あ".repeat(51) })).status).toBe(
      400,
    );
    expect((await anonymous(app, `${base}/apply`, "POST", { name: "中村" })).status).toBe(401);
  });

  it("案内の同意：チェックすると持ち主への同意ができ、false では消さない。組織の会なら組織への同意", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    await apply(app, participant.cookie, eventId, { name: "中村", consent: true });
    const page = (await (await call(app, participant.cookie, `${base}/page`)).json()) as ApplyPage;
    expect(page.viewer).toMatchObject({ consented: true });
    const rows = await database.pool.query<{ owner_account_id: string | null }>(
      "SELECT owner_account_id FROM booking_consent WHERE account_id = $1",
      [participant.account.id],
    );
    expect(rows.rows).toEqual([{ owner_account_id: owner.account.id }]);

    const orgEventId = (await createEvent(app, owner.cookie, { name: "部の練習" })).id;
    const organizationId = await setUpOrganization(app, owner.cookie, [], "バドミントンの部");
    await placeEvent(app, owner.cookie, orgEventId, organizationId);
    await openSelfPage(app, owner.cookie, orgEventId);
    await apply(app, participant.cookie, orgEventId, { name: "中村", consent: true });
    await apply(app, participant.cookie, eventId, { name: "中村", consent: false });
    const both = await database.pool.query<{ organization_id: string | null }>(
      "SELECT organization_id FROM booking_consent WHERE account_id = $1 ORDER BY created_at",
      [participant.account.id],
    );
    expect(both.rows.map((row) => row.organization_id)).toEqual([null, organizationId]);
  });

  it("紐づいている人には LINE で確定の知らせ（申込みページとカレンダーのリンクつき）。友だち追加の URL を返す", async () => {
    const organizationId = await setUpOrganization(app, owner.cookie, [], "バドミントンの部");
    await placeEvent(app, owner.cookie, eventId, organizationId);
    const channelId = (await saveLine(app, owner.cookie, organizationId)).line?.channelId ?? "";
    await followAndLink(app, participant.cookie, channelId, lineUser("a"));
    await openSelfPage(app, owner.cookie, eventId);
    const before = (await (
      await call(app, participant.cookie, `${base}/page`)
    ).json()) as ApplyPage;
    expect(before.lineFriendUrl).toBe("https://line.me/R/ti/p/%40fake");
    expect(before.viewer).toMatchObject({ lineLinked: true });
    expect(before.hostName).toBe("バドミントンの部");
    await apply(app, participant.cookie, eventId);
    const [notice] = await readOutbox(app, participant.cookie);
    expect(notice?.method).toBe("line_push");
    expect(notice?.text).toContain("【申込みの確定】土曜の練習");
    expect(notice?.text).toContain(`/e/${eventId}`);
    expect(notice?.text).toContain("https://calendar.google.com/calendar/render?");
  });

  it("LINE のチェックインは、同じアカウントの自前の申込みに自動で当たる（FR-B100）", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    await apply(app, participant.cookie, eventId);
    await checkIn(app, participant.cookie, eventId);
    const board = (await (await call(app, owner.cookie, `${base}/matches`)).json()) as {
      checkins: { state: string }[];
    };
    expect(board.checkins.map((item) => item.state)).toEqual(["matched_auto"]);
  });

  it(".ics はログインなしで添付として返す（名前・会場・始まりと2時間後）", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    const response = await anonymous(app, `${base}/calendar`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    const text = await response.text();
    expect(text).toContain("SUMMARY:土曜の練習\r\n");
    expect(text).toContain("LOCATION:渋谷の会場\r\n");
    expect(text).toContain(`UID:${eventId}@kanaeru`);
  });

  describe("部員だけの回", () => {
    let member: Awaited<ReturnType<typeof loginAs>>;
    let organizationId: string;

    beforeEach(async () => {
      member = await loginAs(app, { displayName: "森" });
      organizationId = await setUpOrganization(app, owner.cookie, [
        { cookie: member.cookie, accountId: member.account.id, role: "member" },
      ]);
      await placeEvent(app, owner.cookie, eventId, organizationId);
      await openSelfPage(app, owner.cookie, eventId, { visibility: "members" });
    });

    it("部員と主催者はページを読み、部員は申し込める", async () => {
      expect((await call(app, owner.cookie, `${base}/page`)).status).toBe(200);
      expect((await call(app, member.cookie, `${base}/page`)).status).toBe(200);
      expect((await apply(app, member.cookie, eventId)).status).toBe(201);
      expect((await call(app, member.cookie, `${base}/calendar`)).status).toBe(200);
    });

    it("ログインなし・組織の外の人・受付係には 403 で、交流会の名前を返さない", async () => {
      const staff = await makeStaff(app, owner.cookie, eventId);
      for (const response of [
        await anonymous(app, `${base}/page`),
        await call(app, participant.cookie, `${base}/page`),
        await call(app, staff.cookie, `${base}/page`),
        await apply(app, participant.cookie, eventId),
        await anonymous(app, `${base}/calendar`),
      ]) {
        expect(response.status).toBe(403);
        const text = await response.text();
        expect(text).toContain("BOOKING_PAGE_MEMBERS_ONLY");
        expect(text).not.toContain("土曜の練習");
      }
      expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(0);
    });

    it("部員が抜けたら見られない。抜けた人も自分の申込みは取り消せる", async () => {
      const applied = (await (await apply(app, member.cookie, eventId)).json()) as ApplyResult;
      const left = await call(
        app,
        member.cookie,
        `/api/v1/suite/organizations/${organizationId}/leave`,
        "POST",
        {},
      );
      expect([200, 204]).toContain(left.status);
      expect((await call(app, member.cookie, `${base}/page`)).status).toBe(403);
      const cancelled = await call(
        app,
        member.cookie,
        `/api/v1/booking/me/entries/${applied.entry.id}/cancel`,
        "POST",
      );
      expect(cancelled.status).toBe(200);
    });
  });
});
