// 本の画面：分かりたいこと・章ごとに本の中の順・コメントを直す（? で印）・印の付け外し・マーカーを消す前に確かめる・本の設定。
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { BookPage, groupByChapter } from "./BookPage.tsx";
import { BOOK, BOOK_ID, SUMMARY, stubReadingApi } from "./test-api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * 本と本棚に答え、書く要求を受ける。
 * @returns 送られた要求
 */
function stub() {
  return stubReadingApi((request) => {
    if (request.method === "GET" && request.path === `/api/v1/reading/books/${BOOK_ID}`)
      return Response.json(BOOK);
    if (request.method === "GET" && request.path === "/api/v1/reading/books")
      return Response.json({ items: [SUMMARY] });
    if (request.method === "PATCH" && request.path.startsWith("/api/v1/reading/markers/")) {
      return Response.json({ ...BOOK.markers[0], ...(request.body as object) });
    }
    if (request.method === "DELETE") return new Response(null, { status: 204 });
    if (request.method === "PATCH") return Response.json(BOOK);
    return undefined;
  });
}

describe("本の画面", () => {
  it("分かりたいことと、章ごとのマーカーを本の中の順に出す", async () => {
    stub();
    renderWithRouter(<BookPage bookId={BOOK_ID} />);
    expect(await screen.findByRole("heading", { name: "見本のネットワーク入門" })).toBeVisible();
    expect(screen.getByText("仕組みを説明できるようになる")).toBeVisible();
    const sections = screen.getAllByRole("region");
    expect(sections.map((section) => section.getAttribute("aria-label"))).toEqual([
      "2章 見本の通信",
      "3章 見本の窓口",
    ]);
    expect(within(sections[0] as HTMLElement).getByText("見本のマーカーの文 A")).toBeVisible();
    expect(within(sections[0] as HTMLElement).getByText("p.38")).toBeVisible();
  });

  it("コメントを ? で始めて保存すると、印も付ける", async () => {
    const sent = stub();
    const user = userEvent.setup();
    renderWithRouter(<BookPage bookId={BOOK_ID} />);
    await user.click(await screen.findByRole("button", { name: "コメントを書く" }));
    await user.type(screen.getByRole("textbox", { name: "コメント" }), "? 調べる");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(sent.find((request) => request.method === "PATCH")?.body).toEqual({
        comment: "? 調べる",
        question: true,
      });
    });
  });

  it("コメントを変えずに保存しても送らない", async () => {
    const sent = stub();
    const user = userEvent.setup();
    renderWithRouter(<BookPage bookId={BOOK_ID} />);
    await user.click(await screen.findByRole("button", { name: "コメントを直す" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.queryByRole("textbox", { name: "コメント" })).toBeNull();
    expect(sent.filter((request) => request.method === "PATCH")).toEqual([]);
  });

  it("マーカーを消す前に確かめる", async () => {
    const sent = stub();
    const user = userEvent.setup();
    renderWithRouter(<BookPage bookId={BOOK_ID} />);
    await user.click((await screen.findAllByRole("button", { name: "消す" }))[0] as HTMLElement);
    const dialog = await screen.findByRole("alertdialog", { name: "マーカーを消しますか" });
    expect(within(dialog).getByText(/取りこみ直しても、戻りません/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "消す" }));
    await waitFor(() => {
      expect(sent.find((request) => request.method === "DELETE")?.path).toBe(
        `/api/v1/reading/markers/${BOOK.markers[0]?.id}`,
      );
    });
  });

  it("章のまとまりは、離れて出てきた同じ章を別にする", () => {
    const [a, b] = BOOK.markers as [(typeof BOOK.markers)[number], (typeof BOOK.markers)[number]];
    const groups = groupByChapter([a, b, { ...a, id: "x" }]);
    expect(groups.map((group) => group.name)).toEqual([
      "2章 見本の通信",
      "3章 見本の窓口",
      "2章 見本の通信",
    ]);
  });
});
