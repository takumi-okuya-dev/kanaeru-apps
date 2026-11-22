// 試合表の道へ画面の中で入るときに、ページを読み直すか（試合表の道の beforeLoad から呼ぶ。routes.ts）。
// API は、文書（index.html）を返すときに道ごとに守りの見出しを付け、試合表の道（/match・/match/…）の文書だけカメラを許す
// （Permissions-Policy の camera=(self)。apps/api/src/platform/web/web.ts の CAMERA_PATH_PREFIXES・core-015 R3）。
// 見出しは文書ごとに決まるので、ほかの道（/apps など）で開いた文書から画面の中（TanStack Router の Link）で試合表の道へ移ると、
// camera=() のままで、QR を読むカメラを開けない。Service Worker（範囲 /match/。AD-27）も、範囲の外で開いた文書は受け持たない。
// そこで、ほかの道で開いた文書から試合表の道へ入るときは、同じ URL でページを読み直す（LIFF の要る道へ出るときの読み直し
// 〈lib/router.ts・core-013〉と同じ形。読み直すと、組み立ては試合表の道なので LIFF を始めない）。
// 試合表の道で開いた文書の中の行き来は読み直さない（ネットなしで動く）。
import { redirect } from "@tanstack/react-router";

/** 試合表の道の頭（API の CAMERA_PATH_PREFIXES・lib/liff.ts の LIFF を始めない道と同じ比べ方。大文字と小文字を分ける）。 */
const MATCH_PATH_PREFIX = "/match";

/**
 * 試合表の道か。
 * @param pathname 道
 * @returns 試合表の道なら true
 */
export function isMatchDocumentPath(pathname: string): boolean {
  return pathname === MATCH_PATH_PREFIX || pathname.startsWith(`${MATCH_PATH_PREFIX}/`);
}

/**
 * 今の文書を読みこんだ道（Navigation Timing の文書の URL。画面の中で道を変えても変わらない）。
 * @returns 道（分からなければ undefined）
 */
export function documentPathname(): string | undefined {
  try {
    const [entry] = performance.getEntriesByType("navigation");
    return entry ? new URL(entry.name).pathname : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 試合表の道へ移るときに、ページを読み直すか（ほかの道で開いた文書から入るときだけ）。
 * @param documentPath 今の文書を読みこんだ道（分からなければ undefined。そのときは読み直さない）
 * @param target 移る先の道
 * @returns 読み直すなら true
 */
export function mustReloadIntoMatch(documentPath: string | undefined, target: string): boolean {
  return (
    documentPath !== undefined && !isMatchDocumentPath(documentPath) && isMatchDocumentPath(target)
  );
}

/**
 * 試合表の道の beforeLoad：ほかの道で開いた文書から入るなら、同じ URL でページを読み直す（履歴を増やさない）。
 * @param context 道の文脈（移る先・先読みか）
 * @param context.location 移る先
 * @param context.location.pathname 移る先の道
 * @param context.location.href 移る先の URL（道・クエリ・#）
 * @param context.preload 先読みか（先読みでは読み直さない）
 * @throws 読み直すとき（TanStack Router の redirect。Error でない）
 */
export function reloadIntoMatchIfNeeded(context: {
  location: { pathname: string; href: string };
  preload: boolean;
}): void {
  if (context.preload || !mustReloadIntoMatch(documentPathname(), context.location.pathname)) {
    return;
  }
  // TanStack Router は、移す先を投げて伝える（redirect は Error でない）
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw redirect({ href: context.location.href, reloadDocument: true, replace: true });
}
