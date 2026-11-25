// 自前の申込みページの窓口の呼び出し（booking-003。型は apps/api/src/client.ts の ModuleRoutes["booking"] から import type で読む）。
// 読み書きは lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
import type { ApplyInput, EmailApplyInput, SelfPageInput } from "@workspace/contracts/booking";
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
 * 申込みページ（ログインなしでも読める）。
 * @param eventId 交流会の ID
 * @returns 申込みページ
 */
export function fetchApplyPage(eventId: string) {
  return request(() => booking().events[":eventId"].page.$get({ param: { eventId } }));
}

/**
 * LINE ログインで申し込む。
 * @param eventId 交流会の ID
 * @param input 名前と案内の同意
 * @returns 申込みと申込みページ
 */
export function applyToEvent(eventId: string, input: ApplyInput) {
  return request(() =>
    booking().events[":eventId"].apply.$post({ param: { eventId }, json: input }),
  );
}

/**
 * LINE を使わずに申し込む（確認のメールを送る）。
 * @param eventId 交流会の ID
 * @param input 名前とメールアドレス
 * @returns 受け付けた
 */
export function requestEmailApply(eventId: string, input: EmailApplyInput) {
  return request(() =>
    booking().events[":eventId"]["email-requests"].$post({ param: { eventId }, json: input }),
  );
}

/**
 * 札のページ（読むだけ。確定しない）。
 * @param entryToken 札
 * @returns 札のページ
 */
export function fetchEntryToken(entryToken: string) {
  return request(() => booking()["entry-tokens"][":entryToken"].$get({ param: { entryToken } }));
}

/**
 * 確認の札で申込みを確定する。
 * @param entryToken 札
 * @returns 札のページ
 */
export function confirmEntryToken(entryToken: string) {
  return request(() =>
    booking()["entry-tokens"][":entryToken"].confirm.$post({ param: { entryToken } }),
  );
}

/**
 * 札で申込みを取り消す。
 * @param entryToken 札
 * @returns 札のページ
 */
export function cancelEntryToken(entryToken: string) {
  return request(() =>
    booking()["entry-tokens"][":entryToken"].cancel.$post({ param: { entryToken } }),
  );
}

/**
 * 自分の申込み。
 * @returns 一覧
 */
export function fetchMyEntries() {
  return request(() => booking().me.entries.$get());
}

/**
 * 自分の申込みを取り消す。
 * @param entryId 申込みの ID
 * @returns 取り消したあとの1行
 */
export function cancelMyEntry(entryId: string) {
  return request(() => booking().me.entries[":entryId"].cancel.$post({ param: { entryId } }));
}

/**
 * 部の予定。
 * @returns 部の予定
 */
export function fetchMySchedule() {
  return request(() => booking().me.schedule.$get());
}

/**
 * 案内の同意の一覧。
 * @returns 一覧
 */
export function fetchMyConsents() {
  return request(() => booking().me.consents.$get());
}

/**
 * 案内の同意を外す。
 * @param consentId 同意の ID
 * @returns なし
 */
export function removeMyConsent(consentId: string) {
  return request(() => booking().me.consents[":consentId"].$delete({ param: { consentId } }));
}

/**
 * 連絡のメールアドレスを読む（本人だけ）。
 * @returns メールアドレス
 */
export function fetchMyContact() {
  return request(() => booking().me.contact.$get());
}

/**
 * 連絡のメールアドレスを入れる。
 * @param email メールアドレス
 * @returns メールアドレス
 */
export function saveMyContact(email: string) {
  return request(() => booking().me.contact.$put({ json: { email } }));
}

/**
 * 連絡のメールアドレスを消す。
 * @returns 消した
 */
export function deleteMyContact() {
  return request(() => booking().me.contact.$delete());
}

/**
 * 申込みページの受付と見せる範囲を変える（主催者だけ）。
 * @param eventId 交流会の ID
 * @param input 受付と見せる範囲
 * @returns 変えた設定
 */
export function saveSelfPage(eventId: string, input: SelfPageInput) {
  return request(() =>
    booking().events[":eventId"]["self-page"].$put({ param: { eventId }, json: input }),
  );
}
