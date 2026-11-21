// 交流会の持ち主と組織の結合のテスト（本物の PostgreSQL。event-002）：作った人が持ち主・持ち主のない今の交流会を運営者のものにする
// （research R1）・役目の判定（持ち主・組織の管理者と編集者・部員・受付係）・一覧・組織に入れる／外す・ほかの領域の窓口。
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import {
  SAMPLE_EVENT,
  call,
  createEvent,
  makeStaff,
  placeEvent,
} from "../../../test/helpers/event.ts";
import type { ErrorBody, EventBody } from "../../../test/helpers/event.ts";
import {
  createOrganization,
  joinOrganization,
  rotateInviteToken,
  setOrganizationRole,
} from "../../../test/helpers/organization.ts";
import { checkIn } from "../../../test/helpers/reception.ts";
import { getEventRole } from "./index.ts";

const database = useTestDatabase();

/** テストの設定（運営者つき）。 */
const config = testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });

/** ログインした人。 */
type Person = Awaited<ReturnType<typeof loginAs>>;

/** 一覧の行（テストで読む欄）。 */
type ListedEvent = EventBody & {
  owner: { accountId: string; displayName: string } | null;
  organization: { id: string; name: string } | null;
  isOwner: boolean;
};

/**
 * 交流会の持ち主を DB から読む。
 * @param eventId 交流会の ID
 * @returns 持ち主の account の ID（なければ null）
 */
async function ownerOf(eventId: string): Promise<string | null> {
  const result = await database.pool.query<{ owner: string | null }>(
    "SELECT owner_account_id AS owner FROM event WHERE id = $1",
    [eventId],
  );
  return result.rows[0]?.owner ?? null;
}

describe("交流会の持ち主と組織", () => {
  let app: TestApp;
  let operator: Person;
  let owner: Person;
  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, config);
    operator = await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
    owner = await loginAs(app, { displayName: "高橋" });
  });

  /**
   * 組織を作り、ほかの人を入れて役割を決める（持ち主が管理者）。
   * @param roles 入れる人と役割
   * @returns 組織の ID
   */
  async function organizationWith(
    roles: { person: Person; role: "editor" | "member" }[],
  ): Promise<string> {
    const organizationId = await createOrganization(app, owner.cookie, "バドミントンの部");
    const token = await rotateInviteToken(app, owner.cookie, organizationId);
    for (const { person, role } of roles) {
      expect((await joinOrganization(app, person.cookie, token)).status).toBe(200);
      if (role === "editor") {
        expect(
          (await setOrganizationRole(app, owner.cookie, organizationId, person.account.id, role))
            .status,
        ).toBe(204);
      }
    }
    return organizationId;
  }

  /**
   * 一覧を読む。
   * @param cookie クッキー
   * @returns 行の並び
   */
  async function list(cookie: string): Promise<ListedEvent[]> {
    const response = await call(app, cookie, "/api/v1/events");
    expect(response.status).toBe(200);
    return ((await response.json()) as { events: ListedEvent[] }).events;
  }

  describe("持ち主", () => {
    it("作った人が持ち主になる", async () => {
      const created = await createEvent(app, owner.cookie);
      expect(await ownerOf(created.id)).toBe(owner.account.id);
    });

    it("ほかの人の交流会は、運営者でも一覧に出ず、管理の窓口は 403", async () => {
      const created = await createEvent(app, owner.cookie);
      expect(await list(operator.cookie)).toEqual([]);
      for (const path of [
        `/api/v1/events/${created.id}`,
        `/api/v1/events/${created.id}/staff`,
        `/api/v1/events/${created.id}/checkins`,
        `/api/v1/events/${created.id}/checkins/totals`,
        `/api/v1/events/${created.id}/survey-answers`,
      ]) {
        const response = await call(app, operator.cookie, path);
        expect(response.status, path).toBe(403);
      }
      // 参加者の要約はログインした誰でも読める（変えない）
      expect(
        (await call(app, operator.cookie, `/api/v1/events/${created.id}/summary`)).status,
      ).toBe(200);
    });

    it("ほかの人の交流会は、運営者でも書く窓口が 403（直す・アンケートの開閉・招待のリンク・受付係を外す・チェックインを消す・CSV）", async () => {
      const created = await createEvent(app, owner.cookie);
      const staff = await makeStaff(app, owner.cookie, created.id);
      const participant = await loginAs(app);
      const { checkin } = await checkIn(app, participant.cookie, created.id);
      const base = `/api/v1/events/${created.id}`;
      const requests: [string, string, unknown?][] = [
        ["PUT", base, SAMPLE_EVENT],
        ["PUT", `${base}/survey`, { open: false }],
        ["GET", `${base}/staff-invite`],
        ["POST", `${base}/staff-invite`],
        ["DELETE", `${base}/staff/${staff.account.id}`],
        ["DELETE", `${base}/checkins/${checkin.id}`],
        ["GET", `${base}/checkins/export`],
        ["GET", `${base}/survey-answers/export`],
      ];
      for (const person of [operator, await loginAs(app, { displayName: "ほかの人" })]) {
        for (const [method, path, body] of requests) {
          const response = await call(app, person.cookie, path, method, body);
          expect(response.status, `${method} ${path}`).toBe(403);
        }
      }
      // 止めたので、受付係とチェックインは残っている
      const listed = await call(app, staff.cookie, `${base}/checkins`);
      expect(listed.status).toBe(200);
      expect(JSON.stringify(await listed.json())).toContain(checkin.id);
    });

    it("持ち主のない交流会は、運営者が一覧を開くと運営者のものになる。ほかの人が開いても変わらない", async () => {
      const created = await createEvent(app, operator.cookie);
      await database.pool.query("UPDATE event SET owner_account_id = NULL WHERE id = $1", [
        created.id,
      ]);
      expect(await list(owner.cookie)).toEqual([]);
      expect(await ownerOf(created.id)).toBeNull();

      const listed = await list(operator.cookie);
      expect(listed.map((item) => [item.id, item.myRole, item.isOwner])).toEqual([
        [created.id, "organizer", true],
      ]);
      expect(await ownerOf(created.id)).toBe(operator.account.id);
    });

    it("持ち主のない交流会を運営者が直に開いても、運営者のものになる。ほかの人は 403", async () => {
      const created = await createEvent(app, operator.cookie);
      await database.pool.query("UPDATE event SET owner_account_id = NULL WHERE id = $1", [
        created.id,
      ]);
      expect((await call(app, owner.cookie, `/api/v1/events/${created.id}`)).status).toBe(403);
      const opened = await call(app, operator.cookie, `/api/v1/events/${created.id}`);
      expect(opened.status).toBe(200);
      expect(await opened.json()).toMatchObject({ myRole: "organizer", isOwner: true });
      expect(await ownerOf(created.id)).toBe(operator.account.id);
    });
  });

  describe("組織に入れる", () => {
    it("入れると管理者・編集者は主催者、メンバーは部員（管理の窓口は 403）。外すと戻る", async () => {
      const editor = await loginAs(app, { displayName: "森" });
      const member = await loginAs(app, { displayName: "部員" });
      const created = await createEvent(app, owner.cookie);
      const organizationId = await organizationWith([
        { person: editor, role: "editor" },
        { person: member, role: "member" },
      ]);
      const path = `/api/v1/events/${created.id}`;
      expect((await call(app, editor.cookie, path)).status).toBe(403);

      const placed = await placeEvent(app, owner.cookie, created.id, organizationId);
      expect(placed.status).toBe(200);
      expect(await placed.json()).toMatchObject({
        organization: { id: organizationId, name: "バドミントンの部" },
        isOwner: true,
      });

      const asEditor = await call(app, editor.cookie, path);
      expect(asEditor.status).toBe(200);
      expect(await asEditor.json()).toMatchObject({
        myRole: "organizer",
        isOwner: false,
        owner: { accountId: owner.account.id, displayName: "高橋" },
        organization: { id: organizationId, name: "バドミントンの部" },
      });
      expect((await call(app, editor.cookie, path, "PUT", SAMPLE_EVENT)).status).toBe(200);
      expect((await call(app, member.cookie, path)).status).toBe(403);
      expect((await call(app, member.cookie, `${path}/checkins`)).status).toBe(403);
      const memberAccount = { accountId: member.account.id, lineUserId: "" };
      expect(await getEventRole(database.db, config, created.id, memberAccount)).toBe("member");
      // 部員は reception・survey の主催者だけの窓口も 403
      const participant = await loginAs(app);
      const { checkin } = await checkIn(app, participant.cookie, created.id);
      for (const memberPath of [
        `${path}/checkins/breakdown`,
        `${path}/checkins/export`,
        `${path}/survey-answers`,
        `${path}/survey-answers/export`,
        `${path}/survey-answers/checkins/${checkin.id}`,
      ]) {
        expect((await call(app, member.cookie, memberPath)).status, memberPath).toBe(403);
      }
      expect(
        (await call(app, member.cookie, `${path}/checkins/${checkin.id}`, "DELETE")).status,
      ).toBe(403);

      expect((await list(editor.cookie)).map((item) => item.id)).toEqual([created.id]);
      expect(await list(member.cookie)).toEqual([]);

      expect((await placeEvent(app, owner.cookie, created.id, null)).status).toBe(200);
      expect((await call(app, editor.cookie, path)).status).toBe(403);
      expect(await getEventRole(database.db, config, created.id, memberAccount)).toBeNull();
    });

    it("組織に入れる・外すのは持ち主だけ（編集者は 403 EVENT_OWNER_ONLY、ほかの人は 403 FORBIDDEN）", async () => {
      const editor = await loginAs(app);
      const created = await createEvent(app, owner.cookie);
      const organizationId = await organizationWith([{ person: editor, role: "editor" }]);
      expect((await placeEvent(app, owner.cookie, created.id, organizationId)).status).toBe(200);

      const byEditor = await placeEvent(app, editor.cookie, created.id, null);
      expect(byEditor.status).toBe(403);
      expect(((await byEditor.json()) as ErrorBody).error.code).toBe("EVENT_OWNER_ONLY");
      const byOther = await placeEvent(app, operator.cookie, created.id, null);
      expect(byOther.status).toBe(403);
      expect(((await byOther.json()) as ErrorBody).error.code).toBe("FORBIDDEN");

      // 編集者の読む窓口では、選べる組織は空
      const state = await call(app, editor.cookie, `/api/v1/events/${created.id}/organization`);
      expect(await state.json()).toMatchObject({ isOwner: false, options: [] });
    });

    it("入っていない組織は 404。同じ組織をもう一度送っても何もしない。入れ替えられる", async () => {
      const created = await createEvent(app, owner.cookie);
      const first = await organizationWith([]);
      const second = await createOrganization(app, owner.cookie, "勉強会");
      const outsider = await loginAs(app);
      const foreign = await createOrganization(app, outsider.cookie, "よその組織");

      const notMine = await placeEvent(app, owner.cookie, created.id, foreign);
      expect(notMine.status).toBe(404);
      expect(((await notMine.json()) as ErrorBody).error.code).toBe("EVENT_ORGANIZATION_NOT_FOUND");
      expect((await placeEvent(app, owner.cookie, created.id, "x")).status).toBe(400);

      expect((await placeEvent(app, owner.cookie, created.id, first)).status).toBe(200);
      expect((await placeEvent(app, owner.cookie, created.id, first)).status).toBe(200);
      const state = await call(app, owner.cookie, `/api/v1/events/${created.id}/organization`);
      expect(await state.json()).toMatchObject({
        organization: { id: first },
        options: [
          { id: first, name: "バドミントンの部" },
          { id: second, name: "勉強会" },
        ],
      });
      const moved = await placeEvent(app, owner.cookie, created.id, second);
      expect(await moved.json()).toMatchObject({ organization: { id: second, name: "勉強会" } });
    });

    it("持ち主が組織を抜けると、交流会は組織から外れる。組織を消しても外れる", async () => {
      const admin = await loginAs(app);
      const editor = await loginAs(app);
      const organizationId = await createOrganization(app, admin.cookie, "部");
      const token = await rotateInviteToken(app, admin.cookie, organizationId);
      await joinOrganization(app, owner.cookie, token);
      await joinOrganization(app, editor.cookie, token);
      await setOrganizationRole(app, admin.cookie, organizationId, editor.account.id, "editor");
      const created = await createEvent(app, owner.cookie);
      expect((await placeEvent(app, owner.cookie, created.id, organizationId)).status).toBe(200);
      expect((await call(app, editor.cookie, `/api/v1/events/${created.id}`)).status).toBe(200);

      const left = await call(
        app,
        owner.cookie,
        `/api/v1/suite/organizations/${organizationId}/leave`,
        "POST",
        {},
      );
      expect(left.status).toBe(204);
      expect((await call(app, editor.cookie, `/api/v1/events/${created.id}`)).status).toBe(403);
      const mine = await call(app, owner.cookie, `/api/v1/events/${created.id}`);
      expect(await mine.json()).toMatchObject({ organization: null, isOwner: true });

      // 組織を消しても外れる
      const again = await createOrganization(app, owner.cookie, "次の部");
      expect((await placeEvent(app, owner.cookie, created.id, again)).status).toBe(200);
      expect(
        (await call(app, owner.cookie, `/api/v1/suite/organizations/${again}`, "DELETE")).status,
      ).toBe(204);
      const after = await call(app, owner.cookie, `/api/v1/events/${created.id}`);
      expect(await after.json()).toMatchObject({ organization: null, isOwner: true });
    });

    it("編集者をメンバーに下げると、次の要求から主催者でない。受付係で編集者なら主催者", async () => {
      const editor = await loginAs(app);
      const created = await createEvent(app, owner.cookie);
      const organizationId = await organizationWith([{ person: editor, role: "editor" }]);
      await placeEvent(app, owner.cookie, created.id, organizationId);
      const path = `/api/v1/events/${created.id}`;
      expect((await call(app, editor.cookie, path)).status).toBe(200);

      await setOrganizationRole(app, owner.cookie, organizationId, editor.account.id, "member");
      expect((await call(app, editor.cookie, path)).status).toBe(403);

      const staff = await makeStaff(app, owner.cookie, created.id);
      await joinOrganization(
        app,
        staff.cookie,
        await rotateInviteToken(app, owner.cookie, organizationId),
      );
      await setOrganizationRole(app, owner.cookie, organizationId, staff.account.id, "editor");
      const asStaffEditor = await call(app, staff.cookie, path);
      expect(await asStaffEditor.json()).toMatchObject({ myRole: "organizer" });
    });
  });

  describe("一覧", () => {
    it("自分の交流会・編集者の組織の交流会・受付係の交流会が出て、行ごとに持ち主と組織が出る", async () => {
      const me = await loginAs(app, { displayName: "森" });
      const organizationId = await organizationWith([{ person: me, role: "editor" }]);
      await createEvent(app, me.cookie, { name: "自分の" });
      const placed = await createEvent(app, owner.cookie, { name: "組織の" });
      await placeEvent(app, owner.cookie, placed.id, organizationId);
      const staffed = await createEvent(app, operator.cookie, { name: "受付係の" });
      await createEvent(app, owner.cookie, { name: "関係のない" });
      const invite = await call(
        app,
        operator.cookie,
        `/api/v1/events/${staffed.id}/staff-invite`,
        "POST",
      );
      const { token } = (await invite.json()) as { token: string };
      await call(app, me.cookie, `/api/v1/staff-invites/${token}/accept`, "POST");

      const listed = await list(me.cookie);
      const byName = new Map(listed.map((item) => [item.name, item]));
      expect([...byName.keys()].sort()).toEqual(["受付係の", "組織の", "自分の"].sort());
      expect(byName.get("自分の")).toMatchObject({
        myRole: "organizer",
        isOwner: true,
        organization: null,
      });
      expect(byName.get("組織の")).toMatchObject({
        myRole: "organizer",
        isOwner: false,
        owner: { displayName: "高橋" },
        organization: { id: organizationId, name: "バドミントンの部" },
      });
      expect(byName.get("受付係の")).toMatchObject({ myRole: "staff", isOwner: false });
    });
  });

  describe("招待", () => {
    it("組織の編集者は招待を受けても主催者のまま。部員は受けると受付係になる", async () => {
      const editor = await loginAs(app);
      const member = await loginAs(app);
      const created = await createEvent(app, owner.cookie);
      const organizationId = await organizationWith([
        { person: editor, role: "editor" },
        { person: member, role: "member" },
      ]);
      await placeEvent(app, owner.cookie, created.id, organizationId);
      const invite = await call(
        app,
        owner.cookie,
        `/api/v1/events/${created.id}/staff-invite`,
        "POST",
      );
      const { token } = (await invite.json()) as { token: string };

      const preview = await call(app, member.cookie, `/api/v1/staff-invites/${token}`);
      expect(await preview.json()).toMatchObject({ myRole: null });
      const asEditor = await call(
        app,
        editor.cookie,
        `/api/v1/staff-invites/${token}/accept`,
        "POST",
      );
      expect(await asEditor.json()).toMatchObject({ role: "organizer" });
      const asMember = await call(
        app,
        member.cookie,
        `/api/v1/staff-invites/${token}/accept`,
        "POST",
      );
      expect(await asMember.json()).toMatchObject({ role: "staff" });
      expect((await call(app, member.cookie, `/api/v1/events/${created.id}/checkins`)).status).toBe(
        200,
      );
    });
  });

  it("受付係のチェックインは組織と関係なく今のまま使える", async () => {
    const created = await createEvent(app, owner.cookie);
    const staff = await makeStaff(app, owner.cookie, created.id);
    const participant = await loginAs(app);
    await checkIn(app, participant.cookie, created.id);
    expect((await call(app, staff.cookie, `/api/v1/events/${created.id}/checkins`)).status).toBe(
      200,
    );
  });
});
