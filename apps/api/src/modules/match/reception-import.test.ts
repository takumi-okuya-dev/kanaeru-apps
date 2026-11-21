// 受付の交流会から名簿を入れる窓口（match-006）と、前に入れたレベル（AD-25）の結合のテスト（本物の PostgreSQL）：
// チェックインした人と確定した申込みの名簿（名前・account）・権限（交流会の主催者だけ。受付係・部員・ほかの人は 404、
// 試合表の権限がなければ 403、受付アプリが見えなければ 404）・レベルを覚える（account のある人だけ・試合表を入れた組織か持ち主ごと・
// 消えた account は飛ばす）。名前はどれも架空のもの。
import "@hono/zod-openapi";
import { INITIAL_CONTENT } from "@workspace/contracts/match";
import type {
  MatchLevel,
  MatchReceptionRoster,
  MatchTable,
  MatchTableContent,
} from "@workspace/contracts/match";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { importNames, useRoster } from "../../../test/helpers/booking.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff, placeEvent } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import {
  MATCH_TABLES,
  createTable,
  showMatchApp,
  updateTable,
} from "../../../test/helpers/match.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";
import { checkIn, manualCheckIn } from "../../../test/helpers/reception.ts";
import { upsertVisibility } from "../suite/index.ts";
import { levelChanges } from "./level-memory.ts";

const database = useTestDatabase();

/** ない ID。 */
const MISSING_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * 受付の交流会から入れられる人の窓口の道。
 * @param tableId 試合表の ID
 * @param eventId 交流会の ID
 * @returns 道
 */
function receptionPath(tableId: string, eventId: string): string {
  return `${MATCH_TABLES}/${tableId}/reception-events/${eventId}`;
}

/**
 * 名簿の中身（レベルと account の組から）。
 * @param people 名簿の人（account はなくてよい）
 * @returns 中身
 */
function rosterOf(
  people: readonly { accountId?: string; level: MatchLevel | null }[],
): MatchTableContent {
  return {
    ...INITIAL_CONTENT,
    players: people.map((person, index) => ({
      id: `p${index}`,
      nickname: `呼び名${index}`,
      level: person.level,
      status: "present",
      ...(person.accountId ? { accountId: person.accountId } : {}),
    })),
  };
}

describe("受付の交流会から名簿を入れる", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let participant: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;
  let table: MatchTable;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showMatchApp(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "運営" });
    participant = await loginAs(app, { displayName: "なかむら" });
    eventId = (await createEvent(app, owner.cookie, { name: "12/13(日) 練習会" })).id;
    table = await createTable(app, owner.cookie);
  });

  /**
   * 読む（クッキーの人で）。
   * @param cookie クッキー
   * @param tableId 試合表の ID
   * @param target 交流会の ID
   * @returns 応答
   */
  const read = (cookie: string, tableId = table.id, target = eventId) =>
    call(app, cookie, receptionPath(tableId, target));

  it("チェックインした人と確定した申込みの名簿を、名前と account で返す（覚えたレベルはまだない）", async () => {
    await checkIn(app, participant.cookie, eventId, { name: "中村 さき" });
    await manualCheckIn(app, owner.cookie, eventId, { name: "飛び入り 太郎" });
    await useRoster(app, owner.cookie, eventId);
    await importNames(app, owner.cookie, eventId, ["山田 花子", "佐藤 一郎"]);

    const response = await read(owner.cookie);
    expect(response.status).toBe(200);
    const body = (await response.json()) as MatchReceptionRoster;
    expect(body.event).toMatchObject({ id: eventId, name: "12/13(日) 練習会" });
    expect(body.checkins).toEqual([
      { name: "中村 さき", accountId: participant.account.id, level: null },
      { name: "飛び入り 太郎", accountId: null, level: null },
    ]);
    expect(body.applicants).toEqual([
      { name: "山田 花子", accountId: null, level: null },
      { name: "佐藤 一郎", accountId: null, level: null },
    ]);
    // 交流会と名簿の、ほかの欄（媒体・支払い・メールアドレスなど）は返さない
    expect(JSON.stringify(body)).not.toMatch(/connpass|paypay|applicationSource|email/u);
  });

  it("予約を使わない交流会は、申込みの名簿が空", async () => {
    const body = (await (await read(owner.cookie)).json()) as MatchReceptionRoster;
    expect(body).toMatchObject({ checkins: [], applicants: [] });
  });

  it("ほかの人・受付係・部員の交流会は選べない（404 MATCH_EVENT_NOT_FOUND。あるかを漏らさない）", async () => {
    const other = await loginAs(app, { displayName: "ほかの運営" });
    const otherTable = await createTable(app, other.cookie);
    const staff = await makeStaff(app, owner.cookie, eventId, { displayName: "受付係" });
    const staffTable = await createTable(app, staff.cookie);
    const member = await loginAs(app, { displayName: "部員" });
    const organizationId = await setUpOrganization(app, owner.cookie, [
      { cookie: member.cookie, accountId: member.account.id, role: "member" },
    ]);
    expect((await placeEvent(app, owner.cookie, eventId, organizationId)).status).toBe(200);
    const memberTable = await createTable(app, member.cookie);

    for (const [cookie, tableId] of [
      [other.cookie, otherTable.id],
      [staff.cookie, staffTable.id],
      [member.cookie, memberTable.id],
      [owner.cookie, table.id],
    ] as const) {
      const target = cookie === owner.cookie ? MISSING_ID : eventId;
      const response = await read(cookie, tableId, target);
      expect(response.status).toBe(404);
      expect(((await response.json()) as ErrorBody).error.code).toBe("MATCH_EVENT_NOT_FOUND");
    }
    // 形の違う交流会の ID も 404
    expect((await read(owner.cookie, table.id, "not-a-uuid")).status).toBe(404);
  });

  it("交流会を入れた組織の編集者は主催者なので選べる。試合表の権限がなければ 403、ログインしていなければ 401", async () => {
    const editor = await loginAs(app, { displayName: "編集者" });
    const organizationId = await setUpOrganization(app, owner.cookie, [
      { cookie: editor.cookie, accountId: editor.account.id, role: "editor" },
    ]);
    expect((await placeEvent(app, owner.cookie, eventId, organizationId)).status).toBe(200);
    const editorTable = await createTable(app, editor.cookie);
    expect((await read(editor.cookie, editorTable.id)).status).toBe(200);

    // 交流会の主催者でも、ほかの人の（組織に入れていない）試合表は開けない
    const forbidden = await read(editor.cookie, table.id);
    expect(forbidden.status).toBe(403);
    expect(((await forbidden.json()) as ErrorBody).error.code).toBe("MATCH_FORBIDDEN");
    expect((await app.request(receptionPath(table.id, eventId))).status).toBe(401);
  });

  it("受付アプリが見えない人には、交流会を選ばせない（404）", async () => {
    await upsertVisibility(database.db, "reception", "off");
    const response = await read(owner.cookie);
    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorBody).error.code).toBe("MATCH_EVENT_NOT_FOUND");
  });

  it("account のある人のレベルを入れて送ると覚え、同じ運営の次の試合表で入れるときに付く（ない人は null のまま）", async () => {
    await checkIn(app, participant.cookie, eventId, { name: "中村 さき" });
    await manualCheckIn(app, owner.cookie, eventId, { name: "飛び入り 太郎" });
    const saved = await updateTable(
      app,
      owner.cookie,
      table,
      rosterOf([{ accountId: participant.account.id, level: "intermediate" }, { level: "novice" }]),
    );
    expect(saved.status).toBe(200);

    const next = await createTable(app, owner.cookie, { name: "12/20(日) 練習会" });
    const body = (await (await read(owner.cookie, next.id)).json()) as MatchReceptionRoster;
    expect(body.checkins).toEqual([
      { name: "中村 さき", accountId: participant.account.id, level: "intermediate" },
      { name: "飛び入り 太郎", accountId: null, level: null },
    ]);

    // 変えたら上書きする
    const current = (await saved.json()) as MatchTable;
    expect(
      (
        await updateTable(
          app,
          owner.cookie,
          current,
          rosterOf([{ accountId: participant.account.id, level: "advanced" }]),
        )
      ).status,
    ).toBe(200);
    const again = (await (await read(owner.cookie, next.id)).json()) as MatchReceptionRoster;
    expect(again.checkins[0]?.level).toBe("advanced");
  });

  it("レベルは、試合表を入れた組織か持ち主ごとに覚える（ほかの運営には付かない）", async () => {
    await checkIn(app, participant.cookie, eventId, { name: "中村 さき" });
    const editor = await loginAs(app, { displayName: "編集者" });
    const organizationId = await setUpOrganization(app, owner.cookie, [
      { cookie: editor.cookie, accountId: editor.account.id, role: "editor" },
    ]);
    expect((await placeEvent(app, owner.cookie, eventId, organizationId)).status).toBe(200);
    // 組織に入れた試合表で覚える → 組織の編集者の次の試合表（組織に入れたもの）で付く
    const shared = await createTable(app, owner.cookie, { organizationId });
    expect(
      (
        await updateTable(
          app,
          owner.cookie,
          shared,
          rosterOf([{ accountId: participant.account.id, level: "beginner" }]),
        )
      ).status,
    ).toBe(200);
    const editorShared = await createTable(app, editor.cookie, { organizationId });
    const fromOrganization = (await (
      await read(editor.cookie, editorShared.id)
    ).json()) as MatchReceptionRoster;
    expect(fromOrganization.checkins[0]?.level).toBe("beginner");

    // 持ち主の個人の試合表と、編集者の個人の試合表には付かない（組織が覚えたもの）
    const personal = (await (await read(owner.cookie)).json()) as MatchReceptionRoster;
    expect(personal.checkins[0]?.level).toBeNull();
    const editorPersonal = await createTable(app, editor.cookie);
    const fromEditor = (await (
      await read(editor.cookie, editorPersonal.id)
    ).json()) as MatchReceptionRoster;
    expect(fromEditor.checkins[0]?.level).toBeNull();
  });

  it("名簿に残った account が消えていても、中身は保存し、ほかの人のレベルは覚える", async () => {
    await checkIn(app, participant.cookie, eventId, { name: "中村 さき" });
    const saved = await updateTable(
      app,
      owner.cookie,
      table,
      rosterOf([
        { accountId: MISSING_ID, level: "advanced" },
        { accountId: participant.account.id, level: "novice" },
      ]),
    );
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as MatchTable).content.players[0]?.accountId).toBe(MISSING_ID);
    const body = (await (await read(owner.cookie)).json()) as MatchReceptionRoster;
    expect(body.checkins[0]?.level).toBe("novice");
  });

  it("account は見るだけのページに出さない", async () => {
    const saved = (await (
      await updateTable(
        app,
        owner.cookie,
        table,
        rosterOf([
          { accountId: participant.account.id, level: "advanced" },
          { level: "advanced" },
          { level: "advanced" },
          { level: "advanced" },
        ]),
      )
    ).json()) as MatchTable;
    const withPlan = {
      ...saved.content,
      plan: [
        { key: "advanced" as const, games: [{ players: ["p0", "p1", "p2", "p3"], done: false }] },
      ],
    };
    expect((await updateTable(app, owner.cookie, saved, withPlan)).status).toBe(200);
    const issued = await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}/view-link`, "PUT");
    expect(issued.status).toBe(200);
    const { token } = (await issued.json()) as { token: string };
    const view = await app.request(`/api/v1/match/views/${token}`);
    expect(view.status).toBe(200);
    expect(await view.text()).not.toContain(participant.account.id);
  });
});

describe("覚えるレベルの選び方（levelChanges）", () => {
  const A = "0193a1b2-0000-7000-8000-00000000000a";
  const B = "0193a1b2-0000-7000-8000-00000000000b";

  it("account とレベルのある人で、前と違うか前にいなかった人だけを選ぶ", () => {
    const before = rosterOf([
      { accountId: A, level: "advanced" },
      { accountId: B, level: null },
    ]);
    expect(
      levelChanges(
        before,
        rosterOf([
          { accountId: A, level: "advanced" },
          { accountId: B, level: "novice" },
          { level: "beginner" },
        ]),
      ),
    ).toEqual([{ accountId: B, level: "novice" }]);
    expect(levelChanges(before, rosterOf([{ accountId: A, level: "beginner" }]))).toEqual([
      { accountId: A, level: "beginner" },
    ]);
    // レベルを外した人は覚え直さない（消さない）
    expect(levelChanges(before, rosterOf([{ accountId: A, level: null }]))).toEqual([]);
  });

  it("前の中身の形が合わなければ、前にだれもいなかったとみなす。同じ account は後の人のレベル", () => {
    expect(
      levelChanges({ players: "壊れた中身" }, rosterOf([{ accountId: A, level: "advanced" }])),
    ).toEqual([{ accountId: A, level: "advanced" }]);
    expect(
      levelChanges(
        {},
        rosterOf([
          { accountId: A, level: "advanced" },
          { accountId: A, level: "novice" },
        ]),
      ),
    ).toEqual([{ accountId: A, level: "novice" }]);
  });
});
