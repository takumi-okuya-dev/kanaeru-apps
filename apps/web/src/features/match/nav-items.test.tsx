// 外枠のナビに出す試合表の項目（core-022）：試合表の画面の外は何も出さない。試合表の画面の中では、
// 一覧・作るの画面でも項目を出す（直前に開いた試合表へ進む。記録がなければ薄く）。
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LAST_TABLE_KEY, readLastTable, writeLastTable } from "./last-table.ts";
import { useMatchNavItems } from "./nav-items.ts";
import { resetForAccount } from "./offline/account-reset.ts";
import { createMemoryStore, setOfflineStoreForTest } from "./offline/store.ts";
import { MATCH_ROUTE_PATTERNS, matchPaths } from "./paths.ts";

/**
 * 項目を文字にして出す（名前・行き先・ほかに含める道・薄い印）。
 * @returns 項目の並び
 */
function Items() {
  const items = useMatchNavItems();
  return (
    <ul aria-label="項目">
      {items.map((item) => (
        <li key={item.id}>
          {[item.label, item.to, ...(item.also ?? []), ...(item.disabled ? ["（薄い）"] : [])].join(
            " ",
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * 試合表の道と、外の道を登録した道の木で、項目を描く。
 * @param start 始めの道
 * @returns 項目の文字（項目がなければ空の並び）
 */
async function renderItems(start: string) {
  const rootRoute = createRootRoute();
  const paths = [...Object.values(MATCH_ROUTE_PATTERNS), "/apps"];
  const routes = paths.map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: Items }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [start] }),
  });
  render(<RouterProvider router={router} />);
  const list = await screen.findByRole("list", { name: "項目" });
  return Array.from(list.querySelectorAll("li")).map((item) => item.textContent);
}

/** 薄い5つの項目（記録がないとき）。行き先は、押したときに進む一覧。 */
const DIM_ITEMS = [
  "名簿と設定 /match （薄い）",
  "試合表 /match （薄い）",
  "印刷 /match （薄い）",
  "見るだけのページ /match （薄い）",
  "QR で受け付ける /match （薄い）",
];

/**
 * 試合表 t1 の項目の文字。
 * @returns 項目の並び（一覧と5つ）
 */
function itemsOfTable(): string[] {
  return [
    "試合表の一覧 /match /match/new",
    `名簿と設定 ${matchPaths.roster("t1")}`,
    `試合表 ${matchPaths.board("t1")}`,
    `印刷 ${matchPaths.print("t1")}`,
    `見るだけのページ ${matchPaths.viewLink("t1")}`,
    `QR で受け付ける ${matchPaths.joinAdmin("t1")}`,
  ];
}

afterEach(() => {
  window.localStorage.clear();
  setOfflineStoreForTest(undefined);
});

describe("外枠のナビの試合表の項目", () => {
  it("試合表の画面の外では、何も出さない（記録があっても）", async () => {
    writeLastTable("t1");
    expect(await renderItems("/apps")).toEqual([]);
  });

  it("一覧で、記録がなければ、試合表の一覧と薄い5つの項目", async () => {
    expect(await renderItems("/match")).toEqual(["試合表の一覧 /match /match/new", ...DIM_ITEMS]);
  });

  it("一覧・作るの画面で、直前に開いた試合表があれば、その試合表へ進む", async () => {
    writeLastTable("t1");
    expect(await renderItems("/match")).toEqual(itemsOfTable());
    expect(await renderItems("/match/new")).toEqual(itemsOfTable());
  });

  it("試合表の中では、その試合表の項目を出し、直前の記録にする", async () => {
    writeLastTable("t0");
    expect(await renderItems("/match/tables/t1/board")).toEqual(itemsOfTable());
    await waitFor(() => expect(readLastTable()).toBe("t1"));
  });

  it("利用者が替わった片付け（試合表の写しの片付け）で、記録が消え、薄い項目に戻る", async () => {
    setOfflineStoreForTest(createMemoryStore());
    writeLastTable("t1");
    await resetForAccount(null);
    expect(window.localStorage.getItem(LAST_TABLE_KEY)).toBeNull();
    expect(await renderItems("/match")).toEqual(["試合表の一覧 /match /match/new", ...DIM_ITEMS]);
  });
});
