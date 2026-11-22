// 今の利用者が替わったこと（ログアウト・退会・別の人のログイン）を、領域に知らせる（セキュリティの全体点検 run-1）。
// account の領域が知らせ、端末に本人のデータの写しを置く領域（試合表のオフラインなど）が受けて、前の人の写しを消す。
// account はほかの領域を知らずに済む（lib/api.ts の onUnauthenticated と同じ形）。

/** 受け手。今の利用者の ID（ログアウト・退会は null）を受け取る。 */
export type AccountChangeListener = (accountId: string | null) => void | Promise<void>;

/** 受け手を待つ時間の上限（ミリ秒）。端末の置き場所（IndexedDB）が答えないときに、ログインの画面を止めないため。 */
export const ACCOUNT_CHANGE_TIMEOUT_MS = 2000;

/** 受け手の一覧。 */
const listeners = new Set<AccountChangeListener>();

/**
 * 今の利用者が替わったときの受け手を足す。
 * @param listener 受け手
 * @returns 受け手を外す関数
 */
export function onAccountChange(listener: AccountChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 今の利用者を知らせる（account の領域が、ログインした・ログアウトした・退会したときに呼ぶ）。
 * 受け手の失敗は、ほかの受け手と呼び手に広げない。待つのは timeoutMs まで（それを過ぎても受け手は続ける）。
 * @param accountId 今の利用者の ID（ログアウト・退会は null）
 * @param timeoutMs 待つ時間の上限（ミリ秒）
 * @returns すべての受け手が終わるか、上限の時間が過ぎたら終わる
 */
export async function notifyAccountChange(
  accountId: string | null,
  timeoutMs: number = ACCOUNT_CHANGE_TIMEOUT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = Promise.allSettled([...listeners].map(async (listener) => listener(accountId)));
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([settled, timeout]);
  clearTimeout(timer);
}
