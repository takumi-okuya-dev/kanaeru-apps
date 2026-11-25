// アカウントの窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["account"] から import type で読む）。
// 読み書きはすべて lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
import { ConsentResponse as ConsentResponseSchema, ConsentView as ConsentViewSchema } from "@workspace/contracts/account";
import type {
  AuthorizeQuery,
  ConsentViewData,
  ConsentDecisionInput,
  TestLoginInput,
} from "@workspace/contracts/account";
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

/**
 * 退会の確かめの中身を読む（組織の引き継ぎ・引き継がれる記録・消える記録。書きこまない。AD-22）。
 * @returns 確かめの中身（退会の手順と同じ順）
 */
export function fetchWithdrawalPreview() {
  return request(() => api().api.v1.accounts.me.withdrawal.$get());
}

/**
 * 自分のアカウントを消す（退会。すべてのアプリの本人の記録も消える）。
 * @returns 終わり
 * @throws {ApiError} ほかの人が書きこむ記録を持っているとき（409 ACCOUNT_OWNS_SHARED_RECORDS）など
 */
export function deleteMe() {
  return request(() => api().api.v1.accounts.me.$delete());
}

/**
 * 同意の画面に出すもの（クライアントの名前と、要求の範囲の説明）を読む。
 * 同意の道（/api/oauth）は領域の型の外なので、fetch を直接呼び、形は contract で確かめる。
 * @param query 認可の要求の項目（同意の道の問い合わせ）
 * @returns 同意の画面に出すもの
 */
export async function fetchConsentView(query: AuthorizeQuery): Promise<ConsentViewData> {
  const params = new URLSearchParams(query);
  const body = await request(() =>
    fetch(`/api/oauth/authorize/consent?${params.toString()}`, { credentials: "same-origin" }),
  );
  return ConsentViewSchema.parse(body);
}

/**
 * 同意の決め（許す・断る）を送り、戻り先の URL を受け取る。
 * @param input 認可の要求の項目と、決め・許した範囲
 * @returns 戻り先の URL
 */
export async function decideConsent(input: ConsentDecisionInput): Promise<{ redirectTo: string }> {
  const body = await request(() =>
    fetch("/api/oauth/authorize/decision", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return ConsentResponseSchema.parse(body);
}
