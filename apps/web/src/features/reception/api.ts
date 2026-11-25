// 受付の窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["reception"] から import type で読む）。
// 読み書きは lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
// 参加者のデータを消すときだけ、account の窓口（DELETE /api/v1/accounts/{accountId}）を呼ぶ（FR-16・AD-7）。
import type { CheckinInput } from "@workspace/contracts/reception";
import { RECEPTION_ERRORS } from "@workspace/contracts/reception";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { ApiError, createApiClient, request } from "../../lib/api.ts";
import { fetchDownload } from "../../lib/download.ts";
import type { DownloadedFile } from "../../lib/download.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["reception"]>> | undefined;
let accountClient: ReturnType<typeof createApiClient<ModuleRoutes["account"]>> | undefined;

/**
 * 受付の窓口の呼び出しの道具（今の画面の源の /api を呼ぶ）。
 * @returns 呼び出しの道具
 */
function api() {
  client ??= createApiClient<ModuleRoutes["reception"]>();
  return client;
}

/**
 * 交流会のチェックインの道の呼び出し。
 * @param eventId 交流会の ID
 * @returns 呼び出しの道具のチェックインの部分と、道の値
 */
function checkinsApi(eventId: string) {
  return { endpoint: api().api.v1.events[":eventId"].checkins, param: { eventId } };
}

/**
 * その交流会の自分のチェックインと、名前・知ったきっかけの初期値。
 * @param eventId 交流会の ID
 * @returns 自分のチェックイン（まだなら null）と初期値
 */
export function fetchMyCheckin(eventId: string) {
  const { endpoint, param } = checkinsApi(eventId);
  return request(() => endpoint.me.$get({ param }));
}

/**
 * 自分でチェックインする（すでにあれば、記録を増やさずにそれを返す）。
 * @param eventId 交流会の ID
 * @param input 入力
 * @returns チェックインと、前からチェックイン済みだったか
 */
export function checkInMine(eventId: string, input: CheckinInput) {
  const { endpoint, param } = checkinsApi(eventId);
  return request(() => endpoint.me.$post({ param, json: input }));
}

/**
 * 交流会のチェックイン（主催者・受付係。新しい順）。
 * @param eventId 交流会の ID
 * @returns チェックインの一覧
 */
export function fetchCheckins(eventId: string) {
  const { endpoint, param } = checkinsApi(eventId);
  return request(() => endpoint.$get({ param }));
}

/**
 * 手でチェックインする（主催者・受付係）。
 * @param eventId 交流会の ID
 * @param input 入力
 * @returns 一覧画面の行
 */
export function createManualCheckin(eventId: string, input: CheckinInput) {
  const { endpoint, param } = checkinsApi(eventId);
  return request(() => endpoint.$post({ param, json: input }));
}

/**
 * チェックインを直す（主催者・受付係）。
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @param input 入力
 * @returns 直した行
 */
export function updateCheckin(eventId: string, checkinId: string, input: CheckinInput) {
  return request(() =>
    api().api.v1.events[":eventId"].checkins[":checkinId"].$put({
      param: { eventId, checkinId },
      json: input,
    }),
  );
}

/**
 * チェックインを取り消す（主催者・受付係。行を消す）。ほかの端末で先に取り消されていた（404 CHECKIN_NOT_FOUND）ときは、
 * 望んだとおりもうないので、取り消せたものとして扱う（呼ぶ側は枠を閉じて一覧を読み直す）。
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @returns 終わり
 * @throws {ApiError} CHECKIN_NOT_FOUND のほかの API のエラー（交流会がない・権限がないなど）
 * @throws {NetworkError} 通信が届かなかったとき
 */
export async function deleteCheckin(eventId: string, checkinId: string): Promise<void> {
  try {
    await request(() =>
      api().api.v1.events[":eventId"].checkins[":checkinId"].$delete({
        param: { eventId, checkinId },
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === RECEPTION_ERRORS.CHECKIN_NOT_FOUND.code) return;
    throw error;
  }
}

/**
 * 支払い方法ごとの合計（主催者・受付係）。
 * @param eventId 交流会の ID
 * @returns 合計
 */
export function fetchTotals(eventId: string) {
  const { endpoint, param } = checkinsApi(eventId);
  return request(() => endpoint.totals.$get({ param }));
}

/**
 * 申し込みの媒体と知ったきっかけの内訳（主催者だけ）。
 * @param eventId 交流会の ID
 * @returns 内訳
 */
export function fetchBreakdown(eventId: string) {
  const { endpoint, param } = checkinsApi(eventId);
  return request(() => endpoint.breakdown.$get({ param }));
}

/**
 * 参加者の CSV を受け取る（主催者だけ）。エラーは ApiError・NetworkError で投げる。
 * @param eventId 交流会の ID
 * @returns 中身とファイルの名前
 * @throws {ApiError} API がエラーを返したとき
 * @throws {NetworkError} 通信が届かなかったとき
 */
export function downloadParticipantsCsv(eventId: string): Promise<DownloadedFile> {
  const { endpoint, param } = checkinsApi(eventId);
  return fetchDownload(() => endpoint.export.$get({ param }), "participants.csv");
}

/**
 * 参加者のアカウントを消す（主催者だけ。account の窓口。その人のチェックイン・回答も消える）。
 * @param accountId account の ID
 * @returns 終わり
 */
export function deleteParticipantAccount(accountId: string) {
  accountClient ??= createApiClient<ModuleRoutes["account"]>();
  const accounts = accountClient;
  return request(() => accounts.api.v1.accounts[":accountId"].$delete({ param: { accountId } }));
}
