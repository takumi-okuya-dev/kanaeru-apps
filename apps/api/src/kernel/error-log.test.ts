// 予期しないエラーのログの中身のテスト：エラーの文（利用者の値・SQL に渡した値を含みうる）を出さない。
import { DrizzleQueryError } from "drizzle-orm";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { describeUnexpectedError } from "./error-log.ts";

/** エラーの文に入りうる、ログに出てはいけない値。 */
const SECRET = "見本の秘密-memo@example.com";

describe("予期しないエラーのログの中身", () => {
  it("エラーの名前と、どこで起きたか（at の行）だけを出し、エラーの文は出さない", () => {
    const described = describeUnexpectedError(
      new TypeError(`読めません：${SECRET}\n2行目：${SECRET}`),
    );
    const text = JSON.stringify(described);
    expect(described.errorName).toBe("TypeError");
    expect(text).not.toContain(SECRET);
    expect(described.stack).toMatch(/^\s+at /);
    expect(described.stack?.split("\n").every((line) => /^\s+at /.test(line))).toBe(true);
  });

  it("DB のエラーは、SQL と渡した値を出さず、SQLSTATE と制約の名前だけを出す", () => {
    const cause = new pg.DatabaseError(`duplicate key value violates "${SECRET}"`, 0, "error");
    cause.code = "23505";
    cause.constraint = "person_meeting_manual_unique";
    cause.detail = `Key (name)=(${SECRET}) already exists.`;
    const error = new DrizzleQueryError(
      'insert into "person_note" ("full_name") values ($1)',
      [SECRET],
      cause,
    );
    const described = describeUnexpectedError(error);
    const text = JSON.stringify(described);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("person_note");
    // drizzle の DrizzleQueryError は名前を付けないので Error のまま
    expect(described).toMatchObject({
      errorName: "Error",
      sqlState: "23505",
      constraint: "person_meeting_manual_unique",
    });
  });

  it("包まれていない DB のエラーも、SQLSTATE だけを出す", () => {
    const error = new pg.DatabaseError(`bad value ${SECRET}`, 0, "error");
    error.code = "22P02";
    const described = describeUnexpectedError(error);
    expect(JSON.stringify(described)).not.toContain(SECRET);
    expect(described.sqlState).toBe("22P02");
    expect(described.constraint).toBeUndefined();
  });

  it("Error でないものが投げられても、名前だけにする", () => {
    expect(describeUnexpectedError(SECRET)).toEqual({ errorName: "unknown" });
    expect(JSON.stringify(describeUnexpectedError({ message: SECRET }))).not.toContain(SECRET);
  });

  it("SQLSTATE と制約の名前の形でないものは出さない", () => {
    const error = new Error("x") as Error & { code?: string; constraint?: string };
    error.code = SECRET;
    error.constraint = SECRET;
    expect(JSON.stringify(describeUnexpectedError(error))).not.toContain(SECRET);
  });
});
