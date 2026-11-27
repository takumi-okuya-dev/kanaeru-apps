// 人の一覧と検索の画面：名前の横に見た目の特徴が出る・検索の結果に当たった所が分かる形で出る・検索の言葉とタグを入れても
// URL も sessionStorage も変わらない・500人を超えたときの案内・自分だけが見られることが出る。API は fetch の差しかえで答える。
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ListPage } from "./ListPage.tsx";
import type { SearchResult } from "@workspace/contracts/person";
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

  it("遅れて届いた前の検索の答えで、新しい答えを上書きしない。「やめる」のあとに届いた答えも出さない", async () => {
    const suzuki = {
      ...SUMMARY,
      id: "0193a1b2-0000-7000-8000-000000000102",
      fullName: "鈴木 花子",
    };
    let releaseSlow: (() => void) | undefined;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    /**
     * 1人だけの検索の結果。
     * @param note 当たった人
     * @returns 結果
     */
    const resultOf = (note: typeof SUMMARY): SearchResult => ({
      items: [{ note, matches: [] }],
      truncated: false,
    });
    stubPersonApi(async (request) => {
      if (request.method === "GET" && request.path === "/api/v1/person/notes") {
        return Response.json({ items: [SUMMARY, { ...suzuki, tags: ["Go"] }], truncated: false });
      }
      if (request.path.endsWith("/search")) {
        const body = request.body as { tag?: string; query?: string };
        if (body.tag === "AI" || body.query === "おそい") {
          await slow;
          return Response.json(resultOf(SUMMARY));
        }
        return Response.json(resultOf(suzuki));
      }
      return undefined;
    });
    renderWithRouter(<ListPage />);
    const tag = await screen.findByRole("combobox", { name: "タグで絞る" });
    await userEvent.selectOptions(tag, "AI");
    await userEvent.selectOptions(tag, "Go");
    const results = await screen.findByRole("list", { name: "探した結果" });
    expect(await within(results).findByText("鈴木 花子")).toBeVisible();
    await act(async () => {
      releaseSlow?.();
      await slow;
    });
    expect(
      within(screen.getByRole("list", { name: "探した結果" })).queryByText("田中 太郎"),
    ).toBeNull();

    // 「やめる」のあとに届いた答えは出さない
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(screen.queryByRole("list", { name: "探した結果" })).toBeNull();
  });

  it("探している途中で「やめる」と、あとから届いた答えを出さない", async () => {
    let releaseSlow: (() => void) | undefined;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    stubPersonApi(async (request) => {
      if (request.method === "GET" && request.path === "/api/v1/person/notes") {
        return Response.json({ items: [SUMMARY], truncated: false });
      }
      if (request.path.endsWith("/search")) {
        await slow;
        return Response.json({ items: [{ note: SUMMARY, matches: [] }], truncated: false });
      }
      return undefined;
    });
    renderWithRouter(<ListPage />);
    await userEvent.type(await screen.findByRole("searchbox", { name: "探す言葉" }), "おそい");
    await userEvent.click(screen.getByRole("button", { name: /探す|探しています/ }));
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    await act(async () => {
      releaseSlow?.();
      await slow;
    });
    expect(screen.queryByRole("list", { name: "探した結果" })).toBeNull();
    expect(screen.getByRole("list", { name: "人" })).toBeVisible();
  });
});
