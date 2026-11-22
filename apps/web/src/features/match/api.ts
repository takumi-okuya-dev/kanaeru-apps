// 試合表の窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["match"] から import type で読む）。
// 読み書きは lib/api.ts の request を通す（エラーの読み方をそろえる）。
import type { MatchTableCreateInput, MatchTableUpdateInput } from "@workspace/contracts/match";
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
