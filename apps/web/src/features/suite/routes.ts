// スイートの画面の道（core-005）。どれもどのアプリにも属さない外枠の画面（staticData.section）。
// - /apps：すべてのアプリ
// - /settings：設定の一覧。/settings/account：アカウント。/settings/apps：アプリの台帳（運営者だけ）
// - /settings/organizations：組織の一覧と作る。/settings/organizations/{id}：組織の画面（suite-001）
// - /join/{token}：組織の招待（外から開く道。外枠のナビを出さない。AD-14・AD-22）
// - /terms・/privacy：利用規約・プライバシーポリシー（ログインなしで開ける。外枠のナビを出さない。suite-002）
// 台帳・アカウント・組織は、開いたときに別に読む（lazyRouteComponent）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { PARTICIPANT_ROUTE_PATTERNS } from "@workspace/contracts/core";
import { rootRoute } from "../../lib/router.ts";
import { LEGAL_PATHS } from "./legal-paths.ts";
import { ORGANIZATION_ROUTE_PATTERNS } from "./organization-paths.ts";
import { AppsPage } from "./AppsPage.tsx";
import { SettingsIndexPage } from "./SettingsIndexPage.tsx";

/** 道の形。 */
export const SUITE_ROUTE_PATTERNS = {
  /** すべてのアプリ */
  apps: "/apps",
  /** 設定の一覧 */
  settings: "/settings",
  /** 設定 › アカウント */
  account: "/settings/account",
  /** 設定 › アプリの台帳 */
  ledger: "/settings/apps",
  /** 設定 › 組織 */
  organizations: ORGANIZATION_ROUTE_PATTERNS.list,
  /** 利用規約（suite-002） */
  terms: LEGAL_PATHS.terms,
  /** プライバシーポリシー（suite-002） */
  privacy: LEGAL_PATHS.privacy,
} as const;

/** すべてのアプリ。 */
export const appsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SUITE_ROUTE_PATTERNS.apps,
  staticData: { section: "apps" },
  component: AppsPage,
});

/** 設定の一覧。 */
export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SUITE_ROUTE_PATTERNS.settings,
  staticData: { section: "settings" },
  component: SettingsIndexPage,
});

/** 設定 › アカウント。 */
export const accountSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SUITE_ROUTE_PATTERNS.account,
  staticData: { section: "settings" },
  component: lazyRouteComponent(() => import("./AccountSettingsPage.tsx"), "AccountSettingsPage"),
});

/** 設定 › アプリの台帳（運営者だけ）。 */
export const ledgerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SUITE_ROUTE_PATTERNS.ledger,
  staticData: { section: "settings" },
  component: lazyRouteComponent(() => import("./LedgerPage.tsx"), "LedgerPage"),
});

/** 設定 › 組織（一覧と作る。suite-001）。 */
export const organizationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ORGANIZATION_ROUTE_PATTERNS.list,
  staticData: { section: "settings" },
  component: lazyRouteComponent(() => import("./OrganizationsPage.tsx"), "OrganizationsPage"),
});

/** 設定 › 組織 › 組織の画面（suite-001）。 */
export const organizationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ORGANIZATION_ROUTE_PATTERNS.detail,
  staticData: { section: "settings" },
  component: lazyRouteComponent(() => import("./OrganizationPage.tsx"), "OrganizationRoute"),
});

/** 組織の招待（外から開く道。外枠のナビを出さない。suite-001）。 */
export const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PARTICIPANT_ROUTE_PATTERNS.join,
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./JoinPage.tsx"), "JoinRoute"),
});

/** 利用規約（ログインなしで開ける。外枠のナビを出さない。suite-002）。 */
export const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: LEGAL_PATHS.terms,
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./LegalPage.tsx"), "TermsPage"),
});

/** プライバシーポリシー（ログインなしで開ける。外枠のナビを出さない。suite-002）。 */
export const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: LEGAL_PATHS.privacy,
  staticData: { layout: "bare" },
  component: lazyRouteComponent(() => import("./LegalPage.tsx"), "PrivacyPage"),
});
