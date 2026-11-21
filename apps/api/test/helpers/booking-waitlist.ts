// テストの手伝い：定員とキャンセル待ち（booking-004）。定員と枠を入れる・申込みの状態と知らせの種類を DB から読む・打診の期限を
// 過去にする・定期の窓口を呼ぶ。名前はどれも架空のもの。
import type { Database } from "../../src/kernel/db.ts";
import type { TestApp } from "./app.ts";
import { jsonRequest } from "./app.ts";
import { bookingBase } from "./booking.ts";
import { call } from "./event.ts";

/** テストの定期の仕事の合言葉（架空）。 */
export const TEST_JOB_SECRET = "test-job-secret-for-booking-waitlist";

/**
 * 定員と枠を入れる（主催者のクッキーで）。
 * @param app 組み立てた API
 * @param cookie 主催者のクッキー
 * @param eventId 交流会の ID
 * @param capacity 定員
 * @param quotas 枠
 * @throws {Error} 入れられなかったとき
 */
export async function setCapacity(
  app: TestApp,
  cookie: string,
  eventId: string,
  capacity: number | null,
  quotas: { applicationSource: string; seats: number; manageUrl: string | null }[] = [],
): Promise<void> {
  const response = await call(app, cookie, `${bookingBase(eventId)}/capacity`, "PUT", {
    capacity,
    quotas,
  });
  if (response.status !== 200)
    throw new Error(`定員を入れられませんでした（${response.status}）。`);
}

/**
 * 申込みの状態を読む。
 * @param database DB
 * @param entryId 申込みの ID
 * @returns 状態
 */
export async function statusOf(database: Database, entryId: string): Promise<string | undefined> {
  const result = await database.pool.query<{ status: string }>(
    "SELECT status FROM booking_entry WHERE id = $1",
    [entryId],
  );
  return result.rows[0]?.status;
}

/**
 * 申込みに記録した知らせの種類（古い順）。
 * @param database DB
 * @param entryId 申込みの ID
 * @returns 種類の並び
 */
export async function noticeKinds(database: Database, entryId: string): Promise<string[]> {
  const result = await database.pool.query<{ kind: string }>(
    "SELECT kind FROM booking_notice WHERE entry_id = $1 ORDER BY created_at, id",
    [entryId],
  );
  return result.rows.map((row) => row.kind);
}

/**
 * 待っている打診の期限を過去にする（期限切れを作る）。
 * @param database DB
 * @param entryId 申込みの ID
 */
export async function expireOffer(database: Database, entryId: string): Promise<void> {
  await database.pool.query(
    "UPDATE booking_offer SET deadline = now() - interval '1 minute' WHERE entry_id = $1 AND status = 'pending'",
    [entryId],
  );
}

/**
 * 待っている打診の数。
 * @param database DB
 * @param entryId 申込みの ID（なければ全部）
 * @returns 数
 */
export async function pendingOffers(database: Database, entryId?: string): Promise<number> {
  const result = await database.pool.query<{ n: string }>(
    entryId
      ? "SELECT count(*) AS n FROM booking_offer WHERE status = 'pending' AND entry_id = $1"
      : "SELECT count(*) AS n FROM booking_offer WHERE status = 'pending'",
    entryId ? [entryId] : [],
  );
  return Number(result.rows[0]?.n);
}

/**
 * 定期の窓口を呼ぶ。
 * @param app 組み立てた API
 * @param secret 合言葉（なければ見出しを付けない）
 * @returns 応答
 */
export function tick(app: TestApp, secret: string | null = TEST_JOB_SECRET): Promise<Response> {
  const init = jsonRequest("POST", {});
  const headers = new Headers(init.headers);
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  return Promise.resolve(app.request("/api/v1/booking/jobs/tick", { ...init, headers }));
}
