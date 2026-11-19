// 交流会の窓口の結合のテスト（本物の PostgreSQL）：作る・直す・詳細・一覧・要約・アンケートの開閉・
// 招待のリンク（作る・読む・作り直す・受ける・期限）・受付係の一覧と外す・account を消したとき。
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { SAMPLE_EVENT, call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody, EventBody } from "../../../test/helpers/event.ts";

const database = useTestDatabase();

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** ない交流会の ID。 */
const MISSING_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * 表の行の数を数える。
 * @param table 表の名前（このファイルの決まった名前だけ）
 * @returns 行の数
 */
async function countRows(table: "event_staff" | "event"): Promise<number> {
  const query =
    table === "event" ? "SELECT count(*) FROM event" : "SELECT count(*) FROM event_staff";
  const result = await database.pool.query<{ count: string }>(query);
  return Number(result.rows[0]?.count);
}

describe("交流会の窓口", () => {
  let app: TestApp;
  let organizer: string;
  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(
      database,
      testConfig({
        organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST,
        openChatUrl: "https://line.me/ti/g2/example",
      }),
    );
    organizer = (await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST })).cookie;
  });

  describe("作る・直す・読む", () => {
    it("主催者が作ると 201 で、URL の空は null・アンケートは閉じている", async () => {
      const created = await createEvent(app, organizer, {
        fee: 0,
        googleFormUrl: "https://forms.gle/abc",
        lineGroupUrl: "",
      });
      expect(created).toMatchObject({
        name: "11月の交流会",
        venue: "渋谷の会場",
        fee: 0,
        googleFormUrl: "https://forms.gle/abc",
        lineGroupUrl: null,
        surveyOpen: false,
        myRole: "organizer",
      });
      expect(new Date(created.startsAt).getTime()).toBe(new Date(SAMPLE_EVENT.startsAt).getTime());
    });

    it("入力の誤りは 400 と欄ごとの日本語の理由で、作られない", async () => {
      const response = await call(app, organizer, "/api/v1/events", "POST", {
        ...SAMPLE_EVENT,
        name: " ",
        fee: -1,
        lineGroupUrl: "http://line.me/R/ti/g/abc",
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorBody;
      expect(body.error.fields).toEqual([
        { path: "name", message: "交流会の名前を入れてください。" },
        { path: "fee", message: "参加費は0円以上にしてください。" },
        {
          path: "lineGroupUrl",
          message: "LINEグループの招待リンクは https:// で始まる URL を入れてください。",
        },
      ]);
      expect(await countRows("event")).toBe(0);
    });

    it("主催者でなければ作れず（403）、未ログインは 401", async () => {
      const other = await loginAs(app);
      expect((await call(app, other.cookie, "/api/v1/events", "POST", SAMPLE_EVENT)).status).toBe(
        403,
      );
      const anonymous = await app.request("/api/v1/events");
      expect(anonymous.status).toBe(401);
      expect(await countRows("event")).toBe(0);
    });

    it("主催者は直せて、受付係は読めるが直せない。ほかの人は読めない", async () => {
      const created = await createEvent(app, organizer);
      const staff = await makeStaff(app, organizer, created.id);
      const other = await loginAs(app);
      const path = `/api/v1/events/${created.id}`;

      const updated = await call(app, organizer, path, "PUT", {
        ...SAMPLE_EVENT,
        name: "直した交流会",
        fee: 1500,
        googleFormUrl: null,
      });
      expect(updated.status).toBe(200);
      expect(await updated.json()).toMatchObject({ name: "直した交流会", fee: 1500 });

      const asStaff = await call(app, staff.cookie, path);
      expect(asStaff.status).toBe(200);
      expect(await asStaff.json()).toMatchObject({ name: "直した交流会", myRole: "staff" });
      expect((await call(app, staff.cookie, path, "PUT", SAMPLE_EVENT)).status).toBe(403);
      expect((await call(app, other.cookie, path)).status).toBe(403);
    });

    it("ない交流会は 404（読む・直す）", async () => {
      expect((await call(app, organizer, `/api/v1/events/${MISSING_ID}`)).status).toBe(404);
      const updated = await call(
        app,
        organizer,
        `/api/v1/events/${MISSING_ID}`,
        "PUT",
        SAMPLE_EVENT,
      );
      expect(updated.status).toBe(404);
      expect((await call(app, organizer, "/api/v1/events/not-a-uuid")).status).toBe(404);
    });
  });

  describe("一覧", () => {
    it("主催者はすべてを日時の新しい順、受付係は自分の交流会だけ、ほかは空", async () => {
      const older = await createEvent(app, organizer, {
        name: "前の交流会",
        startsAt: new Date(Date.now() - 30 * DAY_MS).toISOString(),
      });
      const newer = await createEvent(app, organizer, { name: "次の交流会" });
      const staff = await makeStaff(app, organizer, newer.id);
      const other = await loginAs(app);

      const list = async (cookie: string) =>
        ((await (await call(app, cookie, "/api/v1/events")).json()) as { events: EventBody[] })
          .events;
      expect((await list(organizer)).map((item) => [item.name, item.myRole])).toEqual([
        ["次の交流会", "organizer"],
        ["前の交流会", "organizer"],
      ]);
      expect((await list(staff.cookie)).map((item) => [item.id, item.myRole])).toEqual([
        [newer.id, "staff"],
      ]);
      expect(await list(other.cookie)).toEqual([]);
      expect(older.id).not.toBe(newer.id);
    });
  });

  describe("要約とアンケートの開閉", () => {
    it("要約はログインした誰でも読め、決めた欄とオープンチャットの URL だけ。未ログインは 401", async () => {
      const created = await createEvent(app, organizer, {
        lineGroupUrl: "https://line.me/R/ti/g/x",
      });
      const participant = await loginAs(app);
      const response = await call(app, participant.cookie, `/api/v1/events/${created.id}/summary`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: created.id,
        name: "11月の交流会",
        startsAt: created.startsAt,
        venue: "渋谷の会場",
        fee: 1000,
        surveyOpen: false,
        googleFormUrl: null,
        lineGroupUrl: "https://line.me/R/ti/g/x",
        openChatUrl: "https://line.me/ti/g2/example",
      });
      expect((await app.request(`/api/v1/events/${created.id}/summary`)).status).toBe(401);
      const missing = await call(app, participant.cookie, `/api/v1/events/${MISSING_ID}/summary`);
      expect(missing.status).toBe(404);
    });

    it("主催者が開くと要約が開いているになり、閉じると戻る。ほかの人は 403", async () => {
      const created = await createEvent(app, organizer);
      const staff = await makeStaff(app, organizer, created.id);
      const path = `/api/v1/events/${created.id}/survey`;
      const opened = await call(app, organizer, path, "PUT", { open: true });
      expect(await opened.json()).toEqual({ surveyOpen: true });
      // 何度送っても同じ
      expect(await (await call(app, organizer, path, "PUT", { open: true })).json()).toEqual({
        surveyOpen: true,
      });
      const summary = await call(app, staff.cookie, `/api/v1/events/${created.id}/summary`);
      expect(await summary.json()).toMatchObject({ surveyOpen: true });

      expect((await call(app, staff.cookie, path, "PUT", { open: false })).status).toBe(403);
      expect(await (await call(app, organizer, path, "PUT", { open: false })).json()).toEqual({
        surveyOpen: false,
      });
      expect((await call(app, organizer, path, "PUT", { open: "yes" })).status).toBe(400);
    });
  });

  describe("招待のリンクと受付係", () => {
    it("主催者がリンクを作ると読めて、期限は交流会の日本時間の日付の終わり。作り直すと前の印は使えない", async () => {
      const created = await createEvent(app, organizer, { startsAt: "2026-11-25T23:30:00+09:00" });
      const path = `/api/v1/events/${created.id}/staff-invite`;
      expect(await (await call(app, organizer, path)).json()).toEqual({ invite: null });

      const first = (await (await call(app, organizer, path, "POST")).json()) as {
        token: string;
        expiresAt: string;
      };
      expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(first.expiresAt).toBe("2026-11-25T15:00:00.000Z");
      expect(await (await call(app, organizer, path)).json()).toMatchObject({
        invite: { token: first.token },
      });

      const second = (await (await call(app, organizer, path, "POST")).json()) as { token: string };
      expect(second.token).not.toBe(first.token);
      const staff = await loginAs(app);
      const old = await call(
        app,
        staff.cookie,
        `/api/v1/staff-invites/${first.token}/accept`,
        "POST",
      );
      expect(old.status).toBe(404);
      expect(((await old.json()) as ErrorBody).error).toMatchObject({
        code: "STAFF_INVITE_INVALID",
        message: "この招待のリンクは使えません。主催者に新しいリンクをもらってください。",
      });
    });

    it("受付係はリンクの中身を読み、受けると受付係になる。2回受けても1つ。主催者は何もしない", async () => {
      const created = await createEvent(app, organizer);
      const invite = (await (
        await call(app, organizer, `/api/v1/events/${created.id}/staff-invite`, "POST")
      ).json()) as { token: string };
      const staff = await loginAs(app, { displayName: "受付の山田" });

      const preview = await call(app, staff.cookie, `/api/v1/staff-invites/${invite.token}`);
      expect(await preview.json()).toMatchObject({
        eventId: created.id,
        eventName: "11月の交流会",
        expired: false,
        myRole: null,
      });

      const accept = `/api/v1/staff-invites/${invite.token}/accept`;
      expect(await (await call(app, staff.cookie, accept, "POST")).json()).toEqual({
        eventId: created.id,
        role: "staff",
      });
      expect((await call(app, staff.cookie, accept, "POST")).status).toBe(200);
      expect(await countRows("event_staff")).toBe(1);

      expect(await (await call(app, organizer, accept, "POST")).json()).toEqual({
        eventId: created.id,
        role: "organizer",
      });
      expect(await countRows("event_staff")).toBe(1);

      const list = await call(app, organizer, `/api/v1/events/${created.id}/staff`);
      expect(await list.json()).toMatchObject({
        staff: [{ accountId: staff.account.id, displayName: "受付の山田" }],
      });
      // 受付係は受付係の一覧を読めない
      expect((await call(app, staff.cookie, `/api/v1/events/${created.id}/staff`)).status).toBe(
        403,
      );
    });

    it("交流会の日が終わったら 410。ただし、すでに受付係なら通す", async () => {
      const created = await createEvent(app, organizer);
      const already = await makeStaff(app, organizer, created.id);
      const invite = (await (
        await call(app, organizer, `/api/v1/events/${created.id}/staff-invite`, "POST")
      ).json()) as { token: string };
      // 交流会の日時をおととい（日本時間）に直す。期限は受けるときの今の日時で決まる
      await call(app, organizer, `/api/v1/events/${created.id}`, "PUT", {
        ...SAMPLE_EVENT,
        startsAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
      });

      const late = await loginAs(app);
      const accept = `/api/v1/staff-invites/${invite.token}/accept`;
      const preview = await call(app, late.cookie, `/api/v1/staff-invites/${invite.token}`);
      expect(await preview.json()).toMatchObject({ expired: true });
      const expired = await call(app, late.cookie, accept, "POST");
      expect(expired.status).toBe(410);
      expect(((await expired.json()) as ErrorBody).error.code).toBe("STAFF_INVITE_EXPIRED");
      expect((await call(app, already.cookie, accept, "POST")).status).toBe(200);
    });

    it("知らない・形の違う印は 404、未ログインは 401", async () => {
      const user = await loginAs(app);
      for (const token of ["a".repeat(43), "short"]) {
        const response = await call(
          app,
          user.cookie,
          `/api/v1/staff-invites/${token}/accept`,
          "POST",
        );
        expect(response.status).toBe(404);
        expect((await call(app, user.cookie, `/api/v1/staff-invites/${token}`)).status).toBe(404);
      }
      const anonymous = await app.request(`/api/v1/staff-invites/${"a".repeat(43)}`);
      expect(anonymous.status).toBe(401);
    });

    it("受付係を外すと 204、いない人は 404。受付係のアカウントを消すと受付係も消える", async () => {
      const created = await createEvent(app, organizer);
      const first = await makeStaff(app, organizer, created.id);
      const second = await makeStaff(app, organizer, created.id);
      const remove = (accountId: string) =>
        call(app, organizer, `/api/v1/events/${created.id}/staff/${accountId}`, "DELETE");
      expect((await remove(first.account.id)).status).toBe(204);
      expect((await remove(first.account.id)).status).toBe(404);
      expect((await call(app, first.cookie, `/api/v1/events/${created.id}`)).status).toBe(403);

      const deleted = await call(app, organizer, `/api/v1/accounts/${second.account.id}`, "DELETE");
      expect(deleted.status).toBe(204);
      expect(await countRows("event_staff")).toBe(0);
    });

    it("受付係を外すと招待のリンクが作り直され、外された人は前のリンクで受け直せない。残りの受付係はそのまま", async () => {
      const created = await createEvent(app, organizer);
      const invitePath = `/api/v1/events/${created.id}/staff-invite`;
      const { token } = (await (await call(app, organizer, invitePath, "POST")).json()) as {
        token: string;
      };
      const removedStaff = await loginAs(app);
      const keptStaff = await loginAs(app);
      const accept = `/api/v1/staff-invites/${token}/accept`;
      expect((await call(app, removedStaff.cookie, accept, "POST")).status).toBe(200);
      expect((await call(app, keptStaff.cookie, accept, "POST")).status).toBe(200);

      const removed = await call(
        app,
        organizer,
        `/api/v1/events/${created.id}/staff/${removedStaff.account.id}`,
        "DELETE",
      );
      expect(removed.status).toBe(204);

      const again = await call(app, removedStaff.cookie, accept, "POST");
      expect(again.status).toBe(404);
      expect(((await again.json()) as ErrorBody).error.code).toBe("STAFF_INVITE_INVALID");
      expect((await call(app, removedStaff.cookie, `/api/v1/staff-invites/${token}`)).status).toBe(
        404,
      );
      expect((await call(app, removedStaff.cookie, `/api/v1/events/${created.id}`)).status).toBe(
        403,
      );

      const current = (await (await call(app, organizer, invitePath)).json()) as {
        invite: { token: string };
      };
      expect(current.invite.token).not.toBe(token);
      expect(current.invite.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect((await call(app, keptStaff.cookie, `/api/v1/events/${created.id}`)).status).toBe(200);
    });

    it("招待のリンクがない交流会で外しても、リンクは作られない", async () => {
      const created = await createEvent(app, organizer);
      const staff = await makeStaff(app, organizer, created.id);
      // makeStaff が作ったリンクを消したのと同じ形にするため、表から消す
      await database.pool.query("DELETE FROM staff_invite");
      const removed = await call(
        app,
        organizer,
        `/api/v1/events/${created.id}/staff/${staff.account.id}`,
        "DELETE",
      );
      expect(removed.status).toBe(204);
      expect(
        await (await call(app, organizer, `/api/v1/events/${created.id}/staff-invite`)).json(),
      ).toEqual({ invite: null });
    });
  });
});
