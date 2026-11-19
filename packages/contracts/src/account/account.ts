// アカウント（account）の窓口の入出力の形（API の入力の確かめ・OpenAPI の文書・画面の入力の確かめが、同じ形を使う）。
// ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。入力の誤りの文は、欄のそばにそのまま出せる日本語にする。
import { z } from "zod";

/** LINE のユーザー ID の形（U と16進の32文字。プロバイダーごとに決まる。AD-2）。 */
export const LINE_USER_ID_FORMAT = /^U[0-9a-f]{32}$/;

/** ID トークンの文字数の上限（LINE の ID トークンは JWT。これより長いものは受け取らない）。 */
export const ID_TOKEN_MAX = 4096;

/** 表示名の文字数の上限（試験用のログイン）。 */
export const DISPLAY_NAME_MAX = 50;

/**
 * LINE でログインするときの入力。画面は liff.getIDToken() の生の値だけを送る（AD-4）。
 * 名前やユーザー ID は受け取らない（知らない欄は誤り）。
 */
export const LineLoginInput = z.strictObject({
  idToken: z
    .string({ error: "LINEのログインの情報を送ってください。" })
    .min(1, { error: "LINEのログインの情報を送ってください。" })
    .max(ID_TOKEN_MAX, { error: "LINEのログインの情報の形が合いません。" }),
});

/** LINE でログインするときの入力の型。 */
export type LineLoginInput = z.infer<typeof LineLoginInput>;

/** 試験用のログイン（手元とテストだけ。AD-12）の入力。前後の空白は除く。 */
export const TestLoginInput = z.strictObject({
  lineUserId: z
    .string({ error: "LINE のユーザー ID を入れてください。" })
    .trim()
    .regex(LINE_USER_ID_FORMAT, {
      error: "LINE のユーザー ID は、U と16進（0〜9・a〜f）の32文字にしてください。",
    }),
  displayName: z
    .string({ error: "表示名を入れてください。" })
    .trim()
    .min(1, { error: "表示名を入れてください。" })
    .max(DISPLAY_NAME_MAX, { error: `表示名は${DISPLAY_NAME_MAX}文字までにしてください。` }),
});

/** 試験用のログインの入力の型（確かめたあと）。 */
export type TestLoginInput = z.infer<typeof TestLoginInput>;

/** 今の利用者（GET /api/v1/accounts/me とログインの答え）。 */
export const CurrentAccountView = z.object({
  /** account の ID */
  id: z.guid(),
  /** 表示名（LINE の名前。チェックインの名前の初期値） */
  displayName: z.string(),
  /** 主催者か（設定の主催者の LINE のユーザー ID と同じか。AD-5） */
  isOrganizer: z.boolean(),
  /** 登録日（アカウントを作った時刻） */
  registeredAt: z.iso.datetime({ offset: true }),
});

/** 今の利用者の型。 */
export type CurrentAccountView = z.infer<typeof CurrentAccountView>;
