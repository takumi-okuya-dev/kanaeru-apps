// 管理の画面の行き来：道が登録されている項目だけを、役目に合わせて出す。今の画面に印。押すと画面を読みこみ直さずに移る。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { ADMIN_ROUTE_PATTERNS, adminPaths } from "@workspace/contracts/event";
import type { EventRole } from "@workspace/contracts/event";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EventAdminNav } from "./EventAdminNav.tsx";
import { availableAdminTabs, firstAdminPath } from "./admin-tabs.ts";

/** 試しの交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * 決めた管理の画面の道だけを登録した道の木で、ナビを描く。
 * @param patterns 登録する道の形
 * @param role 役目
 * @param start 始めの道
 * @returns 道の道具
 */
async function renderNav(patterns: readonly string[], role: EventRole, start: string) {
  const rootRoute = createRootRoute();
  const routes = patterns.map((pattern) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: pattern,
      component: () => (
        <main>
          <p>今の道：{pattern}</p>
          <EventAdminNav eventId={EVENT_ID} role={role} />
        </main>
      ),
    }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [start] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByText(/今の道/);
  return router;
}

describe("管理の画面の行き来", () => {
  it("主催者には、登録された項目を並びの順に出し、今の画面に印を付ける", async () => {
    const router = await renderNav(
      [ADMIN_ROUTE_PATTERNS.eventReception, ADMIN_ROUTE_PATTERNS.eventSetup],
      "organizer",
      adminPaths.eventSetup(EVENT_ID),
    );
    const nav = screen.getByRole("navigation", { name: "交流会の管理" });
    const links = Array.from(nav.querySelectorAll("a")).map((link) => link.textContent);
    expect(links).toEqual(["参加者・合計", "準備"]);
    expect(screen.getByRole("link", { name: "準備" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("link", { name: "参加者・合計" }));
    await screen.findByText(`今の道：${ADMIN_ROUTE_PATTERNS.eventReception}`);
    expect(router.state.location.pathname).toBe(adminPaths.eventReception(EVENT_ID));
  });

  it("受付係には主催者だけの項目を出さない（1つ以下ならナビを出さない）", async () => {
    await renderNav(
      [ADMIN_ROUTE_PATTERNS.eventReception, ADMIN_ROUTE_PATTERNS.eventSetup],
      "staff",
      adminPaths.eventReception(EVENT_ID),
    );
    expect(screen.queryByRole("navigation", { name: "交流会の管理" })).toBeNull();
  });

  it("行き先は、その役目で出す最初の項目（なければ undefined）", () => {
    const all = new Set(Object.values(ADMIN_ROUTE_PATTERNS));
    expect(availableAdminTabs("organizer", all).map((tab) => tab.id)).toEqual([
      "reception",
      "concerns",
      "setup",
    ]);
    expect(availableAdminTabs("staff", all).map((tab) => tab.id)).toEqual(["reception"]);
    const onlyEvent = new Set([ADMIN_ROUTE_PATTERNS.eventSetup]);
    expect(firstAdminPath(EVENT_ID, "organizer", onlyEvent)).toBe(adminPaths.eventSetup(EVENT_ID));
    expect(firstAdminPath(EVENT_ID, "staff", onlyEvent)).toBeUndefined();
  });
});
