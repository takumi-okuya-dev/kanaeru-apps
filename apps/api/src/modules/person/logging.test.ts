// 人物メモの値がログに出ないことの結合のテスト（SC-005・AD-31・research R14）：決まった言葉を、名前・話したこと・タグ・
// 会った場の名前・探す言葉に入れて、すべての窓口（誤りの答えも）を流し、ログの出力（pino の写し）にその言葉がないことを見る。
// あわせて、読みかえられない DB のエラーを、SQL に渡した値を含まないエラーにすることを見る（予期しないエラーのログは積み重ねを書くため）。
import "@hono/zod-openapi";
import type { Note } from "@workspace/contracts/person";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import {
  PERSON_API,
  PERSON_MEETINGS,
  PERSON_NOTES,
  showPersonApp,
} from "../../../test/helpers/person.ts";
import { AppError } from "../../kernel/errors.ts";
import { createLogger } from "../../kernel/logger.ts";
import { guardDbErrors } from "./repository.ts";

const database = useTestDatabase();

/** ログに出てはいけない、決まった言葉（架空のもの）。 */
const CANARY = "カナリアの言葉Zq7";

describe("人物メモの値はログに出ない", () => {
  let app: TestApp;
  let lines: string[];
  let cookie: string;
  let ownerId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showPersonApp(database);
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
    });
    const login = await loginAs(app, { displayName: "使う人" });
    cookie = login.cookie;
    ownerId = login.account.id;
  });

  it("すべての窓口を流しても、名前・話したこと・タグ・会った場・探す言葉がログに出ない", async () => {
    const meeting = (await (
      await call(app, cookie, PERSON_MEETINGS, "POST", {
        name: `${CANARY}の会`,
        metOn: "2026-11-20",
      })
    ).json()) as { id: string };
    const created = await call(app, cookie, PERSON_NOTES, "POST", {
      clientRequestId: crypto.randomUUID(),
      fullName: `${CANARY} 太郎`,
      reading: CANARY,
      lineName: CANARY,
      appearance: CANARY,
      accounts: { x: CANARY, line: CANARY },
      tags: [CANARY.slice(0, 10)],
      talk: CANARY,
      nextTopic: CANARY,
      meetingId: meeting.id,
    });
    expect(created.status).toBe(201);
    const note = (await created.json()) as Note;
    const path = `${PERSON_NOTES}/${note.id}`;
    const responses = [
      await call(app, cookie, PERSON_NOTES),
      await call(app, cookie, path),
      await call(app, cookie, path, "PATCH", { baseVersion: 1, fullName: CANARY, talk: CANARY }),
      // 古い版（409）
      await call(app, cookie, path, "PATCH", { baseVersion: 1, fullName: CANARY }),
      await call(app, cookie, `${path}/appends`, "POST", {
        appendId: crypto.randomUUID(),
        text: CANARY,
        meetingId: meeting.id,
      }),
      // 上限を超える書き足し（400）
      await call(app, cookie, `${path}/appends`, "POST", {
        appendId: crypto.randomUUID(),
        text: CANARY.repeat(2000),
      }),
      await call(app, cookie, `${PERSON_NOTES}/search`, "POST", { query: CANARY }),
      await call(app, cookie, `${PERSON_NOTES}/search`, "POST", {
        query: CANARY,
        tag: CANARY.slice(0, 10),
      }),
      // 入力の誤り（400）
      await call(app, cookie, `${PERSON_NOTES}/search`, "POST", { query: `${CANARY}\nX` }),
      await call(app, cookie, PERSON_NOTES, "POST", { clientRequestId: "x", fullName: CANARY }),
      await call(app, cookie, PERSON_MEETINGS),
      await call(app, cookie, `${PERSON_MEETINGS}/${meeting.id}`),
      await call(app, cookie, `${path}/meetings/${meeting.id}`, "DELETE"),
      await call(app, cookie, `${path}/meetings/${meeting.id}`, "PUT"),
      await call(app, cookie, `${PERSON_API}/export`),
      await call(app, cookie, `${PERSON_MEETINGS}/${meeting.id}`, "DELETE"),
      await call(app, cookie, path, "DELETE"),
    ];
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 409, 200, 400, 200, 200, 400, 400, 200, 200, 200, 200, 200, 204, 204,
    ]);
    expect(lines.length).toBeGreaterThan(0);
    const output = lines.join("\n");
    expect(output).not.toContain(CANARY);
    expect(output).not.toContain(CANARY.slice(0, 10));
  });

  it("読みかえられない DB のエラーは、SQL に渡した値を含まないエラーになる", async () => {
    // NOT NULL の違反（search_text がない）：drizzle のエラーの文には SQL に渡した値が入る
    const error = await guardDbErrors(() =>
      database.db.execute(
        sql`insert into person_note (owner_account_id, full_name, search_text, search_version) values (${ownerId}, ${CANARY}, null, 1)`,
      ),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("PersonDbError");
    expect((error as Error).message).toContain("23502");
    expect(`${(error as Error).message}\n${(error as Error).stack ?? ""}`).not.toContain(CANARY);

    // CHECK の違反（フルネームが空）は入力の誤り
    const check = await guardDbErrors(() =>
      database.db.execute(
        sql`insert into person_note (owner_account_id, full_name, search_text, search_version, talk) values (${ownerId}, '', '', 1, ${CANARY})`,
      ),
    ).catch((caught: unknown) => caught);
    expect(check).toBeInstanceOf(AppError);
    expect((check as AppError).code).toBe("INVALID_INPUT");
  });
});
