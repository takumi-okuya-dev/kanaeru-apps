// 試合表の窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["match"] から import type で読む）。
// 読み書きは lib/api.ts の request を通す（エラーの読み方をそろえる）。
import type {
  MatchJoinInput,
  MatchTableCreateInput,
  MatchTableUpdateInput,
} from "@workspace/contracts/match";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["match"]>> | undefined;

/**
 * 試合表の窓口の呼び出しの道具。
 * @returns 呼び出しの道具の match の部分
 */
function matchApi() {
  client ??= createApiClient<ModuleRoutes["match"]>();
  return client.api.v1.match;
}

/**
 * 開ける試合表の一覧。
 * @returns 一覧
 */
export function fetchTables() {
  return request(() => matchApi().tables.$get());
}

/**
 * 試合表を作る。
 * @param input 名前・試合の日・組織・この端末の ID
 * @returns 作った試合表
 */
export function createTable(input: MatchTableCreateInput) {
  return request(() => matchApi().tables.$post({ json: input }));
}

/**
 * 試合表を入れられる組織。
 * @returns 組織
 */
export function fetchOrganizationOptions() {
  return request(() => matchApi()["organization-options"].$get());
}

/**
 * 試合表を読む。
 * @param tableId 試合表の ID
 * @returns 試合表
 */
export function fetchTable(tableId: string) {
  return request(() => matchApi().tables[":tableId"].$get({ param: { tableId } }));
}

/**
 * 試合表の中身を送る（担当の端末だけ）。
 * @param tableId 試合表の ID
 * @param input 端末・もとの版・変更の ID・くじの種・中身
 * @returns 直した試合表
 */
export function saveTable(tableId: string, input: MatchTableUpdateInput) {
  return request(() => matchApi().tables[":tableId"].$put({ param: { tableId }, json: input }));
}

/**
 * この端末を担当の端末にする。
 * @param tableId 試合表の ID
 * @param deviceId この端末の ID
 * @returns 担当の端末を替えた試合表
 */
export function takeEditor(tableId: string, deviceId: string) {
  return request(() =>
    matchApi().tables[":tableId"].editor.$put({ param: { tableId }, json: { deviceId } }),
  );
}

/**
 * 試合表を消す。
 * @param tableId 試合表の ID
 * @returns 終わり
 */
export function deleteTable(tableId: string) {
  return request(() => matchApi().tables[":tableId"].$delete({ param: { tableId } }));
}

/**
 * 見るだけの札を作り直す（前の札・QR は使えなくなる）。
 * @param tableId 試合表の ID
 * @returns 札と期限
 */
export function issueViewLink(tableId: string) {
  return request(() => matchApi().tables[":tableId"]["view-link"].$put({ param: { tableId } }));
}

/**
 * 受付の札を作り直して受付を開く（前の札は使えなくなる）。
 * @param tableId 試合表の ID
 * @returns 札と期限
 */
export function issueJoinLink(tableId: string) {
  return request(() => matchApi().tables[":tableId"]["join-link"].$put({ param: { tableId } }));
}

/**
 * 受付を締める。
 * @param tableId 試合表の ID
 * @returns 締めたあとの受付の一覧
 */
export function closeJoin(tableId: string) {
  return request(() =>
    matchApi().tables[":tableId"]["join-link"].close.$post({ param: { tableId } }),
  );
}

/**
 * 受付の一覧。
 * @param tableId 試合表の ID
 * @returns 受付の一覧
 */
export function fetchJoins(tableId: string) {
  return request(() => matchApi().tables[":tableId"].joins.$get({ param: { tableId } }));
}

/**
 * 受付の行を消す。
 * @param tableId 試合表の ID
 * @param joinId 受付の ID
 * @returns 終わり
 */
export function deleteJoin(tableId: string, joinId: string) {
  return request(() =>
    matchApi().tables[":tableId"].joins[":joinId"].$delete({ param: { tableId, joinId } }),
  );
}

/**
 * 見るだけのページの中身（ログインなし）。
 * @param viewToken 見るだけの札
 * @returns 中身
 */
export function fetchView(viewToken: string) {
  return request(() => matchApi().views[":viewToken"].$get({ param: { viewToken } }));
}

/**
 * 見るだけのページの版の番号（ログインなし）。
 * @param viewToken 見るだけの札
 * @returns 版の番号
 */
export function fetchViewVersion(viewToken: string) {
  return request(() => matchApi().views[":viewToken"].version.$get({ param: { viewToken } }));
}

/**
 * 受付のページの中身（ログインなし）。
 * @param joinToken 受付の札
 * @returns 試合表の名前と日付・選べるレベル
 */
export function fetchJoinInfo(joinToken: string) {
  return request(() => matchApi().joins[":joinToken"].$get({ param: { joinToken } }));
}

/**
 * 受け付ける（ログインなし）。
 * @param joinToken 受付の札
 * @param input 呼び名とレベル
 * @returns 受け付けた呼び名とレベル
 */
export function submitJoin(joinToken: string, input: MatchJoinInput) {
  return request(() => matchApi().joins[":joinToken"].$post({ param: { joinToken }, json: input }));
}
