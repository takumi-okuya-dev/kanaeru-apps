// 読書記録の窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["reading"] から import type で読む）。
// 読み書きは lib/api.ts の request を通す（エラーの読み方をそろえる）。書誌の検索の言葉は POST の本文で送り、URL に載せない。
import type {
  BookCreateInput,
  BookUpdateInput,
  MarkerImportInput,
  MarkerUpdateInput,
} from "@workspace/contracts/reading";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["reading"]>> | undefined;

/**
 * 読書記録の窓口の呼び出しの道具。
 * @returns 呼び出しの道具の reading の部分
 */
function readingApi() {
  client ??= createApiClient<ModuleRoutes["reading"]>();
  return client.api.v1.reading;
}

/**
 * 書誌を探す（書名か ISBN）。
 * @param q 書名か ISBN
 * @returns 候補
 */
export function searchCatalog(q: string) {
  return request(() => readingApi().catalog.search.$post({ json: { q } }));
}

/**
 * 本棚。
 * @returns 本棚の本
 */
export function fetchBooks() {
  return request(() => readingApi().books.$get());
}

/**
 * 本を足す。
 * @param input 本の欄
 * @returns 足した本
 */
export function createBook(input: BookCreateInput) {
  return request(() => readingApi().books.$post({ json: input }));
}

/**
 * 本を読む。
 * @param bookId 本の ID
 * @returns 本（マーカーつき）
 */
export function fetchBook(bookId: string) {
  return request(() => readingApi().books[":bookId"].$get({ param: { bookId } }));
}

/**
 * 本を直す。
 * @param bookId 本の ID
 * @param input 直す欄
 * @returns 直した本
 */
export function updateBook(bookId: string, input: BookUpdateInput) {
  return request(() => readingApi().books[":bookId"].$patch({ param: { bookId }, json: input }));
}

/**
 * 本を消す。
 * @param bookId 本の ID
 * @returns なし
 */
export function deleteBook(bookId: string) {
  return request(() => readingApi().books[":bookId"].$delete({ param: { bookId } }));
}

/**
 * 本をまとめる。
 * @param bookId まとめる元の本
 * @param intoBookId まとめ先の本
 * @returns まとめ先の本と数
 */
export function mergeBook(bookId: string, intoBookId: string) {
  return request(() =>
    readingApi().books[":bookId"].merge.$post({ param: { bookId }, json: { intoBookId } }),
  );
}

/**
 * 本のマーカーの鍵の一覧。
 * @param bookId 本の ID
 * @returns 鍵
 */
export function fetchMarkerKeys(bookId: string) {
  return request(() => readingApi().books[":bookId"]["marker-keys"].$get({ param: { bookId } }));
}

/**
 * マーカーの束を取りこむ。
 * @param bookId 本の ID
 * @param input 束
 * @returns 入った・新しくなった・変わらなかった数
 */
export function importMarkerBatch(bookId: string, input: MarkerImportInput) {
  return request(() =>
    readingApi().books[":bookId"].markers.import.$post({ param: { bookId }, json: input }),
  );
}

/**
 * マーカーを直す。
 * @param markerId マーカーの ID
 * @param input 直す欄
 * @returns 直したマーカー
 */
export function updateMarker(markerId: string, input: MarkerUpdateInput) {
  return request(() =>
    readingApi().markers[":markerId"].$patch({ param: { markerId }, json: input }),
  );
}

/**
 * マーカーを消す。
 * @param markerId マーカーの ID
 * @returns なし
 */
export function deleteMarker(markerId: string) {
  return request(() => readingApi().markers[":markerId"].$delete({ param: { markerId } }));
}
