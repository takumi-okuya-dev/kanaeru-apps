// 試合表の運営の画面にだけ、ホーム画面に置くための見出しのリンクを付ける（match-007）：
// manifest（名前「kanaeru 試合表」・始まりと範囲 /match/）・iPhone のアイコン（apple-touch-icon）・iPhone のホーム画面の名前。
// 画面の外枠（index.html）はどのアプリの道でも同じなので、外枠には書かず、試合表の運営の画面（MatchGate）を開いている間だけ
// 付け、離れたら外す（ほかのアプリの道で、試合表の manifest とアイコンが出ないように）。見るだけ・受付のページ（参加者が開く
// その日だけのページ）には付けない（始まりの /match/ は運営の一覧なので、参加者がホーム画面に置くと運営の画面が開いてしまう）。
// iPhone のホーム画面の動き（置いた画面・ネットなしで開くか）は実機で確かめる（specs/match/007-event-link-and-icon/research.md）。
import { useEffect } from "react";
import { MATCH_APPLE_TOUCH_ICON_PATH, MATCH_MANIFEST_PATH } from "./home-screen.ts";

/** ホーム画面の名前（manifest の short_name と同じ）。 */
const HOME_SCREEN_TITLE = "試合表";

/** 付けた見出しの要素の印（同じ画面で2度付けない・外すときに見分ける）。 */
const MARK = "data-match-home-screen";

/** 付けている部品の数（1つの画面に2つあっても、最後の1つが消えるまで外さない）。 */
let users = 0;

/**
 * 見出しに、ホーム画面のためのリンクを付ける（もう付いていれば何もしない）。
 */
export function addHomeScreenLinks(): void {
  if (document.head.querySelector(`[${MARK}]`)) return;
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = MATCH_MANIFEST_PATH;
  const icon = document.createElement("link");
  icon.rel = "apple-touch-icon";
  icon.href = MATCH_APPLE_TOUCH_ICON_PATH;
  const title = document.createElement("meta");
  title.name = "apple-mobile-web-app-title";
  title.content = HOME_SCREEN_TITLE;
  for (const element of [manifest, icon, title]) {
    element.setAttribute(MARK, "");
    document.head.append(element);
  }
}

/** 見出しから、ホーム画面のためのリンクを外す。 */
export function removeHomeScreenLinks(): void {
  for (const element of document.head.querySelectorAll(`[${MARK}]`)) element.remove();
}

/** 画面を開いている間だけ、ホーム画面のためのリンクを付ける（試合表の運営の画面が使う）。 */
export function useHomeScreenLinks(): void {
  useEffect(() => {
    users += 1;
    addHomeScreenLinks();
    return () => {
      users -= 1;
      if (users === 0) removeHomeScreenLinks();
    };
  }, []);
}
