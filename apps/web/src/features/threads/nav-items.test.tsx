// 外枠のナビに出す Threads の運用の項目：Threads の画面の外は何も出さない（機能の印が切の環境で入口を出さない）。
// 一覧では「アカウント」だけ、運用アカウントの中では「投稿の案」「案を作る」「戦略」「設定」も出す。
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useThreadsNavItems } from "./nav-items.ts";
import { THREADS_ROUTE_PATTERNS } from "./paths.ts";

/** 試しの運用アカウントの ID。 */
const ACCOUNT_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * 項目を文字にして出す（名前と行き先）。
 * @returns 項目の並び
 */
function Items() {
  const items = useThreadsNavItems();
  return (
    <ul aria-label="項目">
      {items.map((item) => (
        <li key={item.id}>{`${item.label} ${item.to}`}</li>
      ))}
    </ul>
  );
}

/**
 * Threads の道とほかの道を登録した道の木で、項目を描く。
 * @param start 始めの道
 * @returns 項目の文字
 */
async function renderItems(start: string): Promise<string[]> {
  const rootRoute = createRootRoute();
  const patterns = [...Object.values(THREADS_ROUTE_PATTERNS), "/admin/events"];
  const routes = patterns.map((pattern) =>
    createRoute({ getParentRoute: () => rootRoute, path: pattern, component: Items }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [start] }),
  });
  render(<RouterProvider router={router} />);
  const list = await screen.findByRole("list", { name: "項目" });
  return [...list.querySelectorAll("li")].map((item) => item.textContent);
}

describe("Threads の運用のナビの項目", () => {
  it("Threads の画面の外では、何も出さない", async () => {
    expect(await renderItems("/admin/events")).toEqual([]);
  });

  it("運用アカウントの一覧では「アカウント」だけ", async () => {
    expect(await renderItems("/threads")).toEqual(["アカウント /threads"]);
  });

  it("運用アカウントの中では、その運用アカウントの画面も出す", async () => {
    expect(await renderItems(`/threads/accounts/${ACCOUNT_ID}/stock`)).toEqual([
      "アカウント /threads",
      `投稿の案 /threads/accounts/${ACCOUNT_ID}/stock`,
      `案を作る /threads/accounts/${ACCOUNT_ID}/create`,
      `戦略 /threads/accounts/${ACCOUNT_ID}/strategy`,
      `リサーチ /threads/accounts/${ACCOUNT_ID}/research`,
      `反応 /threads/accounts/${ACCOUNT_ID}/performance`,
      `分析 /threads/accounts/${ACCOUNT_ID}/analysis`,
      `外部メディア /threads/accounts/${ACCOUNT_ID}/media`,
      `設定 /threads/accounts/${ACCOUNT_ID}/settings`,
    ]);
  });
});
