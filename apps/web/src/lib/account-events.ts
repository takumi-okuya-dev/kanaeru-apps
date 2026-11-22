// 今の利用者が替わったこと（ログアウト・退会・別の人のログイン）を、領域に知らせる（セキュリティの全体点検 run-1）。
// account の領域が知らせ、端末に本人のデータの写しを置く領域（試合表のオフラインなど）が受けて、前の人の写しを消す。
// account はほかの領域を知らずに済む（lib/api.ts の onUnauthenticated と同じ形）。

/** 受け手。今の利用者の ID（ログアウト・退会は null）を受け取る。 */
export type AccountChangeListener = (accountId: string | null) => void | Promise<void>;

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
 * 受け手の失敗は、ほかの受け手と呼び手に広げない。
 * @param accountId 今の利用者の ID（ログアウト・退会は null）
 * @returns すべての受け手が終わったら終わる
 */
export async function notifyAccountChange(accountId: string | null): Promise<void> {
  await Promise.allSettled([...listeners].map(async (listener) => listener(accountId)));
}
