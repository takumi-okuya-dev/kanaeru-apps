// テストの手伝い：試験用のログインでセッションを作り、ログインした要求を送る（ほかの領域のテストも使う）。
// 組み立てた API は、テストの設定（vitest.config.ts の TEST_LOGIN_ENABLED=true）で作ったものを渡す。
import type { CurrentAccountView } from "@workspace/contracts/account";
import { TEST_ORIGIN, jsonRequest } from "./app.ts";
import type { TestApp } from "./app.ts";

/** テストの主催者の LINE のユーザー ID（testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }) に渡す）。 */
export const ORGANIZER_LINE_USER_ID_FOR_TEST = `U${"f".repeat(32)}`;

/** loginAs の数（LINE のユーザー ID を毎回変えるため）。 */
let sequence = 0;

/**
 * テストの LINE のユーザー ID を作る（呼ぶたびに違う値）。
 * @returns LINE のユーザー ID（U と16進の32文字）
 */
export function testLineUserId(): string {
  sequence += 1;
  return `U${sequence.toString(16).padStart(32, "0")}`;
}

/**
 * 試験用のログインでセッションを作る。
 * @param app 組み立てた API（TEST_LOGIN_ENABLED が true の設定）
 * @param input LINE のユーザー ID（なければ毎回違う値）と表示名（なければ「試験の利用者」）
 * @param input.lineUserId LINE のユーザー ID
 * @param input.displayName 表示名
 * @returns Cookie の見出しの値と、今の利用者
 * @throws {Error} ログインできなかったとき
 */
export async function loginAs(
  app: TestApp,
  input: { lineUserId?: string; displayName?: string } = {},
): Promise<{ cookie: string; account: CurrentAccountView }> {
  const response = await app.request(
    "/api/v1/auth/test-login",
    jsonRequest("POST", {
      lineUserId: input.lineUserId ?? testLineUserId(),
      displayName: input.displayName ?? "試験の利用者",
    }),
  );
  if (response.status !== 200) {
    throw new Error(`試験用のログインができませんでした（${response.status}）。`);
  }
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0] ?? "";
  return { cookie, account: (await response.json()) as CurrentAccountView };
}

/**
 * 要求の中身に、ログインのクッキーと画面の源の Origin を足す。
 * @param cookie loginAs が返した Cookie の見出しの値
 * @param init 要求の中身（jsonRequest(...) など）
 * @returns 要求の中身
 */
export function withCookie(cookie: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  if (!headers.has("origin")) headers.set("origin", TEST_ORIGIN);
  return { ...init, headers };
}
