// スイートの窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["suite"] から import type で読む）。
// 読み書きはすべて lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
import type { AppSettingInput } from "@workspace/contracts/suite";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["suite"]>> | undefined;

/**
 * スイートの窓口の呼び出しの道具（今の画面の源の /api を呼ぶ）。
 * @returns 呼び出しの道具
 */
function api() {
  client ??= createApiClient<ModuleRoutes["suite"]>();
  return client;
}

/**
 * 見る人に見えるアプリの一覧を読む（ログインの前でも答える）。
 * @returns 見えるアプリと、運営者か
 */
export function fetchVisibleApps() {
  return request(() => api().api.v1.suite.apps.$get());
}

/**
 * アプリの台帳を読む（運営者だけ）。
 * @returns 台帳
 */
export function fetchAppSettings() {
  return request(() => api().api.v1.suite["app-settings"].$get());
}

/**
 * アプリの公開の状態を変える（運営者だけ。すぐに効く）。
 * @param appKey アプリの key
 * @param input 新しい公開の状態
 * @returns 変えたあとの台帳の行
 */
export function updateAppSetting(appKey: string, input: AppSettingInput) {
  return request(() =>
    api().api.v1.suite["app-settings"][":appKey"].$put({ param: { appKey }, json: input }),
  );
}
