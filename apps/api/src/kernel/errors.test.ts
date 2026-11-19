// 投げられたものから応答のエラーへの読みかえ（toAppError）と、DB_UNAVAILABLE の文が時刻で変わること。
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, toAppError } from "./errors.ts";

/**
 * code を持つエラーを作る（Node が投げる形）。
 * @param code エラーの code
 * @param extra ほかに持たせるもの（syscall など）
 * @returns エラー
 */
function withCode(code: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error("失敗"), { code, ...extra });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DB に届かないときの読みかえ", () => {
  it("Drizzle の命令が DB に届かなければ 503 DB_UNAVAILABLE", () => {
    const error = new DrizzleQueryError(
      "select 1",
      [],
      withCode("ECONNREFUSED", { syscall: "connect" }),
    );
    const appError = toAppError(error);
    expect(appError?.code).toBe("DB_UNAVAILABLE");
    expect(appError?.status).toBe(503);
  });

  it("LINE への fetch が ENOTFOUND で失敗しても DB_UNAVAILABLE にしない（呼ぶ側が INTERNAL にする）", () => {
    const fetchFailed = new TypeError("fetch failed", {
      cause: withCode("ENOTFOUND", { syscall: "getaddrinfo", hostname: "api.line.me" }),
    });
    expect(toAppError(fetchFailed)).toBeUndefined();
  });

  it("ファイルの ENOENT も DB_UNAVAILABLE にしない", () => {
    expect(toAppError(withCode("ENOENT", { syscall: "open", path: "/x" }))).toBeUndefined();
  });

  it("pool の空き待ちの時間切れ（混んでいる）は DB_UNAVAILABLE にしない", () => {
    const error = new DrizzleQueryError(
      "select 1",
      [],
      new Error("timeout exceeded when trying to connect"),
    );
    expect(toAppError(error)).toBeUndefined();
  });
});

describe("DB_UNAVAILABLE の文は、起きた時刻の日本時間で選ぶ", () => {
  it("夜間（0時〜8時）は夜間の文", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T03:00:00+09:00"));
    expect(new AppError("DB_UNAVAILABLE").message).toBe(
      "夜間（0時〜8時）は止まっています。8時からもう一度開いてください。",
    );
  });

  it("昼（Cloud SQL の保守の再起動など）は一時的な文", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T14:00:00+09:00"));
    expect(new AppError("DB_UNAVAILABLE").message).toBe(
      "一時的につながりません。少し待ってから、もう一度開いてください。",
    );
  });
});
