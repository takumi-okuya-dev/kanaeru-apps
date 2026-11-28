// 人物メモの窓口の結合のテスト（本物の PostgreSQL・specs/person/001-notes/contracts/person.md）：人を足す・読む・直す
// （版の番号）・消す・送り直し（clientRequestId）・書き足す（appendId・見出し・上限）・探す（そろえ方・前後の文・記号・
// 会った場・タグ・並びと上限）・会った場（そろえて同じものは前のもの・付ける・外す・消す・人数）・書き出し（CSV）・退会・
// 持ち主だけ（ほかの人の ID は 404）・アプリが見えないときの 404。名前と話したことは、どれも架空のもの。
import "@hono/zod-openapi";
import { jstDate } from "@workspace/contracts/core";
import { PERSON_RECENT_APPEND_IDS_MAX } from "@workspace/contracts/person";
import type {
  Meeting,
  MeetingList,
  Note,
  NoteList,
  SearchResult,
} from "@workspace/contracts/person";
import { beforeEach, describe, expect, it } from "vitest";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import {
  PERSON_API,
  PERSON_MEETINGS,
  PERSON_NOTES,
  createMeeting,
  createNote,
  insertNotesDirectly,
  showPersonApp,
} from "../../../test/helpers/person.ts";
import { upsertVisibility } from "../suite/index.ts";

const database = useTestDatabase();

/** ログインした人（クッキーと account の ID）。 */
type Login = Awaited<ReturnType<typeof loginAs>>;

/**
 * 応答のエラーの code。
 * @param response 応答
 * @returns code
 */
async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as ErrorBody).error.code;
}

/**
 * 探す。
 * @param app 組み立てた API
 * @param cookie クッキー
 * @param body 探す言葉とタグ
 * @returns 結果
 */
async function search(
  app: TestApp,
  cookie: string,
  body: { query?: string; tag?: string },
): Promise<SearchResult> {
  const response = await call(app, cookie, `${PERSON_NOTES}/search`, "POST", body);
  expect(response.status).toBe(200);
  return (await response.json()) as SearchResult;
}

/**
 * 人を読む。
 * @param app 組み立てた API
 * @param cookie クッキー
 * @param noteId 人の ID
 * @returns 人
 */
async function readNote(app: TestApp, cookie: string, noteId: string): Promise<Note> {
  const response = await call(app, cookie, `${PERSON_NOTES}/${noteId}`);
  expect(response.status).toBe(200);
  return (await response.json()) as Note;
}

/**
 * 持ち主の行の数（3つの表）。
 * @param ownerId 持ち主の account の ID
 * @returns 表ごとの行の数
 */
async function countRows(ownerId: string): Promise<number[]> {
  const counts: number[] = [];
  for (const table of ["person_note", "person_meeting", "person_note_meeting"]) {
    const result = await database.pool.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE owner_account_id = $1`,
      [ownerId],
    );
    counts.push((result.rows[0] as { n: number }).n);
  }
  return counts;
}

describe("人物メモの窓口", () => {
  let app: TestApp;
  let owner: Login;
  let other: Login;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showPersonApp(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "使う人" });
    other = await loginAs(app, { displayName: "ほかの使う人" });
  });

  describe("人を足す・読む・直す・消す", () => {
    it("フルネームだけで足せ、一覧に出る。全部の欄を書いて読み返せる", async () => {
      const simple = await createNote(app, owner.cookie, { fullName: "佐藤 次郎" });
      expect(simple).toMatchObject({
        fullName: "佐藤 次郎",
        reading: null,
        lineName: null,
        appearance: null,
        tags: [],
        talk: "",
        nextTopic: "",
        version: 1,
        meetings: [],
        accounts: { x: null, connpass: null, github: null, linkedin: null, line: null, url: null },
      });
      const full = await createNote(app, owner.cookie, {
        fullName: "田中 太郎",
        reading: "たなか たろう",
        lineName: "たろう🍙",
        appearance: "黒ぶちの眼鏡",
        accounts: { x: "@taro", line: "taro.line", url: "https://example.com/taro", github: "" },
        tags: ["AI", "ａｉ", "Go"],
        talk: "Go の話",
        nextTopic: "転職の話",
      });
      const read = await readNote(app, owner.cookie, full.id);
      expect(read).toMatchObject({
        reading: "たなか たろう",
        lineName: "たろう🍙",
        appearance: "黒ぶちの眼鏡",
        accounts: {
          x: "@taro",
          line: "taro.line",
          url: "https://example.com/taro",
          github: null,
        },
        tags: ["AI", "Go"],
        talk: "Go の話",
        nextTopic: "転職の話",
      });
      const list = (await (await call(app, owner.cookie, PERSON_NOTES)).json()) as NoteList;
      expect(list.truncated).toBe(false);
      expect(list.items.map((item) => item.fullName)).toEqual(["田中 太郎", "佐藤 次郎"]);
      expect(list.items[0]).toMatchObject({ appearance: "黒ぶちの眼鏡" });
    });

    it("足す入力の誤りは 400（フルネームが空・知らない欄・http でない URL）", async () => {
      for (const body of [
        { fullName: " " },
        { fullName: "田中", phone: "0312345678" },
        { fullName: "田中", accounts: { url: "javascript:alert(1)" } },
      ]) {
        const response = await call(app, owner.cookie, PERSON_NOTES, "POST", {
          clientRequestId: crypto.randomUUID(),
          ...body,
        });
        expect(response.status).toBe(400);
        expect(await errorCode(response)).toBe("INVALID_INPUT");
      }
    });

    it("ログインしていなければ 401。ない ID・形の違う ID・ほかの人の ID は 404", async () => {
      expect((await app.request(PERSON_NOTES)).status).toBe(401);
      expect((await app.request(PERSON_MEETINGS)).status).toBe(401);
      expect((await app.request(`${PERSON_API}/export`)).status).toBe(401);
      const missing = await call(app, owner.cookie, `${PERSON_NOTES}/${crypto.randomUUID()}`);
      expect(missing.status).toBe(404);
      expect(await errorCode(missing)).toBe("PERSON_NOT_FOUND");
      expect((await call(app, owner.cookie, `${PERSON_NOTES}/abc`)).status).toBe(404);

      const theirs = await createNote(app, other.cookie, { fullName: "ほかの人のメモ" });
      const path = `${PERSON_NOTES}/${theirs.id}`;
      expect((await call(app, owner.cookie, path)).status).toBe(404);
      expect(
        (await call(app, owner.cookie, path, "PATCH", { baseVersion: 1, fullName: "書きかえ" }))
          .status,
      ).toBe(404);
      expect(
        (
          await call(app, owner.cookie, `${path}/appends`, "POST", {
            appendId: crypto.randomUUID(),
            text: "書き足し",
          })
        ).status,
      ).toBe(404);
      expect((await call(app, owner.cookie, path, "DELETE")).status).toBe(404);
      expect((await readNote(app, other.cookie, theirs.id)).fullName).toBe("ほかの人のメモ");
    });

    it("同じ clientRequestId の送り直しは二重にならない（200 で前の人）", async () => {
      const clientRequestId = crypto.randomUUID();
      const body = { clientRequestId, fullName: "田中 太郎" };
      const first = await call(app, owner.cookie, PERSON_NOTES, "POST", body);
      expect(first.status).toBe(201);
      const again = await call(app, owner.cookie, PERSON_NOTES, "POST", body);
      expect(again.status).toBe(200);
      expect(((await again.json()) as Note).id).toBe(((await first.json()) as Note).id);
      const list = (await (await call(app, owner.cookie, PERSON_NOTES)).json()) as NoteList;
      expect(list.items).toHaveLength(1);
      // ほかの人が同じ ID を送っても、その人の新しい人になる
      expect((await call(app, other.cookie, PERSON_NOTES, "POST", body)).status).toBe(201);
    });

    it("直すと版が上がり、送った欄だけが変わる。baseVersion が違えば 409", async () => {
      const note = await createNote(app, owner.cookie, {
        reading: "たなか",
        nextTopic: "前の話題",
        talk: "Go の話",
      });
      const response = await call(app, owner.cookie, `${PERSON_NOTES}/${note.id}`, "PATCH", {
        baseVersion: 1,
        fullName: "田中 太郎",
        nextTopic: "新しい話題",
        tags: ["AI"],
      });
      expect(response.status).toBe(200);
      const saved = (await response.json()) as Note;
      expect(saved).toMatchObject({
        version: 2,
        nextTopic: "新しい話題",
        reading: "たなか",
        talk: "Go の話",
        tags: ["AI"],
      });
      const stale = await call(app, owner.cookie, `${PERSON_NOTES}/${note.id}`, "PATCH", {
        baseVersion: 1,
        fullName: "古い版",
      });
      expect(stale.status).toBe(409);
      expect(await errorCode(stale)).toBe("PERSON_VERSION_CONFLICT");
      expect((await readNote(app, owner.cookie, note.id)).fullName).toBe("田中 太郎");
    });

    it("消すと 204 で、読むと 404", async () => {
      const note = await createNote(app, owner.cookie);
      expect((await call(app, owner.cookie, `${PERSON_NOTES}/${note.id}`, "DELETE")).status).toBe(
        204,
      );
      expect((await call(app, owner.cookie, `${PERSON_NOTES}/${note.id}`)).status).toBe(404);
    });

    it("一覧は最後に保存した順で、500人を超えると新しい500人だけと truncated", async () => {
      const first = await createNote(app, owner.cookie, { fullName: "はじめの人" });
      await createNote(app, owner.cookie, { fullName: "つぎの人" });
      await call(app, owner.cookie, `${PERSON_NOTES}/${first.id}`, "PATCH", {
        baseVersion: 1,
        fullName: "はじめの人",
        talk: "直した",
      });
      const list = (await (await call(app, owner.cookie, PERSON_NOTES)).json()) as NoteList;
      expect(list.items.map((item) => item.fullName)).toEqual(["はじめの人", "つぎの人"]);

      await insertNotesDirectly(database, owner.account.id, 500);
      const many = (await (await call(app, owner.cookie, PERSON_NOTES)).json()) as NoteList;
      expect(many.items).toHaveLength(500);
      expect(many.truncated).toBe(true);
    });

    it("台帳で「切」か「運営者だけ」なら、運営者でない人には 404。運営者には見える", async () => {
      await upsertVisibility(database.db, "person", "off");
      expect((await call(app, owner.cookie, PERSON_NOTES)).status).toBe(404);
      await upsertVisibility(database.db, "person", "operator_only");
      expect((await call(app, owner.cookie, PERSON_NOTES)).status).toBe(404);
      const operatorApp = buildApp(
        database,
        testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }),
      );
      const operator = await loginAs(operatorApp, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
      expect((await call(operatorApp, operator.cookie, PERSON_NOTES)).status).toBe(200);
    });
  });

  describe("探す", () => {
    let tanaka: Note;
    let suzuki: Note;
    let sato: Note;

    beforeEach(async () => {
      tanaka = await createNote(app, owner.cookie, {
        fullName: "田中 太郎",
        reading: "たなか たろう",
        talk: "Go のバックエンドを書いている",
        tags: ["AI"],
      });
      suzuki = await createNote(app, owner.cookie, {
        fullName: "鈴木 花子",
        lineName: "はなこ🌸",
        appearance: "赤い眼鏡",
        nextTopic: "100% の話と a_b の話",
      });
      const meeting = await createMeeting(app, owner.cookie, { name: "11月の AI 勉強会" });
      sato = await createNote(app, owner.cookie, {
        fullName: "佐藤 次郎",
        talk: "Rust の話。1000円の会費と axb の話",
        meetingId: meeting.id,
      });
      // ほかの使う人の、同じ言葉を持つ人
      await createNote(app, other.cookie, {
        fullName: "田中 太郎",
        reading: "たなか",
        talk: "Go",
        tags: ["AI"],
      });
    });

    it("「タナカ」でよみの「たなか」が当たる。ほかの人の行は当たらない", async () => {
      const result = await search(app, owner.cookie, { query: "タナカ" });
      expect(result.items.map((item) => item.note.id)).toEqual([tanaka.id]);
      expect(result.items[0]?.matches).toEqual([
        { field: "reading", before: "", hit: "たなか", after: " たろう" },
      ]);
    });

    it("「ｇｏ」で「Go」が当たり、前後の文がもとの文のその所", async () => {
      const result = await search(app, owner.cookie, { query: "ｇｏ" });
      expect(result.items.map((item) => item.note.id)).toEqual([tanaka.id]);
      expect(result.items[0]?.matches).toEqual([
        { field: "talk", before: "", hit: "Go", after: " のバックエンドを書いている" },
      ]);
    });

    it("LINE の名前・見た目の特徴でも当たる", async () => {
      expect(
        (await search(app, owner.cookie, { query: "はなこ" })).items.map((i) => i.note.id),
      ).toEqual([suzuki.id]);
      expect(
        (await search(app, owner.cookie, { query: "眼鏡" })).items[0]?.matches[0],
      ).toMatchObject({ field: "appearance", hit: "眼鏡", before: "赤い" });
    });

    it("「100%」「a_b」は文字としてだけ当たる", async () => {
      expect(
        (await search(app, owner.cookie, { query: "100%" })).items.map((i) => i.note.id),
      ).toEqual([suzuki.id]);
      expect(
        (await search(app, owner.cookie, { query: "a_b" })).items.map((i) => i.note.id),
      ).toEqual([suzuki.id]);
    });

    it("会った場の名前で当たる", async () => {
      const result = await search(app, owner.cookie, { query: "勉強会" });
      expect(result.items.map((item) => item.note.id)).toEqual([sato.id]);
      expect(result.items[0]?.matches).toEqual([
        { field: "meeting", before: "11月の AI ", hit: "勉強会", after: "" },
      ]);
    });

    it("タグで絞れる（そろえて比べる）。言葉と両方なら両方に当たる人だけ", async () => {
      const tagged = await search(app, owner.cookie, { tag: "ａｉ" });
      expect(tagged.items.map((item) => item.note.id)).toEqual([tanaka.id]);
      expect(tagged.items[0]?.matches).toEqual([]);
      expect(
        (await search(app, owner.cookie, { query: "go", tag: "AI" })).items.map((i) => i.note.id),
      ).toEqual([tanaka.id]);
      expect((await search(app, owner.cookie, { query: "rust", tag: "AI" })).items).toEqual([]);
    });

    it("言葉もタグもなければ 400", async () => {
      const response = await call(app, owner.cookie, `${PERSON_NOTES}/search`, "POST", {});
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_INPUT");
    });

    it("結果は最後に保存した順で、100人を超えると新しい100人だけと truncated", async () => {
      const all = await search(app, owner.cookie, { query: "の" });
      expect(all.items.map((item) => item.note.id)).toEqual([sato.id, suzuki.id, tanaka.id]);
      await insertNotesDirectly(database, owner.account.id, 101);
      const many = await search(app, owner.cookie, { query: "見本" });
      expect(many.items).toHaveLength(100);
      expect(many.truncated).toBe(true);
    });
  });

  describe("会った場", () => {
    it("作ると 201。そろえて同じ名前と日付は、作らずに前のもの（200）", async () => {
      const created = await call(app, owner.cookie, PERSON_MEETINGS, "POST", {
        name: "11月の AI 勉強会",
        metOn: "2026-11-20",
      });
      expect(created.status).toBe(201);
      const meeting = (await created.json()) as Meeting;
      expect(meeting).toMatchObject({ name: "11月の AI 勉強会", metOn: "2026-11-20", notes: [] });
      for (const name of ["  11月の AI 勉強会 ", "11月の　ＡＩ   勉強会"]) {
        const again = await call(app, owner.cookie, PERSON_MEETINGS, "POST", {
          name,
          metOn: "2026-11-20",
        });
        expect(again.status).toBe(200);
        expect(((await again.json()) as Meeting).id).toBe(meeting.id);
      }
      const otherDay = await call(app, owner.cookie, PERSON_MEETINGS, "POST", {
        name: "11月の AI 勉強会",
        metOn: "2026-11-21",
      });
      expect(otherDay.status).toBe(201);
      // ほかの使う人は、同じ名前と日付でも自分の会った場を作る
      const theirs = await createMeeting(app, other.cookie, { name: "11月の AI 勉強会" });
      expect(theirs.id).not.toBe(meeting.id);
      expect(
        (await call(app, owner.cookie, PERSON_MEETINGS, "POST", { name: "", metOn: "2026-11-20" }))
          .status,
      ).toBe(400);
    });

    it("足すときに meetingId を付けると組ができ、会った場に人が並ぶ。一覧に人数が出る", async () => {
      const meeting = await createMeeting(app, owner.cookie);
      const first = await createNote(app, owner.cookie, {
        fullName: "田中 太郎",
        meetingId: meeting.id,
      });
      expect(first.meetings.map((item) => item.id)).toEqual([meeting.id]);
      await createNote(app, owner.cookie, { fullName: "鈴木 花子", meetingId: meeting.id });
      const read = (await (
        await call(app, owner.cookie, `${PERSON_MEETINGS}/${meeting.id}`)
      ).json()) as Meeting;
      expect(read.notes.map((note) => note.fullName)).toEqual(["鈴木 花子", "田中 太郎"]);
      expect(read.noteCount).toBe(2);
      await createMeeting(app, owner.cookie, { name: "12月の勉強会", metOn: "2026-12-03" });
      const list = (await (await call(app, owner.cookie, PERSON_MEETINGS)).json()) as MeetingList;
      expect(list.items.map((item) => [item.name, item.noteCount])).toEqual([
        ["12月の勉強会", 0],
        ["11月の AI 勉強会", 2],
      ]);
    });

    it("付ける窓口は、付いていても同じ答え。付ける・外すと人の updatedAt が新しくなる", async () => {
      const meeting = await createMeeting(app, owner.cookie);
      const note = await createNote(app, owner.cookie);
      const path = `${PERSON_NOTES}/${note.id}/meetings/${meeting.id}`;
      const attached = await call(app, owner.cookie, path, "PUT");
      expect(attached.status).toBe(200);
      const once = (await attached.json()) as Note;
      expect(once.meetings.map((item) => item.id)).toEqual([meeting.id]);
      expect(Date.parse(once.updatedAt)).toBeGreaterThan(Date.parse(note.updatedAt));
      const twice = (await (await call(app, owner.cookie, path, "PUT")).json()) as Note;
      expect(twice.meetings).toHaveLength(1);
      const detached = await call(app, owner.cookie, path, "DELETE");
      expect(detached.status).toBe(200);
      const after = (await detached.json()) as Note;
      expect(after.meetings).toEqual([]);
      expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(twice.updatedAt));
    });

    it("ほかの人の会った場は、付けても・足すときに選んでも・開いても 404", async () => {
      const theirs = await createMeeting(app, other.cookie);
      const note = await createNote(app, owner.cookie);
      expect(
        (await call(app, owner.cookie, `${PERSON_NOTES}/${note.id}/meetings/${theirs.id}`, "PUT"))
          .status,
      ).toBe(404);
      const create = await call(app, owner.cookie, PERSON_NOTES, "POST", {
        clientRequestId: crypto.randomUUID(),
        fullName: "鈴木 花子",
        meetingId: theirs.id,
      });
      expect(create.status).toBe(404);
      const list = (await (await call(app, owner.cookie, PERSON_NOTES)).json()) as NoteList;
      expect(list.items).toHaveLength(1);
      expect((await call(app, owner.cookie, `${PERSON_MEETINGS}/${theirs.id}`)).status).toBe(404);
      expect(
        (await call(app, owner.cookie, `${PERSON_MEETINGS}/${theirs.id}`, "DELETE")).status,
      ).toBe(404);
      const theirNote = await createNote(app, other.cookie);
      const mine = await createMeeting(app, owner.cookie);
      expect(
        (
          await call(
            app,
            owner.cookie,
            `${PERSON_NOTES}/${theirNote.id}/meetings/${mine.id}`,
            "PUT",
          )
        ).status,
      ).toBe(404);
    });

    it("会った場を消すと組だけが消え、人は残る", async () => {
      const meeting = await createMeeting(app, owner.cookie);
      const note = await createNote(app, owner.cookie, { meetingId: meeting.id });
      expect(
        (await call(app, owner.cookie, `${PERSON_MEETINGS}/${meeting.id}`, "DELETE")).status,
      ).toBe(204);
      expect((await call(app, owner.cookie, `${PERSON_MEETINGS}/${meeting.id}`)).status).toBe(404);
      expect((await readNote(app, owner.cookie, note.id)).meetings).toEqual([]);
    });
  });

  describe("書き足す", () => {
    it("見出しつきで足され、版が上がる。同じ appendId は書かずに今の値", async () => {
      const note = await createNote(app, owner.cookie, { talk: "Go の話" });
      const appendId = crypto.randomUUID();
      const path = `${PERSON_NOTES}/${note.id}/appends`;
      const response = await call(app, owner.cookie, path, "POST", { appendId, text: "転職の話" });
      expect(response.status).toBe(200);
      const saved = (await response.json()) as Note;
      expect(saved.talk).toBe(`Go の話\n\n── ${jstDate(new Date())} ──\n転職の話`);
      expect(saved.version).toBe(2);
      const again = (await (
        await call(app, owner.cookie, path, "POST", { appendId, text: "転職の話" })
      ).json()) as Note;
      expect(again.talk).toBe(saved.talk);
      expect(again.version).toBe(2);
    });

    it("送り直しの間にほかの端末の書き足しが入っても、送り直しは二重にならない（最近の20個まで見分ける）", async () => {
      const note = await createNote(app, owner.cookie, { talk: "" });
      const path = `${PERSON_NOTES}/${note.id}/appends`;
      const first = crypto.randomUUID();
      await call(app, owner.cookie, path, "POST", { appendId: first, text: "1台目の書き足し" });
      // 2台目の書き足しが、1台目の送り直しより先に届く
      await call(app, owner.cookie, path, "POST", {
        appendId: crypto.randomUUID(),
        text: "2台目の書き足し",
      });
      const retried = (await (
        await call(app, owner.cookie, path, "POST", { appendId: first, text: "1台目の書き足し" })
      ).json()) as Note;
      expect(retried.talk.split("1台目の書き足し")).toHaveLength(2);
      expect(retried.version).toBe(3);

      // 20個より前の ID は覚えていないので、新しい書き足しとして足す
      for (let i = 0; i < PERSON_RECENT_APPEND_IDS_MAX; i += 1) {
        await call(app, owner.cookie, path, "POST", {
          appendId: crypto.randomUUID(),
          text: `${i}`,
        });
      }
      const old = (await (
        await call(app, owner.cookie, path, "POST", { appendId: first, text: "1台目の書き足し" })
      ).json()) as Note;
      expect(old.talk.split("1台目の書き足し")).toHaveLength(3);
    });

    it("会った場を付けると、見出しに名前と日付が入り、組もできる", async () => {
      const meeting = await createMeeting(app, owner.cookie, {
        name: "12月の勉強会",
        metOn: "2026-12-03",
      });
      const note = await createNote(app, owner.cookie);
      const saved = (await (
        await call(app, owner.cookie, `${PERSON_NOTES}/${note.id}/appends`, "POST", {
          appendId: crypto.randomUUID(),
          text: "転職の話",
          meetingId: meeting.id,
        })
      ).json()) as Note;
      expect(saved.talk).toBe(`── ${jstDate(new Date())} 12月の勉強会（2026-12-03）──\n転職の話`);
      expect(saved.meetings.map((item) => item.id)).toEqual([meeting.id]);
    });

    it("書き足すと話したことが20,000字を超えるなら、書かずに 400（fields.talk）", async () => {
      const note = await createNote(app, owner.cookie, { talk: "あ".repeat(19_990) });
      const response = await call(app, owner.cookie, `${PERSON_NOTES}/${note.id}/appends`, "POST", {
        appendId: crypto.randomUUID(),
        text: "転職の話",
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorBody;
      expect(body.error.code).toBe("INVALID_INPUT");
      expect(body.error.fields?.map((field) => field.path)).toEqual(["talk"]);
      const read = await readNote(app, owner.cookie, note.id);
      expect(read.talk).toHaveLength(19_990);
      expect(read.version).toBe(1);
    });
  });

  describe("書き出しと退会", () => {
    it("CSV は BOM つきで、決まった列。式として動かない形で、ほかの人の行は入らない", async () => {
      const meeting = await createMeeting(app, owner.cookie, {
        name: "11月の AI 勉強会",
        metOn: "2026-11-20",
      });
      await createNote(app, owner.cookie, {
        fullName: "田中 太郎",
        reading: "たなか",
        accounts: { x: "@taro", url: "https://example.com" },
        tags: ["AI", "Go"],
        talk: "=1+1",
        nextTopic: "転職の話",
        meetingId: meeting.id,
      });
      await createNote(app, owner.cookie, { fullName: "鈴木 花子" });
      await createNote(app, other.cookie, { fullName: "ほかの人のメモ" });
      const response = await call(app, owner.cookie, `${PERSON_API}/export`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("content-disposition")).toContain(
        `person-notes-${jstDate(new Date())}.csv`,
      );
      const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
        await response.arrayBuffer(),
      );
      expect(text.startsWith("﻿")).toBe(true);
      const lines = text.slice(1).trimEnd().split("\r\n");
      expect(lines[0]).toBe(
        "フルネーム,よみ,LINE の名前,見た目の特徴,X,connpass,GitHub,LinkedIn,LINE ID,URL,タグ,話したこと,次に話したいこと,会った場,最後に保存した日時",
      );
      expect(lines).toHaveLength(3);
      expect(text).not.toContain("ほかの人のメモ");
      const tanaka = lines.find((line) => line.startsWith("田中 太郎"));
      expect(tanaka).toContain(",'=1+1,");
      expect(tanaka).toContain("AI、Go");
      expect(tanaka).toContain("11月の AI 勉強会（2026-11-20）");
      expect(tanaka).toContain("@taro");
    });

    it("退会すると、3つの表のその人の行が消える", async () => {
      const meeting = await createMeeting(app, owner.cookie);
      await createNote(app, owner.cookie, { meetingId: meeting.id });
      expect(await countRows(owner.account.id)).toEqual([1, 1, 1]);
      expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
      expect(await countRows(owner.account.id)).toEqual([0, 0, 0]);
    });
  });
});
