// スイートの画面の入口（docs/apps/suite.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature と useVisibleApps を読む。
// スイートは共通の領域で、どのアプリにも属さない（AD-15）。すべてのアプリ（/apps）・設定（/settings/…）・アプリの台帳を持つ。
// 見えるアプリ（useVisibleApps）は、組み立てが外枠のアプリの切り替えとナビに使う（AD-16。外枠はアプリの名前を書かない）。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import {
  SUITE_ROUTE_PATTERNS,
  accountSettingsRoute,
  appsRoute,
  ledgerRoute,
  settingsRoute,
} from "./routes.ts";

export { SUITE_QUERY_KEYS, loadVisibleApps, useVisibleApps } from "./queries.ts";
export type { VisibleAppsState } from "./queries.ts";
export { SUITE_ROUTE_PATTERNS } from "./routes.ts";

/** スイートの領域が出すもの（ナビには出さない。設定の項目に「アカウント」と「アプリの台帳」）。 */
export const feature = {
  id: "suite",
  routes: [appsRoute, settingsRoute, accountSettingsRoute, ledgerRoute],
  settings: [
    {
      id: "suite-account",
      label: "アカウント",
      to: SUITE_ROUTE_PATTERNS.account,
      group: "personal",
      icon: "account",
    },
    {
      id: "suite-ledger",
      label: "アプリの台帳",
      to: SUITE_ROUTE_PATTERNS.ledger,
      group: "operator",
      icon: "ledger",
    },
  ],
} satisfies WebFeature;
