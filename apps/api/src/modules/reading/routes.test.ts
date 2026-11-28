// 読書記録の窓口の結合のテスト（本物の PostgreSQL・specs/reading/001-bookshelf-import/contracts/reading.md）：本を足す・本棚の並び・
// 読む・直す・消す・まとめる・鍵の一覧・取りこみ（束の上限・重ならない・取りこみ直しの決まり）・マーカーを直す・消す・
// 持ち主だけ（ほかの人の ID は 404）・アプリが見えないときの 404・退会。書名とマーカーの文は、どれも架空のもの。
import "@hono/zod-openapi";
import { READING_IMPORT_LIMITS, markerKey } from "@workspace/contracts/reading";
import type { Book, BookList, BookMergeResult, Marker } from "@workspace/contracts/reading";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import {
  READING_API,
  READING_BOOKS,
  createBook,
  importMarkers,
  importResult,
  sampleMarker,
  showReadingApp,
} from "../../../test/helpers/reading.ts";
import { upsertVisibility } from "../suite/index.ts";

const database = useTestDatabase();

/** ログインした人（クッキーと account の ID）。 */
type Login = Awaited<ReturnType<typeof loginAs>>;

/**
 * 応答のエラーの code。
 * @param response 応答
 * @returns code
 */
async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as ErrorBody).error.code;
}

describe("読書記録の窓口", () => {
  let app: TestApp;
  let owner: Login;
  let other: Login;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showReadingApp(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "使う人" });
    other = await loginAs(app, { displayName: "ほかの使う人" });
  });

  /**
   * 本を読む。
   * @param bookId 本の ID
   * @param cookie クッキー（なければ持ち主）
   * @returns 本
   */
  async function readBook(bookId: string, cookie = owner.cookie): Promise<Book> {
    const response = await call(app, cookie, `${READING_BOOKS}/${bookId}`);
    expect(response.status).toBe(200);
    return (await response.json()) as Book;
  }

  describe("本", () => {
    it("手で書いて足し、読む。ISBN は13桁に直る", async () => {
      const book = await createBook(app, owner.cookie, {
        title: "  見本の本  ",
        author: "架空 太郎",
        isbn: "4-87311-778-X",
        want: "仕組みを説明できるようになる",
        sources: ["goodnotes"],
      });
      expect(book).toMatchObject({
        title: "見本の本",
        author: "架空 太郎",
        isbn: "9784873117782",
        want: "仕組みを説明できるようになる",
        sources: ["goodnotes"],
        status: "reading",
        markers: [],
      });
      expect((await readBook(book.id)).title).toBe("見本の本");
    });

    it("入力の誤りは 400（書名が空・ISBN の形・書影の URL・読む場所の重なり・知らない欄）", async () => {
      const cases: Record<string, unknown>[] = [
        { title: "", catalogSource: "manual" },
        { title: "本", catalogSource: "manual", isbn: "123" },
        { title: "本", catalogSource: "ndl", coverUrl: "https://books.google.com/x.jpg" },
        { title: "本", catalogSource: "manual", sources: ["kindle", "kindle"] },
        { title: "本", catalogSource: "manual", extra: 1 },
      ];
      for (const body of cases) {
        expect((await call(app, owner.cookie, READING_BOOKS, "POST", body)).status).toBe(400);
      }
    });

    it("本棚は、読んでいる本が上で、最後に取りこんだ本が先", async () => {
      const a = await createBook(app, owner.cookie, { title: "A" });
      const b = await createBook(app, owner.cookie, { title: "B" });
      const c = await createBook(app, owner.cookie, { title: "C" });
      await importResult(await importMarkers(app, owner.cookie, a.id, [sampleMarker(1)]));
      await call(app, owner.cookie, `${READING_BOOKS}/${c.id}`, "PATCH", { status: "finished" });
      const list = (await (await call(app, owner.cookie, READING_BOOKS)).json()) as BookList;
      expect(list.items.map((item) => item.title)).toEqual(["A", "B", "C"]);
      expect(list.items[0]?.markerCount).toBe(1);
      expect(list.items.map((item) => item.id)).toEqual([a.id, b.id, c.id]);
    });

    it("ログインしていなければ 401。ない ID・形の違う ID・ほかの人の本は 404", async () => {
      expect((await app.request(READING_BOOKS)).status).toBe(401);
      expect(
        (await call(app, owner.cookie, `${READING_BOOKS}/${crypto.randomUUID()}`)).status,
      ).toBe(404);
      expect((await call(app, owner.cookie, `${READING_BOOKS}/abc`)).status).toBe(404);
      const theirs = await createBook(app, other.cookie, { title: "ほかの人の本" });
      const path = `${READING_BOOKS}/${theirs.id}`;
      const notFound = await call(app, owner.cookie, path);
      expect(notFound.status).toBe(404);
      expect(await errorCode(notFound)).toBe("READING_NOT_FOUND");
      expect((await call(app, owner.cookie, path, "PATCH", { title: "書きかえ" })).status).toBe(
        404,
      );
      expect((await call(app, owner.cookie, path, "DELETE")).status).toBe(404);
      expect((await call(app, owner.cookie, `${path}/marker-keys`)).status).toBe(404);
      expect((await importMarkers(app, owner.cookie, theirs.id, [sampleMarker(1)])).status).toBe(
        404,
      );
      expect((await readBook(theirs.id, other.cookie)).title).toBe("ほかの人の本");
    });

    it("台帳で「切」なら、ログインしていても 404", async () => {
      await upsertVisibility(database.db, "reading", "off");
      expect((await call(app, owner.cookie, READING_BOOKS)).status).toBe(404);
    });

    it("直す（送った欄だけ）・消す（マーカーも消える）", async () => {
      const book = await createBook(app, owner.cookie, { title: "前の書名", want: "前" });
      await importResult(await importMarkers(app, owner.cookie, book.id, [sampleMarker(1)]));
      const patched = await call(app, owner.cookie, `${READING_BOOKS}/${book.id}`, "PATCH", {
        status: "dropped",
        sources: ["kindle", "other"],
        want: "",
      });
      expect(patched.status).toBe(200);
      expect((await patched.json()) as Book).toMatchObject({
        title: "前の書名",
        status: "dropped",
        sources: ["kindle", "other"],
        want: null,
      });
      expect((await call(app, owner.cookie, `${READING_BOOKS}/${book.id}`, "DELETE")).status).toBe(
        204,
      );
      expect((await call(app, owner.cookie, `${READING_BOOKS}/${book.id}`)).status).toBe(404);
      const left = await database.pool.query("SELECT count(*)::int AS n FROM reading_marker");
      expect(left.rows[0]).toEqual({ n: 0 });
    });
  });

  describe("取りこみ", () => {
    it("入る・本の中の順に並ぶ・最後に取りこんだ時刻と読む場所が新しくなる", async () => {
      const book = await createBook(app, owner.cookie);
      const result = await importResult(
        await importMarkers(app, owner.cookie, book.id, [
          sampleMarker(3, { chapter: "3章", comment: "コメント" }),
          sampleMarker(1, { chapter: "1章" }),
          { text: "", comment: "? コメントだけ", page: 2, position: 200_000, question: true },
        ]),
      );
      expect(result).toEqual({ inserted: 3, updated: 0, unchanged: 0 });
      const read = await readBook(book.id);
      expect(read.markers.map((marker) => marker.page)).toEqual([1, 2, 3]);
      expect(read.markers[1]).toMatchObject({
        text: "",
        comment: "? コメントだけ",
        question: true,
      });
      expect(read.sources).toEqual(["goodnotes"]);
      expect(read.lastImportedAt).not.toBeNull();
      await importResult(
        await importMarkers(app, owner.cookie, book.id, [sampleMarker(9)], "paste"),
      );
      expect((await readBook(book.id)).sources).toEqual(["goodnotes", "other"]);
    });

    it("鍵の一覧は、API が作った鍵と同じ", async () => {
      const book = await createBook(app, owner.cookie);
      await importResult(await importMarkers(app, owner.cookie, book.id, [sampleMarker(1)]));
      const response = await call(app, owner.cookie, `${READING_BOOKS}/${book.id}/marker-keys`);
      const { keys } = (await response.json()) as { keys: string[] };
      expect(keys).toEqual([await markerKey({ text: "見本のマーカーの文 1", page: 1 })]);
    });

    it("束の上限：501件は 400・文もコメントもない行は 400・本文が大きすぎると断る", async () => {
      const book = await createBook(app, owner.cookie);
      const many = Array.from({ length: READING_IMPORT_LIMITS.markersPerBatch + 1 }, (_, i) =>
        sampleMarker(i + 1),
      );
      expect((await importMarkers(app, owner.cookie, book.id, many)).status).toBe(400);
      expect(
        (
          await importMarkers(app, owner.cookie, book.id, [
            { text: " ", position: 1, question: false },
          ])
        ).status,
      ).toBe(400);
      const huge = Array.from({ length: 40 }, (_, i) =>
        sampleMarker(i + 1, { text: "あ".repeat(4_000) }),
      );
      expect((await importMarkers(app, owner.cookie, book.id, huge)).status).toBe(413);
    });
  });

  describe("取りこみ直し", () => {
    it("同じ束を2回送っても重ならない。空白だけ違う文は同じマーカー。束の中の重なりも1つ", async () => {
      const book = await createBook(app, owner.cookie);
      const first = await importResult(
        await importMarkers(app, owner.cookie, book.id, [sampleMarker(1), sampleMarker(2)]),
      );
      expect(first.inserted).toBe(2);
      const again = await importResult(
        await importMarkers(app, owner.cookie, book.id, [
          sampleMarker(1, { text: "見本の\nマーカーの文  1" }),
          sampleMarker(2),
          sampleMarker(2),
          sampleMarker(3),
        ]),
      );
      expect(again).toEqual({ inserted: 1, updated: 0, unchanged: 3 });
      expect((await readBook(book.id)).markers).toHaveLength(3);
    });

    it("読書記録で直したコメントと付け外した印は変わらない。直していないコメントは新しくなる。章は空のときだけ埋める", async () => {
      const book = await createBook(app, owner.cookie);
      await importResult(
        await importMarkers(app, owner.cookie, book.id, [
          sampleMarker(1, { comment: "元のコメント1" }),
          sampleMarker(2, { comment: "元のコメント2" }),
          sampleMarker(3, { comment: "? 調べる", question: true, chapter: "直した章" }),
        ]),
      );
      const [m1, , m3] = (await readBook(book.id)).markers as [Marker, Marker, Marker];
      await call(app, owner.cookie, `${READING_API}/markers/${m1.id}`, "PATCH", {
        comment: "読書記録で直した",
      });
      await call(app, owner.cookie, `${READING_API}/markers/${m3.id}`, "PATCH", {
        question: false,
      });
      const result = await importResult(
        await importMarkers(app, owner.cookie, book.id, [
          sampleMarker(1, { comment: "GoodNotes で直した1" }),
          sampleMarker(2, { comment: "GoodNotes で直した2", chapter: "2章" }),
          sampleMarker(3, { comment: "? 調べる", question: true, chapter: "べつの章" }),
        ]),
      );
      expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 2 });
      const markers = (await readBook(book.id)).markers;
      expect(markers.map((marker) => marker.comment)).toEqual([
        "読書記録で直した",
        "GoodNotes で直した2",
        "? 調べる",
      ]);
      expect(markers[1]?.chapter).toBe("2章");
      expect(markers[2]).toMatchObject({ question: false, chapter: "直した章" });
    });

    it("消したマーカーは、取りこみ直しても戻らない", async () => {
      const book = await createBook(app, owner.cookie);
      await importResult(await importMarkers(app, owner.cookie, book.id, [sampleMarker(1)]));
      const [marker] = (await readBook(book.id)).markers as [Marker];
      expect(
        (await call(app, owner.cookie, `${READING_API}/markers/${marker.id}`, "DELETE")).status,
      ).toBe(204);
      const result = await importResult(
        await importMarkers(app, owner.cookie, book.id, [sampleMarker(1, { comment: "新しい" })]),
      );
      expect(result).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
      expect((await readBook(book.id)).markers).toEqual([]);
    });
  });

  describe("マーカー", () => {
    it("コメント・印・章を直す。文のないマーカーのコメントは消せない。ほかの人のマーカーは 404", async () => {
      const book = await createBook(app, owner.cookie);
      await importResult(
        await importMarkers(app, owner.cookie, book.id, [
          sampleMarker(1),
          { text: "", comment: "コメントだけ", page: 2, position: 200_000, question: false },
        ]),
      );
      const [m1, m2] = (await readBook(book.id)).markers as [Marker, Marker];
      const patched = await call(app, owner.cookie, `${READING_API}/markers/${m1.id}`, "PATCH", {
        comment: "? 分からない",
        question: true,
        chapter: "1章",
      });
      expect(patched.status).toBe(200);
      expect((await patched.json()) as Marker).toMatchObject({
        comment: "? 分からない",
        question: true,
        chapter: "1章",
      });
      expect(
        (
          await call(app, owner.cookie, `${READING_API}/markers/${m2.id}`, "PATCH", {
            comment: null,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await call(app, other.cookie, `${READING_API}/markers/${m1.id}`, "PATCH", {
            comment: "x",
          })
        ).status,
      ).toBe(404);
      expect(
        (await call(app, other.cookie, `${READING_API}/markers/${m1.id}`, "DELETE")).status,
      ).toBe(404);
    });
  });

  describe("本棚を整える", () => {
    it("まとめると、マーカーが寄り、同じマーカーは1つになり、元の本は消える", async () => {
      const into = await createBook(app, owner.cookie, { title: "まとめ先", sources: ["kindle"] });
      const from = await createBook(app, owner.cookie, { title: "元", sources: ["goodnotes"] });
      await importResult(await importMarkers(app, owner.cookie, into.id, [sampleMarker(1)]));
      await importResult(
        await importMarkers(app, owner.cookie, from.id, [sampleMarker(1), sampleMarker(2)]),
      );
      const response = await call(app, owner.cookie, `${READING_BOOKS}/${from.id}/merge`, "POST", {
        intoBookId: into.id,
      });
      expect(response.status).toBe(200);
      const merged = (await response.json()) as BookMergeResult;
      expect(merged).toMatchObject({ movedCount: 1, duplicateCount: 1 });
      expect(merged.book.markers).toHaveLength(2);
      expect(merged.book.sources).toEqual(["kindle", "goodnotes"]);
      expect((await call(app, owner.cookie, `${READING_BOOKS}/${from.id}`)).status).toBe(404);
    });

    it("同じ本どうしは 422。まとめ先がほかの人の本なら 404", async () => {
      const mine = await createBook(app, owner.cookie);
      const theirs = await createBook(app, other.cookie);
      const same = await call(app, owner.cookie, `${READING_BOOKS}/${mine.id}/merge`, "POST", {
        intoBookId: mine.id,
      });
      expect(same.status).toBe(422);
      expect(await errorCode(same)).toBe("READING_SAME_BOOK");
      expect(
        (
          await call(app, owner.cookie, `${READING_BOOKS}/${mine.id}/merge`, "POST", {
            intoBookId: theirs.id,
          })
        ).status,
      ).toBe(404);
      expect((await readBook(mine.id)).id).toBe(mine.id);
    });
  });

  describe("退会", () => {
    it("退会すると、本とマーカーの行が消える", async () => {
      const book = await createBook(app, owner.cookie);
      await importResult(await importMarkers(app, owner.cookie, book.id, [sampleMarker(1)]));
      await createBook(app, other.cookie);
      expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
      const books = await database.pool.query("SELECT count(*)::int AS n FROM reading_book");
      const markers = await database.pool.query("SELECT count(*)::int AS n FROM reading_marker");
      expect(books.rows[0]).toEqual({ n: 1 });
      expect(markers.rows[0]).toEqual({ n: 0 });
    });
  });
});
