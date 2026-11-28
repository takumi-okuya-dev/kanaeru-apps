// テストの手伝い：人物メモのアプリを台帳で「公開」にする・人と会った場を作る（person のテストが使う）。
// 台帳に行がないアプリは「運営者だけ」なので、ふつうの利用者でログインするテストの前に showPersonApp を呼ぶ（truncateAllTables のあと）。
// 名前・話したことはどれも架空のもの。
import { SEARCH_VERSION, normalizeForSearch } from "@workspace/contracts/person";
import type { MeetingSummary, Note } from "@workspace/contracts/person";
import type { Database } from "../../src/kernel/db.ts";
import { personNote } from "../../src/modules/person/schema.ts";
import { upsertVisibility } from "../../src/modules/suite/index.ts";
import type { TestApp } from "./app.ts";
import { call } from "./event.ts";

/** 人物メモの窓口の道の頭。 */
export const PERSON_API = "/api/v1/person";

/** 人の窓口の道の頭。 */
export const PERSON_NOTES = `${PERSON_API}/notes`;

/** 会った場の窓口の道の頭。 */
export const PERSON_MEETINGS = `${PERSON_API}/meetings`;

/**
 * 人物メモのアプリを、だれにでも見えるようにする。
 * @param database DB の接続
 */
export async function showPersonApp(database: Database): Promise<void> {
  await upsertVisibility(database.db, "person", "public");
}

/**
 * 人を足す。
 * @param app 組み立てた API
 * @param cookie 足す人のクッキー
 * @param input 欄（なければフルネームだけの見本。clientRequestId はなければ毎回違う値）
 * @returns 足した人
 * @throws {Error} 足せなかったとき
 */
export async function createNote(
  app: TestApp,
  cookie: string,
  input: Record<string, unknown> = {},
): Promise<Note> {
  const response = await call(app, cookie, PERSON_NOTES, "POST", {
    clientRequestId: crypto.randomUUID(),
    fullName: "田中 太郎",
    ...input,
  });
  if (response.status !== 201) throw new Error(`人を足せませんでした（${response.status}）。`);
  return (await response.json()) as Note;
}

/**
 * 会った場を作る（そろえて同じ名前と日付のものがあれば、前のものが返る）。
 * @param app 組み立てた API
 * @param cookie 作る人のクッキー
 * @param input 名前と日付（なければ見本）
 * @param input.name 名前
 * @param input.metOn 日付
 * @returns 会った場
 * @throws {Error} 作れなかったとき
 */
export async function createMeeting(
  app: TestApp,
  cookie: string,
  input: { name?: string; metOn?: string } = {},
): Promise<MeetingSummary> {
  const response = await call(app, cookie, PERSON_MEETINGS, "POST", {
    name: input.name ?? "11月の AI 勉強会",
    metOn: input.metOn ?? "2026-11-20",
  });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`会った場を作れませんでした（${response.status}）。`);
  }
  return (await response.json()) as MeetingSummary;
}

/**
 * 人を表に直にまとめて足す（一覧の上限を確かめるときだけ。窓口を何百回も呼ばない）。
 * @param database DB の接続
 * @param ownerAccountId 持ち主
 * @param count 足す人数
 */
export async function insertNotesDirectly(
  database: Database,
  ownerAccountId: string,
  count: number,
): Promise<void> {
  const rows = Array.from({ length: count }, (_, index) => {
    const fullName = `見本 ${index + 1}`;
    return {
      ownerAccountId,
      fullName,
      searchText: normalizeForSearch(fullName),
      searchVersion: SEARCH_VERSION,
    };
  });
  await database.db.insert(personNote).values(rows);
}
