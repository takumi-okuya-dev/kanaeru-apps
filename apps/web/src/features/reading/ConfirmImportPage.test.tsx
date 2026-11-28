// 確かめてから入れる画面：件数と新しいマーカーの数・ファイルの名前に近い本を選ぶ・束で送る・途中で失敗したら「もう一度入れる」・
// 新しく登録する・読み取った中身がなければ取りこみの画面への案内。
import { markerKey } from "@workspace/contracts/reading";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ConfirmImportPage, guessBook } from "./ConfirmImportPage.tsx";
import { clearImportDraft, getImportDraft, setImportDraft } from "./import-session.ts";
import { BOOK, BOOK_ID, SUMMARY, errorResponse, stubReadingApi } from "./test-api.ts";

const OTHER_ID = "0193a1b2-0000-7000-8000-000000000398";

/** 読み取った見本のマーカー。 */
const MARKERS = [
  {
    text: "見本のマーカー 1",
    chapter: "1.2 見本の節",
    page: 1,
    position: 100_000,
    question: false,
  },
  {
    text: "見本のマーカー 2",
    comment: "? 分からない",
    chapter: "1.2 見本の節",
    page: 1,
    position: 100_001,
    question: true,
  },
  { text: "見本のマーカー 3", page: 2, position: 200_000, question: false },
];

beforeEach(() => {
  setImportDraft({
    source: "goodnotes",
    fileName: "見本のネットワーク入門.pdf",
    markers: MARKERS,
    bookId: null,
    skippedLines: [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearImportDraft();
});

/**
 * 本棚・鍵・取りこみに答える。
 * @param options 取りこみの答え
 * @param options.failFirstImport 最初の取りこみを失敗にするか
 * @returns 送られた要求
 */
async function stub({ failFirstImport = false } = {}) {
  const existing = await markerKey({ text: "見本のマーカー 1", page: 1 });
  let failed = false;
  return stubReadingApi((request) => {
    if (request.method === "GET" && request.path === "/api/v1/reading/books") {
      return Response.json({ items: [{ ...SUMMARY, id: OTHER_ID, title: "ほかの見本" }, SUMMARY] });
    }
    if (request.path.endsWith("/marker-keys")) return Response.json({ keys: [existing] });
    if (request.path.endsWith("/markers/import")) {
      if (failFirstImport && !failed) {
        failed = true;
        return errorResponse(503, "DB_UNAVAILABLE", "夜間（0時〜8時）は止まっています。");
      }
      return Response.json({ inserted: 2, updated: 0, unchanged: 1 });
    }
    if (request.method === "POST" && request.path === "/api/v1/reading/books") {
      return Response.json(
        { ...BOOK, id: "0193a1b2-0000-7000-8000-000000000397", markers: [] },
        { status: 201 },
      );
    }
    return undefined;
  });
}

describe("確かめてから入れる画面", () => {
  it("件数・新しいマーカーの数を出し、ファイルの名前に近い本を選んで入れる", async () => {
    const sent = await stub();
    const user = userEvent.setup();
    renderWithRouter(<ConfirmImportPage />);
    expect(await screen.findByRole("combobox", { name: "本" })).toHaveValue(BOOK_ID);
    expect(document.body.textContent).toContain("マーカー 3・コメント 1・「?」 1");
    expect(await screen.findByText(/前に入れた 1 は重ねません/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "入れる" }));
    await waitFor(() => expect(getImportDraft()).toBeUndefined());
    const imports = sent.filter((request) => request.path.endsWith("/markers/import"));
    expect(imports).toHaveLength(1);
    expect(imports[0]?.path).toBe(`/api/v1/reading/books/${BOOK_ID}/markers/import`);
    expect(imports[0]?.body).toMatchObject({ source: "goodnotes", markers: MARKERS });
  });

  it("途中で失敗したら止めて「もう一度入れる」を出し、押すと送り直す", async () => {
    const sent = await stub({ failFirstImport: true });
    const user = userEvent.setup();
    renderWithRouter(<ConfirmImportPage />);
    await screen.findByRole("combobox", { name: "本" });
    await user.click(screen.getByRole("button", { name: "入れる" }));
    expect(await screen.findByText(/入れられませんでした。.*重なりません/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "もう一度入れる" }));
    await waitFor(() => expect(getImportDraft()).toBeUndefined());
    expect(sent.filter((request) => request.path.endsWith("/markers/import"))).toHaveLength(2);
  });

  it("新しく登録して入れる（書名が空なら送らない）", async () => {
    const sent = await stub();
    const user = userEvent.setup();
    renderWithRouter(<ConfirmImportPage />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "本" }), "__new__");
    await user.click(screen.getByRole("button", { name: "入れる" }));
    expect(screen.getByText("新しく登録する本の書名を入れてください。")).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: /新しく登録する本の書名/ }), "新しい見本");
    await user.click(screen.getByRole("button", { name: "入れる" }));
    await waitFor(() => expect(getImportDraft()).toBeUndefined());
    expect(
      sent.find((request) => request.method === "POST" && request.path === "/api/v1/reading/books")
        ?.body,
    ).toMatchObject({
      title: "新しい見本",
      catalogSource: "manual",
    });
  });

  it("読み取った中身がなければ、取りこみの画面への案内を出す", async () => {
    clearImportDraft();
    await stub();
    renderWithRouter(<ConfirmImportPage />);
    expect(await screen.findByRole("link", { name: "取りこむ画面へ" })).toHaveAttribute(
      "href",
      "/reading/import",
    );
  });

  it("ファイルの名前に近い本を選ぶ（なければ読んでいる本）", () => {
    const books = [
      { ...SUMMARY, id: "a", title: "設計レビューの見本", status: "finished" as const },
      { ...SUMMARY, id: "b", title: "ネットワーク入門の見本" },
    ];
    expect(guessBook(books, "ネットワーク入門_書きこみ.pdf")).toBe("b");
    expect(guessBook(books, "関係ない.pdf")).toBe("b");
    expect(guessBook([], "x.pdf")).toBeNull();
  });
});
