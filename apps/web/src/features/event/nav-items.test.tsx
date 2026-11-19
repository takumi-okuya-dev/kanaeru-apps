// 外枠のナビに出す交流会の項目：外は一覧だけ、中は役目と登録された道で項目を足す。読みこむ前は一覧だけ。
// ナビのために問い合わせを始めない。行き先は交流会を選んだときの最初の項目（firstAdminPath）とそろう。
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
import { afterEach, describe, expect, it, vi } from "vitest";
import { availableAdminTabs, firstAdminPath } from "./admin-tabs.ts";
import { useEventNavItems } from "./nav-items.ts";
import { EVENT_QUERY_KEYS } from "./queries.ts";

/** 試しの交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * 項目を文字にして出す（名前・行き先・ほかに含める道）。
 * @returns 項目の並び
 */
function Items() {
  const items = useEventNavItems();
  return (
    <ul aria-label="項目">
      {items.map((item) => (
        <li key={item.id}>{[item.label, item.to, ...(item.also ?? [])].join(" ")}</li>
      ))}
    </ul>
  );
}

/**
 * 決めた道だけを登録した道の木で、項目を描く。
 * @param start 始めの道
 * @param role 読みこんだ交流会の役目（undefined なら、まだ読んでいない）
 * @param patterns 登録する道の形（既定は管理の道すべて）
 * @returns 項目の文字
 */
async function renderItems(
  start: string,
  role: EventRole | undefined,
  patterns: readonly string[] = Object.values(ADMIN_ROUTE_PATTERNS),
) {
  const rootRoute = createRootRoute();
  const routes = patterns.map((pattern) =>
    createRoute({ getParentRoute: () => rootRoute, path: pattern, component: Items }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [start] }),
  });
  const queryClient = new QueryClient();
  if (role) queryClient.setQueryData(EVENT_QUERY_KEYS.detail(EVENT_ID), { myRole: role });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const list = await screen.findByRole("list", { name: "項目" });
  return Array.from(list.querySelectorAll("li")).map((item) => item.textContent);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("外枠のナビの交流会の項目", () => {
  it("交流会の外では、交流会の一覧だけ", async () => {
    expect(await renderItems(ADMIN_ROUTE_PATTERNS.eventList, undefined)).toEqual([
      "交流会の一覧 /admin/events",
    ]);
    expect(await renderItems(ADMIN_ROUTE_PATTERNS.eventNew, "organizer")).toEqual([
      "交流会の一覧 /admin/events",
    ]);
  });

  it("主催者には4つ（準備は交流会を直すも含む）", async () => {
    expect(await renderItems(adminPaths.eventReception(EVENT_ID), "organizer")).toEqual([
      "交流会の一覧 /admin/events",
      `参加者・合計 ${adminPaths.eventReception(EVENT_ID)}`,
      `困りごと ${adminPaths.eventConcerns(EVENT_ID)}`,
      `準備 ${adminPaths.eventSetup(EVENT_ID)} ${adminPaths.eventEdit(EVENT_ID)}`,
    ]);
  });

  it("受付係には、交流会の一覧と参加者・合計だけ", async () => {
    expect(await renderItems(adminPaths.eventData(EVENT_ID), "staff")).toEqual([
      "交流会の一覧 /admin/events",
      `参加者・合計 ${adminPaths.eventReception(EVENT_ID)}`,
    ]);
  });

  it("交流会を読みこむ前は一覧だけで、ナビのために問い合わせない", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await renderItems(adminPaths.eventSetup(EVENT_ID), undefined)).toEqual([
      "交流会の一覧 /admin/events",
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("登録されていない道の項目は出さない", async () => {
    expect(
      await renderItems(adminPaths.eventSetup(EVENT_ID), "organizer", [
        ADMIN_ROUTE_PATTERNS.eventList,
        ADMIN_ROUTE_PATTERNS.eventSetup,
      ]),
    ).toEqual([
      "交流会の一覧 /admin/events",
      `準備 ${adminPaths.eventSetup(EVENT_ID)} ${adminPaths.eventEdit(EVENT_ID)}`,
    ]);
  });

  it("交流会を選んだときの行き先は、その役目で出す最初の項目（なければ undefined）", () => {
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
