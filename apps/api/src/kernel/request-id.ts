// 要求の ID。
// X-Request-Id を受け取り、正しい形（英数字と「-」「_」「=」で128文字まで）でなければ作る。
// 応答の見出し・エラーの本文・ログに同じ値を入れる。
import { requestId } from "hono/request-id";

/** 要求の ID の見出しの名前。 */
export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * 要求の ID の仕組みを作る（Hono の requestId。c.get("requestId") で読める）。
 * @returns Hono の middleware
 */
export function requestIdMiddleware() {
  return requestId({ headerName: REQUEST_ID_HEADER, limitLength: 128 });
}
