// 読書記録の窓口（specs/reading/001-bookshelf-import/contracts/reading.md の11の窓口）。道の頭は /api/v1/reading（AD-15・AD-32）。
// どの道もログインが要る（account の requireSession）。権限は access.ts の「持ち主か」だけで、ほかの人の記録は 404。
// アプリが見えないときの 404 は、組み立てが付ける suite の requireApp（AD-16）。
// 書誌の検索の言葉は URL に載せず、POST の本文で受ける（research R9）。本文（書名・マーカー・コメント）はログに出さない。
// DB のエラーは repository.ts の guardDbErrors で読みかえる（SQL に渡した値を、予期しないエラーのログに出さない）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/reading";
import { READING_ERRORS } from "@workspace/contracts/reading";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import { requireOwnedBook, requireOwnedMarker } from "./access.ts";
import { createCatalogClient } from "./catalog.ts";
import {
  bookOf,
  deleteBook,
  deleteMarker,
  guardDbErrors,
  importMarkers,
  insertBook,
  listBooks,
  markerKeysOf,
  mergeBooks,
  updateBook,
  updateMarker,
} from "./repository.ts";

/** 本棚。 */
const BookList = contract.BookList.openapi("ReadingBookList");
/** 本（マーカーつき）。 */
const Book = contract.Book.openapi("ReadingBook");
/** 本を足す入力。 */
const BookCreateInput = contract.BookCreateInput.openapi("ReadingBookCreateInput", {
  example: { title: "見本の本", catalogSource: "manual" },
});
/** 本を直す入力。 */
const BookUpdateInput = contract.BookUpdateInput.openapi("ReadingBookUpdateInput");
/** 本をまとめる入力。 */
const BookMergeInput = contract.BookMergeInput.openapi("ReadingBookMergeInput");
/** 本をまとめた結果。 */
const BookMergeResult = contract.BookMergeResult.openapi("ReadingBookMergeResult");
/** 鍵の一覧。 */
const MarkerKeyList = contract.MarkerKeyList.openapi("ReadingMarkerKeyList");
/** 取りこみの束。 */
const MarkerImportInput = contract.MarkerImportInput.openapi("ReadingMarkerImportInput");
/** 取りこみの束の結果。 */
const MarkerImportResult = contract.MarkerImportResult.openapi("ReadingMarkerImportResult");
/** マーカーを直す入力。 */
const MarkerUpdateInput = contract.MarkerUpdateInput.openapi("ReadingMarkerUpdateInput");
/** マーカー。 */
const Marker = contract.Marker.openapi("ReadingMarker");
/** 書誌を探す入力。 */
const CatalogSearchInput = contract.CatalogSearchInput.openapi("ReadingCatalogSearchInput", {
  example: { q: "9784873117782" },
});
/** 書誌の候補。 */
const CatalogResult = contract.CatalogResult.openapi("ReadingCatalogResult");

/** 道の bookId。 */
const BookParams = z.object({ bookId: uuidParam("bookId", "本の ID") });
/** 道の markerId。 */
const MarkerParams = z.object({ markerId: uuidParam("markerId", "マーカーの ID") });

/** 本・マーカーがない応答。 */
const notFoundResponse = domainErrorResponse(
  READING_ERRORS.NOT_FOUND,
  "本・マーカーがない（消した・ID が違う・ほかの使う人のもの）",
);

/**
 * JSON の応答の書き方。
 * @param schema 本文の形
 * @param description いつ返すか
 * @returns OpenAPI の応答の定義
 */
function json<T>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } } as const;
}

/**
 * JSON の本文の書き方。
 * @param schema 本文の形
 * @returns OpenAPI の本文の定義
 */
function body<T>(schema: T) {
  return { required: true, content: { "application/json": { schema } } } as const;
}

/**
 * 読書記録の窓口の道の定義（middleware に deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const tags = ["reading"];
  const api = "/api/v1/reading";
  const books = `${api}/books`;
  const owned = { 401: unauthenticatedResponse, 404: notFoundResponse } as const;
  return {
    searchCatalog: createRoute({
      method: "post",
      path: `${api}/catalog/search`,
      tags,
      operationId: "readingSearchCatalog",
      summary:
        "書誌を探す（書名は国立国会図書館サーチ、ISBN は openBD。20件まで。言葉を URL に載せないため POST）",
      middleware: [session] as const,
      request: { body: body(CatalogSearchInput) },
      responses: {
        200: json(CatalogResult, "候補"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        502: domainErrorResponse(READING_ERRORS.CATALOG_UNAVAILABLE, "書誌の検索の相手が使えない"),
      },
    }),
    listBooks: createRoute({
      method: "get",
      path: books,
      tags,
      operationId: "readingListBooks",
      summary: "本棚（読んでいる本が上・最後に取りこんだ順）",
      middleware: [session] as const,
      responses: { 200: json(BookList, "本棚"), 401: unauthenticatedResponse },
    }),
    createBook: createRoute({
      method: "post",
      path: books,
      tags,
      operationId: "readingCreateBook",
      summary: "本を足す（書誌から・手で書く）",
      middleware: [session] as const,
      request: { body: body(BookCreateInput) },
      responses: {
        201: json(Book, "足した本"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
      },
    }),
    getBook: createRoute({
      method: "get",
      path: `${books}/{bookId}`,
      tags,
      operationId: "readingGetBook",
      summary: "本を読む（消していないマーカーを本の中の順に）",
      middleware: [session] as const,
      request: { params: BookParams },
      responses: { 200: json(Book, "本"), ...owned },
    }),
    updateBook: createRoute({
      method: "patch",
      path: `${books}/{bookId}`,
      tags,
      operationId: "readingUpdateBook",
      summary: "本を直す（送った欄だけ）",
      middleware: [session] as const,
      request: { params: BookParams, body: body(BookUpdateInput) },
      responses: { 200: json(Book, "直した本"), 400: invalidInputResponse, ...owned },
    }),
    deleteBook: createRoute({
      method: "delete",
      path: `${books}/{bookId}`,
      tags,
      operationId: "readingDeleteBook",
      summary: "本を消す（マーカーも消える。戻せない）",
      middleware: [session] as const,
      request: { params: BookParams },
      responses: { 204: { description: "消した" }, ...owned },
    }),
    mergeBook: createRoute({
      method: "post",
      path: `${books}/{bookId}/merge`,
      tags,
      operationId: "readingMergeBook",
      summary: "本をまとめる（この本のマーカーをまとめ先に寄せ、この本を消す）",
      middleware: [session] as const,
      request: { params: BookParams, body: body(BookMergeInput) },
      responses: {
        200: json(BookMergeResult, "まとめ先の本"),
        400: invalidInputResponse,
        ...owned,
        422: domainErrorResponse(READING_ERRORS.SAME_BOOK, "同じ本どうし"),
      },
    }),
    markerKeys: createRoute({
      method: "get",
      path: `${books}/{bookId}/marker-keys`,
      tags,
      operationId: "readingMarkerKeys",
      summary: "本のマーカーの鍵の一覧（消したものも含む。画面が新しいマーカーの数を数える）",
      middleware: [session] as const,
      request: { params: BookParams },
      responses: { 200: json(MarkerKeyList, "鍵"), ...owned },
    }),
    importMarkers: createRoute({
      method: "post",
      path: `${books}/{bookId}/markers/import`,
      tags,
      operationId: "readingImportMarkers",
      summary:
        "マーカーの束を取りこむ（1〜500件。重なりは鍵で止め、読書記録で直したもの・消したものは変えない）",
      middleware: [session] as const,
      request: { params: BookParams, body: body(MarkerImportInput) },
      responses: {
        200: json(MarkerImportResult, "入った・新しくなった・変わらなかった数"),
        400: invalidInputResponse,
        ...owned,
      },
    }),
    updateMarker: createRoute({
      method: "patch",
      path: `${api}/markers/{markerId}`,
      tags,
      operationId: "readingUpdateMarker",
      summary: "マーカーを直す（コメント・? の印・章）",
      middleware: [session] as const,
      request: { params: MarkerParams, body: body(MarkerUpdateInput) },
      responses: { 200: json(Marker, "直したマーカー"), 400: invalidInputResponse, ...owned },
    }),
    deleteMarker: createRoute({
      method: "delete",
      path: `${api}/markers/{markerId}`,
      tags,
      operationId: "readingDeleteMarker",
      summary: "マーカーを消す（取りこみ直しでも戻らない）",
      middleware: [session] as const,
      request: { params: MarkerParams },
      responses: { 204: { description: "消した" }, ...owned },
    }),
  };
}

/**
 * 読書記録の窓口。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function readingRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);
  const catalog = createCatalogClient(deps.fetch);

  /**
   * 持ち主の本を読み直して返す形にする。
   * @param ownerAccountId 持ち主
   * @param bookId 本の ID
   * @returns 本
   */
  const readBook = async (ownerAccountId: string, bookId: string) =>
    bookOf(db, await requireOwnedBook(db, ownerAccountId, bookId));

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.searchCatalog, async (c) => {
      const { q } = c.req.valid("json");
      return c.json({ items: await catalog.search(q) }, 200);
    })
    .openapi(routes.listBooks, async (c) => {
      const { accountId } = currentAccount(c);
      return c.json({ items: await guardDbErrors(() => listBooks(db, accountId)) }, 200);
    })
    .openapi(routes.createBook, async (c) => {
      const { accountId } = currentAccount(c);
      const input = c.req.valid("json");
      const book = await guardDbErrors(async () => {
        const id = await insertBook(db, accountId, input);
        return readBook(accountId, id);
      });
      return c.json(book, 201);
    })
    .openapi(routes.getBook, async (c) => {
      const { accountId } = currentAccount(c);
      const { bookId } = c.req.valid("param");
      return c.json(await guardDbErrors(() => readBook(accountId, bookId)), 200);
    })
    .openapi(routes.updateBook, async (c) => {
      const { accountId } = currentAccount(c);
      const { bookId } = c.req.valid("param");
      const input = c.req.valid("json");
      await guardDbErrors(() =>
        db.transaction(async (tx) => {
          const book = await requireOwnedBook(tx, accountId, bookId, true);
          await updateBook(tx, book, input);
        }),
      );
      return c.json(await guardDbErrors(() => readBook(accountId, bookId)), 200);
    })
    .openapi(routes.deleteBook, async (c) => {
      const { accountId } = currentAccount(c);
      const { bookId } = c.req.valid("param");
      await guardDbErrors(() =>
        db.transaction(async (tx) => {
          const book = await requireOwnedBook(tx, accountId, bookId, true);
          await deleteBook(tx, book);
        }),
      );
      return c.body(null, 204);
    })
    .openapi(routes.mergeBook, async (c) => {
      const { accountId } = currentAccount(c);
      const { bookId } = c.req.valid("param");
      const { intoBookId } = c.req.valid("json");
      if (intoBookId === bookId) throw new AppError(READING_ERRORS.SAME_BOOK);
      const counts = await guardDbErrors(() =>
        db.transaction(async (tx) => {
          // 2つの本を同じ順で押さえる（同時のまとめで行き詰まらないように）
          const [firstId, secondId] = [bookId, intoBookId].sort();
          const first = await requireOwnedBook(tx, accountId, firstId as string, true);
          const second = await requireOwnedBook(tx, accountId, secondId as string, true);
          const from = first.id === bookId ? first : second;
          const into = first.id === bookId ? second : first;
          return mergeBooks(tx, from, into);
        }),
      );
      const book = await guardDbErrors(() => readBook(accountId, intoBookId));
      return c.json({ book, ...counts }, 200);
    })
    .openapi(routes.markerKeys, async (c) => {
      const { accountId } = currentAccount(c);
      const { bookId } = c.req.valid("param");
      const keys = await guardDbErrors(async () =>
        markerKeysOf(db, await requireOwnedBook(db, accountId, bookId)),
      );
      return c.json({ keys }, 200);
    })
    .openapi(routes.importMarkers, async (c) => {
      const { accountId } = currentAccount(c);
      const { bookId } = c.req.valid("param");
      const input = c.req.valid("json");
      const result = await guardDbErrors(() =>
        db.transaction(async (tx) => {
          const book = await requireOwnedBook(tx, accountId, bookId, true);
          return importMarkers(tx, book, input.source, input.markers);
        }),
      );
      return c.json(result, 200);
    })
    .openapi(routes.updateMarker, async (c) => {
      const { accountId } = currentAccount(c);
      const { markerId } = c.req.valid("param");
      const input = c.req.valid("json");
      const marker = await guardDbErrors(() =>
        db.transaction(async (tx) => {
          const current = await requireOwnedMarker(tx, accountId, markerId);
          return updateMarker(tx, current, input);
        }),
      );
      return c.json(marker, 200);
    })
    .openapi(routes.deleteMarker, async (c) => {
      const { accountId } = currentAccount(c);
      const { markerId } = c.req.valid("param");
      await guardDbErrors(() =>
        db.transaction(async (tx) => {
          const current = await requireOwnedMarker(tx, accountId, markerId);
          await deleteMarker(tx, current);
        }),
      );
      return c.body(null, 204);
    });
}
