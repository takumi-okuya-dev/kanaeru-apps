// 外枠のナビの「名簿」：名簿を使う交流会の中で、交流会を読んだあとだけ出す。受付だけ・交流会の外・読む前は出さない。
// ナビのために問い合わせを始めない（fetch を呼ばない）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { BOOKING_ROUTE_PATTERNS } from "@workspace/contracts/booking";
import { ADMIN_ROUTE_PATTERNS } from "@workspace/contracts/event";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENT_QUERY_KEYS } from "../event/index.ts";
import { useBookingNavItems } from "./nav-items.ts";
import { BOOKING_QUERY_KEYS } from "./queries.ts";

/** 試しの交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * 項目を文字にして出す。
 * @returns 項目の並び
 */
function Items() {
  const items = useBookingNavItems();
  return (
    <ul aria-label="項目">
      {items.map((item) => (
        <li key={item.id}>{`${item.label} ${item.to}`}</li>
      ))}
    </ul>
  );
}

/**
 * 項目を描く。
 * @param start 始めの道
 * @param cache 読みこみ済みにするもの
 * @param cache.event 交流会を読んだか
 * @param cache.mode 使い方（undefined なら読んでいない）
 * @returns 項目の文字
 */
async function renderItems(
  start: string,
  cache: { event: boolean; mode?: "reception" | "roster" | "self_page" },
) {
  cleanup();
  const rootRoute = createRootRoute();
  const routes = [
    ...Object.values(ADMIN_ROUTE_PATTERNS),
    ...Object.values(BOOKING_ROUTE_PATTERNS),
  ].map((pattern) =>
    createRoute({ getParentRoute: () => rootRoute, path: pattern, component: Items }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [start] }),
  });
  const queryClient = new QueryClient();
  if (cache.event) queryClient.setQueryData(EVENT_QUERY_KEYS.detail(EVENT_ID), { myRole: "staff" });
  if (cache.mode) {
    queryClient.setQueryData(BOOKING_QUERY_KEYS.setting(EVENT_ID), {
      mode: cache.mode,
      entryCount: 0,
    });
  }
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
  vi.unstubAllGlobals();
});

describe("外枠のナビの名簿", () => {
  it("名簿を使う交流会の中では「名簿」を出す（名簿の画面の中でも）", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await renderItems(`/admin/events/${EVENT_ID}`, { event: true, mode: "roster" })).toEqual(
      [`名簿 /admin/events/${EVENT_ID}/roster`],
    );
    expect(
      await renderItems(`/admin/events/${EVENT_ID}/roster/match`, { event: true, mode: "roster" }),
    ).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("自前で申込みを受ける交流会の中でも「名簿」を出す（booking-003）", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(
      await renderItems(`/admin/events/${EVENT_ID}`, { event: true, mode: "self_page" }),
    ).toEqual([`名簿 /admin/events/${EVENT_ID}/roster`]);
  });

  it("受付だけ・使い方を読む前・交流会を読む前・交流会の外では出さない", async () => {
    expect(
      await renderItems(`/admin/events/${EVENT_ID}`, { event: true, mode: "reception" }),
    ).toEqual([]);
    expect(await renderItems(`/admin/events/${EVENT_ID}`, { event: true })).toEqual([]);
    expect(
      await renderItems(`/admin/events/${EVENT_ID}`, { event: false, mode: "roster" }),
    ).toEqual([]);
    expect(await renderItems("/admin/events", { event: true, mode: "roster" })).toEqual([]);
  });
});
