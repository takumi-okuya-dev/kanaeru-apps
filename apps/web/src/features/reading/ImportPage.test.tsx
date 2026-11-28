// 取りこむ画面：PDF を選ぶと端末の中で読み、確かめの画面へ移る（PDF は送らない）・読めないときの文と貼り付けの道・貼り付けで確かめへ。
// pdf.js の読み取りは import/pdf.ts を差しかえる（読み方そのものは import/*.test.ts が確かめる）。
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ImportPage } from "./ImportPage.tsx";
import { clearImportDraft, getImportDraft } from "./import-session.ts";
import { stubReadingApi } from "./test-api.ts";
import type { GoodNotesResult } from "./import/pdf.ts";

/** 読み取りの設定（差しかえる関数が受け取るもの）。 */
type ReadOptions = { onProgress?: (done: number, total: number) => void };

/** 読み取りの結果。 */
type ReadResult = GoodNotesResult;

const readGoodNotesPdf = vi.fn<(file: Blob, options: ReadOptions) => Promise<ReadResult>>();
vi.mock("./import/pdf.ts", () => ({
  readGoodNotesPdf: (file: Blob, options: ReadOptions) => readGoodNotesPdf(file, options),
}));

beforeEach(() => {
  clearImportDraft();
  readGoodNotesPdf.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * 見本の PDF のファイル。
 * @returns ファイル
 */
function samplePdf(): File {
  return new File(["%PDF-1.4 見本"], "見本のネットワーク入門.pdf", { type: "application/pdf" });
}

describe("取りこむ画面", () => {
  it("PDF を選ぶと端末の中で読み、読み取った中身を置き、PDF を送らない", async () => {
    const sent = stubReadingApi(() => undefined);
    readGoodNotesPdf.mockImplementation((_file: Blob, options: ReadOptions) => {
      options.onProgress?.(1, 2);
      return Promise.resolve({
        markers: [{ text: "見本のマーカー", page: 1, position: 100_000, question: false }],
        pageCount: 2,
      });
    });
    const user = userEvent.setup();
    renderWithRouter(<ImportPage />);
    await user.upload(await screen.findByLabelText("ファイルを選ぶ"), samplePdf());
    await waitFor(() => expect(getImportDraft()?.markers).toHaveLength(1));
    expect(getImportDraft()).toMatchObject({
      source: "goodnotes",
      fileName: "見本のネットワーク入門.pdf",
    });
    expect(sent).toEqual([]);
  });

  it("読めない PDF・マーカーのない PDF は理由と貼り付けの道を出す", async () => {
    stubReadingApi(() => undefined);
    readGoodNotesPdf.mockRejectedValueOnce(
      Object.assign(new Error("broken"), { reason: "not-pdf" }),
    );
    const user = userEvent.setup();
    renderWithRouter(<ImportPage />);
    await user.upload(await screen.findByLabelText("ファイルを選ぶ"), samplePdf());
    expect(await screen.findByText(/PDF のファイルではありません/)).toBeVisible();
    readGoodNotesPdf.mockResolvedValueOnce({ markers: [], pageCount: 3 });
    await user.upload(screen.getByLabelText("ファイルを選ぶ"), samplePdf());
    expect(
      await screen.findByText(/マーカーもテキストボックスも見つかりませんでした.*貼り付け/),
    ).toBeVisible();
    expect(getImportDraft()).toBeUndefined();
  });

  it("貼り付けた文を読んで置く（ページ・コメント・長すぎる行）", async () => {
    stubReadingApi(() => undefined);
    const user = userEvent.setup();
    renderWithRouter(<ImportPage />);
    const area = await screen.findByRole("textbox", { name: "マーカーの文（1行に1つ）" });
    await user.click(area);
    await user.paste(`p.38 見本の文 // ? 分からない\n見本の文2\n${"あ".repeat(4001)}`);
    await user.click(screen.getByRole("button", { name: "確かめる" }));
    await waitFor(() => expect(getImportDraft()?.markers).toHaveLength(2));
    expect(getImportDraft()).toMatchObject({ source: "paste", skippedLines: [3] });
    expect(getImportDraft()?.markers[0]).toMatchObject({
      page: 38,
      comment: "? 分からない",
      question: true,
    });
  });

  it("空の貼り付けは置かない", async () => {
    stubReadingApi(() => undefined);
    const user = userEvent.setup();
    renderWithRouter(<ImportPage />);
    await user.click(await screen.findByRole("button", { name: "確かめる" }));
    expect(screen.getByText(/取りこむ行がありません/)).toBeVisible();
  });
});
