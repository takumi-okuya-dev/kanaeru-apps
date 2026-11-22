// 試合表の見るだけのページ（AD-26）と QR の受付（AD-30）の窓口の形（ログインなしで使う。match-004 contracts）。
// 見るだけのページに出すのは、試合表の名前と日付・組（言葉）・呼び名・組み合わせ・進み具合だけ。レベル・氏名・名簿の人の ID・
// account・つないだ交流会は出さない（組の言葉で、どのレベルの表に名前があるかは見える）。
// 受付で書けるのは呼び名（1〜20文字）とレベルだけ（strict。ほかの欄は受けない）。
import { z } from "zod";
import { MATCH_GROUP_KEYS, MATCH_LEVELS } from "./options.ts";
import { NICKNAME_MAX } from "./table.ts";

/** 1つの試合表に受け付ける人数の上限（AD-30【仮決め】）。 */
export const JOIN_MAX = 100;

/**
 * 受付の行から名簿に入れた人の ID（受付の ID〈uuid〉の終わりの15文字に j を付けた16文字。名簿の人の ID の形）。
 * 同じ受付を二度入れない・名簿の人がどの受付から入ったかを見分けるために、API と画面が同じ関数を使う。
 * @param joinId 受付の ID
 * @returns 名簿の人の ID
 */
export function joinPlayerId(joinId: string): string {
  return `j${joinId.replace(/-/gu, "").toLowerCase().slice(-15)}`;
}

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/** 見るだけのページの1試合（呼び名の並び・終わったか）。 */
export const MatchViewGame = z.object({
  /** 入る人の呼び名（列の順） */
  players: z.array(z.string()),
  /** 終わったか */
  done: z.boolean(),
});

/** 見るだけのページの1つの組。 */
export const MatchViewGroup = z.object({
  /** 組の key */
  key: z.enum(MATCH_GROUP_KEYS),
  /** 組の言葉（タブ） */
  label: z.string(),
  /** 試合（古い順） */
  games: z.array(MatchViewGame),
});

/** 見るだけのページの中身。 */
export const MatchView = z.object({
  /** 試合表の名前 */
  name: z.string(),
  /** 試合の日（日本時間の日付） */
  playDate: z.string(),
  /** 版の番号（30秒おきに確かめ、変わっていれば読み直す） */
  version: z.number().int(),
  /** 1試合の長さ（分） */
  minutesPerGame: z.number().int(),
  /** 組ごとの試合（分け方の順。試合のない組も出す） */
  groups: z.array(MatchViewGroup),
  /** 最後に直した時刻 */
  updatedAt: isoDateTime,
  /** 見られる期限 */
  expiresAt: isoDateTime,
});

/** 見るだけのページの中身の型。 */
export type MatchView = z.infer<typeof MatchView>;

/** 見るだけのページの版の番号。 */
export const MatchViewVersion = z.object({
  /** 版の番号 */
  version: z.number().int(),
});

/**
 * ネットなしで開く仕組みを使うか（機能の印 match.offline。AD-27 の止め方。ログインなしで読む）。
 * 画面は false か 404（アプリが見えない）なら Service Worker を入れず、入っているものを外す（match-005）。
 */
export const MatchOfflineSetting = z.object({
  /** 使うか */
  enabled: z.boolean(),
});

/** ネットなしで開く仕組みを使うかの型。 */
export type MatchOfflineSetting = z.infer<typeof MatchOfflineSetting>;

/** 受付のページの中身（試合表の名前と日付・選べるレベル）。 */
export const MatchJoinInfo = z.object({
  /** 試合表の名前 */
  name: z.string(),
  /** 試合の日 */
  playDate: z.string(),
  /** 選べるレベル */
  levels: z.array(z.enum(MATCH_LEVELS)),
});

/** 受付のページの中身の型。 */
export type MatchJoinInfo = z.infer<typeof MatchJoinInfo>;

/** 受付の入力（呼び名とレベルだけ）。 */
export const MatchJoinInput = z.strictObject({
  /** 呼び名（試合表に出る名前。制御文字・向きを変える文字・幅のない文字は受けない） */
  nickname: z
    .string()
    .trim()
    .min(1, { error: "名前を入れてください。" })
    .max(NICKNAME_MAX, { error: `名前は${NICKNAME_MAX}文字までにしてください。` })
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), {
      error: "名前に使えない文字が入っています。ふつうの文字で入れてください。",
    }),
  /** レベル */
  level: z.enum(MATCH_LEVELS, { error: "レベルを選んでください。" }),
});

/** 受付の入力の型。 */
export type MatchJoinInput = z.infer<typeof MatchJoinInput>;

/** 受け付けた答え。 */
export const MatchJoinAccepted = z.object({
  /** 呼び名 */
  nickname: z.string(),
  /** レベル */
  level: z.enum(MATCH_LEVELS),
});

/** 運営に返す、作った札（札そのものはこのときだけ返す。DB は SHA-256 だけを持つ）。 */
export const MatchLinkIssued = z.object({
  /** 札（URL に入れる） */
  token: z.string(),
  /** 期限 */
  expiresAt: isoDateTime,
  /** 札の SHA-256 の頭8文字（端末に置いた札が今の札かを見分ける。札は分からない） */
  hint: z.string(),
});

/** 作った札の型。 */
export type MatchLinkIssued = z.infer<typeof MatchLinkIssued>;

/** 受付の1行（運営の画面）。 */
export const MatchJoinEntry = z.object({
  /** 受付の ID */
  id: z.uuid(),
  /** 呼び名 */
  nickname: z.string(),
  /** レベル */
  level: z.enum(MATCH_LEVELS),
  /** 受け付けた時刻 */
  createdAt: isoDateTime,
  /** 同じ呼び名が、ほかの受付か名簿にある */
  duplicate: z.boolean(),
});

/** 受付の1行の型。 */
export type MatchJoinEntry = z.infer<typeof MatchJoinEntry>;

/** 受付の一覧（受け付けた順）。 */
export const MatchJoinList = z.object({
  /** 受付の行 */
  joins: z.array(MatchJoinEntry),
  /** 受付の札の期限（札がなければ null） */
  expiresAt: isoDateTime.nullable(),
  /** 締めた時刻（締めていなければ null） */
  closedAt: isoDateTime.nullable(),
  /** 今の受付の札の SHA-256 の頭8文字（札がない・期限を過ぎていれば null） */
  hint: z.string().nullable(),
});

/** 受付の一覧の型。 */
export type MatchJoinList = z.infer<typeof MatchJoinList>;
