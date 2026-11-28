// 読書記録の値がログに出ないことの結合のテスト（FR-025・PRD 5章）：決まった言葉を、書名・分かりたいこと・マーカーの文・コメント・
// 章・検索の言葉に入れて、すべての窓口（誤りの答えも）を流し、ログの出力（pino の写し）にその言葉がないことを見る。
// あわせて、読みかえられない DB のエラーを、SQL に渡した値を含まないエラーにすることを見る。
import "@hono/zod-openapi";
import type { Book } from "@workspace/contracts/reading";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import { READING_API, READING_BOOKS, showReadingApp } from "../../../test/helpers/reading.ts";
import { AppError } from "../../kernel/errors.ts";
import { createLogger } from "../../kernel/logger.ts";
import { guardDbErrors } from "./repository.ts";

const database = useTestDatabase();

/** ログに出てはいけない、決まった言葉（架空のもの）。 */
const CANARY = "カナリアの言葉Rd5";

describe("読書記録の値はログに出ない", () => {
  let app: TestApp;
  let lines: string[];
  let cookie: string;
  let ownerId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showReadingApp(database);
    lines = [];
    app = buildApp(database, testConfig(), {
      logger: createLogger(
        { level: "trace", pretty: false },
        {
          write: (line: string) => {
            lines.push(line);
          },
        },
      ),
      fetch: () => Promise.resolve(new Response("", { status: 500 })),
    });
    const login = await loginAs(app, { displayName: "使う人" });
    cookie = login.cookie;
    ownerId = login.account.id;
  });

  it("すべての窓口を流しても、書名・分かりたいこと・マーカー・コメント・章・検索の言葉がログに出ない", async () => {
    const created = await call(app, cookie, READING_BOOKS, "POST", {
      title: `${CANARY}の本`,
      author: CANARY,
      catalogSource: "manual",
      want: CANARY,
    });
    expect(created.status).toBe(201);
    const book = (await created.json()) as Book;
    const path = `${READING_BOOKS}/${book.id}`;
    const marker = {
      text: CANARY,
      comment: CANARY,
      chapter: CANARY,
      page: 1,
      position: 1,
      question: false,
    };
    const imported = await call(app, cookie, `${path}/markers/import`, "POST", {
      source: "goodnotes",
      markers: [marker],
    });
    const read = (await (await call(app, cookie, path)).json()) as Book;
    const markerPath = `${READING_API}/markers/${read.markers[0]?.id}`;
    const responses = [
      imported,
      await call(app, cookie, READING_BOOKS),
      await call(app, cookie, path, "PATCH", { title: CANARY, want: CANARY }),
      // 入力の誤り（400）
      await call(app, cookie, path, "PATCH", { title: CANARY.repeat(100) }),
      await call(app, cookie, `${path}/markers/import`, "POST", {
        source: "goodnotes",
        markers: [{ ...marker, text: CANARY.repeat(1000) }],
      }),
      await call(app, cookie, `${path}/marker-keys`),
      await call(app, cookie, markerPath, "PATCH", { comment: CANARY }),
      // 外の書誌の API が落ちている（502）
      await call(app, cookie, `${READING_API}/catalog/search`, "POST", { q: CANARY }),
      await call(app, cookie, markerPath, "DELETE"),
      await call(app, cookie, path, "DELETE"),
    ];
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 400, 400, 200, 200, 502, 204, 204,
    ]);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(CANARY);
  });

  it("読みかえられない DB のエラーは、SQL に渡した値を含まないエラーになる", async () => {
    // NOT NULL の違反（catalog_source がない）：drizzle のエラーの文には SQL に渡した値が入る
    const error = await guardDbErrors(() =>
      database.db.execute(
        sql`insert into reading_book (owner_account_id, title, catalog_source) values (${ownerId}, ${CANARY}, null)`,
      ),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("ReadingDbError");
    expect((error as Error).message).toContain("23502");
    expect(`${(error as Error).message}\n${(error as Error).stack ?? ""}`).not.toContain(CANARY);

    // CHECK の違反（書名が空）は入力の誤り
    const check = await guardDbErrors(() =>
      database.db.execute(
        sql`insert into reading_book (owner_account_id, title, catalog_source, want) values (${ownerId}, '', 'manual', ${CANARY})`,
      ),
    ).catch((caught: unknown) => caught);
    expect(check).toBeInstanceOf(AppError);
    expect((check as AppError).code).toBe("INVALID_INPUT");
  });
});
