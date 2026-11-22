// API の呼び出し：エラーの本文を ApiError に、応答がないときを NetworkError に読みかえる。
import { describe, expect, it } from "vitest";
import {
  ApiError,
  NetworkError,
  SERVICE_UNAVAILABLE_MESSAGE,
  errorMessage,
  onUnauthenticated,
  request,
} from "./api.ts";

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
  it("401 を受けたら、onUnauthenticated の受け手に知らせる（ほかの失敗では知らせない）。外すと知らせない", async () => {
    const received: ApiError[] = [];
    const unsubscribe = onUnauthenticated((error) => received.push(error));
    const unauthenticated = json(401, {
      error: { code: "UNAUTHENTICATED", message: "ログインしていません。", requestId: "req-1" },
    });
    await request(() => Promise.resolve(unauthenticated)).catch(() => undefined);
    await request(() =>
      Promise.resolve(
        json(403, { error: { code: "FORBIDDEN", message: "使えません。", requestId: "req-1" } }),
      ),
    ).catch(() => undefined);
    expect(received.map((error) => error.code)).toEqual(["UNAUTHENTICATED"]);
    unsubscribe();
    await request(() => Promise.resolve(unauthenticated.clone())).catch(() => undefined);
    expect(received).toHaveLength(1);
  });

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
    const error = await request(() =>
      Promise.resolve(new Response("x", { status: 500, headers: { "x-request-id": "req-9" } })),
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "INTERNAL", status: 500, requestId: "req-9" });
  });

  it("エラーの本文でない 502・503・504（置き場所が止まっている）は「ただいま使えません」。API の 503（夜間の停止）はそのまま（core-020）", async () => {
    for (const status of [502, 503, 504]) {
      const error = await request(() =>
        Promise.resolve(new Response("<html>Service Unavailable</html>", { status })),
      ).catch((caught: unknown) => caught);
      expect(error, String(status)).toMatchObject({ code: "SERVICE_UNAVAILABLE", status });
      expect(errorMessage(error)).toBe(SERVICE_UNAVAILABLE_MESSAGE);
    }
    const night = await request(() =>
      Promise.resolve(
        json(503, {
          error: { code: "DB_UNAVAILABLE", message: "夜間は止まっています。", requestId: "req-1" },
        }),
      ),
    ).catch((caught: unknown) => caught);
    expect(night).toMatchObject({ code: "DB_UNAVAILABLE", status: 503 });
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
