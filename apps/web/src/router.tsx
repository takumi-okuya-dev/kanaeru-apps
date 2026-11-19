// 道の組み立て（TanStack Router。コードで書く形）。features.list.ts の領域の道とナビをつなぐ。
// 領域を足しても、このファイルは直さない（features.list.ts に1行足す。docs/rules/coding.md 6-6）。
// アプリの切り替え（core-005。AD-15・AD-16）：
// - 今のアプリ ＝ 今の道を出した領域が属するアプリ（packages/contracts/src/core/apps.list.ts）。外枠の画面（/apps・/settings）はどのアプリでもない
// - 外枠のナビは、今のアプリの領域の useNavItems（なければ nav）だけを並べる。設定の画面では、領域の feature.settings を見る人で絞って並べる
// - 見えるアプリは suite の useVisibleApps。外枠に、切り替えの状態（useShellApps）として渡す
// はじめの画面（/）は、この端末で最後に使ったアプリ（見えるもの）、なければ見える最初のアプリの、最初のナビの項目へ移す。
import type { QueryClient } from "@tanstack/react-query";
import { createRoute, createRouter, redirect, useRouterState } from "@tanstack/react-router";
import { appOfDomain, listApps } from "@workspace/contracts/core";
import * as features from "./features.list.ts";
import { SUITE_ROUTE_PATTERNS, loadVisibleApps, useVisibleApps } from "./features/suite/index.ts";
import type { VisibleAppsState } from "./features/suite/index.ts";
import { pickStartApp, provideStartPaths, readLastApp, startPathOf } from "./lib/apps.ts";
import type { ShellApp, ShellAppsView, ShellPlace } from "./lib/apps.ts";
import type { WebFeature } from "./lib/feature.ts";
import { rootRoute } from "./lib/router.ts";
import type { NavItem } from "./lib/feature.ts";
import {
  SETTINGS_GROUP_LABELS,
  provideSettingsSections,
  visibleSettingsSections,
} from "./lib/settings.ts";
import type { ResolvedSettingsSection } from "./lib/settings.ts";
import { AppShell } from "./shell/AppShell.tsx";
import { ErrorPage } from "./shell/ErrorPage.tsx";
import { NotFoundPage } from "./shell/NotFoundPage.tsx";

/** features.list.ts の領域が出す feature の型の和（領域が1つもなければ never）。 */
type ListedFeature = {
  [K in keyof typeof features]: (typeof features)[K] extends { feature: infer F } ? F : never;
}[keyof typeof features];

/** 登録された領域の feature の型（領域が1つもないときは、道を持たない形）。 */
type RegisteredFeature = [ListedFeature] extends [never]
  ? Omit<WebFeature, "routes"> & { routes: readonly never[] }
  : ListedFeature;

/**
 * 登録された領域（features.list.ts の順）。型を消さないよう、WebFeature[] と書かない（道の型が Link の to を確かめる）。
 * 領域が0のときも型が通るよう、名前空間の値の型を RegisteredFeature で読む。
 */
export const registeredFeatures = Object.values<{ feature: RegisteredFeature }>(features).map(
  (module) => module.feature,
);

/** 領域の決まったナビの項目（features.list.ts の順。はじめの画面の行き先）。 */
export const navItems: readonly NavItem[] = registeredFeatures.flatMap((feature: WebFeature) =>
  feature.nav
    ? [
        {
          id: feature.id,
          label: feature.nav.label,
          to: feature.nav.to,
          icon: feature.nav.icon ?? "list",
        },
      ]
    : [],
);

/** 領域ごとのナビの項目の出し方（features.list.ts の順。useNavItems があればそれ、なければ決まった項目）。 */
const navSources: readonly { domain: string; use: () => readonly NavItem[] }[] =
  registeredFeatures.flatMap((feature: WebFeature) => {
    if (feature.useNavItems) return [{ domain: feature.id, use: feature.useNavItems }];
    const item = navItems.find((nav) => nav.id === feature.id);
    return item ? [{ domain: feature.id, use: () => [item] }] : [];
  });

/** 登録されたアプリ（apps.list.ts の順。今の道のアプリと、はじめの画面を決める）。 */
const registeredApps = listApps();

// アプリを開いたときの道：そのアプリの領域の、最初の決まったナビの項目（なければアプリの道の頭）
provideStartPaths(
  new Map(
    registeredApps.flatMap((app) => {
      const first = navItems.find((item) => app.domains.includes(item.id));
      return first ? [[app.key, first.to] as const] : [];
    }),
  ),
);

/** 領域の設定の項目に、属するアプリを付けたもの（features.list.ts の順）。 */
export const settingsSectionList: readonly ResolvedSettingsSection[] = registeredFeatures.flatMap(
  (feature: WebFeature) =>
    (feature.settings ?? []).map((section) => {
      const appKey = appOfDomain(feature.id, registeredApps)?.key;
      return appKey ? { ...section, appKey } : { ...section };
    }),
);
provideSettingsSections(settingsSectionList);

/** 道の ID → その道を出した領域（初めて使うときに作る。道の ID は道の木を作ったあとに決まる）。 */
let routeDomains: Map<string, string> | undefined;

/**
 * 道を出した領域。
 * @param routeId 道の ID
 * @returns 領域の名前（領域の道でなければ undefined）
 */
function domainOfRoute(routeId: string): string | undefined {
  routeDomains ??= new Map(
    registeredFeatures.flatMap((feature: WebFeature) =>
      feature.routes.map((route) => [route.id, feature.id] as const),
    ),
  );
  return routeDomains.get(routeId);
}

/**
 * 領域が属するアプリの key（登録されたアプリと、API が返した見えるアプリから探す）。
 * @param domain 領域の名前
 * @param visible 見えるアプリ
 * @returns アプリの key（共通の領域なら undefined）
 */
function appKeyOfDomain(domain: string, visible: VisibleAppsState): string | undefined {
  return (
    appOfDomain(domain, registeredApps)?.key ??
    visible.apps.find((app) => app.domains.includes(domain))?.key
  );
}

/** 外枠の今いる所（組み立ての中だけで使う）。 */
type ShellContext = {
  /** 今の道が外枠の画面か */
  section: "apps" | "settings" | undefined;
  /** 今の道のアプリの key（外枠の画面・共通の領域・どの道にも当たらないときは undefined） */
  appKey: string | undefined;
  /** 見えるアプリ */
  visible: VisibleAppsState;
};

/**
 * 今の道から、外枠の今いる所を決める。
 * @returns 今いる所
 */
function useShellContext(): ShellContext {
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId });
  const section = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.section });
  const visible = useVisibleApps();
  const domain = routeId === undefined ? undefined : domainOfRoute(routeId);
  const appKey = section || domain === undefined ? undefined : appKeyOfDomain(domain, visible);
  return { section, appKey, visible };
}

/**
 * 今のアプリがないとき（見つからない画面など）に、ナビを出すアプリ（最後に使ったアプリ、なければ見える最初のアプリ）。
 * @param visible 見えるアプリ
 * @returns アプリの key（なければ undefined）
 */
function fallbackAppKey(visible: VisibleAppsState): string | undefined {
  const candidates = visible.status === "success" ? visible.apps : registeredApps;
  return pickStartApp<{ key: string }>(candidates, readLastApp())?.key;
}

/**
 * 外枠のナビの項目（今のアプリの領域の項目だけ。設定の画面では設定の項目）。
 * 領域の並びと数は起動のときに決まり、描くたびに変わらないので、領域のフックを毎回同じ順に呼べる（React のフックの決まりを守る）。
 * @returns ナビの項目
 */
export function useNavItems(): readonly NavItem[] {
  const sourced = navSources.map((source) => ({ domain: source.domain, items: source.use() }));
  const { section, appKey, visible } = useShellContext();
  if (section === "settings") {
    return visibleSettingsSections(settingsSectionList, {
      visibleAppKeys: visible.status === "success" ? new Set(visible.apps.map((a) => a.key)) : null,
      isOperator: visible.isOperator,
    }).map((item) => ({
      id: item.id,
      label: item.label,
      to: item.to,
      icon: item.icon ?? "list",
      group: SETTINGS_GROUP_LABELS[item.group],
    }));
  }
  if (section === "apps") return [];
  const key = appKey ?? fallbackAppKey(visible);
  const domains = new Set(
    registeredApps.find((app) => app.key === key)?.domains ??
      visible.apps.find((app) => app.key === key)?.domains ??
      sourced.map((entry) => entry.domain),
  );
  return sourced.filter((entry) => domains.has(entry.domain)).flatMap((entry) => entry.items);
}

/**
 * 外枠のアプリの切り替えの状態（見えるアプリ・今いる所・今の道のアプリが見えないか・すべてのアプリと設定の道）。
 * @returns 切り替えの状態
 */
export function useShellApps(): ShellAppsView {
  const { section, appKey, visible } = useShellContext();
  const apps = visible.apps.map((app): ShellApp => ({
    key: app.key,
    name: app.name,
    summary: app.summary,
    icon: app.icon,
    startPath: startPathOf(app),
    operatorOnly: visible.isOperator && app.visibility === "operator_only",
  }));
  const place: ShellPlace = section
    ? { kind: section }
    : appKey
      ? { kind: "app", key: appKey }
      : null;
  const listed =
    appKey !== undefined &&
    visible.status === "success" &&
    visible.apps.some((app) => app.key === appKey);
  return {
    apps,
    place,
    // 見えるアプリを読めて、ログインしているとわかっているときだけ決める（読めないとき・ログインの前は画面を出す。
    // 運営者だけのアプリでも、画面がログインさせてから読み直す。窓口は API の requireApp が守る）
    hidden: appKey !== undefined && visible.status === "success" && visible.signedIn && !listed,
    placeVisible: listed,
    appsPath: SUITE_ROUTE_PATTERNS.apps,
    settingsPath: SUITE_ROUTE_PATTERNS.settings,
  };
}

rootRoute.update({
  component: () => <AppShell useNavItems={useNavItems} useApps={useShellApps} />,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

/** はじめの画面（最後に使ったアプリか、見える最初のアプリの、最初のナビの項目へ移す）。 */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async ({ context }) => {
    const list = await loadVisibleApps(context.queryClient);
    // 見えるアプリを読めなければ（夜間の停止など）、登録されたアプリから選ぶ（開いた画面が自分の状態を出す）
    const app = pickStartApp<{ key: string; basePath: string }>(
      list ? list.apps : registeredApps,
      readLastApp(),
    );
    const to = app ? startPathOf(app) : list ? SUITE_ROUTE_PATTERNS.apps : navItems[0]?.to;
    // TanStack Router は、移す先を投げて伝える（redirect は Error でない）
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (to) throw redirect({ to, replace: true });
  },
  component: NotFoundPage,
});

/** 登録された領域の道の型の和（領域が2つ以上のとき、flatMap が最初の領域の道の型だけに決めないように書く）。 */
type RegisteredRoute = RegisteredFeature["routes"][number];

/** 道の木。 */
export const routeTree = rootRoute.addChildren([
  indexRoute,
  ...registeredFeatures.flatMap((feature): readonly RegisteredRoute[] => feature.routes),
]);

/**
 * 道の道具を作る。
 * @param queryClient TanStack Query の入れ物
 * @returns 道の道具
 */
export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: false });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
