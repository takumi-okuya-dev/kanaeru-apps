// 外枠：管理の形はサイドバー（メニューのボタンで開閉し、覚える）とタブバー、ナビなしの形は帯だけ。
// 今の項目に aria-current。道が変わったら h1 にフォーカスを移す。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { APP_NAME } from "../lib/app-name.ts";
import { LAST_APP_STORAGE_KEY } from "../lib/apps.ts";
import type { ShellApp, ShellAppsView } from "../lib/apps.ts";
import type { NavItem } from "../lib/feature.ts";
import { AppShell } from "./AppShell.tsx";
import { SIDEBAR_STORAGE_KEY } from "./sidebar-state.ts";

/** 試しの項目。 */
const ITEMS: readonly NavItem[] = [
  { id: "list", label: "交流会の一覧", to: "/admin/events", icon: "list" },
  { id: "reception", label: "参加者・合計", to: "/admin/events/e1", icon: "people" },
];

/**
 * 試しの道の木で外枠を描く。
 * @param start 始めの道
 * @param items ナビの項目
 * @param apps アプリの切り替えの状態（なければ渡さない）
 * @returns 道の道具
 */
async function renderShell(start: string, items: readonly NavItem[] = ITEMS, apps?: ShellAppsView) {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell useNavItems={() => items} {...(apps ? { useApps: () => apps } : {})} />
    ),
  });
  const page = (path: string, title: string, bare = false) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      ...(bare ? { staticData: { layout: "bare" as const } } : {}),
      component: () => <h1 tabIndex={-1}>{title}</h1>,
    });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      page("/", "はじめ"),
      page("/admin/events", "交流会の一覧の画面"),
      page("/admin/events/$eventId", "参加者・合計の画面"),
      page("/e/$eventId/checkin", "チェックイン", true),
      page("/apps", "すべてのアプリの画面"),
      page("/settings", "設定の画面"),
      page("/settings/account", "アカウントの画面"),
      page("/sample", "見本のアプリの画面"),
    ]),
    history: createMemoryHistory({ initialEntries: [start] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return router;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("外枠", () => {
  it("管理の形は、サイドバーとタブバーに同じ項目を出し、今の画面に aria-current を付ける", async () => {
    await renderShell("/admin/events/e1");
    const navs = screen.getAllByRole("navigation", { name: "メイン" });
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      const links = within(nav).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["交流会の一覧", "参加者・合計"]);
      expect(within(nav).getByRole("link", { name: "参加者・合計" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(within(nav).getByRole("link", { name: "交流会の一覧" })).not.toHaveAttribute(
        "aria-current",
      );
    }
    expect(screen.getByRole("link", { name: APP_NAME })).toBeInTheDocument();
  });

  it("メニューのボタンでサイドバーを隠し、覚える（描き直しても隠れたまま）", async () => {
    await renderShell("/admin/events");
    const button = screen.getByRole("button", { name: "メニュー" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", "app-sidebar");
    expect(document.getElementById("app-sidebar")).toHaveClass("wide:block");

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("app-sidebar")).not.toHaveClass("wide:block");
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("0");
  });

  it("隠したことを覚えていれば、はじめから隠す", async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "0");
    await renderShell("/admin/events");
    expect(screen.getByRole("button", { name: "メニュー" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("ナビなしの道は、ナビもメニューのボタンも出さず、アプリの名前をリンクにしない", async () => {
    await renderShell("/e/e1/checkin");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "メニュー" })).toBeNull();
    expect(screen.queryByRole("link", { name: APP_NAME })).toBeNull();
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
  });

  it("項目がなければ、ナビを出さない", async () => {
    await renderShell("/admin/events", []);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "メニュー" })).toBeNull();
  });

  it("タブバーの項目を押すと移り、新しい画面の h1 にフォーカスが移る", async () => {
    const router = await renderShell("/admin/events/e1");
    const [, tabBar] = screen.getAllByRole("navigation", { name: "メイン" });
    if (!tabBar) throw new Error("タブバーがありません");
    await userEvent.click(within(tabBar).getByRole("link", { name: "交流会の一覧" }));
    const heading = await screen.findByRole("heading", { name: "交流会の一覧の画面" });
    expect(router.state.location.pathname).toBe("/admin/events");
    await expect.poll(() => document.activeElement).toBe(heading);
  });
});

/** 試しのアプリ（受付と見本）。 */
const RECEPTION: ShellApp = {
  key: "reception",
  name: "受付",
  summary: "交流会の受付・アンケート",
  icon: "qr",
  startPath: "/admin/events",
  operatorOnly: false,
};
const SAMPLE: ShellApp = {
  key: "sample",
  name: "見本",
  summary: "見本のアプリ",
  icon: "list",
  startPath: "/sample",
  operatorOnly: true,
};

/**
 * 試しのアプリの切り替えの状態。
 * @param overrides 替える値
 * @returns 状態
 */
function appsView(overrides: Partial<ShellAppsView> = {}): ShellAppsView {
  return {
    apps: [RECEPTION],
    place: { kind: "app", key: "reception" },
    hidden: false,
    appsPath: "/apps",
    settingsPath: "/settings",
    ...overrides,
  };
}

describe("外枠のアプリの切り替え（core-005）", () => {
  it("見えるアプリが1つなら切り替えを出さず、設定の入口だけを出す。今のアプリを覚える", async () => {
    await renderShell("/admin/events", ITEMS, appsView());
    expect(screen.queryByRole("button", { name: /切り替える）$/ })).toBeNull();
    expect(screen.getByRole("link", { name: "設定" })).toHaveAttribute("href", "/settings");
    expect(screen.getAllByRole("navigation", { name: "メイン" })).toHaveLength(2);
    expect(window.localStorage.getItem(LAST_APP_STORAGE_KEY)).toBe("reception");
  });

  it("見えるアプリが2つなら、PC は切り替えのメニューに使えるアプリ・運営者だけの札・すべてのアプリを出す", async () => {
    await renderShell("/admin/events", ITEMS, appsView({ apps: [RECEPTION, SAMPLE] }));
    // 上の帯（スマホ）のあとに、サイドバー（PC）の切り替えがある
    const pcTrigger = screen.getAllByRole("button", { name: /切り替える）$/ }).at(-1);
    if (!pcTrigger) throw new Error("切り替えがありません");
    await userEvent.click(pcTrigger);
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "受付交流会の受付・アンケート",
      "見本運営者だけ見本のアプリ",
      "すべてのアプリ",
    ]);
    expect(items[0]).toHaveAttribute("aria-current", "page");
    expect(items[2]).toHaveAttribute("href", "/apps");
  });

  it("スマホの切り替えは下から出す枠で、すべてのアプリと設定も出す", async () => {
    await renderShell("/admin/events", ITEMS, appsView({ apps: [RECEPTION, SAMPLE] }));
    const triggers = screen.getAllByRole("button", { name: /切り替える）$/ });
    const [mobile] = triggers;
    if (!mobile) throw new Error("切り替えがありません");
    await userEvent.click(mobile);
    const sheet = await screen.findByRole("dialog", { name: "アプリを切り替える" });
    expect(
      within(sheet)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "受付交流会の受付・アンケート",
      "見本運営者だけ見本のアプリ",
      "すべてのアプリ",
      "設定",
    ]);
  });

  it("すべてのアプリの画面は、ナビの項目なしでサイドバーに切り替えと案内を出す", async () => {
    await renderShell(
      "/apps",
      [],
      appsView({ apps: [RECEPTION, SAMPLE], place: { kind: "apps" } }),
    );
    expect(
      screen.getAllByRole("button", { name: "アプリ すべてのアプリ（切り替える）" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("アプリを選ぶと、そのアプリのメニューがここに出ます。")).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "メイン" })).toBeNull();
  });

  it("設定の画面は、見出しごとのナビを出し、タブバーを出さず、スマホは一覧へ戻るリンクを出す", async () => {
    const settingsItems: NavItem[] = [
      {
        id: "account",
        label: "アカウント",
        to: "/settings/account",
        icon: "account",
        group: "個人の設定",
      },
      {
        id: "ledger",
        label: "アプリの台帳",
        to: "/settings/apps",
        icon: "ledger",
        group: "運営（運営者だけ）",
      },
    ];
    await renderShell(
      "/settings/account",
      settingsItems,
      appsView({ place: { kind: "settings" } }),
    );
    const navs = screen.getAllByRole("navigation", { name: "メイン" });
    expect(navs).toHaveLength(1);
    const [nav] = navs;
    if (!nav) throw new Error("ナビがありません");
    expect(within(nav).getByText("個人の設定")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "アカウント" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "設定" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "設定の一覧へ" })).toHaveAttribute("href", "/settings");
  });

  it("今の道のアプリが見えないときは、ページが見つかりませんを出し、覚えない", async () => {
    render(<></>);
    const rootRoute = createRootRoute({
      component: () => (
        <AppShell
          useNavItems={() => ITEMS}
          useApps={() => appsView({ place: { kind: "app", key: "sample" }, hidden: true })}
        />
      ),
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        createRoute({
          getParentRoute: () => rootRoute,
          path: "/sample",
          component: () => <h1>見本のアプリの画面</h1>,
        }),
      ]),
      history: createMemoryHistory({ initialEntries: ["/sample"] }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
    expect(screen.queryByText("見本のアプリの画面")).toBeNull();
    expect(window.localStorage.getItem(LAST_APP_STORAGE_KEY)).toBeNull();
  });
});
