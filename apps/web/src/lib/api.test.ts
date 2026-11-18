// API の呼び出し：エラーの本文を ApiError に、応答がないときを NetworkError に読みかえる。
import { describe, expect, it } from "vitest";
import { ApiError, NetworkError, errorMessage, request } from "./api.ts";

/**
 * JSON の応答を作る。
 * @param status 状態の番号
 * @param body 本文
 * @returns 応答
 */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req-1" },
  });
}

describe("request", () => {
  it("成功なら本文を返し、204 なら undefined", async () => {
    expect(await request(() => Promise.resolve(json(200, { ok: true })))).toEqual({ ok: true });
    expect(
      await request(() => Promise.resolve(new Response(null, { status: 204 }))),
    ).toBeUndefined();
  });

  it("エラーの本文は、code・文・欄ごとの理由を持つ ApiError", async () => {
    const error = await request(() =>
      Promise.resolve(
        json(409, {
          error: {
            code: "NOTE_TITLE_TAKEN",
            message: "同じ題のメモがあります。",
            requestId: "req-1",
            fields: [{ path: "title", message: "同じ題のメモがあります。" }],
          },
        }),
      ),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOTE_TITLE_TAKEN", status: 409 });
    expect((error as ApiError).fields).toEqual([
      { path: "title", message: "同じ題のメモがあります。" },
    ]);
  });

  it("エラーの本文でない失敗は、INTERNAL の ApiError（要求の ID は見出しから）", async () => {
    const error = await request(() => Promise.resolve(new Response("x", { status: 502 }))).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code: "INTERNAL", status: 502 });
  });

  it("応答がなければ NetworkError で、文は通信が切れたこと", async () => {
    const error = await request(() => Promise.reject(new TypeError("fetch failed"))).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(NetworkError);
    expect(errorMessage(error)).toContain("通信が切れました");
    expect(errorMessage(new Error("内部の文"))).not.toContain("内部の文");
  });
});
