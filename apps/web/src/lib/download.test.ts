// ファイルの受け取りと保存（core-004 R4）：ファイル名の読み方・既定の名前・エラーの読みかえ・ブラウザの保存。
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "./api.ts";
import { fetchDownload, filenameFromDisposition, saveFile } from "./download.ts";

/**
 * CSV の応答を作る。
 * @param disposition Content-Disposition（なければ付けない）
 * @returns 応答
 */
function csv(disposition?: string): Response {
  const headers = new Headers({ "content-type": "text/csv; charset=utf-8" });
  if (disposition) headers.set("content-disposition", disposition);
  return new Response("\uFEFF名前\r\n", { status: 200, headers });
}

describe("fetchDownload", () => {
  it("中身と、Content-Disposition のファイル名を返す", async () => {
    const file = await fetchDownload(
      () => Promise.resolve(csv('attachment; filename="participants-2026-11-25.csv"')),
      "participants.csv",
    );
    expect(file.filename).toBe("participants-2026-11-25.csv");
    // text() は先頭の BOM を読み捨てるので、バイトで比べる（BOM の EF BB BF が残っている）
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe("名前\r\n");
  });

  it("ファイル名がなければ、既定の名前", async () => {
    expect((await fetchDownload(() => Promise.resolve(csv()), "concerns.csv")).filename).toBe(
      "concerns.csv",
    );
    expect(
      (await fetchDownload(() => Promise.resolve(csv("attachment")), "concerns.csv")).filename,
    ).toBe("concerns.csv");
  });

  it("エラーの応答は ApiError（code と状態の番号）", async () => {
    const forbidden = new Response(
      JSON.stringify({ error: { code: "FORBIDDEN", message: "使えません。", requestId: "r" } }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
    const error = await fetchDownload(() => Promise.resolve(forbidden), "x.csv").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("通信が届かなければ NetworkError", async () => {
    await expect(
      fetchDownload(() => Promise.reject(new TypeError("Failed to fetch")), "x.csv"),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("filenameFromDisposition", () => {
  it.each([
    ['attachment; filename="participants-2026-11-25.csv"', "participants-2026-11-25.csv"],
    ["attachment; filename=report.csv", "report.csv"],
    ["attachment; filename*=UTF-8''%E5%8F%82%E5%8A%A0%E8%80%85.csv", "参加者.csv"],
    ["attachment; filename=\"fallback.csv\"; filename*=UTF-8''%E5%9B%B0.csv", "困.csv"],
    ["attachment; filename*=UTF-8''%E0%A4%A; filename=\"ok.csv\"", "ok.csv"],
    ["attachment", null],
    ["", null],
  ])("%j → %j", (disposition, expected) => {
    expect(filenameFromDisposition(disposition)).toBe(expected);
  });
});

describe("saveFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("ファイル名つきのリンクを押して保存させ、あとで URL を返す", () => {
    vi.useFakeTimers();
    // spyOn は restoreAllMocks で元に戻る（ほかのテストに漏れない）
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:kanaeru/1");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });

    saveFile(new Blob(["a"]), "participants-2026-11-25.csv");

    expect(clicked).toEqual([{ download: "participants-2026-11-25.csv", href: "blob:kanaeru/1" }]);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:kanaeru/1");
  });
});
