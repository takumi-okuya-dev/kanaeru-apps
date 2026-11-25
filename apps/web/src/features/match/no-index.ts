// ログインなしのページ（見るだけ・受付）に、検索に載せない印（<meta name="robots" content="noindex, nofollow">）を付ける
// （AD-26・AD-30。窓口の答えには X-Robots-Tag を付ける）。ページを離れたら外す。
import { useEffect } from "react";

/** ページを開いている間だけ、検索に載せない印を付ける。 */
export function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.append(meta);
    return () => meta.remove();
  }, []);
}
