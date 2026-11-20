// テストの手伝い：自前の申込みページ（booking-003）。使い方を自前にして受付を開く・ログインなしの要求・申し込む・確認のメールの札を読む。
// 名前・アドレスはどれも架空のもの。
import type { TestApp } from "./app.ts";
import { TEST_ORIGIN, jsonRequest } from "./app.ts";
import { bookingBase } from "./booking.ts";
import { call } from "./event.ts";

/**
 * 使い方を「自前で申込みを受ける」にし、受付を開く（主催者のクッキーで）。
 * @param app 組み立てた API
 * @param cookie 主催者のクッキー
 * @param eventId 交流会の ID
 * @param options 受付を開くか・見せる範囲（既定は開く・誰でも）
 * @param options.accepting 受付を開くか
 * @param options.visibility 見せる範囲
 * @throws {Error} 変えられなかったとき
 */
export async function openSelfPage(
  app: TestApp,
  cookie: string,
  eventId: string,
  options: { accepting?: boolean; visibility?: "public" | "members" } = {},
): Promise<void> {
  const mode = await call(app, cookie, `${bookingBase(eventId)}/setting`, "PUT", {
    mode: "self_page",
  });
  if (mode.status !== 200) throw new Error(`使い方を変えられませんでした（${mode.status}）。`);
  const page = await call(app, cookie, `${bookingBase(eventId)}/self-page`, "PUT", {
    accepting: options.accepting ?? true,
    visibility: options.visibility ?? "public",
  });
  if (page.status !== 200) throw new Error(`受付を開けませんでした（${page.status}）。`);
}

/**
 * ログインしていない要求を送る（画面の源の Origin つき）。
 * @param app 組み立てた API
 * @param path 道
 * @param method 動き
 * @param body 本文（あれば JSON）
 * @returns 応答
 */
export function anonymous(
  app: TestApp,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  const init = body === undefined ? { method } : jsonRequest(method, body);
  const headers = new Headers(init.headers);
  headers.set("origin", TEST_ORIGIN);
  return Promise.resolve(app.request(path, { ...init, headers }));
}

/**
 * LINE ログインで申し込む（参加者のクッキーで）。
 * @param app 組み立てた API
 * @param cookie 参加者のクッキー
 * @param eventId 交流会の ID
 * @param body 名前と案内の同意
 * @returns 応答
 */
export function apply(
  app: TestApp,
  cookie: string,
  eventId: string,
  body: { name: string; consent?: boolean } = { name: "中村 さき" },
): Promise<Response> {
  return call(app, cookie, `${bookingBase(eventId)}/apply`, "POST", body);
}

/**
 * 文の中の札のページのリンクから札を取り出す。
 * @param text 本文
 * @returns 札
 * @throws {Error} リンクがないとき
 */
export function entryTokenOf(text: string): string {
  const match = /\/e\/[0-9a-f-]+\/entry\/([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error("札のページのリンクがありません。");
  return match[1];
}
