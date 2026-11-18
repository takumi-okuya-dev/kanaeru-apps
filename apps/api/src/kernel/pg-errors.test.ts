// DB に届かないことの見分け（503 DB_UNAVAILABLE に読みかえるもの）と、一意の制約の違反の見分け。
import { describe, expect, it } from "vitest";
import { isDbUnavailable, isUniqueViolation } from "./pg-errors.ts";

/**
 * code を持つエラーを作る（Node や pg が投げる形）。
 * @param code エラーの code
 * @param message エラーの文
 * @returns エラー
 */
function withCode(code: string, message = "失敗"): Error {
  return Object.assign(new Error(message), { code });
}

describe("DB に届かないことの見分け", () => {
  it.each(["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ENOENT"])(
    "つなぐときのエラー %s",
    (code) => {
      expect(isDbUnavailable(withCode(code))).toBe(true);
    },
  );

  it.each(["08006", "08001", "57P01", "57P03"])("PostgreSQL の SQLSTATE %s", (code) => {
    expect(isDbUnavailable(withCode(code))).toBe(true);
  });

  it.each([
    "Connection terminated due to connection timeout",
    "Connection terminated unexpectedly",
    "timeout exceeded when trying to connect",
    "Query read timeout",
  ])("pg の文「%s」", (message) => {
    expect(isDbUnavailable(new Error(message))).toBe(true);
  });

  it("drizzle が包んだもの（cause）と、AggregateError の中も見る", () => {
    const wrapped = new Error("Failed query: select 1", { cause: withCode("ECONNREFUSED") });
    expect(isDbUnavailable(wrapped)).toBe(true);
    const aggregate = Object.assign(new AggregateError([withCode("ECONNREFUSED")], ""), {});
    expect(isDbUnavailable(new Error("包み", { cause: aggregate }))).toBe(true);
  });

  it("DB に届いているエラー（違反・命令の時間切れ・接続が多すぎる）や、ほかのものは届かないとしない", () => {
    for (const code of ["23505", "57014", "53300", "42P01"]) {
      expect(isDbUnavailable(withCode(code)), code).toBe(false);
    }
    expect(isDbUnavailable(new TypeError("x is undefined"))).toBe(false);
    expect(isDbUnavailable(undefined)).toBe(false);
    expect(isDbUnavailable("ECONNREFUSED")).toBe(false);
  });

  it("包みが自分を指していても止まる", () => {
    const loop: Error & { cause?: unknown } = new Error("輪");
    loop.cause = loop;
    expect(isDbUnavailable(loop)).toBe(false);
  });
});

describe("一意の制約の違反の見分け", () => {
  it("そのままのものと、cause に包まれたもの", () => {
    expect(isUniqueViolation(withCode("23505"))).toBe(true);
    expect(isUniqueViolation(new Error("x", { cause: withCode("23505") }))).toBe(true);
    expect(isUniqueViolation(withCode("23503"))).toBe(false);
  });
});
