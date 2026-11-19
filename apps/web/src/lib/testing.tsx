// 画面のテストの手伝い（テストだけで使う）：部品を、道（TanStack Router）と TanStack Query の中で描く。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type * as React from "react";

/**
 * 部品を、道と TanStack Query の中で描く（Link が使える。/ のほかの道は空の画面）。
 * @param ui 描く部品
 * @returns Testing Library の描いた結果
 */
export function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute();
  const page = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => ui });
  const other = createRoute({ getParentRoute: () => rootRoute, path: "$", component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([page, other]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
