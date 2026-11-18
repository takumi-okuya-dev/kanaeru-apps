// テストの手伝い：チェックインを作る（reception と、survey のテストも使う）。
import type { CheckinView, MyCheckinResult } from "@workspace/contracts/reception";
import type { TestApp } from "./app.ts";
import { call } from "./event.ts";

/** チェックインの入力の見本。 */
export const SAMPLE_CHECKIN = {
  name: "佐藤 太郎",
  applicationSource: "connpass",
  referral: "friend",
  paymentMethod: "paypay",
} as const;

/**
 * 自分でチェックインする（参加者のクッキーで）。
 * @param app 組み立てた API
 * @param cookie 参加者のクッキー（loginAs の cookie）
 * @param eventId 交流会の ID
 * @param input 入力（足りない欄は見本）
 * @returns チェックインした結果
 * @throws {Error} チェックインできなかったとき
 */
export async function checkIn(
  app: TestApp,
  cookie: string,
  eventId: string,
  input: Record<string, unknown> = {},
): Promise<MyCheckinResult> {
  const response = await call(app, cookie, `/api/v1/events/${eventId}/checkins/me`, "POST", {
    ...SAMPLE_CHECKIN,
    ...input,
  });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`チェックインできませんでした（${response.status}）。`);
  }
  return (await response.json()) as MyCheckinResult;
}

/**
 * 手でチェックインする（主催者か受付係のクッキーで）。
 * @param app 組み立てた API
 * @param cookie 主催者か受付係のクッキー
 * @param eventId 交流会の ID
 * @param input 入力（足りない欄は見本）
 * @returns 一覧画面の行
 * @throws {Error} チェックインできなかったとき
 */
export async function manualCheckIn(
  app: TestApp,
  cookie: string,
  eventId: string,
  input: Record<string, unknown> = {},
): Promise<CheckinView> {
  const response = await call(app, cookie, `/api/v1/events/${eventId}/checkins`, "POST", {
    ...SAMPLE_CHECKIN,
    ...input,
  });
  if (response.status !== 201) {
    throw new Error(`手でチェックインできませんでした（${response.status}）。`);
  }
  return (await response.json()) as CheckinView;
}
