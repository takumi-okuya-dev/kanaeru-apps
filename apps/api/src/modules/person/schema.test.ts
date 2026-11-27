// 人物メモの表の結合のテスト（本物の PostgreSQL・specs/person/001-notes/data-model.md）：長さの CHECK と約束の上限が
// 食い違わない・アカウントの URL・作り方の選択肢と交流会・一意（足す送りの ID・交流会・手で書いた会った場）・
// 持ち主の違う人と会った場を結べない・消し方（持ち主・人・会った場・交流会）。
// 窓口はまだないので、表に直に書いて確かめる（pr1。窓口は pr2）。
import "@hono/zod-openapi";
import { randomUUID } from "node:crypto";
import {
  PERSON_MEETING_LIMITS,
  PERSON_MEETING_SOURCES,
  PERSON_NOTE_LIMITS,
} from "@workspace/contracts/person";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createEvent } from "../../../test/helpers/event.ts";

const database = useTestDatabase();

/** PostgreSQL の誤りの code（一意・外部キー・CHECK）。 */
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";
const CHECK = "23514";

/**
 * 命令が、決まった code の誤りで断られることを確かめる。
 * @param run 命令
 * @param code 期待する SQLSTATE
 */
async function expectRejected(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toMatchObject({ code });
}

describe("人物メモの表", () => {
  let app: TestApp;
  let ownerId: string;
  let otherId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    ownerId = (await loginAs(app, { displayName: "使う人" })).account.id;
    otherId = (await loginAs(app, { displayName: "ほかの使う人" })).account.id;
  });

  /**
   * 人のメモを表に直に足す。
   * @param values 列の値（足りない列は見本）
   * @returns 足した行の ID
   */
  async function insertNote(values: Record<string, unknown> = {}): Promise<string> {
    const row: Record<string, unknown> = {
      owner_account_id: ownerId,
      full_name: "田中 太郎",
      search_text: "たなか たろう",
      search_version: 1,
      ...values,
    };
    const columns = Object.keys(row);
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO person_note (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      Object.values(row),
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("行を足せませんでした。");
    return id;
  }

  /**
   * 会った場を表に直に足す。
   * @param values 列の値（足りない列は見本）
   * @returns 足した行の ID
   */
  async function insertMeeting(values: Record<string, unknown> = {}): Promise<string> {
    const row: Record<string, unknown> = {
      owner_account_id: ownerId,
      source: "manual",
      name: "11月の AI 勉強会",
      name_key: "11月の ai 勉強会",
      met_on: "2026-11-20",
      ...values,
    };
    const columns = Object.keys(row);
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO person_meeting (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      Object.values(row),
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("行を足せませんでした。");
    return id;
  }

  /**
   * 人と会った場を結ぶ。
   * @param noteId 人
   * @param meetingId 会った場
   * @param owner 持ち主
   */
  async function link(noteId: string, meetingId: string, owner = ownerId): Promise<void> {
    await database.pool.query(
      "INSERT INTO person_note_meeting (note_id, meeting_id, owner_account_id) VALUES ($1, $2, $3)",
      [noteId, meetingId, owner],
    );
  }

  /**
   * 表の行の数を数える。
   * @param table 表の名前（このテストの中の決まった名前だけ）
   * @returns 行の数
   */
  async function count(
    table: "person_note" | "person_meeting" | "person_note_meeting",
  ): Promise<number> {
    const result = await database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table}`,
    );
    return result.rows[0]?.n ?? 0;
  }

  it("長さの CHECK は約束の上限と同じ（上限ちょうどは入り、1字多いと断る。絵文字も1字）", async () => {
    const cases: [string, number][] = [
      ["full_name", PERSON_NOTE_LIMITS.fullName],
      ["reading", PERSON_NOTE_LIMITS.reading],
      ["line_name", PERSON_NOTE_LIMITS.lineName],
      ["appearance", PERSON_NOTE_LIMITS.appearance],
      ["account_x", PERSON_NOTE_LIMITS.account],
      ["account_connpass", PERSON_NOTE_LIMITS.account],
      ["account_github", PERSON_NOTE_LIMITS.account],
      ["account_linkedin", PERSON_NOTE_LIMITS.account],
      ["account_line", PERSON_NOTE_LIMITS.account],
      ["talk", PERSON_NOTE_LIMITS.talk],
      ["next_topic", PERSON_NOTE_LIMITS.nextTopic],
    ];
    for (const [column, limit] of cases) {
      await insertNote({ [column]: "🍙".repeat(limit) });
      await expectRejected(() => insertNote({ [column]: "🍙".repeat(limit + 1) }), CHECK);
    }
    await expectRejected(() => insertNote({ full_name: "" }), CHECK);
    await insertMeeting({ name: "会".repeat(PERSON_MEETING_LIMITS.name), name_key: "a" });
    await expectRejected(
      () => insertMeeting({ name: "会".repeat(PERSON_MEETING_LIMITS.name + 1), name_key: "b" }),
      CHECK,
    );
    await expectRejected(() => insertMeeting({ name: "", name_key: "c" }), CHECK);
  });

  it("アカウントの URL は http・https で始まるものだけ", async () => {
    await insertNote({ account_url: "https://example.com/taro" });
    await insertNote({ account_url: "http://example.com/taro" });
    for (const bad of [
      "javascript:alert(1)",
      "tel:0312345678",
      "data:text/html,x",
      "example.com",
    ]) {
      await expectRejected(() => insertNote({ account_url: bad }), CHECK);
    }
    await expectRejected(
      () => insertNote({ account_url: `https://${"a".repeat(PERSON_NOTE_LIMITS.account)}` }),
      CHECK,
    );
  });

  it("タグは書いた形とそろえた形の数がそろう（数の上限は置かない）", async () => {
    const many = Array.from({ length: 50 }, (_, i) => `タグ${i}`);
    await insertNote({ tags: many, tag_keys: many });
    await expectRejected(() => insertNote({ tags: ["AI", "Go"], tag_keys: ["ai"] }), CHECK);
  });

  it("会った場の作り方は選択肢だけで、手で書いたものは交流会を指さない", async () => {
    const { cookie } = await loginAs(app, { displayName: "主催" });
    const event = await createEvent(app, cookie);
    for (const source of PERSON_MEETING_SOURCES) {
      await insertMeeting({ source, name_key: `k-${source}` });
    }
    await expectRejected(() => insertMeeting({ source: "other", name_key: "x" }), CHECK);
    await expectRejected(() => insertMeeting({ source: "manual", event_id: event.id }), CHECK);
    await insertMeeting({ source: "event", event_id: event.id, name_key: "ev" });
  });

  it("同じ使う人の同じ「足す送りの ID」は1つだけ（ほかの使う人とはぶつからない）", async () => {
    const requestId = randomUUID();
    await insertNote({ create_request_id: requestId });
    await expectRejected(() => insertNote({ create_request_id: requestId }), UNIQUE);
    await insertNote({ owner_account_id: otherId, create_request_id: requestId });
    await insertNote({ create_request_id: null });
    await insertNote({ create_request_id: null });
  });

  it("会った場の一意：同じ交流会は1つ・手で書いた同じ名前と日付は1つ（ほかの使う人・ほかの日とはぶつからない）", async () => {
    const { cookie } = await loginAs(app, { displayName: "主催" });
    const event = await createEvent(app, cookie);
    await insertMeeting({ source: "event", event_id: event.id, name_key: "ev1" });
    await expectRejected(
      () => insertMeeting({ source: "event", event_id: event.id, name_key: "ev2" }),
      UNIQUE,
    );
    await insertMeeting();
    await expectRejected(() => insertMeeting(), UNIQUE);
    await insertMeeting({ met_on: "2026-11-21" });
    await insertMeeting({ owner_account_id: otherId });
  });

  it("交流会が消えると event_id だけが空になり、手で書いた同じ名前と日付の会った場があってもぶつからない", async () => {
    const { cookie } = await loginAs(app, { displayName: "主催" });
    const event = await createEvent(app, cookie);
    await insertMeeting();
    const fromEvent = await insertMeeting({ source: "event", event_id: event.id });
    await database.pool.query("DELETE FROM event WHERE id = $1", [event.id]);
    const row = await database.pool.query<{ event_id: string | null; name: string }>(
      "SELECT event_id, name FROM person_meeting WHERE id = $1",
      [fromEvent],
    );
    expect(row.rows[0]).toEqual({ event_id: null, name: "11月の AI 勉強会" });
    expect(await count("person_meeting")).toBe(2);
  });

  it("人と会った場の組は1つだけで、持ち主の違う人と会った場は結べない", async () => {
    const note = await insertNote();
    const meeting = await insertMeeting();
    await link(note, meeting);
    await expectRejected(() => link(note, meeting), UNIQUE);
    const othersMeeting = await insertMeeting({ owner_account_id: otherId });
    await expectRejected(() => link(note, othersMeeting), FOREIGN_KEY);
    await expectRejected(() => link(note, othersMeeting, otherId), FOREIGN_KEY);
  });

  it("人を消すと組だけが消えて会った場は残り、会った場を消すと組だけが消えて人は残る", async () => {
    const first = await insertNote();
    const second = await insertNote();
    const meeting = await insertMeeting();
    await link(first, meeting);
    await link(second, meeting);
    await database.pool.query("DELETE FROM person_note WHERE id = $1", [first]);
    expect(await count("person_note_meeting")).toBe(1);
    expect(await count("person_meeting")).toBe(1);
    await database.pool.query("DELETE FROM person_meeting WHERE id = $1", [meeting]);
    expect(await count("person_note_meeting")).toBe(0);
    expect(await count("person_note")).toBe(1);
  });

  it("持ち主を消すと、その人のメモ・会った場・組がすべて消え、ほかの使う人の行は残る", async () => {
    const note = await insertNote();
    const meeting = await insertMeeting();
    await link(note, meeting);
    const othersNote = await insertNote({ owner_account_id: otherId });
    await database.pool.query("DELETE FROM account WHERE id = $1", [ownerId]);
    expect(await count("person_note")).toBe(1);
    expect(await count("person_meeting")).toBe(0);
    expect(await count("person_note_meeting")).toBe(0);
    const left = await database.pool.query<{ id: string }>("SELECT id FROM person_note");
    expect(left.rows[0]?.id).toBe(othersNote);
  });
});
