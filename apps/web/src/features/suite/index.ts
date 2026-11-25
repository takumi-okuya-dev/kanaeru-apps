// スイートの画面の入口（docs/apps/suite.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature と useVisibleApps を読む。
// スイートは共通の領域で、どのアプリにも属さない（AD-15）。すべてのアプリ（/apps）・設定（/settings/…）・アプリの台帳・
// 組織（/settings/organizations…・招待の /join/{token}。suite-001）・利用規約とプライバシーポリシー（/terms・/privacy。suite-002）を持つ。
// ほかの領域は、利用規約とプライバシーポリシーへのリンクを LegalLink で出す（道を書き写さない）。
// 見えるアプリ（useVisibleApps）は、組み立てが外枠のアプリの切り替えとナビに使う（AD-16。外枠はアプリの名前を書かない）。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import {
  SUITE_ROUTE_PATTERNS,
  accountSettingsRoute,
  appsRoute,
  joinRoute,
  ledgerRoute,
  organizationRoute,
  organizationsRoute,
  privacyRoute,
  settingsRoute,
  termsRoute,
} from "./routes.ts";

export { SUITE_QUERY_KEYS, loadVisibleApps, useVisibleApps } from "./queries.ts";
export type { VisibleAppsState } from "./queries.ts";
export { SUITE_ROUTE_PATTERNS } from "./routes.ts";
export { ORGANIZATION_QUERY_KEYS } from "./organization-queries.ts";
export { LegalLink } from "./LegalLink.tsx";
export type { LegalLinkProps } from "./LegalLink.tsx";

/** スイートの領域が出すもの（ナビには出さない。設定の項目に「アカウント」「組織」と「アプリの台帳」）。 */
export const feature = {
  id: "suite",
  routes: [
    appsRoute,
    settingsRoute,
    accountSettingsRoute,
    ledgerRoute,
    organizationsRoute,
    organizationRoute,
    joinRoute,
    termsRoute,
    privacyRoute,
  ],
  settings: [
    {
      id: "suite-account",
      label: "アカウント",
      to: SUITE_ROUTE_PATTERNS.account,
      group: "personal",
      icon: "account",
    },
    {
      id: "suite-organizations",
      label: "組織",
      to: SUITE_ROUTE_PATTERNS.organizations,
      group: "personal",
      icon: "people",
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
