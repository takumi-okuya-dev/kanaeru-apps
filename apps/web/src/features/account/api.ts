// アカウントの窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["account"] から import type で読む）。
// 読み書きはすべて lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
import type { TestLoginInput } from "@workspace/contracts/account";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["account"]>> | undefined;

/**
 * アカウントの窓口の呼び出しの道具（今の画面の源の /api を呼ぶ）。
 * @returns 呼び出しの道具
 */
function api() {
  client ??= createApiClient<ModuleRoutes["account"]>();
  return client;
}

/**
 * 今の利用者を読む。
 * @returns 今の利用者
 */
export function fetchMe() {
  return request(() => api().api.v1.accounts.me.$get());
}

/**
 * LINE の ID トークンでログインする（liff.getIDToken() の生の値だけを送る。AD-4）。
 * @param idToken ID トークン
 * @returns 今の利用者
 */
export function loginWithLine(idToken: string) {
  return request(() => api().api.v1.auth.line.$post({ json: { idToken } }));
}

/**
 * 試験用のログイン（手元とテストだけ）。
 * @param input LINE のユーザー ID と表示名
 * @returns 今の利用者
 */
export function testLogin(input: TestLoginInput) {
  return request(() => api().api.v1.auth["test-login"].$post({ json: input }));
}

/**
 * ログアウトする。
 * @returns 終わり
 */
export function logout() {
  return request(() => api().api.v1.auth.logout.$post());
}
