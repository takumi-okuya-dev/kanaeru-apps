// アンケートの窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["survey"] から import type で読む）。
// 読み書きは lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
import type { SurveyAnswerInput, SurveyListQuery } from "@workspace/contracts/survey";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";
import { fetchDownload } from "../../lib/download.ts";
import type { DownloadedFile } from "../../lib/download.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["survey"]>> | undefined;

/**
 * 交流会の回答の道の呼び出し。
 * @param eventId 交流会の ID
 * @returns 呼び出しの道具の回答の部分と、道の値
 */
function answersApi(eventId: string) {
  client ??= createApiClient<ModuleRoutes["survey"]>();
  return { endpoint: client.api.v1.events[":eventId"]["survey-answers"], param: { eventId } };
}

/**
 * その交流会の自分の回答と、チェックイン済みか。
 * @param eventId 交流会の ID
 * @returns チェックイン済みかと自分の回答
 */
export function fetchMySurvey(eventId: string) {
  const { endpoint, param } = answersApi(eventId);
  return request(() => endpoint.me.$get({ param }));
}

/**
 * 自分の回答を送る（作る・直す）。
 * @param eventId 交流会の ID
 * @param input 入力
 * @returns 回答
 */
export function putMySurvey(eventId: string, input: SurveyAnswerInput) {
  const { endpoint, param } = answersApi(eventId);
  return request(() => endpoint.me.$put({ param, json: input }));
}

/**
 * チェックインの回答（主催者だけ。代わりに入れるとき）。
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @returns そのチェックインの回答
 */
export function fetchProxySurvey(eventId: string, checkinId: string) {
  const { endpoint } = answersApi(eventId);
  return request(() => endpoint.checkins[":checkinId"].$get({ param: { eventId, checkinId } }));
}

/**
 * チェックインの回答を代わりに送る（主催者だけ。閉じていても受ける）。
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @param input 入力
 * @returns 回答
 */
export function putProxySurvey(eventId: string, checkinId: string, input: SurveyAnswerInput) {
  const { endpoint } = answersApi(eventId);
  return request(() =>
    endpoint.checkins[":checkinId"].$put({ param: { eventId, checkinId }, json: input }),
  );
}

/**
 * 困りごとの一覧（主催者だけ）。
 * @param eventId 交流会の ID
 * @param query 絞りこみと並べ方
 * @returns 困りごとの一覧
 */
export function fetchSurveyAnswers(eventId: string, query: SurveyListQuery) {
  const { endpoint, param } = answersApi(eventId);
  return request(() => endpoint.$get({ param, query }));
}

/**
 * 困りごとの CSV を受け取る（主催者だけ）。エラーは ApiError・NetworkError で投げる。
 * @param eventId 交流会の ID
 * @returns 中身とファイルの名前
 * @throws {ApiError} API がエラーを返したとき
 * @throws {NetworkError} 通信が届かなかったとき
 */
export function downloadConcernsCsv(eventId: string): Promise<DownloadedFile> {
  const { endpoint, param } = answersApi(eventId);
  return fetchDownload(() => endpoint.export.$get({ param }), "concerns.csv");
}
