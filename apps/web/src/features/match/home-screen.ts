// 試合表をホーム画面に置くためのファイル（manifest とアイコン。apps/web/public/match/ に置く。match-007）の道。
// 組み立て（vite.config.ts の scopedServiceWorker の publicFiles）と、画面の見出しのリンク（use-home-screen.ts）が、この1か所を読む。
// ほかのものを読まない（組み立ての設定からも読むため）。アイコンの PNG は e2e/scripts/render-match-icons.ts で SVG から作る。

/** manifest の道（範囲 /match/ の下。Service Worker が持つ）。 */
export const MATCH_MANIFEST_PATH = "/match/manifest.webmanifest";

/** iPhone のホーム画面のアイコン（180×180）の道。 */
export const MATCH_APPLE_TOUCH_ICON_PATH = "/match/apple-touch-icon.png";

/** Service Worker が持つ、ホーム画面のためのファイル（public からの道。manifest と、manifest・見出しが指すアイコン）。 */
export const MATCH_HOME_SCREEN_FILES: readonly string[] = [
  "match/manifest.webmanifest",
  "match/apple-touch-icon.png",
  "match/icon-192.png",
  "match/icon-512.png",
  "match/icon-maskable-192.png",
  "match/icon-maskable-512.png",
];
