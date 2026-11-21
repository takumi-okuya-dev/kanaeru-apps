// 予約の窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["booking"] から import type で読む）。
// 読み書きは lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。書き出しは lib/download.ts。
import type {
  BookingMode,
  MatchInput,
  RosterEntryInput,
  RosterImportInput,
  RosterMergeInput,
} from "@workspace/contracts/booking";
import type { CheckinInput } from "@workspace/contracts/reception";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";
import { fetchDownload } from "../../lib/download.ts";
import type { DownloadedFile } from "../../lib/download.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["booking"]>> | undefined;

/**
 * 交流会の予約の窓口の呼び出し（道の値つき）。
 * @param eventId 交流会の ID
 * @returns 呼び出しの道具の交流会の部分と、道の値
 */
function eventApi(eventId: string) {
  client ??= createApiClient<ModuleRoutes["booking"]>();
  return { endpoint: client.api.v1.booking.events[":eventId"], param: { eventId } };
}

/**
 * 交流会の使い方（主催者・受付係）。
 * @param eventId 交流会の ID
 * @returns 使い方と名簿の行の数
 */
export function fetchSetting(eventId: string) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.setting.$get({ param }));
}

/**
 * 交流会の使い方を変える（主催者だけ）。
 * @param eventId 交流会の ID
 * @param mode 使い方
 * @returns 変えた使い方
 */
export function saveSetting(eventId: string, mode: BookingMode) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.setting.$put({ param, json: { mode } }));
}

/**
 * 名簿（主催者・受付係）。
 * @param eventId 交流会の ID
 * @returns 名簿
 */
export function fetchRoster(eventId: string) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.entries.$get({ param }));
}

/**
 * 名簿に1人足す（主催者・受付係）。
 * @param eventId 交流会の ID
 * @param input 名前・媒体・メモ
 * @returns 足した行
 */
export function addEntry(eventId: string, input: RosterEntryInput) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.entries.$post({ param, json: input }));
}

/**
 * 名簿の行を取り消す・戻す（主催者だけ）。
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 * @param status 状態
 * @returns 直した行
 */
export function setEntryStatus(
  eventId: string,
  entryId: string,
  status: "confirmed" | "cancelled",
) {
  const { endpoint } = eventApi(eventId);
  return request(() =>
    endpoint.entries[":entryId"].status.$put({ param: { eventId, entryId }, json: { status } }),
  );
}

/**
 * 同じ名前の2つの行をまとめる（主催者だけ）。
 * @param eventId 交流会の ID
 * @param input 残す行とまとめる行
 * @returns 残した行
 */
export function mergeEntries(eventId: string, input: RosterMergeInput) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.entries.merge.$post({ param, json: input }));
}

/**
 * 取り込む前の見積もり（主催者だけ。書かない）。
 * @param eventId 交流会の ID
 * @param input 媒体・行・列の対応
 * @returns 行ごとの結果と人数
 */
export function previewImport(eventId: string, input: RosterImportInput) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.entries.import.preview.$post({ param, json: input }));
}

/**
 * 名簿に取り込む（主催者だけ）。
 * @param eventId 交流会の ID
 * @param input 媒体・行・列の対応
 * @returns 入った・すでにある・名前が空の数
 */
export function runImport(eventId: string, input: RosterImportInput) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.entries.import.$post({ param, json: input }));
}

/**
 * 交流会の持ち主が覚えた CSV の列の対応（主催者だけ）。
 * @param eventId 交流会の ID
 * @returns 列の対応
 */
export function fetchImportMappings(eventId: string) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint["import-mappings"].$get({ param }));
}

/**
 * 名簿の CSV を受け取る（主催者だけ）。
 * @param eventId 交流会の ID
 * @returns 中身とファイルの名前
 */
export function downloadRosterCsv(eventId: string): Promise<DownloadedFile> {
  const { endpoint, param } = eventApi(eventId);
  return fetchDownload(() => endpoint.entries.export.$get({ param }), "roster.csv");
}

/**
 * 受付係の「名簿に当てる」（主催者・受付係）。
 * @param eventId 交流会の ID
 * @returns 受付係の画面
 */
export function fetchMatches(eventId: string) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.matches.$get({ param }));
}

/**
 * チェックインを名簿の行に当てる。
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @param input 行
 * @returns 受付係の画面
 */
export function matchCheckin(eventId: string, checkinId: string, input: MatchInput) {
  const { endpoint } = eventApi(eventId);
  return request(() =>
    endpoint.checkins[":checkinId"].match.$post({ param: { eventId, checkinId }, json: input }),
  );
}

/**
 * 候補を「ちがう人」にする。
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @param input 行
 * @returns 受付係の画面
 */
export function dismissCandidate(eventId: string, checkinId: string, input: MatchInput) {
  const { endpoint } = eventApi(eventId);
  return request(() =>
    endpoint.checkins[":checkinId"].dismiss.$post({ param: { eventId, checkinId }, json: input }),
  );
}

/**
 * 当たらないチェックインを飛び入りの行にする。
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @returns 受付係の画面
 */
export function walkInFromCheckin(eventId: string, checkinId: string) {
  const { endpoint } = eventApi(eventId);
  return request(() =>
    endpoint.checkins[":checkinId"]["walk-in"].$post({ param: { eventId, checkinId } }),
  );
}

/**
 * 名簿から選んで手でチェックインする。
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 * @param input チェックインの入力
 * @returns 受付係の画面
 */
export function checkInEntry(eventId: string, entryId: string, input: CheckinInput) {
  const { endpoint } = eventApi(eventId);
  return request(() =>
    endpoint.entries[":entryId"].checkin.$post({ param: { eventId, entryId }, json: input }),
  );
}

/**
 * 名簿にいない人を飛び入りとして手でチェックインする。
 * @param eventId 交流会の ID
 * @param input チェックインの入力
 * @returns 受付係の画面
 */
export function walkIn(eventId: string, input: CheckinInput) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint["walk-ins"].$post({ param, json: input }));
}
