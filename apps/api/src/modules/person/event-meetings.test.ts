// 人物メモの「PaletKit の交流会を会った場に選ぶ」の結合のテスト（本物の PostgreSQL・specs/person/002-event-meetings）。
// - 選べる交流会（GET /event-candidates）：チェックインした会・持ち主の会・受付係の会だけ。組織の役割だけの会・関係のない会・
//   今日（日本時間）より後の会は出ない。同じ会は1件。新しい順に最大50件。作った会には meetingId。受付アプリが見えなければ空
// - 交流会から作る（POST /meetings/from-event）：名前と日本時間の日付の写し。2回目は前のもの。同時に送っても1つ。
//   選べない会は 404（候補と同じ条件で確かめ直す）
// - 作った会った場は、手で書いたものと同じに使え（足す・付ける・探す・見出し・CSV）、交流会が直る・消える・受付係から外れても残る
// 交流会・受付係・チェックインは窓口から作る。名前は、どれも架空のもの。
import "@hono/zod-openapi";
import { endOfJstDate, jstDate } from "@workspace/contracts/core";
import type { EventCandidateList, Meeting, Note, SearchResult } from "@workspace/contracts/person";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ORGANIZER_LINE_USER_ID_FOR_TEST,
  loginAs,
  testLineUserId,
} from "../../../test/helpers/account.ts";
import { buildApp, jsonRequest, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import {
  SAMPLE_EVENT,
  call,
  createEvent,
  makeStaff,
  placeEvent,
} from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";
import {
  PERSON_API,
  PERSON_MEETINGS,
  PERSON_NOTES,
  createMeeting,
  createNote,
  showPersonApp,
} from "../../../test/helpers/person.ts";
import { checkIn } from "../../../test/helpers/reception.ts";
import { upsertVisibility } from "../suite/index.ts";

const database = useTestDatabase();

/** 候補の窓口の道。 */
const CANDIDATES = `${PERSON_API}/event-candidates`;

/** 交流会から作る窓口の道。 */
const FROM_EVENT = `${PERSON_MEETINGS}/from-event`;

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** ほかの参加者がチェックインで書く名前（候補の答えに出てはいけない。架空のもの）。 */
const OTHER_ATTENDEE_NAME = "ほかの参加者Qx9";

/** ログインした人（クッキーと account の ID）。 */
type Login = Awaited<ReturnType<typeof loginAs>>;

/**
 * 今から days 日あとの日時（ISO の文字。負なら前）。
 * @param days 日数
 * @returns 日時
 */
function daysLater(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/**
 * 選べる交流会を読む。
 * @param app 組み立てた API
 * @param cookie クッキー
 * @returns 一覧
 */
async function candidates(app: TestApp, cookie: string): Promise<EventCandidateList> {
  const response = await call(app, cookie, CANDIDATES);
  expect(response.status).toBe(200);
  return (await response.json()) as EventCandidateList;
}

/**
 * 選べる交流会の ID の並び。
 * @param app 組み立てた API
 * @param cookie クッキー
 * @returns 交流会の ID の並び
 */
async function candidateIds(app: TestApp, cookie: string): Promise<string[]> {
  return (await candidates(app, cookie)).items.map((item) => item.eventId);
}

/**
 * 交流会から会った場を作る。
 * @param app 組み立てた API
 * @param cookie クッキー
 * @param eventId 交流会の ID
 * @returns 応答
 */
function fromEvent(app: TestApp, cookie: string, eventId: unknown): Promise<Response> {
  return call(app, cookie, FROM_EVENT, "POST", { eventId });
}

/**
 * 交流会から会った場を作り、会った場を返す（201 でなければ失敗）。
 * @param app 組み立てた API
 * @param cookie クッキー
 * @param eventId 交流会の ID
 * @returns 会った場
 */
async function meetingFromEvent(app: TestApp, cookie: string, eventId: string): Promise<Meeting> {
  const response = await fromEvent(app, cookie, eventId);
  expect(response.status).toBe(201);
  return (await response.json()) as Meeting;
}

/**
 * 交流会を直す（持ち主のクッキーで。名前と始まりだけを変え、ほかは見本のまま）。
 * 受付係の招待は交流会の日が終わると使えないので、受付係にしたあとで始まりを前へ動かすときにも使う。
 * @param app 組み立てた API
 * @param ownerCookie 持ち主のクッキー
 * @param eventId 交流会の ID
 * @param input 名前と始まり
 * @param input.name 名前
 * @param input.startsAt 始まり
 */
async function updateEvent(
  app: TestApp,
  ownerCookie: string,
  eventId: string,
  input: { name: string; startsAt: string },
): Promise<void> {
  const response = await call(app, ownerCookie, `/api/v1/events/${eventId}`, "PUT", {
    ...SAMPLE_EVENT,
    ...input,
  });
  expect(response.status).toBe(200);
}

/**
 * 応答のエラーの code。
 * @param response 応答
 * @returns code
 */
async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as ErrorBody).error.code;
}

/** 会った場の行（作り方と交流会を見る）。 */
type MeetingRow = { id: string; source: string; event_id: string | null; name: string };

/**
 * 持ち主の会った場の行（作った順）。
 * @param ownerId 持ち主の account の ID
 * @returns 行の並び
 */
async function meetingRows(ownerId: string): Promise<MeetingRow[]> {
  const result = await database.pool.query(
    "SELECT id, source, event_id, name FROM person_meeting WHERE owner_account_id = $1 ORDER BY created_at",
    [ownerId],
  );
  return result.rows as MeetingRow[];
}

describe("PaletKit の交流会を会った場に選ぶ", () => {
  let app: TestApp;
  let myLineUserId: string;
  let me: Login;
  let other: Login;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showPersonApp(database);
    await upsertVisibility(database.db, "reception", "public");
    app = buildApp(database, testConfig());
    myLineUserId = testLineUserId();
    me = await loginAs(app, { lineUserId: myLineUserId, displayName: "使う人" });
    other = await loginAs(app, { displayName: "ほかの主催者" });
  });

  /**
   * ほかの人の交流会で、使う人を受付係にし、始まりを前へ動かす。
   * @param name 交流会の名前
   * @param startsAt 受付係にしたあとの始まり
   * @returns 交流会の ID
   */
  async function staffedEvent(name: string, startsAt: string): Promise<string> {
    const event = await createEvent(app, other.cookie, { name });
    const staff = await makeStaff(app, other.cookie, event.id, { lineUserId: myLineUserId });
    expect(staff.account.id).toBe(me.account.id);
    await updateEvent(app, other.cookie, event.id, { name, startsAt });
    return event.id;
  }

  describe("選べる交流会（GET /event-candidates）", () => {
    it("持ち主・受付係・チェックインした会が、名前と日本時間の日付つきで新しい順に出る。関係のない会は出ない", async () => {
      // 2025-11-20 16:30（UTC）は、日本時間では 2025-11-21
      const owned = await createEvent(app, me.cookie, {
        name: "自分の会",
        startsAt: "2025-11-20T16:30:00.000Z",
      });
      const staffedId = await staffedEvent("受付係の会", daysLater(-2));
      const checkedIn = await createEvent(app, other.cookie, {
        name: "参加した会",
        startsAt: daysLater(-1),
      });
      await checkIn(app, me.cookie, checkedIn.id);
      await createEvent(app, other.cookie, { name: "関係のない会", startsAt: daysLater(-3) });

      const list = await candidates(app, me.cookie);
      expect(list).toEqual({
        available: true,
        items: [
          {
            eventId: checkedIn.id,
            name: "参加した会",
            metOn: jstDate(checkedIn.startsAt),
            meetingId: null,
          },
          {
            eventId: staffedId,
            name: "受付係の会",
            metOn: jstDate(daysLater(-2)),
            meetingId: null,
          },
          { eventId: owned.id, name: "自分の会", metOn: "2025-11-21", meetingId: null },
        ],
      });
    });

    it("ほかの参加者の名前・人数は答えに入らない", async () => {
      const event = await createEvent(app, other.cookie, {
        name: "参加した会",
        startsAt: daysLater(-1),
      });
      await checkIn(app, me.cookie, event.id, { name: "使う人の名前" });
      const attendee = await loginAs(app, { displayName: "ほかの参加者" });
      await checkIn(app, attendee.cookie, event.id, { name: OTHER_ATTENDEE_NAME });
      const response = await call(app, me.cookie, CANDIDATES);
      const text = await response.text();
      expect(text).not.toContain(OTHER_ATTENDEE_NAME);
      expect(text).not.toContain("使う人の名前");
      const list = JSON.parse(text) as EventCandidateList;
      expect(Object.keys(list.items[0] ?? {}).sort()).toEqual([
        "eventId",
        "meetingId",
        "metOn",
        "name",
      ]);
    });

    it("組織の役割（管理者・編集者・部員）だけの会は出ない", async () => {
      const editor = await loginAs(app, { displayName: "編集者" });
      const member = await loginAs(app, { displayName: "部員" });
      const owner = await loginAs(app, { displayName: "交流会の持ち主" });
      const organizationId = await setUpOrganization(app, me.cookie, [
        { cookie: editor.cookie, accountId: editor.account.id, role: "editor" },
        { cookie: member.cookie, accountId: member.account.id, role: "member" },
        { cookie: owner.cookie, accountId: owner.account.id, role: "editor" },
      ]);
      const placed = await createEvent(app, owner.cookie, {
        name: "組織の会",
        startsAt: daysLater(-1),
      });
      expect((await placeEvent(app, owner.cookie, placed.id, organizationId)).status).toBe(200);
      for (const person of [me, editor, member]) {
        expect(await candidateIds(app, person.cookie)).toEqual([]);
        expect((await fromEvent(app, person.cookie, placed.id)).status).toBe(404);
      }
      expect(await candidateIds(app, owner.cookie)).toEqual([placed.id]);
    });

    it("持ち主で受付係でもあり、チェックインもした会は1件だけ出る", async () => {
      const owned = await createEvent(app, me.cookie, {
        name: "自分の会",
        startsAt: daysLater(-1),
      });
      await checkIn(app, me.cookie, owned.id);
      expect(await candidateIds(app, me.cookie)).toEqual([owned.id]);
    });

    it("今日（日本時間）のうちに始まる会は出て、明日より後の会は出ない", async () => {
      const lastMinute = new Date(endOfJstDate(new Date()).getTime() - 60_000).toISOString();
      const today = await createEvent(app, me.cookie, { name: "今日の会", startsAt: lastMinute });
      await createEvent(app, me.cookie, {
        name: "明日の会",
        startsAt: endOfJstDate(new Date()).toISOString(),
      });
      await createEvent(app, me.cookie, { name: "来週の会", startsAt: daysLater(7) });
      expect(await candidateIds(app, me.cookie)).toEqual([today.id]);
    });

    it("新しい順に最大50件。51件目の古い会は出ず、作ることもできない", async () => {
      const ids: string[] = [];
      for (let index = 1; index <= 51; index += 1) {
        const event = await createEvent(app, me.cookie, {
          name: `会 ${index}`,
          startsAt: daysLater(-index),
        });
        ids.push(event.id);
      }
      expect(await candidateIds(app, me.cookie)).toEqual(ids.slice(0, 50));
      const oldest = await fromEvent(app, me.cookie, ids[50]);
      expect(oldest.status).toBe(404);
    });

    it("作った会には meetingId が付く（ほかの人が同じ会から作ったものは付かない）", async () => {
      const event = await createEvent(app, me.cookie, {
        name: "自分の会",
        startsAt: daysLater(-1),
      });
      await checkIn(app, other.cookie, event.id);
      const othersMeeting = await meetingFromEvent(app, other.cookie, event.id);
      expect((await candidates(app, me.cookie)).items[0]?.meetingId).toBeNull();
      const meeting = await meetingFromEvent(app, me.cookie, event.id);
      expect(meeting.id).not.toBe(othersMeeting.id);
      expect((await candidates(app, me.cookie)).items[0]?.meetingId).toBe(meeting.id);
      expect((await candidates(app, other.cookie)).items[0]?.meetingId).toBe(othersMeeting.id);
    });

    it("受付アプリが見えない（切・運営者だけ）と available は false で空。運営者には出る", async () => {
      await createEvent(app, me.cookie, { name: "自分の会", startsAt: daysLater(-1) });
      await upsertVisibility(database.db, "reception", "off");
      expect(await candidates(app, me.cookie)).toEqual({ available: false, items: [] });
      await upsertVisibility(database.db, "reception", "operator_only");
      expect(await candidates(app, me.cookie)).toEqual({ available: false, items: [] });

      const operatorApp = buildApp(
        database,
        testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }),
      );
      const operator = await loginAs(operatorApp, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
      const operatorEvent = await createEvent(operatorApp, operator.cookie, {
        name: "運営者の会",
        startsAt: daysLater(-1),
      });
      expect(await candidates(operatorApp, operator.cookie)).toMatchObject({
        available: true,
        items: [{ eventId: operatorEvent.id }],
      });
    });

    it("ログインしていなければ 401", async () => {
      expect((await app.request(CANDIDATES)).status).toBe(401);
    });
  });

  describe("交流会から作る（POST /meetings/from-event）", () => {
    it("交流会の名前が会った場の決まりに合わない（長い・空白だけ）ときも、候補と作る窓口が食い違わない", async () => {
      // 交流会の表には名前の長さの CHECK がない（古い行など）。候補に出た会は必ず作れ、空白だけの会は候補にも作る窓口にも出ない
      const long = await createEvent(app, me.cookie, { startsAt: "2025-11-20T16:30:00.000Z" });
      const blank = await createEvent(app, me.cookie, { startsAt: "2025-11-19T16:30:00.000Z" });
      const longName = `${"長".repeat(110)}の会`;
      await database.pool.query("UPDATE event SET name = $1 WHERE id = $2", [longName, long.id]);
      await database.pool.query("UPDATE event SET name = $1 WHERE id = $2", ["　 ", blank.id]);

      const listed = await candidates(app, me.cookie);
      expect(listed.items.map((item) => [item.eventId, item.name])).toEqual([
        [long.id, "長".repeat(100)],
      ]);
      const meeting = await meetingFromEvent(app, me.cookie, long.id);
      expect(meeting.name).toBe("長".repeat(100));
      expect((await fromEvent(app, me.cookie, blank.id)).status).toBe(404);
    });

    it("201 で、交流会の名前の写しと日本時間の日付の会った場ができる（作り方は event）", async () => {
      const event = await createEvent(app, me.cookie, {
        name: "11月の交流会",
        startsAt: "2025-11-20T16:30:00.000Z",
      });
      const response = await fromEvent(app, me.cookie, event.id);
      expect(response.status).toBe(201);
      const meeting = (await response.json()) as Meeting;
      expect(meeting).toMatchObject({
        name: "11月の交流会",
        metOn: "2025-11-21",
        noteCount: 0,
        notes: [],
      });
      expect(await meetingRows(me.account.id)).toEqual([
        { id: meeting.id, source: "event", event_id: event.id, name: "11月の交流会" },
      ]);
    });

    it("2回目は作らずに 200 で前の会った場。同時に2回送っても1つだけできる", async () => {
      const event = await createEvent(app, me.cookie, {
        name: "自分の会",
        startsAt: daysLater(-1),
      });
      const first = await meetingFromEvent(app, me.cookie, event.id);
      const again = await fromEvent(app, me.cookie, event.id);
      expect(again.status).toBe(200);
      expect(((await again.json()) as Meeting).id).toBe(first.id);

      const raced = await createEvent(app, me.cookie, {
        name: "同時の会",
        startsAt: daysLater(-1),
      });
      const responses = await Promise.all([
        fromEvent(app, me.cookie, raced.id),
        fromEvent(app, me.cookie, raced.id),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
      const [a, b] = (await Promise.all(responses.map((response) => response.json()))) as Meeting[];
      expect(a?.id).toBe(b?.id);
      expect(await meetingRows(me.account.id)).toHaveLength(2);
    });

    it("同じ名前と日付の、手で書いた会った場とは別に作る", async () => {
      const event = await createEvent(app, me.cookie, {
        name: "11月の交流会",
        startsAt: "2025-11-20T03:00:00.000Z",
      });
      const manual = await createMeeting(app, me.cookie, {
        name: "11月の交流会",
        metOn: "2025-11-20",
      });
      const fromTheEvent = await meetingFromEvent(app, me.cookie, event.id);
      expect(fromTheEvent.id).not.toBe(manual.id);
      expect((await meetingRows(me.account.id)).map((row) => row.source)).toEqual([
        "manual",
        "event",
      ]);
    });

    it("作った会った場を消すと、もう一度選んだときに新しく作る", async () => {
      const event = await createEvent(app, me.cookie, {
        name: "自分の会",
        startsAt: daysLater(-1),
      });
      const first = await meetingFromEvent(app, me.cookie, event.id);
      expect((await call(app, me.cookie, `${PERSON_MEETINGS}/${first.id}`, "DELETE")).status).toBe(
        204,
      );
      expect((await candidates(app, me.cookie)).items[0]?.meetingId).toBeNull();
      const second = await meetingFromEvent(app, me.cookie, event.id);
      expect(second.id).not.toBe(first.id);
    });

    it("選べない会（ほかの人の会）・ない会・今日より後の会・受付アプリが見えないときは 404 PERSON_NOT_FOUND で、作らない", async () => {
      const others = await createEvent(app, other.cookie, {
        name: "ほかの人の会",
        startsAt: daysLater(-1),
      });
      const future = await createEvent(app, me.cookie, {
        name: "来週の会",
        startsAt: daysLater(7),
      });
      const mine = await createEvent(app, me.cookie, { name: "自分の会", startsAt: daysLater(-1) });
      for (const eventId of [others.id, future.id, "0193a1b2-0000-7000-8000-000000000999"]) {
        const response = await fromEvent(app, me.cookie, eventId);
        expect(response.status).toBe(404);
        expect(await errorCode(response)).toBe("PERSON_NOT_FOUND");
      }
      await upsertVisibility(database.db, "reception", "off");
      const hidden = await fromEvent(app, me.cookie, mine.id);
      expect(hidden.status).toBe(404);
      expect(await errorCode(hidden)).toBe("PERSON_NOT_FOUND");
      expect(await meetingRows(me.account.id)).toEqual([]);
    });

    it("形の違う eventId・知らない欄は 400 で、作らない", async () => {
      const bad = await fromEvent(app, me.cookie, "abc");
      expect(bad.status).toBe(400);
      expect(await errorCode(bad)).toBe("INVALID_INPUT");
      const mine = await createEvent(app, me.cookie, { name: "自分の会", startsAt: daysLater(-1) });
      const extra = await call(app, me.cookie, FROM_EVENT, "POST", {
        eventId: mine.id,
        name: "勝手な名前",
      });
      expect(extra.status).toBe(400);
      expect(await meetingRows(me.account.id)).toEqual([]);
    });

    it("ログインしていなければ 401", async () => {
      const response = await app.request(
        FROM_EVENT,
        jsonRequest("POST", { eventId: crypto.randomUUID() }),
      );
      expect(response.status).toBe(401);
    });
  });

  describe("交流会から作った会った場を、手で書いたものと同じに使う", () => {
    it("人を足す・前の人を付ける・会った場の名前で探す・書き足しの見出し・CSV の会った場の列", async () => {
      const event = await createEvent(app, me.cookie, {
        name: "秋の交流会",
        startsAt: "2025-11-20T16:30:00.000Z",
      });
      const meeting = await meetingFromEvent(app, me.cookie, event.id);
      const first = await createNote(app, me.cookie, {
        fullName: "鈴木 花子",
        meetingId: meeting.id,
      });
      const second = await createNote(app, me.cookie, {
        fullName: "佐藤 次郎",
        meetingId: meeting.id,
      });
      const earlier = await createNote(app, me.cookie, { fullName: "田中 太郎" });
      const attached = await call(
        app,
        me.cookie,
        `${PERSON_NOTES}/${earlier.id}/meetings/${meeting.id}`,
        "PUT",
      );
      expect(attached.status).toBe(200);

      const read = (await (
        await call(app, me.cookie, `${PERSON_MEETINGS}/${meeting.id}`)
      ).json()) as Meeting;
      expect(read.noteCount).toBe(3);
      expect(read.notes.map((note) => note.id).sort()).toEqual(
        [first.id, second.id, earlier.id].sort(),
      );

      const found = (await (
        await call(app, me.cookie, `${PERSON_NOTES}/search`, "POST", { query: "秋の交流会" })
      ).json()) as SearchResult;
      expect(found.items.map((item) => item.note.id).sort()).toEqual(
        [first.id, second.id, earlier.id].sort(),
      );

      const appended = (await (
        await call(app, me.cookie, `${PERSON_NOTES}/${first.id}/appends`, "POST", {
          appendId: crypto.randomUUID(),
          text: "転職の話",
          meetingId: meeting.id,
        })
      ).json()) as Note;
      expect(appended.talk).toBe(`── ${jstDate(new Date())} 秋の交流会（2025-11-21）──\n転職の話`);

      const csv = await (await call(app, me.cookie, `${PERSON_API}/export`)).text();
      expect(csv).toContain("秋の交流会（2025-11-21）");
    });
  });

  describe("交流会が直る・消える・選べなくなっても残る", () => {
    it("交流会の名前と日付を直しても、会った場は作ったときの写しのまま", async () => {
      const event = await createEvent(app, me.cookie, {
        name: "前の名前の会",
        startsAt: "2025-11-20T16:30:00.000Z",
      });
      const meeting = await meetingFromEvent(app, me.cookie, event.id);
      await updateEvent(app, me.cookie, event.id, {
        name: "新しい名前の会",
        startsAt: "2025-10-01T03:00:00.000Z",
      });
      const read = (await (
        await call(app, me.cookie, `${PERSON_MEETINGS}/${meeting.id}`)
      ).json()) as Meeting;
      expect(read).toMatchObject({ name: "前の名前の会", metOn: "2025-11-21" });
      // 候補には今の名前が出て、作った会った場を指す
      expect((await candidates(app, me.cookie)).items).toEqual([
        { eventId: event.id, name: "新しい名前の会", metOn: "2025-10-01", meetingId: meeting.id },
      ]);
      // もう一度選んでも、写しは直さずに前の会った場を開く
      const again = await fromEvent(app, me.cookie, event.id);
      expect(again.status).toBe(200);
      expect((await again.json()) as Meeting).toMatchObject({
        id: meeting.id,
        name: "前の名前の会",
      });
    });

    it("交流会が消えると交流会を指す欄だけが空になり、会った場と付いた人は残る。候補からは消える", async () => {
      const event = await createEvent(app, me.cookie, {
        name: "消える会",
        startsAt: "2025-11-20T16:30:00.000Z",
      });
      const meeting = await meetingFromEvent(app, me.cookie, event.id);
      const note = await createNote(app, me.cookie, { meetingId: meeting.id });
      await database.pool.query("DELETE FROM event WHERE id = $1", [event.id]);

      expect(await meetingRows(me.account.id)).toEqual([
        { id: meeting.id, source: "event", event_id: null, name: "消える会" },
      ]);
      const read = (await (
        await call(app, me.cookie, `${PERSON_MEETINGS}/${meeting.id}`)
      ).json()) as Meeting;
      expect(read).toMatchObject({ name: "消える会", metOn: "2025-11-21", noteCount: 1 });
      expect(read.notes.map((item) => item.id)).toEqual([note.id]);
      expect(await candidates(app, me.cookie)).toEqual({ available: true, items: [] });
      const list = (await (await call(app, me.cookie, PERSON_MEETINGS)).json()) as {
        items: { id: string }[];
      };
      expect(list.items.map((item) => item.id)).toEqual([meeting.id]);
    });

    it("受付係から外れても、作った会った場は残る（候補からは消える）", async () => {
      const eventId = await staffedEvent("受付係の会", daysLater(-1));
      const meeting = await meetingFromEvent(app, me.cookie, eventId);
      const removed = await call(
        app,
        other.cookie,
        `/api/v1/events/${eventId}/staff/${me.account.id}`,
        "DELETE",
      );
      expect(removed.status).toBe(204);
      expect(await candidateIds(app, me.cookie)).toEqual([]);
      expect((await call(app, me.cookie, `${PERSON_MEETINGS}/${meeting.id}`)).status).toBe(200);
      expect((await fromEvent(app, me.cookie, eventId)).status).toBe(404);
    });
  });
});
