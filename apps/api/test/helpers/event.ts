// テストの手伝い：交流会を作り、ログインした要求を送る（event と、reception・survey のテストも使う）。
import { jsonRequest } from "./app.ts";
import type { TestApp } from "./app.ts";
import type { CurrentAccountView } from "@workspace/contracts/account";
import { loginAs, withCookie } from "./account.ts";

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 交流会の入力の見本（日時は1週間あと。招待のリンクの期限が切れていないもの）。 */
export const SAMPLE_EVENT = {
  name: "11月の交流会",
  startsAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
  venue: "渋谷の会場",
  fee: 1000,
};

/** 交流会の答え（テストで読む欄）。 */
export type EventBody = {
  id: string;
  name: string;
  startsAt: string;
  venue: string;
  fee: number;
  googleFormUrl: string | null;
  lineGroupUrl: string | null;
  surveyOpen: boolean;
  myRole: string;
};

/** エラーの本文（使う所だけ）。 */
export type ErrorBody = {
  error: { code: string; message: string; fields?: { path: string; message: string }[] };
};

/**
 * 主催者のクッキーで交流会を作る。
 * @param app 組み立てた API
 * @param cookie 主催者のクッキー
 * @param input 入力（足りない欄は見本）
 * @returns 作った交流会
 * @throws {Error} 作れなかったとき
 */
export async function createEvent(
  app: TestApp,
  cookie: string,
  input: Record<string, unknown> = {},
): Promise<EventBody> {
  const response = await app.request(
    "/api/v1/events",
    withCookie(cookie, jsonRequest("POST", { ...SAMPLE_EVENT, ...input })),
  );
  if (response.status !== 201) throw new Error(`交流会を作れませんでした（${response.status}）。`);
  return (await response.json()) as EventBody;
}

/**
 * ログインした要求を送る。
 * @param app 組み立てた API
 * @param cookie クッキー
 * @param path 道
 * @param method 動き
 * @param body 本文（あれば JSON）
 * @returns 応答
 */
export async function call(
  app: TestApp,
  cookie: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  const init = body === undefined ? { method } : jsonRequest(method, body);
  return app.request(path, withCookie(cookie, init));
}

/**
 * 招待のリンクで、新しい利用者をその交流会の受付係にする（主催者がリンクを作り、受付係が受ける）。
 * @param app 組み立てた API
 * @param organizerCookie 主催者のクッキー
 * @param eventId 交流会の ID（日付が終わっていないもの）
 * @param input 受付係の LINE のユーザー ID と表示名（なければ loginAs の既定）
 * @param input.lineUserId LINE のユーザー ID
 * @param input.displayName 表示名
 * @returns 受付係のクッキーと今の利用者
 * @throws {Error} 受付係にできなかったとき
 */
export async function makeStaff(
  app: TestApp,
  organizerCookie: string,
  eventId: string,
  input: { lineUserId?: string; displayName?: string } = {},
): Promise<{ cookie: string; account: CurrentAccountView }> {
  const invite = await call(app, organizerCookie, `/api/v1/events/${eventId}/staff-invite`, "POST");
  const { token } = (await invite.json()) as { token: string };
  const staff = await loginAs(app, input);
  const accepted = await call(app, staff.cookie, `/api/v1/staff-invites/${token}/accept`, "POST");
  if (accepted.status !== 200) {
    throw new Error(`受付係にできませんでした（${accepted.status}）。`);
  }
  return staff;
}

/**
 * 交流会を組織に入れる・外す（持ち主のクッキーで。event-002）。
 * @param app 組み立てた API
 * @param ownerCookie 持ち主のクッキー
 * @param eventId 交流会の ID
 * @param organizationId 入れる組織（null で外す）
 * @returns 応答
 */
export function placeEvent(
  app: TestApp,
  ownerCookie: string,
  eventId: string,
  organizationId: string | null,
): Promise<Response> {
  return call(app, ownerCookie, `/api/v1/events/${eventId}/organization`, "PUT", {
    organizationId,
  });
}
