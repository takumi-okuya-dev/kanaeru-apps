// 読書記録の約束の上限：字の数え方（コードポイント）と、上限の値。
import { describe, expect, it } from "vitest";
import {
  READING_BOOK_LIMITS,
  READING_IMPORT_LIMITS,
  READING_MARKER_LIMITS,
  countChars,
} from "./index.ts";

describe("読書記録の上限", () => {
  it("字はコードポイントで数える（絵文字も1字）", () => {
    expect(countChars("本📚")).toBe(2);
    expect(countChars("")).toBe(0);
  });

  it("上限は data-model の値", () => {
    expect(READING_BOOK_LIMITS).toEqual({ title: 300, author: 300, want: 500 });
    expect(READING_MARKER_LIMITS).toEqual({ chapter: 200, text: 4_000, comment: 4_000 });
    expect(READING_IMPORT_LIMITS).toEqual({
      markersPerImport: 5_000,
      markersPerBatch: 500,
      batchBytes: 92_160,
      fileBytes: 314_572_800,
    });
  });
});
