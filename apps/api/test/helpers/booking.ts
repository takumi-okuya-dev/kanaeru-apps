// テストの手伝い：交流会の使い方を名簿にし、名簿に取り込む（booking のテストが使う）。名前はどれも架空のもの。
import type { Roster } from "@workspace/contracts/booking";
import type { TestApp } from "./app.ts";
import { call } from "./event.ts";

/**
 * 交流会の窓口の道の頭。
 * @param eventId 交流会の ID
 * @returns 道の頭
 */
export function bookingBase(eventId: string): string {
  return `/api/v1/booking/events/${eventId}`;
}

/**
 * 使い方を「名簿を使う」にする（主催者のクッキーで）。
 * @param app 組み立てた API
 * @param cookie 主催者のクッキー
 * @param eventId 交流会の ID
 * @throws {Error} 変えられなかったとき
 */
export async function useRoster(app: TestApp, cookie: string, eventId: string): Promise<void> {
  const response = await call(app, cookie, `${bookingBase(eventId)}/setting`, "PUT", {
    mode: "roster",
  });
  if (response.status !== 200)
    throw new Error(`使い方を変えられませんでした（${response.status}）。`);
}

/**
 * 名前を名簿に取り込む（主催者のクッキーで）。
 * @param app 組み立てた API
 * @param cookie 主催者のクッキー
 * @param eventId 交流会の ID
 * @param names 名前（上から2行目・3行目…として送る）
 * @param applicationSource 媒体
 * @throws {Error} 取り込めなかったとき
 */
export async function importNames(
  app: TestApp,
  cookie: string,
  eventId: string,
  names: readonly string[],
  applicationSource = "other",
): Promise<void> {
  const response = await call(app, cookie, `${bookingBase(eventId)}/entries/import`, "POST", {
    applicationSource,
    rows: names.map((name, index) => ({ line: index + 2, name })),
  });
  if (response.status !== 200) throw new Error(`取り込めませんでした（${response.status}）。`);
}

/**
 * 名簿を読む。
 * @param app 組み立てた API
 * @param cookie 主催者か受付係のクッキー
 * @param eventId 交流会の ID
 * @returns 名簿
 * @throws {Error} 読めなかったとき
 */
export async function readRoster(app: TestApp, cookie: string, eventId: string): Promise<Roster> {
  const response = await call(app, cookie, `${bookingBase(eventId)}/entries`);
  if (response.status !== 200) throw new Error(`名簿を読めませんでした（${response.status}）。`);
  return (await response.json()) as Roster;
}
