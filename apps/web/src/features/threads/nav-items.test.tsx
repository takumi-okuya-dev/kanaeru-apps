// 外枠のナビに出す Threads の運用の項目：Threads の画面の外は何も出さない（機能の印が切の環境で入口を出さない）。
// 入口と一覧では「アカウント」だけ、運用アカウントの中（ホームを含む）では「ホーム」「投稿の案」「案を作る」「戦略」「設定」なども出す。
// どれかの組織に入っている人には「組織」も出す（threads-013）。
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DRAFT_LIST_STATUSES } from "@workspace/contracts/threads";
import { useThreadsNavItems } from "./nav-items.ts";
import { STOCK_TABS, THREADS_ROUTE_PATTERNS } from "./paths.ts";
import { THREADS_QUERY_KEYS } from "./queries.ts";

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
 * @param client 問い合わせの入れ物（画面が読んだ運用アカウントを入れておける）
 * @returns 項目の文字
 */
async function renderItems(start: string, client = new QueryClient()): Promise<string[]> {
  const rootRoute = createRootRoute();
  const patterns = [...Object.values(THREADS_ROUTE_PATTERNS), "/admin/events"];
  const routes = patterns.map((pattern) =>
    createRoute({ getParentRoute: () => rootRoute, path: pattern, component: Items }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [start] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const list = await screen.findByRole("list", { name: "項目" });
  return [...list.querySelectorAll("li")].map((item) => item.textContent);
}

describe("Threads の運用のナビの項目", () => {
  it("Threads の画面の外では、何も出さない", async () => {
    expect(await renderItems("/admin/events")).toEqual([]);
  });

  it("入口と運用アカウントの一覧では「アカウント」と「チーム」（threads-012・threads-016）", async () => {
    const outside = ["アカウント /threads/accounts", "チーム /threads/teams"];
    for (const start of ["/threads", "/threads/accounts", "/threads/teams"]) {
      expect(await renderItems(start)).toEqual(outside);
      cleanup();
    }
  });

  it("運用アカウントのホームでも、その運用アカウントの画面を出す（threads-012）", async () => {
    const items = await renderItems(`/threads/accounts/${ACCOUNT_ID}`);
    expect(items.slice(0, 2)).toEqual([
      "アカウント /threads/accounts",
      `ホーム /threads/accounts/${ACCOUNT_ID}`,
    ]);
  });

  it("運用アカウントの中では、その運用アカウントの画面も出す", async () => {
    expect(await renderItems(`/threads/accounts/${ACCOUNT_ID}/stock`)).toEqual([
      "アカウント /threads/accounts",
      `ホーム /threads/accounts/${ACCOUNT_ID}`,
      `投稿の案 /threads/accounts/${ACCOUNT_ID}/stock`,
      `案を作る /threads/accounts/${ACCOUNT_ID}/create`,
      `戦略 /threads/accounts/${ACCOUNT_ID}/strategy`,
      `リサーチ /threads/accounts/${ACCOUNT_ID}/research`,
      `反応 /threads/accounts/${ACCOUNT_ID}/performance`,
      `分析 /threads/accounts/${ACCOUNT_ID}/analysis`,
      `外部メディア /threads/accounts/${ACCOUNT_ID}/media`,
      `設定 /threads/accounts/${ACCOUNT_ID}/settings`,
      "チーム /threads/teams",
    ]);
  });

  it("画面が運用アカウントを読んでいれば、「投稿の案」に承認待ちの数を添える（threads-011）", async () => {
    const client = new QueryClient();
    client.setQueryData(THREADS_QUERY_KEYS.detail(ACCOUNT_ID), {
      id: ACCOUNT_ID,
      name: "AI部",
      counts: { needsReview: 3, approved: 0, rejected: 0, published: 0, publishFailed: 0 },
      createdAt: "2026-11-20T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
    });
    const items = await renderItems(`/threads/accounts/${ACCOUNT_ID}/stock`, client);
    expect(items[2]).toBe(`投稿の案（3） /threads/accounts/${ACCOUNT_ID}/stock`);
  });

  it("投稿の案の ?tab= の状態は、約束の一覧の状態と同じ並び（threads-011）", () => {
    expect([...STOCK_TABS]).toEqual([...DRAFT_LIST_STATUSES]);
  });
});
