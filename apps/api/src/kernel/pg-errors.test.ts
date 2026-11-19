// DB に届かないことの見分け（503 DB_UNAVAILABLE に読みかえるもの）と、一意の制約の違反の見分け。
import { DrizzleQueryError } from "drizzle-orm";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { isDbUnavailable, isForeignKeyViolation, isUniqueViolation } from "./pg-errors.ts";

/**
 * code を持つエラーを作る（Node や pg が投げる形）。
 * @param code エラーの code
 * @param extra ほかに持たせるもの（syscall・address など）
 * @returns エラー
 */
function withCode(code: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error("失敗"), { code, ...extra });
}

/**
 * Drizzle が命令の失敗を包んだ形を作る。
 * @param cause pg が投げたもの
 * @returns Drizzle の命令のエラー
 */
function drizzleWrapped(cause: unknown): DrizzleQueryError {
  return new DrizzleQueryError("select 1", [], cause as Error);
}

/**
 * pg が DB から受けたエラー（DatabaseError）を作る。
 * @param code SQLSTATE
 * @returns pg の DatabaseError
 */
function databaseError(code: string): pg.DatabaseError {
  return Object.assign(new pg.DatabaseError("DB のエラー", 0, "error"), { code });
}

describe("DB に届かないことの見分け（Drizzle が包んだもの）", () => {
  it.each(["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ENOENT", "EPIPE"])(
    "ソケットのエラー %s",
    (code) => {
      expect(isDbUnavailable(drizzleWrapped(withCode(code)))).toBe(true);
    },
  );

  it.each(["08006", "08001", "57P01", "57P02", "57P03"])("PostgreSQL の SQLSTATE %s", (code) => {
    expect(isDbUnavailable(drizzleWrapped(databaseError(code)))).toBe(true);
  });

  it.each([
    "Connection terminated due to connection timeout",
    "Connection terminated unexpectedly",
  ])("pg の文「%s」", (message) => {
    expect(isDbUnavailable(drizzleWrapped(new Error(message)))).toBe(true);
  });

  it("AggregateError（IPv4・IPv6 の両方に断られた）の中も見る", () => {
    const aggregate = new AggregateError([withCode("ECONNREFUSED")], "");
    expect(isDbUnavailable(drizzleWrapped(aggregate))).toBe(true);
  });

  it("pool の空き待ちの時間切れ・命令の答えが遅い、は DB に届いているので届かないとしない", () => {
    expect(
      isDbUnavailable(drizzleWrapped(new Error("timeout exceeded when trying to connect"))),
    ).toBe(false);
    expect(isDbUnavailable(drizzleWrapped(new Error("Query read timeout")))).toBe(false);
  });

  it("DB に届いているエラー（違反・命令の時間切れ・接続が多すぎる・表がない）は届かないとしない", () => {
    for (const code of ["23505", "57014", "53300", "42P01"]) {
      expect(isDbUnavailable(drizzleWrapped(databaseError(code))), code).toBe(false);
    }
  });

  it("包みが自分を指していても止まる", () => {
    const loop: Error & { cause?: unknown } = new Error("輪");
    loop.cause = loop;
    expect(isDbUnavailable(drizzleWrapped(loop))).toBe(false);
  });
});

describe("DB に届かないことの見分け（包まれずに届いた pg のエラー）", () => {
  it("つなぐときのソケットのエラー（TCP・名前を引く・Cloud SQL の Unix ソケット）", () => {
    expect(
      isDbUnavailable(withCode("ECONNREFUSED", { syscall: "connect", address: "127.0.0.1" })),
    ).toBe(true);
    expect(isDbUnavailable(withCode("ENOTFOUND", { syscall: "getaddrinfo" }))).toBe(true);
    expect(isDbUnavailable(withCode("EAI_AGAIN", { syscall: "getaddrinfo" }))).toBe(true);
    expect(
      isDbUnavailable(
        withCode("ENOENT", {
          syscall: "connect",
          address: "/cloudsql/project:region:instance/.s.PGSQL.5432",
        }),
      ),
    ).toBe(true);
  });

  it("IPv4・IPv6 の両方に断られた AggregateError", () => {
    const refused = withCode("ECONNREFUSED", { syscall: "connect" });
    expect(isDbUnavailable(new AggregateError([refused, refused], ""))).toBe(true);
  });

  it("pg の DatabaseError の SQLSTATE（止める途中・起動の途中・接続の例外）", () => {
    for (const code of ["57P01", "57P03", "08006"]) {
      expect(isDbUnavailable(databaseError(code)), code).toBe(true);
    }
    expect(isDbUnavailable(databaseError("23505"))).toBe(false);
  });

  it("pg の決まった文", () => {
    expect(isDbUnavailable(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isDbUnavailable(new Error("Connection terminated due to connection timeout"))).toBe(
      true,
    );
    expect(isDbUnavailable(new Error("timeout exceeded when trying to connect"))).toBe(false);
    expect(isDbUnavailable(new Error("Query read timeout"))).toBe(false);
  });
});

describe("DB の層から来ていないエラーは、DB に届かないとしない", () => {
  it("LINE への fetch の失敗（TypeError に ENOTFOUND が包まれた形）", () => {
    const fetchFailed = new TypeError("fetch failed", {
      cause: withCode("ENOTFOUND", { syscall: "getaddrinfo", hostname: "api.line.me" }),
    });
    expect(isDbUnavailable(fetchFailed)).toBe(false);
    const refused = new TypeError("fetch failed", {
      cause: withCode("ECONNREFUSED", { syscall: "connect" }),
    });
    expect(isDbUnavailable(refused)).toBe(false);
  });

  it("ファイルの ENOENT・ソケットでない code・ふつうの包み", () => {
    expect(isDbUnavailable(withCode("ENOENT", { syscall: "open", path: "/x" }))).toBe(false);
    expect(
      isDbUnavailable(withCode("ENOENT", { syscall: "connect", address: "/tmp/x.sock" })),
    ).toBe(false);
    expect(isDbUnavailable(withCode("ECONNREFUSED"))).toBe(false);
    expect(isDbUnavailable(new Error("包み", { cause: withCode("ECONNREFUSED") }))).toBe(false);
    expect(isDbUnavailable(new AggregateError([withCode("ENOENT", { syscall: "open" })], ""))).toBe(
      false,
    );
    expect(isDbUnavailable(new AggregateError([], ""))).toBe(false);
  });

  it("ほかのもの", () => {
    expect(isDbUnavailable(new TypeError("x is undefined"))).toBe(false);
    expect(isDbUnavailable(undefined)).toBe(false);
    expect(isDbUnavailable("ECONNREFUSED")).toBe(false);
    expect(isDbUnavailable({ message: "Connection terminated unexpectedly" })).toBe(false);
  });
});

describe("制約の違反の見分け（一意・外部キー）", () => {
  it("そのままのものと、cause に包まれたもの", () => {
    expect(isUniqueViolation(withCode("23505"))).toBe(true);
    expect(isUniqueViolation(new Error("x", { cause: withCode("23505") }))).toBe(true);
    expect(isUniqueViolation(withCode("23503"))).toBe(false);
  });

  it("外部キーの違反（NO ACTION の 23503・RESTRICT の 23001）を見分ける。包まれた cause も見る", () => {
    expect(isForeignKeyViolation(withCode("23503"))).toBe(true);
    expect(isForeignKeyViolation(withCode("23001"))).toBe(true);
    expect(isForeignKeyViolation(new Error("x", { cause: withCode("23001") }))).toBe(true);
    expect(isForeignKeyViolation(withCode("23505"))).toBe(false);
  });
});
