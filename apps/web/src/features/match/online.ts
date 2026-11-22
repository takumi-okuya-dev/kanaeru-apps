// つながっているか（ブラウザの navigator.onLine と online・offline の知らせ）。担当の端末の受け渡し（AD-28：受け取る端末が
// つながっているときだけ）と、読み直し（つながっている間だけ）に使う。onLine が true でも届かないことはある（そのときは
// 窓口のエラーで知らせる）。
import { useSyncExternalStore } from "react";

/**
 * つながりの変わり目を受け取る。
 * @param listener 変わったときに呼ぶ関数
 * @returns 受け取りをやめる関数
 */
function subscribe(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/**
 * 今つながっているか。
 * @returns つながっていれば true
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
