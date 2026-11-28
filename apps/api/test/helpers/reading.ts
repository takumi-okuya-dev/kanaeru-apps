// テストの手伝い：読書記録のアプリを台帳で「公開」にする・本を足す・マーカーを取りこむ（reading のテストが使う）。
// 台帳に行がないアプリは「運営者だけ」なので、ふつうの利用者でログインするテストの前に showReadingApp を呼ぶ（truncateAllTables のあと）。
// 書名・マーカーの文はどれも架空のもの。
import type { Book, MarkerImportResult } from "@workspace/contracts/reading";
import type { Database } from "../../src/kernel/db.ts";
import { upsertVisibility } from "../../src/modules/suite/index.ts";
import type { TestApp } from "./app.ts";
import { call } from "./event.ts";

/** 読書記録の窓口の道の頭。 */
export const READING_API = "/api/v1/reading";

/** 本の窓口の道の頭。 */
export const READING_BOOKS = `${READING_API}/books`;

/**
 * 読書記録のアプリを、だれにでも見えるようにする。
 * @param database DB の接続
 */
export async function showReadingApp(database: Database): Promise<void> {
  await upsertVisibility(database.db, "reading", "public");
}

/**
 * 本を足す。
 * @param app 組み立てた API
 * @param cookie 足す人のクッキー
 * @param input 欄（なければ手で書いた見本の本）
 * @returns 足した本
 * @throws {Error} 足せなかったとき
 */
export async function createBook(
  app: TestApp,
  cookie: string,
  input: Record<string, unknown> = {},
): Promise<Book> {
  const response = await call(app, cookie, READING_BOOKS, "POST", {
    title: "見本の本",
    catalogSource: "manual",
    ...input,
  });
  if (response.status !== 201) throw new Error(`本を足せませんでした（${response.status}）。`);
  return (await response.json()) as Book;
}

/**
 * マーカーの束を取りこむ。
 * @param app 組み立てた API
 * @param cookie 取りこむ人のクッキー
 * @param bookId 本
 * @param markers マーカー
 * @param source どこから取りこんだか
 * @returns 取りこみの応答
 */
export async function importMarkers(
  app: TestApp,
  cookie: string,
  bookId: string,
  markers: Record<string, unknown>[],
  source = "goodnotes",
): Promise<Response> {
  return call(app, cookie, `${READING_BOOKS}/${bookId}/markers/import`, "POST", {
    source,
    markers,
  });
}

/**
 * 取りこみの応答の結果を読む。
 * @param response 取りこみの応答
 * @returns 結果
 * @throws {Error} 200 でないとき
 */
export async function importResult(response: Response): Promise<MarkerImportResult> {
  if (response.status !== 200) throw new Error(`取りこめませんでした（${response.status}）。`);
  return (await response.json()) as MarkerImportResult;
}

/**
 * 見本のマーカー（ページ・並び・文）。
 * @param n 番号（1から）
 * @param extra 足す欄
 * @returns マーカー
 */
export function sampleMarker(
  n: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    text: `見本のマーカーの文 ${n}`,
    page: n,
    position: n * 100_000,
    question: false,
    ...extra,
  };
}
