// 公式 LINE の友だち追加（PRD FR-6）。勧めるのはミニアプリのチャネルの設定（Add friend option）で、画面からは出さない。
// あとで要る画面（reception の済んだ画面など）のために、LIFF の requestFriendship を出すだけ（research R10）。
import { getLiff } from "../../lib/liff.ts";

/**
 * 公式 LINE の友だち追加を勧める小さな画面を出す（使えないときは何もしない）。
 * @returns 画面を出せたら true（友だちになったかは分からない）。使えない・失敗したら false
 */
export function requestFriendship(): Promise<boolean> {
  return getLiff().requestFriendship();
}
