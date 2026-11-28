// 本棚の画面：読んでいる本が並ぶ・読み終えた本は閉じている・書影がなければ仮の表紙・空のときの案内・主のボタン「取りこむ」。
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ShelfPage } from "./ShelfPage.tsx";
import { SUMMARY, stubReadingApi } from "./test-api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("本棚の画面", () => {
  it("読んでいる本が並び、読み終えた本は閉じた「読み終えた本」の中にある", async () => {
    stubReadingApi((request) =>
      request.path === "/api/v1/reading/books"
        ? Response.json({
            items: [
              SUMMARY,
              {
                ...SUMMARY,
                id: "0193a1b2-0000-7000-8000-000000000399",
                title: "読み終えた見本",
                status: "finished",
              },
            ],
          })
        : undefined,
    );
    renderWithRouter(<ShelfPage />);
    const item = await screen.findByRole("listitem", { name: "見本のネットワーク入門" });
    expect(within(item).getByText("GoodNotes・マーカー 2")).toBeVisible();
    expect(within(item).getByTestId("placeholder-cover")).toBeInTheDocument();
    expect(screen.getByText("読み終えた本（1冊）")).toBeVisible();
    expect(screen.getByText("読み終えた見本")).not.toBeVisible();
    expect(screen.getByRole("link", { name: "取りこむ" })).toHaveAttribute(
      "href",
      "/reading/import",
    );
    expect(screen.getByRole("link", { name: "本を足す" })).toHaveAttribute(
      "href",
      "/reading/books/new",
    );
  });

  it("本がないときは、最初にすることを出す", async () => {
    stubReadingApi(() => Response.json({ items: [] }));
    renderWithRouter(<ShelfPage />);
    expect(await screen.findByText(/まだ本がありません/)).toBeVisible();
  });
});
