// 人の一覧と検索の画面：名前の横に見た目の特徴が出る・検索の結果に当たった所が分かる形で出る・検索の言葉とタグを入れても
// URL も sessionStorage も変わらない・500人を超えたときの案内・自分だけが見られることが出る。API は fetch の差しかえで答える。
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ListPage } from "./ListPage.tsx";
import { SUMMARY, stubPersonApi } from "./test-api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * 一覧と検索に答える。
 * @param truncated 500人を超えたか
 * @returns 送られた要求
 */
function stubList(truncated = false) {
  return stubPersonApi((request) => {
    if (request.method === "GET" && request.path === "/api/v1/person/notes") {
      return Response.json({
        items: [
          SUMMARY,
          {
            ...SUMMARY,
            id: "0193a1b2-0000-7000-8000-000000000102",
            fullName: "鈴木 花子",
            appearance: null,
            tags: ["Go"],
          },
        ],
        truncated,
      });
    }
    if (request.method === "POST" && request.path === "/api/v1/person/notes/search") {
      return Response.json({
        items: [
          {
            note: SUMMARY,
            matches: [{ field: "talk", before: "", hit: "Go", after: " のバックエンド" }],
          },
        ],
        truncated: false,
      });
    }
    return undefined;
  });
}

describe("人の一覧と検索の画面", () => {
  it("名前の横に見た目の特徴が出る。自分だけが見られることが出る", async () => {
    stubList();
    renderWithRouter(<ListPage />);
    const item = await screen.findByRole("listitem", { name: /田中 太郎/ });
    expect(within(item).getByText("黒ぶちの眼鏡")).toBeVisible();
    expect(screen.getByText("このメモを見られるのはあなただけです。")).toBeVisible();
    expect(screen.queryByText(/新しい500人だけ/)).toBeNull();
  });

  it("500人を超えたときは案内が出る", async () => {
    stubList(true);
    renderWithRouter(<ListPage />);
    expect(
      await screen.findByText("新しい500人だけを出しています。探すと全員から探せます。"),
    ).toBeVisible();
  });

  it("探すと当たった所が印つきで出て、URL も sessionStorage も変わらない", async () => {
    const sent = stubList();
    renderWithRouter(<ListPage />);
    const before = window.location.href;
    await userEvent.type(await screen.findByRole("searchbox", { name: "探す言葉" }), "ｇｏ");
    await userEvent.click(screen.getByRole("button", { name: "探す" }));
    const hit = await screen.findByText("Go", { selector: "mark" });
    expect(hit).toBeVisible();
    expect(screen.getByText("話したこと：", { exact: false })).toBeVisible();
    expect(sent.find((request) => request.path.endsWith("/search"))?.body).toEqual({
      query: "ｇｏ",
    });
    expect(window.location.href).toBe(before);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("タグを選ぶと、そのタグで探す（URL は変わらない）", async () => {
    const sent = stubList();
    renderWithRouter(<ListPage />);
    const before = window.location.href;
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "タグで絞る" }),
      "AI",
    );
    await waitFor(() =>
      expect(sent.find((request) => request.path.endsWith("/search"))?.body).toEqual({ tag: "AI" }),
    );
    expect(window.location.href).toBe(before);
  });
});
