// 画面の外枠（EXPERIENCE.md の Information Architecture・Responsive & Platform・DESIGN.md のサイドバーとタブバー。core-003）。
// - 形は道ごと（今の道の staticData.layout。lib/router.ts）。書かない道は管理の形、参加者が開く道は "bare"（ナビなし）。
// - 管理の形：上に帯（「メニュー」ボタンとアプリの名前）。752px 以上は左にサイドバー（ボタンで出す・隠す。ブラウザに覚える）、
//   751px 以下は画面の下のタブバー（帯の下にナビの行を出さない）。項目は領域が出す（router.tsx の useNavItems）。
//   751px 以下では、帯と本文を1つのスクロールの枠に入れ、タブバーをその下の段に置く（本文がタブバーの下に潜らないので、
//   押せる所がタブバーに隠れない。WCAG 2.5.8・2.4.11）。道が変わったら、枠を上に戻す。枠は relative にし、中の読み上げだけの
//   要素（sr-only は absolute）が枠の外で文書を伸ばし、窓までスクロールしないようにする。
// - ナビなしの形：上の帯はアプリの名前だけ（リンクにしない）。サイドバー・タブバー・管理への入口を出さない。
// - 先頭に「本文へ移る」。道が変わったら、新しい画面の h1（tabindex="-1"）にフォーカスを移す（読み上げが題から読む）。
//   読みこみ中で h1 がまだないときは、h1 が出たときに移す。
// - 画面の上の知らせの帯（lib/notice.ts）を、今の道の知らせがあるときだけ出す。トーストは使わない。
// - アプリの切り替え（core-005。AD-15・AD-16）：組み立てが useApps で渡す。見る人に見えるアプリが2つ以上のときだけ、PC はサイドバーの上、
//   スマホは上の帯の右に出す（1つなら今までと同じ見た目）。「設定」の入口は、PC は上の帯の右、スマホは切り替えの枠の下
//   （切り替えを出さないときは上の帯の右）。ナビの項目は、組み立てが今のアプリ（か設定）のものに絞って渡す。
//   今の道のアプリが見えないときは「ページが見つかりません」を出す。アプリの中にいるときは、そのアプリをこの端末に覚える。
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { NotificationBar } from "@workspace/ui/components/notification-bar";
import { cn } from "@workspace/ui/lib/cn";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { APP_NAME } from "../lib/app-name.ts";
import { writeLastApp } from "../lib/apps.ts";
import type { ShellAppsView } from "../lib/apps.ts";
import type { NavItem } from "../lib/feature.ts";
import { Icon } from "../lib/icon.tsx";
import { clearNotice, useNotice } from "../lib/notice.ts";
import type { ShellLayout } from "../lib/router.ts";
import { MobileAppSwitcher, SidebarAppSwitcher } from "./AppSwitcher.tsx";
import { NavIcon } from "./NavIcon.tsx";
import { NotFoundPage } from "./NotFoundPage.tsx";
import { currentNav } from "./current-nav.ts";
import type { CurrentNav } from "./current-nav.ts";
import { readSidebarOpen, writeSidebarOpen } from "./sidebar-state.ts";

/** 道が変わったあと、読みこみ中の画面の h1 が出るのを待つ長さ（ミリ秒）。 */
const HEADING_WAIT_MS = 10_000;

/** サイドバーの要素の ID（「メニュー」ボタンの aria-controls）。 */
const SIDEBAR_ID = "app-sidebar";

/** 外枠が受け取るもの。 */
type AppShellProps = {
  /** 今の道に合わせたナビの項目を返すフック（組み立てが領域の項目を並べたもの。描くたびに呼ぶ） */
  useNavItems: () => readonly NavItem[];
  /** アプリの切り替えの状態を返すフック（任意。なければ切り替えも設定の入口も出さない。描くたびに呼ぶ） */
  useApps?: () => ShellAppsView;
};

/** アプリの切り替えを渡されないときの状態（切り替えも設定の入口も出さない）。 */
const NO_APPS: ShellAppsView = {
  apps: [],
  place: null,
  hidden: false,
  placeVisible: false,
  appsPath: null,
  settingsPath: null,
};

/**
 * アプリの切り替えを渡されないときのフック。
 * @returns 切り替えも設定の入口も出さない状態
 */
function useNoApps(): ShellAppsView {
  return NO_APPS;
}

/**
 * 道が変わったら、新しい画面の h1 にフォーカスを移す。
 * @param resolvedPath 新しい画面を描き終えた道
 * @param mainRef 本文の要素
 */
function useFocusHeadingOnNavigation(
  resolvedPath: string | undefined,
  mainRef: RefObject<HTMLElement | null>,
) {
  const previousPath = useRef(resolvedPath);
  useEffect(() => {
    // 最初に開いたときは動かさない（先頭の「本文へ移る」から Tab で進めるように）
    if (previousPath.current === undefined || previousPath.current === resolvedPath) {
      previousPath.current = resolvedPath;
      return;
    }
    previousPath.current = resolvedPath;
    const main = mainRef.current;
    if (!main) return;
    const focusHeading = () => {
      const heading = main.querySelector<HTMLElement>("h1");
      heading?.focus();
      return heading !== null;
    };
    if (focusHeading()) return;
    // 読みこみ中の画面（ログインの確かめ・データの読みこみ）は、あとから h1 が出る。出たときに一度だけ移す。
    // その間に利用者がフォーカスを動かしたら、動かさない（移ったときのフォーカスか、本文の外れたときだけ）
    const focusedAtNavigation = document.activeElement;
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      if (active !== focusedAtNavigation && active !== document.body && active !== null) {
        observer.disconnect();
        return;
      }
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    const timer = window.setTimeout(() => observer.disconnect(), HEADING_WAIT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [resolvedPath, mainRef]);
}

/** ナビの項目の並びが受け取るもの。 */
type NavListProps = {
  /** 項目 */
  items: readonly NavItem[];
  /** 今の項目 */
  current: CurrentNav | undefined;
};

/**
 * PC のサイドバーの項目（縦に並べる。今の項目は左の墨の線と太字）。
 * @param props 項目（items）・今の項目（current）
 * @returns 要素
 */
function SidebarList({ items, current }: NavListProps) {
  // まとまりの見出しがある項目（設定のナビ）は、見出しごとに分けて出す
  if (items.some((item) => item.group)) {
    const groups: { label: string; items: NavItem[] }[] = [];
    for (const item of items) {
      const label = item.group ?? "";
      const last = groups.at(-1);
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return (
      <div className="flex flex-col gap-xxs py-xxs">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col">
            <p className="px-xs pt-xxs text-xs font-bold text-text-sub">{group.label}</p>
            <SidebarItems items={group.items} current={current} />
          </div>
        ))}
      </div>
    );
  }
  return <SidebarItems items={items} current={current} className="py-xs" />;
}

/**
 * サイドバーの項目の並び。
 * @param props 項目（items）・今の項目（current）・追加の class
 * @returns 要素
 */
function SidebarItems({ items, current, className }: NavListProps & { className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-x3s px-xxs", className)}>
      {items.map((item) => {
        const here = current?.id === item.id ? current.ariaCurrent : undefined;
        return (
          <li key={item.id}>
            <Link
              to={item.to}
              activeOptions={{ exact: true }}
              aria-current={here}
              data-nav-item=""
              className={cn(
                "flex min-h-xl items-center gap-xxs rounded-sm border-l-4 px-xs text-m text-text",
                here
                  ? "border-primary bg-surface font-bold"
                  : "border-transparent hover:bg-surface-over",
              )}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * スマホのタブバーの項目（横に等しく並べる。今の項目は上の墨の線と太字）。
 * @param props 項目（items）・今の項目（current）
 * @returns 要素
 */
function TabBarList({ items, current }: NavListProps) {
  return (
    <ul className="grid auto-cols-fr grid-flow-col">
      {items.map((item) => {
        const here = current?.id === item.id ? current.ariaCurrent : undefined;
        return (
          <li key={item.id} className="flex">
            <Link
              to={item.to}
              activeOptions={{ exact: true }}
              aria-current={here}
              data-nav-item=""
              className={cn(
                "flex min-h-xxl w-full flex-col items-center justify-center gap-x3s border-t-2 px-x3s py-x3s text-center text-xs leading-tight",
                here ? "border-primary font-bold text-text" : "border-transparent text-text-sub",
              )}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 画面の外枠。
 * @param props ナビの項目を返すフック（useNavItems）・アプリの切り替えの状態を返すフック（useApps）
 * @returns 外枠の要素
 */
export function AppShell({ useNavItems, useApps = useNoApps }: AppShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // 新しい画面を描き終えた道（開いたときに読む画面〈lazy〉も、読み終えてから変わる）
  const resolvedPath = useRouterState({ select: (state) => state.resolvedLocation?.pathname });
  const layout = useRouterState({
    select: (state): ShellLayout => state.matches.at(-1)?.staticData.layout ?? "admin",
  });
  const navItems = useNavItems();
  const apps = useApps();
  const notice = useNotice();
  const mainRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  useEffect(() => {
    // スマホの管理の形は、窓でなく枠がスクロールする。道が変わったら上に戻す（窓は道の道具が戻す）
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [resolvedPath]);
  useFocusHeadingOnNavigation(resolvedPath, mainRef);

  useEffect(() => {
    // ほかの道へ移ったら、前の道の知らせを消す
    if (notice && notice.path !== pathname) clearNotice();
  }, [notice, pathname]);

  const placeAppKey = apps.place?.kind === "app" ? apps.place.key : undefined;
  useEffect(() => {
    // 見えると確かめたアプリの中にいるときは、そのアプリをこの端末に覚える（はじめの画面〈/〉で開く）
    if (placeAppKey !== undefined && apps.placeVisible) writeLastApp(placeAppKey);
  }, [placeAppKey, apps.placeVisible]);

  const admin = layout === "admin";
  // 切り替えは、見えるアプリが2つ以上のときだけ（1つなら今までと同じ見た目）
  const withSwitcher = admin && apps.apps.length >= 2;
  const inSettings = apps.place?.kind === "settings";
  const withNav = admin && navItems.length > 0;
  // PC のサイドバー：ナビの項目か、切り替えがあるとき
  const withSidebar = withNav || withSwitcher;
  // スマホのタブバー：ナビの項目があるとき（設定は一覧の画面から入るので出さない）
  const withTabBar = withNav && !inSettings;
  const current = withNav ? currentNav(navItems, pathname) : undefined;
  const settingsPath = admin ? apps.settingsPath : null;
  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    writeSidebarOpen(next);
  };

  return (
    <div className={cn("flex min-h-dvh flex-col px-safe", withTabBar && "max-wide:h-dvh")}>
      <a
        href="#main"
        className="sr-only rounded-sm bg-surface px-xs py-xxs text-text-link focus:not-sr-only focus:fixed focus:top-xxs focus:left-xxs"
      >
        本文へ移る
      </a>
      <div
        ref={scrollRef}
        className={cn(
          "flex flex-1 flex-col",
          withTabBar && "max-wide:relative max-wide:min-h-0 max-wide:overflow-y-auto",
        )}
      >
        <header className="border-b border-border bg-surface">
          <div className="flex min-h-xxl items-center gap-xxs px-xs wide:px-s">
            {withSidebar ? (
              <button
                type="button"
                aria-label="メニュー"
                aria-expanded={sidebarOpen}
                aria-controls={SIDEBAR_ID}
                onClick={toggleSidebar}
                className="-ml-xxs hidden size-xl shrink-0 cursor-pointer items-center justify-center rounded-sm text-text hover:bg-surface-over wide:flex"
              >
                <NavIcon name="menu" />
              </button>
            ) : null}
            {layout === "admin" ? (
              <Link to="/" className="text-l leading-tight font-bold text-text">
                {APP_NAME}
              </Link>
            ) : (
              <span className="text-l leading-tight font-bold text-text">{APP_NAME}</span>
            )}
            {settingsPath || withSwitcher ? (
              <div className="ml-auto flex min-w-0 items-center gap-xxs">
                {settingsPath ? (
                  <Link
                    to={settingsPath}
                    aria-current={inSettings ? "page" : undefined}
                    className={cn(
                      "min-h-xl shrink-0 items-center gap-xxs rounded-sm px-xs text-m text-text hover:bg-surface-over",
                      inSettings && "bg-surface-over font-bold",
                      withSwitcher ? "hidden wide:flex" : "flex",
                    )}
                  >
                    <Icon name="settings" className="size-xs" />
                    設定
                  </Link>
                ) : null}
                {withSwitcher ? (
                  <div className="min-w-0 wide:hidden">
                    <MobileAppSwitcher view={apps} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>
        <div className="flex flex-1 flex-col wide:flex-row">
          {withSidebar ? (
            <div
              id={SIDEBAR_ID}
              className={cn(
                "hidden bg-surface-sunken wide:w-sidebar wide:shrink-0 wide:border-r wide:border-border",
                sidebarOpen && "wide:block",
              )}
            >
              {withSwitcher ? (
                <div className="px-xxs pt-xs">
                  <SidebarAppSwitcher view={apps} />
                </div>
              ) : null}
              {apps.place?.kind === "apps" ? (
                <p className="px-xs py-xs text-s text-text-sub">
                  アプリを選ぶと、そのアプリのメニューがここに出ます。
                </p>
              ) : null}
              {withNav ? (
                <nav aria-label="メイン">
                  <SidebarList items={navItems} current={current} />
                </nav>
              ) : null}
            </div>
          ) : null}
          <main
            id="main"
            ref={mainRef}
            tabIndex={-1}
            className={cn(
              // 本文は幅の上限まで広げ、広い画面では中央に寄せる（左右に同じ余白）
              "mx-auto flex w-full max-w-page min-w-0 flex-col gap-s px-xs py-s outline-none wide:px-m wide:py-m",
            )}
          >
            {notice && notice.path === pathname ? (
              <NotificationBar tone={notice.tone} onClose={clearNotice}>
                {notice.message}
              </NotificationBar>
            ) : null}
            {inSettings && settingsPath && pathname !== settingsPath ? (
              <Link
                to={settingsPath}
                className="-mb-xxs flex items-center gap-x3s self-start text-m text-text-link underline wide:hidden"
              >
                <Icon name="back" className="size-xs" />
                設定の一覧へ
              </Link>
            ) : null}
            {apps.hidden ? <NotFoundPage /> : <Outlet />}
          </main>
        </div>
      </div>
      {withTabBar ? (
        <nav
          aria-label="メイン"
          className="shrink-0 border-t border-border bg-surface pb-safe wide:hidden"
        >
          <TabBarList items={navItems} current={current} />
        </nav>
      ) : null}
    </div>
  );
}
