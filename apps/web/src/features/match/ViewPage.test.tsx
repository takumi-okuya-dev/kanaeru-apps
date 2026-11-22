// 見るだけのページ（P1。match-004・match-005）の読み直し：navigator.onLine が true のまま窓口に届かない（通信の誤りが続く）
// ときに、失敗のたびにすぐ読み直し続けない。読み直すのは、電波が戻った知らせ（online）と、30秒おきの確かめだけ。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "../../lib/api.ts";
import { fetchView, fetchViewVersion } from "./api.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";
import { ViewRoute } from "./ViewPage.tsx";

vi.mock("./api.ts", () => ({ fetchView: vi.fn(), fetchViewVersion: vi.fn() }));

/**
 * 見るだけのページを、道と TanStack Query の中で描く。
 * @returns Testing Library の描いた結果
 */
function renderViewPage() {
  const rootRoute = createRootRoute();
  const view = createRoute({
    getParentRoute: () => rootRoute,
    path: MATCH_ROUTE_PATTERNS.view,
    component: ViewRoute,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([view]),
    history: createMemoryHistory({ initialEntries: ["/match/view/view-token"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/**
 * 少し待つ（その間に読み直しが続けて起きないかを見る）。
 * @param ms 待つ時間（ミリ秒）
 */
async function settle(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("見るだけのページの読み直し", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // 失敗のたびに、新しい通信の誤りを投げる（navigator.onLine は true のまま）
    vi.mocked(fetchView).mockImplementation(() =>
      Promise.reject(new NetworkError(new TypeError("Failed to fetch"))),
    );
    vi.mocked(fetchViewVersion).mockImplementation(() =>
      Promise.reject(new NetworkError(new TypeError("Failed to fetch"))),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(fetchView).mockReset();
    vi.mocked(fetchViewVersion).mockReset();
  });

  it("つながっているのに届かないとき、失敗のたびにすぐ読み直し続けない（電波が戻った知らせで1回だけ読み直す）", async () => {
    renderViewPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: "読みこめませんでした" }),
    ).toBeVisible();
    await settle(300);
    expect(vi.mocked(fetchView)).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle(300);
    expect(vi.mocked(fetchView)).toHaveBeenCalledTimes(2);
  });

  it("届かない間は、30秒おきに読み直す", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderViewPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: "読みこめませんでした" }),
    ).toBeVisible();
    expect(vi.mocked(fetchView)).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(vi.mocked(fetchView)).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(vi.mocked(fetchView)).toHaveBeenCalledTimes(2);
  });
});
