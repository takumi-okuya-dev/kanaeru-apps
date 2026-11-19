// スイートの画面の道（core-005）。どれもどのアプリにも属さない外枠の画面（staticData.section）。
// - /apps：すべてのアプリ
// - /settings：設定の一覧。/settings/account：アカウント。/settings/apps：アプリの台帳（運営者だけ）
// 台帳とアカウントは、開いたときに別に読む（lazyRouteComponent）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
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
