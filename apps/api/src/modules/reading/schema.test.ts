// 読書記録の表の結合のテスト（本物の PostgreSQL・specs/reading/001-bookshelf-import/data-model.md）：長さの CHECK と約束の上限が
// 食い違わない・選択肢と形（ISBN・書影の URL・ページ・鍵）・一意（本と鍵）・持ち主の違う本にマーカーを付けられない・消し方。
// 窓口はまだないので、表に直に書いて確かめる（pr1。窓口は pr2）。
import "@hono/zod-openapi";
import {
  READING_BOOK_LIMITS,
  READING_BOOK_STATUSES,
  READING_CATALOG_SOURCES,
  READING_MARKER_LIMITS,
  READING_MARKER_SOURCES,
  READING_SOURCES,
} from "@workspace/contracts/reading";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";

const database = useTestDatabase();

/** PostgreSQL の誤りの code（一意・外部キー・CHECK）。 */
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";
const CHECK = "23514";

/** 見本の鍵（64字の16進）。 */
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

/**
 * 命令が、決まった code の誤りで断られることを確かめる。
 * @param run 命令
 * @param code 期待する SQLSTATE
 */
async function expectRejected(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toMatchObject({ code });
}

describe("読書記録の表", () => {
  let app: TestApp;
  let ownerId: string;
  let otherId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    ownerId = (await loginAs(app, { displayName: "使う人" })).account.id;
    otherId = (await loginAs(app, { displayName: "ほかの使う人" })).account.id;
  });

  /**
   * 表に1行を直に足す。
   * @param table 表の名前（このテストの中の決まった名前だけ）
   * @param row 列の値
   * @returns 足した行の ID
   */
  async function insert(
    table: "reading_book" | "reading_marker",
    row: Record<string, unknown>,
  ): Promise<string> {
    const columns = Object.keys(row);
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      Object.values(row),
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("行を足せませんでした。");
    return id;
  }

  /**
   * 本を足す。
   * @param values 列の値（足りない列は見本）
   * @returns 足した行の ID
   */
  async function insertBook(values: Record<string, unknown> = {}): Promise<string> {
    return insert("reading_book", {
      owner_account_id: ownerId,
      title: "見本の本",
      catalog_source: "manual",
      ...values,
    });
  }

  /**
   * マーカーを足す。
   * @param bookId 本
   * @param values 列の値（足りない列は見本）
   * @returns 足した行の ID
   */
  async function insertMarker(
    bookId: string,
    values: Record<string, unknown> = {},
  ): Promise<string> {
    return insert("reading_marker", {
      book_id: bookId,
      owner_account_id: ownerId,
      source: "goodnotes",
      position: 1,
      text: "見本のマーカーの文",
      dedupe_key: KEY_A,
      ...values,
    });
  }

  /**
   * 表の行の数を数える。
   * @param table 表の名前（このテストの中の決まった名前だけ）
   * @returns 行の数
   */
  async function count(table: "reading_book" | "reading_marker"): Promise<number> {
    const result = await database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table}`,
    );
    return result.rows[0]?.n ?? 0;
  }

  it("長さの CHECK は約束の上限と同じ（上限ちょうどは入り、1字多いと断る。絵文字も1字）", async () => {
    const bookCases: [string, number][] = [
      ["title", READING_BOOK_LIMITS.title],
      ["author", READING_BOOK_LIMITS.author],
      ["want", READING_BOOK_LIMITS.want],
    ];
    for (const [column, limit] of bookCases) {
      await insertBook({ [column]: "📚".repeat(limit) });
      await expectRejected(() => insertBook({ [column]: "📚".repeat(limit + 1) }), CHECK);
      await expectRejected(() => insertBook({ [column]: "" }), CHECK);
    }
    const bookId = await insertBook();
    const markerCases: [string, number, boolean][] = [
      ["chapter", READING_MARKER_LIMITS.chapter, true],
      ["text", READING_MARKER_LIMITS.text, false],
      ["comment", READING_MARKER_LIMITS.comment, true],
    ];
    let n = 0;
    for (const [column, limit, emptyRejected] of markerCases) {
      n += 1;
      await insertMarker(bookId, {
        [column]: "📚".repeat(limit),
        dedupe_key: `${n}`.padStart(64, "0"),
      });
      await expectRejected(
        () => insertMarker(bookId, { [column]: "📚".repeat(limit + 1), dedupe_key: KEY_B }),
        CHECK,
      );
      if (emptyRejected) {
        await expectRejected(
          () => insertMarker(bookId, { [column]: "", dedupe_key: KEY_B }),
          CHECK,
        );
      }
    }
  });

  it("選択肢は約束と同じものだけ", async () => {
    for (const status of READING_BOOK_STATUSES) await insertBook({ status });
    await expectRejected(() => insertBook({ status: "unread" }), CHECK);
    for (const source of READING_CATALOG_SOURCES) await insertBook({ catalog_source: source });
    await expectRejected(() => insertBook({ catalog_source: "google" }), CHECK);
    await insertBook({ sources: [...READING_SOURCES] });
    await expectRejected(() => insertBook({ sources: ["kobo"] }), CHECK);
    await expectRejected(
      () => insertBook({ sources: ["kindle", "kindle", "goodnotes", "other"] }),
      CHECK,
    );
    const bookId = await insertBook();
    let n = 0;
    for (const source of READING_MARKER_SOURCES) {
      n += 1;
      await insertMarker(bookId, { source, dedupe_key: `${n}`.padStart(64, "0") });
    }
    await expectRejected(() => insertMarker(bookId, { source: "kobo", dedupe_key: KEY_B }), CHECK);
  });

  it("ISBN・書影の URL・ページ・位置・鍵の形", async () => {
    await insertBook({
      isbn: "9784000000000",
      cover_url: "https://cover.openbd.jp/9784000000000.jpg",
    });
    await expectRejected(() => insertBook({ isbn: "4000000000" }), CHECK);
    await expectRejected(() => insertBook({ isbn: "978-4-00-000000-0" }), CHECK);
    await expectRejected(
      () => insertBook({ cover_url: "https://books.google.com/books/content?id=x" }),
      CHECK,
    );
    await expectRejected(() => insertBook({ cover_url: "http://cover.openbd.jp/x.jpg" }), CHECK);
    const bookId = await insertBook();
    await insertMarker(bookId, { page: 1, location: 1 });
    await expectRejected(() => insertMarker(bookId, { page: 0, dedupe_key: KEY_B }), CHECK);
    await expectRejected(() => insertMarker(bookId, { location: 0, dedupe_key: KEY_B }), CHECK);
    await expectRejected(() => insertMarker(bookId, { dedupe_key: "A".repeat(64) }), CHECK);
  });

  it("マーカーは文かコメントのどちらかがある", async () => {
    const bookId = await insertBook();
    await insertMarker(bookId, { text: "", comment: "コメントだけ" });
    await expectRejected(() => insertMarker(bookId, { text: "", dedupe_key: KEY_B }), CHECK);
  });

  it("同じ本に同じ鍵のマーカーは1つだけ（ほかの本ならよい）", async () => {
    const bookId = await insertBook();
    const otherBookId = await insertBook();
    await insertMarker(bookId);
    await expectRejected(() => insertMarker(bookId), UNIQUE);
    await insertMarker(otherBookId);
  });

  it("持ち主の違う本にマーカーを付けられない", async () => {
    const othersBook = await insertBook({ owner_account_id: otherId });
    await expectRejected(() => insertMarker(othersBook), FOREIGN_KEY);
  });

  it("本を消すとマーカーが消え、持ち主の account を消すと本とマーカーが消える", async () => {
    const bookId = await insertBook();
    await insertMarker(bookId);
    await database.pool.query("DELETE FROM reading_book WHERE id = $1", [bookId]);
    expect(await count("reading_marker")).toBe(0);

    const kept = await insertBook({ owner_account_id: otherId });
    const ownBook = await insertBook();
    await insertMarker(ownBook);
    await database.pool.query("DELETE FROM account WHERE id = $1", [ownerId]);
    expect(await count("reading_book")).toBe(1);
    expect(await count("reading_marker")).toBe(0);
    const left = await database.pool.query<{ id: string }>("SELECT id FROM reading_book");
    expect(left.rows.map((row) => row.id)).toEqual([kept]);
  });
});
