// @vitest-environment node
// pdf.js を通して見本の PDF を読む（research R5・R6・R14。T032）。
// テストでは Node の pdf.js を使う：worker は同じ流れの中で動かし（globalThis.pdfjsWorker）、
// CMap は画面と同じ読み手（import.meta.glob で集めた URL を fetch する）を通し、fetch だけを手元のファイルを返すものに差しかえる。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { READING_IMPORT_LIMITS } from "@workspace/contracts/reading";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GoodNotesReadError, readGoodNotesPdf } from "./pdf.ts";

const cmapDir = join(
  dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")),
  "cmaps",
);
const fetched: string[] = [];

beforeAll(async () => {
  Object.assign(globalThis, {
    pdfjsWorker: await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  });
  vi.stubGlobal("fetch", (url: string) => {
    const name = String(url).split("/").pop()?.split("?")[0] ?? "";
    fetched.push(name);
    return Promise.resolve(new Response(readFileSync(join(cmapDir, name))));
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/**
 * 見本の PDF を読む。
 * @returns 見本の PDF のファイル
 */
function sample(): Blob {
  return new Blob([readFileSync(new URL("./__fixtures__/goodnotes-sample.pdf", import.meta.url))]);
}

/**
 * 読めなかったわけを取り出す。
 * @param promise 読む約束
 * @returns わけ
 */
async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(GoodNotesReadError);
    return (error as GoodNotesReadError).reason;
  }
  throw new Error("読めてしまった");
}

describe("GoodNotes の PDF を pdf.js で読む", () => {
  it("見本の PDF から、マーカー3つ・コメント1つ・章・ページを取り出し、読んだページの数を知らせる", async () => {
    const progress: [number, number][] = [];
    const result = await readGoodNotesPdf(sample(), {
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(result.pageCount).toBe(2);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(result.markers).toEqual([
      {
        text: "架空の本の見本です。",
        chapter: "1.2 見本の節",
        page: 13,
        position: 100_000,
        question: false,
      },
      {
        text: "二つ目のしるしの文",
        comment: "あとで読み返したいところ",
        chapter: "1.2 見本の節",
        page: 13,
        position: 100_001,
        question: false,
      },
      {
        text: "三つ目のしるしは",
        chapter: "1.2 見本の節",
        page: 14,
        position: 200_000,
        question: false,
      },
    ]);
    // 日本語の CMap は、画面の静かなファイルの URL から読む
    expect(fetched).toContain("UniJIS-UCS2-H.bcmap");
  });

  it(`${READING_IMPORT_LIMITS.fileBytes / 1024 / 1024}MB をこえるファイルは読まない`, async () => {
    const huge = { size: READING_IMPORT_LIMITS.fileBytes + 1 } as Blob;
    expect(await reasonOf(readGoodNotesPdf(huge))).toBe("too-large");
  });

  it("PDF でないファイルは読まない", async () => {
    expect(await reasonOf(readGoodNotesPdf(new Blob(["名前,メモ\n"])))).toBe("not-pdf");
  });

  it("壊れた PDF は、壊れているとして知らせる（文に利用者の値を入れない）", async () => {
    const promise = readGoodNotesPdf(new Blob(["%PDF-1.7\nこわれた中身\n%%EOF\n"]));
    expect(await reasonOf(promise)).toBe("broken");
    await expect(promise).rejects.toThrow("PDF を読めませんでした。");
  });

  it("やめる合図が来ていれば、読まずにやめる", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await reasonOf(readGoodNotesPdf(sample(), { signal: controller.signal }))).toBe(
      "aborted",
    );
  });
});
