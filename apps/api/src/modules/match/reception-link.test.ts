// 名簿を入れた受付の交流会（match-007）の結合のテスト（本物の PostgreSQL）：
// 中身の写しを送ると試合表につなぐ・一覧と試合表に「どこから入れたか」と受付アプリで開けるかを返す・別の交流会から入れ直すと
// 置きかわる・入れてよくない交流会はつながず送りは止めない・交流会が消えても写しを出す・開けるかは見る人ごと・受付アプリが
// 見えなければ開けない・見るだけのページには出さない。名前はどれも架空のもの。
import "@hono/zod-openapi";
import { INITIAL_CONTENT } from "@workspace/contracts/match";
import type {
  MatchReceptionSource,
  MatchTable,
  MatchTableContent,
  MatchTableList,
} from "@workspace/contracts/match";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff, placeEvent } from "../../../test/helpers/event.ts";
import {
  MATCH_TABLES,
  createTable,
  showMatchApp,
  updateTable,
} from "../../../test/helpers/match.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";
import { upsertVisibility } from "../suite/index.ts";
import { matchTable } from "./schema.ts";

const database = useTestDatabase();

/** 交流会の始まり（見本の交流会の日時。写しは画面が渡したまま持つ）。 */
const STARTS_AT = "2026-12-13T04:00:00.000Z";

/**
 * 名簿を入れた受付の交流会の写し。
 * @param eventId 交流会の ID
 * @param name 名前
 * @returns 写し
 */
function sourceOf(eventId: string, name = "12/13(日) 練習会"): MatchReceptionSource {
  return { eventId, name, startsAt: STARTS_AT };
}

/**
 * 名簿の1人と、名簿を入れた交流会の写しのある中身。
 * @param source 写し（なければ持たない）
 * @returns 中身
 */
function contentFrom(source?: MatchReceptionSource): MatchTableContent {
  return {
    ...INITIAL_CONTENT,
    players: [{ id: "p0", nickname: "なかむら", level: "advanced", status: "present" }],
    ...(source ? { receptionEvent: source } : {}),
  };
}

describe("名簿を入れた受付の交流会", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let eventId: string;
  let table: MatchTable;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showMatchApp(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "運営" });
    eventId = (await createEvent(app, owner.cookie, { name: "12/13(日) 練習会" })).id;
    table = await createTable(app, owner.cookie);
  });

  /**
   * 中身を送り、答えの試合表を返す（200 でなければ落とす）。
   * @param base もとにした試合表
   * @param content 中身
   * @param cookie 送る人のクッキー
   * @returns 答えの試合表
   */
  const send = async (base: MatchTable, content: MatchTableContent, cookie = owner.cookie) => {
    const response = await updateTable(app, cookie, base, content);
    expect(response.status).toBe(200);
    return (await response.json()) as MatchTable;
  };

  /**
   * つないだ交流会（DB の列）を読む。
   * @returns 交流会の ID（なければ null）
   */
  const linkedEventId = async () => {
    const [row] = await database.db
      .select({ eventId: matchTable.eventId })
      .from(matchTable)
      .where(eq(matchTable.id, table.id));
    return row?.eventId ?? null;
  };

  /**
   * 試合表を読む。
   * @param cookie クッキー
   * @returns 試合表
   */
  const readTable = async (cookie = owner.cookie) =>
    (await (await call(app, cookie, `${MATCH_TABLES}/${table.id}`)).json()) as MatchTable;

  /**
   * 一覧の、この試合表の行を読む。
   * @param cookie クッキー
   * @returns 一覧の行
   */
  const readRow = async (cookie = owner.cookie) => {
    const list = (await (await call(app, cookie, MATCH_TABLES)).json()) as MatchTableList;
    return list.tables.find((row) => row.id === table.id);
  };

  it("作ったばかりの試合表は、どこからも入れていない（null）", async () => {
    expect(table.receptionEvent).toBeNull();
    expect((await readRow())?.receptionEvent).toBeNull();
    expect(await linkedEventId()).toBeNull();
  });

  it("写しを送ると試合表につなぎ、試合表と一覧に名前・日時と、受付アプリで開けることを返す", async () => {
    const saved = await send(table, contentFrom(sourceOf(eventId)));
    const expected = { eventId, name: "12/13(日) 練習会", startsAt: STARTS_AT, canOpen: true };
    expect(saved.receptionEvent).toEqual(expected);
    expect(saved.content.receptionEvent).toEqual(sourceOf(eventId));
    expect(await linkedEventId()).toBe(eventId);
    expect((await readTable()).receptionEvent).toEqual(expected);
    expect((await readRow())?.receptionEvent).toEqual(expected);
  });

  it("別の交流会から入れ直すと置きかわり、貼り付けで置きかえて写しを外すと、つながりも外れる", async () => {
    const first = await send(table, contentFrom(sourceOf(eventId)));
    const otherId = (await createEvent(app, owner.cookie, { name: "12/20(日) 練習会" })).id;
    const second = await send(first, contentFrom(sourceOf(otherId, "12/20(日) 練習会")));
    expect(second.receptionEvent).toMatchObject({ eventId: otherId, canOpen: true });
    expect(await linkedEventId()).toBe(otherId);

    const third = await send(second, contentFrom());
    expect(third.receptionEvent).toBeNull();
    expect(third.content.receptionEvent).toBeUndefined();
    expect(await linkedEventId()).toBeNull();
  });

  it("入れてよくない交流会（ほかの人の・ない交流会）の写しは、送りを止めずに受けるが、つながず開けない", async () => {
    const other = await loginAs(app, { displayName: "ほかの運営" });
    const othersEvent = (await createEvent(app, other.cookie, { name: "ほかの会" })).id;
    const saved = await send(table, contentFrom(sourceOf(othersEvent, "ほかの会")));
    expect(saved.receptionEvent).toMatchObject({ eventId: othersEvent, canOpen: false });
    expect(await linkedEventId()).toBeNull();

    const missing = "0193a1b2-0000-7000-8000-000000000000";
    const next = await send(saved, contentFrom(sourceOf(missing, "消えた会")));
    expect(next.receptionEvent).toMatchObject({ eventId: missing, canOpen: false });
    expect(await linkedEventId()).toBeNull();
  });

  it("交流会があとで消えたら、つながりは外れ（外部キー）、写しの名前と日時は出し続ける（開けない）", async () => {
    await send(table, contentFrom(sourceOf(eventId)));
    await database.db.execute(sql`delete from event where id = ${eventId}`);
    expect(await linkedEventId()).toBeNull();
    const read = await readTable();
    expect(read.receptionEvent).toEqual({
      eventId,
      name: "12/13(日) 練習会",
      startsAt: STARTS_AT,
      canOpen: false,
    });
    expect((await readRow())?.receptionEvent).toMatchObject({ eventId, canOpen: false });
  });

  it("開けるかは見る人ごと：交流会を組織から外すと、組織の編集者には開けず、持ち主には開ける。受付係なら開ける", async () => {
    const editor = await loginAs(app, { displayName: "編集者" });
    const staff = await makeStaff(app, owner.cookie, eventId, { displayName: "受付係" });
    const organizationId = await setUpOrganization(app, owner.cookie, [
      { cookie: editor.cookie, accountId: editor.account.id, role: "editor" },
      { cookie: staff.cookie, accountId: staff.account.id, role: "editor" },
    ]);
    expect((await placeEvent(app, owner.cookie, eventId, organizationId)).status).toBe(200);
    table = await createTable(app, owner.cookie, { organizationId });
    // 組織の編集者は、組織の交流会の主催者なので、組織の試合表につなげる
    const saved = await send(table, contentFrom(sourceOf(eventId)), editor.cookie);
    expect(saved.receptionEvent).toMatchObject({ canOpen: true });
    expect(await linkedEventId()).toBe(eventId);

    expect((await placeEvent(app, owner.cookie, eventId, null)).status).toBe(200);
    expect((await readTable(editor.cookie)).receptionEvent).toMatchObject({ canOpen: false });
    expect((await readRow(editor.cookie))?.receptionEvent).toMatchObject({ canOpen: false });
    expect((await readTable(owner.cookie)).receptionEvent).toMatchObject({ canOpen: true });
    expect((await readTable(staff.cookie)).receptionEvent).toMatchObject({ canOpen: true });
    // つながりは、写しの交流会が変わるまで、そのまま（見る人が変わっただけ）
    expect(await linkedEventId()).toBe(eventId);
  });

  it("受付アプリが見えない人には、開けるとしない（つながりは残す）", async () => {
    await send(table, contentFrom(sourceOf(eventId)));
    await upsertVisibility(database.db, "reception", "off");
    expect((await readTable()).receptionEvent).toMatchObject({ eventId, canOpen: false });
    expect(await linkedEventId()).toBe(eventId);
  });

  it("試合表を開く権限のない人には、試合表ごと見せない（403）", async () => {
    await send(table, contentFrom(sourceOf(eventId)));
    const stranger = await loginAs(app, { displayName: "知らない人" });
    expect((await call(app, stranger.cookie, `${MATCH_TABLES}/${table.id}`)).status).toBe(403);
    const list = (await (await call(app, stranger.cookie, MATCH_TABLES)).json()) as MatchTableList;
    expect(list.tables).toEqual([]);
  });

  it("見るだけのページには、交流会の名前も ID も出さない（AD-26）", async () => {
    const saved = await send(table, contentFrom(sourceOf(eventId, "ひみつの練習会")));
    const issued = await call(app, owner.cookie, `${MATCH_TABLES}/${saved.id}/view-link`, "PUT");
    expect(issued.status).toBe(200);
    const { token } = (await issued.json()) as { token: string };
    const view = await app.request(`/api/v1/match/views/${token}`);
    expect(view.status).toBe(200);
    const text = await view.text();
    expect(text).not.toContain("ひみつの練習会");
    expect(text).not.toContain(eventId);
  });

  it("写しの名前が長すぎる・形が違う中身は、入力の誤り（400）", async () => {
    const tooLong = contentFrom(sourceOf(eventId, "あ".repeat(201)));
    expect((await updateTable(app, owner.cookie, table, tooLong)).status).toBe(400);
    const extra = {
      ...contentFrom(),
      receptionEvent: { ...sourceOf(eventId), email: "x@example.com" },
    } as unknown as MatchTableContent;
    expect((await updateTable(app, owner.cookie, table, extra)).status).toBe(400);
  });
});
