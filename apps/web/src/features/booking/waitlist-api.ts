// 定員・キャンセル待ち・打診の窓口の呼び出し（booking-004。型は apps/api/src/client.ts の ModuleRoutes["booking"] から
// import type で読む）。読み書きは lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
import type { CapacityInput } from "@workspace/contracts/booking";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["booking"]>> | undefined;

/**
 * 呼び出しの道具の予約の部分（初めて使うときに作る）。
 * @returns 道具
 */
function booking() {
  client ??= createApiClient<ModuleRoutes["booking"]>();
  return client.api.v1.booking;
}

/**
 * 定員と枠を変える（主催者だけ）。
 * @param eventId 交流会の ID
 * @param input 定員と枠
 * @returns 変えた設定
 */
export function saveCapacity(eventId: string, input: CapacityInput) {
  return request(() =>
    booking().events[":eventId"].capacity.$put({ param: { eventId }, json: input }),
  );
}

/**
 * キャンセル待ちの人に手で打診する（主催者だけ）。
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 * @returns 打診した行
 */
export function offerEntry(eventId: string, entryId: string) {
  return request(() =>
    booking().events[":eventId"].entries[":entryId"].offer.$post({ param: { eventId, entryId } }),
  );
}

/**
 * 申込みに送った知らせ（主催者だけ）。
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 * @returns 送った知らせ
 */
export function fetchNoticeLog(eventId: string, entryId: string) {
  return request(() =>
    booking().events[":eventId"].entries[":entryId"].notices.$get({ param: { eventId, entryId } }),
  );
}

/**
 * 日時や場所の変更を知らせる・知らせずに済ませる（主催者だけ）。
 * @param eventId 交流会の ID
 * @param notify 知らせるか
 * @returns 済ませたあとの設定
 */
export function resolveChange(eventId: string, notify: boolean) {
  return request(() =>
    booking().events[":eventId"]["change-notice"].$post({ param: { eventId }, json: { notify } }),
  );
}

/**
 * 予約を中止する（主催者だけ）。
 * @param eventId 交流会の ID
 * @returns 中止したあとの設定
 */
export function cancelBooking(eventId: string) {
  return request(() =>
    booking().events[":eventId"]["cancel-booking"].$post({ param: { eventId } }),
  );
}

/**
 * 自分の申込みの打診に答える（参加する・辞退する）。
 * @param entryId 申込みの ID
 * @param answer 参加する・辞退する
 * @returns 答えたあとの1行
 */
export function respondMyEntry(entryId: string, answer: "accept" | "decline") {
  return request(() =>
    booking().me.entries[":entryId"].respond.$post({ param: { entryId }, json: { answer } }),
  );
}

/**
 * 札で打診に答える（参加する・辞退する）。
 * @param entryToken 札
 * @param answer 参加する・辞退する
 * @returns 答えたあとの札のページ
 */
export function respondEntryToken(entryToken: string, answer: "accept" | "decline") {
  return request(() =>
    booking()["entry-tokens"][":entryToken"].respond.$post({
      param: { entryToken },
      json: { answer },
    }),
  );
}
