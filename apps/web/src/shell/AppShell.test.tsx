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
 * @returns 道の道具
 */
async function renderShell(start: string, items: readonly NavItem[] = ITEMS) {
  const rootRoute = createRootRoute({ component: () => <AppShell useNavItems={() => items} /> });
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
