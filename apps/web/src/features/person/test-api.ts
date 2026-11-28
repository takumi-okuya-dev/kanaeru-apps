// 人物メモの画面のテストの手伝い（テストだけで使う）：fetch を差しかえ、今の利用者を返し、送られた要求を残す。
// 名前と話したことは、どれも架空のもの。
import type { Meeting, Note, NoteSummary } from "@workspace/contracts/person";
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

/** 見本の人の ID。 */
export const NOTE_ID = "0193a1b2-0000-7000-8000-000000000101";

/** 見本の会った場の ID。 */
export const MEETING_ID = "0193a1b2-0000-7000-8000-000000000201";

/** 見本の一覧の1行。 */
export const SUMMARY: NoteSummary = {
  id: NOTE_ID,
  fullName: "田中 太郎",
  reading: "たなか たろう",
  lineName: "たろう🍙",
  appearance: "黒ぶちの眼鏡",
  tags: ["AI"],
  updatedAt: "2026-11-27T10:00:00.000Z",
};

/** 見本の人のメモ。 */
export const NOTE: Note = {
  ...SUMMARY,
  accounts: {
    x: "@taro",
    connpass: null,
    github: null,
    linkedin: null,
    line: "taro.line",
    url: "javascript:alert(1)",
  },
  talk: "Go の話",
  nextTopic: "転職の話",
  version: 3,
  meetings: [{ id: MEETING_ID, name: "11月の AI 勉強会", metOn: "2026-11-20", noteCount: 1 }],
};

/** 見本の会った場。 */
export const MEETING: Meeting = {
  id: MEETING_ID,
  name: "11月の AI 勉強会",
  metOn: "2026-11-20",
  noteCount: 0,
  notes: [],
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
 * @param handler 人物メモの窓口に答える関数
 * @returns 送られた要求（今の利用者の読みこみは除く）
 */
export function stubPersonApi(handler: Handler): Sent[] {
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
