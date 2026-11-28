// 読書記録の画面のテストの手伝い（テストだけで使う）：fetch を差しかえ、今の利用者を返し、送られた要求を残す。
// 書名とマーカーの文は、どれも架空のもの。
import type { Book, BookSummary } from "@workspace/contracts/reading";
import { vi } from "vitest";

/** 送られた要求。 */
export type Sent = {
  /** 動き */
  method: string;
  /** 道 */
  path: string;
  /** 本文（JSON） */
  body: unknown;
};

/** 要求に答える関数（undefined なら 404）。投げると通信の誤りになる。 */
export type Handler = (request: Sent) => Response | undefined | Promise<Response | undefined>;

/** 見本の本の ID。 */
export const BOOK_ID = "0193a1b2-0000-7000-8000-000000000301";

/** 見本の本棚の1冊。 */
export const SUMMARY: BookSummary = {
  id: BOOK_ID,
  title: "見本のネットワーク入門",
  author: "架空 太郎",
  coverUrl: null,
  status: "reading",
  sources: ["goodnotes"],
  markerCount: 2,
  lastImportedAt: "2026-11-26T10:00:00.000Z",
};

/** 見本の本（マーカーつき）。 */
export const BOOK: Book = {
  ...SUMMARY,
  isbn: null,
  want: "仕組みを説明できるようになる",
  catalogSource: "manual",
  markers: [
    {
      id: "0193a1b2-0000-7000-8000-000000000401",
      source: "goodnotes",
      chapter: "2章 見本の通信",
      page: 38,
      location: null,
      position: 3_800_001,
      text: "見本のマーカーの文 A",
      comment: "見本のコメント",
      question: false,
    },
    {
      id: "0193a1b2-0000-7000-8000-000000000402",
      source: "goodnotes",
      chapter: "3章 見本の窓口",
      page: 57,
      location: null,
      position: 5_700_001,
      text: "見本のマーカーの文 B",
      comment: null,
      question: false,
    },
  ],
};

/**
 * エラーの本文の応答。
 * @param status 状態の番号
 * @param code code
 * @param message 文言
 * @returns 応答
 */
export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, requestId: "r" } }, { status });
}

/**
 * fetch を差しかえる（今の利用者は、いつもログインしている人）。
 * @param handler 読書記録の窓口に答える関数
 * @returns 送られた要求（今の利用者の読みこみは除く）
 */
export function stubReadingApi(handler: Handler): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/api/v1/accounts/me") {
      return Response.json({
        id: "0193a1b2-0000-7000-8000-000000000000",
        displayName: "使う人",
        isOrganizer: false,
        registeredAt: "2026-11-19T10:00:00.000Z",
      });
    }
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const request = { method: (init?.method ?? "GET").toUpperCase(), path: url.pathname, body };
    sent.push(request);
    const response = await handler(request);
    return response ?? errorResponse(404, "NOT_FOUND", "見つかりません。");
  });
  return sent;
}
