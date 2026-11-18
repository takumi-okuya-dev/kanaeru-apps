// エラーの本文の形（土台の code の文言は messages.ts）。
// 領域のエラーの code と文言は、その領域のフォルダ（packages/contracts/src/<領域>/）に置き、ここに足さない。
// 約束はふつうの zod で書く（画面の組み立てに OpenAPI の道具を入れないため）。OpenAPI の名前は API の側で付ける。
import { z } from "zod";

/** 入力の欄ごとの理由。 */
export const FieldError = z.object({
  path: z.string().describe("欄の道（入れ子は . でつなぐ）"),
  message: z.string().describe("欄のそばに出せる日本語"),
});

/** 入力の欄ごとの理由の型。 */
export type FieldError = z.infer<typeof FieldError>;

/** エラーの本文の形。すべての窓口のエラーで同じ。 */
export const ErrorBody = z.object({
  error: z.object({
    code: z
      .string()
      .describe(
        "機械が読む印（英語の大文字）。土台の code は CORE_ERROR_MESSAGES、領域の code は領域の約束。",
      ),
    message: z.string().describe("画面にそのまま出せる日本語。利用者が入れた値は入れない。"),
    requestId: z.string(),
    fields: z.array(FieldError).optional().describe("入力が合わないときだけ。欄ごとの理由。"),
  }),
});

/** エラーの本文の型。 */
export type ErrorBody = z.infer<typeof ErrorBody>;
