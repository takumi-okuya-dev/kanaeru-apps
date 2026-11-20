// 参加者が外から開く画面の道と、それを LINEミニアプリの URL（パーマリンク）にする関数（構成の決めごと AD-14）。
// 組織の招待（/join/{token}）も、外から開く道としてここに置く（AD-22）。
// reception・survey・event の画面はこの道で作り、event はこの関数で QR と招待のリンクを作る。QR に置き場所の URL を入れない。
// パーマリンク ＝ LIFF URL ＋（ページの URL − エンドポイントの URL）。エンドポイントは源の直下に置くので、LIFF URL ＋ 道になる
// （https://developers.line.biz/en/docs/line-mini-app/develop/permanent-links/。specs/core/001-foundation/research.md R9）。
// 未認証のミニアプリをパーマリンクで開けないと分かったら、この関数の中だけを直す（Open Question 1）。
// zod を読まない（画面が道だけを読んでも zod が束に入らないため）。

/** LINEミニアプリの URL（LIFF URL）の頭。LINE 13.20 より前の端末は liff.line.me を使うが、こちらを開いてもミニアプリが開く。 */
export const MINI_APP_URL_BASE = "https://miniapp.line.me";

/** LIFF ID の形（チャネル ID の数字 - 英数字）。 */
const LIFF_ID_FORMAT = /^\d+-[A-Za-z0-9]+$/;

/** 参加者が開く画面の道の形（TanStack Router の createRoute の path にそのまま使う）。 */
export const PARTICIPANT_ROUTE_PATTERNS = {
  /** 受付（チェックイン） */
  checkin: "/e/$eventId/checkin",
  /** アンケート */
  survey: "/e/$eventId/survey",
  /** 受付係の招待 */
  invite: "/invite/$inviteToken",
  /** 組織の招待（suite-001。AD-22） */
  join: "/join/$joinToken",
} as const;

/**
 * 道の値を、道の一部として使える形にする（空は止める）。
 * @param value 道の値（交流会の ID・招待の印）
 * @returns 道に入れる文字
 * @throws {RangeError} 値が空のとき
 */
function segment(value: string): string {
  if (value.length === 0) throw new RangeError("道の値が空です。");
  return encodeURIComponent(value);
}

/** 参加者が開く画面の道を作る関数。 */
export const participantPaths = {
  /**
   * 受付（チェックイン）の道。
   * @param eventId 交流会の ID
   * @returns `/e/{eventId}/checkin`
   */
  checkin: (eventId: string): string => `/e/${segment(eventId)}/checkin`,
  /**
   * アンケートの道。
   * @param eventId 交流会の ID
   * @returns `/e/{eventId}/survey`
   */
  survey: (eventId: string): string => `/e/${segment(eventId)}/survey`,
  /**
   * 受付係の招待の道。
   * @param inviteToken 招待の印
   * @returns `/invite/{inviteToken}`
   */
  invite: (inviteToken: string): string => `/invite/${segment(inviteToken)}`,
  /**
   * 組織の招待の道（suite-001。AD-22）。
   * @param joinToken 組織の招待の札
   * @returns `/join/{joinToken}`
   */
  join: (joinToken: string): string => `/join/${segment(joinToken)}`,
};

/**
 * 画面の道を、LINEミニアプリの URL（パーマリンク）にする。QR と招待のリンクには、これを入れる。
 * @param liffId LIFF ID（画面の組み立てに埋めた VITE_LIFF_ID と同じ値）
 * @param path 画面の道（`/` で始める。問い合わせ・`#` を含めてよい。participantPaths で作る）
 * @returns `https://miniapp.line.me/{liffId}{path}`
 * @throws {RangeError} LIFF ID の形が違う・道が `/` で始まらない（`//` で始まる）とき
 */
export function miniAppPermalink(liffId: string, path: string): string {
  if (!LIFF_ID_FORMAT.test(liffId)) throw new RangeError("LIFF ID の形が違います。");
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new RangeError("道は / で始めてください（// は使えません）。");
  }
  return `${MINI_APP_URL_BASE}/${liffId}${path}`;
}
