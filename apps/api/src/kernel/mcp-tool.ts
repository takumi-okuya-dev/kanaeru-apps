// MCP の道具の型（領域が出し、/api/mcp が範囲で見せる。core-021・AD-20）。
// 道具は、窓口（画面と同じ HTTP の道）を request で呼ぶだけ。権限は窓口の既存の守りが決める。
import type { z } from "zod";

/** 道具の中身が使う道具（窓口を呼ぶ。利用者の札は付けない。内部の印で利用者と範囲を渡す）。 */
export type McpToolContext = {
  /** 呼んだ利用者の account の ID */
  accountId: string;
  /**
   * 窓口を呼ぶ（path は "/api/v1/…"）。この利用者の範囲で、窓口の守りを通る。
   * @param path 道（問い合わせを含めてよい）
   * @param init 要求の中身（省けば GET）
   * @returns 応答
   */
  request(path: string, init?: RequestInit): Promise<Response>;
};

/** 道具の定義。 */
export type McpTool = {
  /** 道具の名前（例 reception_my_checkin） */
  name: string;
  /** AI に見せる説明 */
  description: string;
  /** 読むか書くか（書くは次の段階の仕組み。FR-025） */
  access: "read" | "write";
  /** 呼ぶのに要る範囲（例 reception:read） */
  requiredScope: string;
  /** 入力の形（zod） */
  inputSchema: z.ZodType;
  /**
   * 道具の中身。
   * @param input 入力（inputSchema を通ったもの）
   * @param ctx 呼んだ利用者と窓口の呼び出し
   * @returns 本文（テキスト）
   */
  run(input: unknown, ctx: McpToolContext): Promise<string>;
};
