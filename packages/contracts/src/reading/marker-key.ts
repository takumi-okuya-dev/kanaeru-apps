// マーカーの重なりを見分ける鍵（specs/reading/001-bookshelf-import/research.md R3・AD-32）。zod を読まない。
// そろえたマーカーの文（文のないものはコメント）と、ページと位置をつないで SHA-256 にする。API と画面の両方が同じ関数を使う。
// API は画面から来た鍵を信じず、受けた中身から作り直す。Web Crypto（crypto.subtle）は Node と端末の両方にある。

/** 日本語の字（漢字・ひらがな・カタカナ・長音・句読点）。この字どうしの間の空白は、改行の名残なので除く。 */
const JA = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー、。「」]";

/** 日本語の字どうしの間の空白。 */
const SPACE_BETWEEN_JA = new RegExp(`(?<=${JA}) (?=${JA})`, "gu");

/**
 * マーカーの文をそろえる（NFKC・空白と改行の続きを1つの空白に・日本語の字どうしの間の空白を除く・前後の空白を取る）。
 * PDF や書き出しでは、行の折り返しが空白や改行として入るため。
 * @param value 文
 * @returns そろえた文
 */
export function normalizeMarkerText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").replace(SPACE_BETWEEN_JA, "").trim();
}

/** 鍵を作る中身。 */
export type MarkerKeyInput = {
  /** マーカーの文（空はコメントだけのもの） */
  text: string;
  /** コメント（文が空のときだけ鍵に使う） */
  comment?: string | null | undefined;
  /** ページ */
  page?: number | null | undefined;
  /** 位置 */
  location?: number | null | undefined;
};

/**
 * 鍵のもとの文（テストと鍵の両方で使う）。
 * @param input 中身
 * @returns 鍵のもとの文
 */
export function markerKeySource(input: MarkerKeyInput): string {
  const text = normalizeMarkerText(input.text);
  const body = text === "" ? `comment:${normalizeMarkerText(input.comment ?? "")}` : `text:${text}`;
  return `${body}|${input.page ?? ""}|${input.location ?? ""}`;
}

/**
 * マーカーの重なりを見分ける鍵（SHA-256 の16進64字）。
 * @param input 中身
 * @returns 鍵
 */
export async function markerKey(input: MarkerKeyInput): Promise<string> {
  const bytes = new TextEncoder().encode(markerKeySource(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
