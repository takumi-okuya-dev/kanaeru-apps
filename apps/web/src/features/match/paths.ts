// 試合表の運営の画面の道（新しいアプリの画面は /<key>/… の下。AD-15・AD-25）。道の文字は、ここ1か所で持つ。
// 試合表の道（/match・/match/…）は、組み立てが LIFF を始めない（AD-4 の例外。core-013）ので、この道の画面は getLiff() と、
// それを読む部品（account の SessionGate など）を使わない。ログインはクッキーのセッションだけで確かめる（MatchGate）。
// 見るだけ（/match/view/…。AD-26）・受付（/match/join/…。AD-30）の道はログインなしで開く参加者の道（match-004）。試合表の ID の道と
// 重ねないよう、ID は /match/tables/ の下。AD-26 は道の形を contracts/core に置くとするが、試合表の領域の中だけで使うので、今は
// ここに置く（research R3【仮決め】）。QR には画面の源＋道（matchPaths.view・join）を入れる。

/** 道の形（TanStack Router の道の ID）。 */
export const MATCH_ROUTE_PATTERNS = {
  /** M0 試合表の一覧 */
  list: "/match",
  /** M0 試合表を作る */
  create: "/match/new",
  /** M1 名簿と設定 */
  roster: "/match/tables/$tableId",
  /** M2・M6 試合表 */
  board: "/match/tables/$tableId/board",
  /** M5・R1 印刷 */
  print: "/match/tables/$tableId/print",
  /** M3 大きく映す（match-003） */
  big: "/match/tables/$tableId/big",
  /** 見るだけのページのリンクと QR（運営。match-004） */
  viewLink: "/match/tables/$tableId/view-link",
  /** M7 QR で受け付ける（運営。match-004） */
  joinAdmin: "/match/tables/$tableId/join",
  /** P1 見るだけのページ（ログインなし。match-004） */
  view: "/match/view/$viewToken",
  /** P2・P3 受付のページ（ログインなし。match-004） */
  join: "/match/join/$joinToken",
} as const;

/** 試合表の中の道の頭（ナビの項目を出すかを決める）。 */
export const MATCH_TABLE_SCOPE = "/match/tables/$tableId";

/**
 * 道の値を、道の一部として使える形にする（空は止める）。
 * @param value 道の値（試合表の ID）
 * @returns 道に入れる文字
 * @throws {RangeError} 値が空のとき
 */
function segment(value: string): string {
  if (value.length === 0) throw new RangeError("道の値が空です。");
  return encodeURIComponent(value);
}

/** 試合表の画面の道を作る関数（値を入れた道）。 */
export const matchPaths = {
  /**
   * 試合表の一覧。
   * @returns 道
   */
  list: () => "/match",
  /**
   * 試合表を作る。
   * @returns 道
   */
  create: () => "/match/new",
  /**
   * 名簿と設定。
   * @param tableId 試合表の ID
   * @returns 道
   */
  roster: (tableId: string) => `/match/tables/${segment(tableId)}`,
  /**
   * 試合表。
   * @param tableId 試合表の ID
   * @returns 道
   */
  board: (tableId: string) => `/match/tables/${segment(tableId)}/board`,
  /**
   * 印刷。
   * @param tableId 試合表の ID
   * @returns 道
   */
  print: (tableId: string) => `/match/tables/${segment(tableId)}/print`,
  /**
   * 大きく映す。
   * @param tableId 試合表の ID
   * @returns 道
   */
  big: (tableId: string) => `/match/tables/${segment(tableId)}/big`,
  /**
   * 見るだけのページのリンクと QR（運営）。
   * @param tableId 試合表の ID
   * @returns 道
   */
  viewLink: (tableId: string) => `/match/tables/${segment(tableId)}/view-link`,
  /**
   * QR で受け付ける（運営）。
   * @param tableId 試合表の ID
   * @returns 道
   */
  joinAdmin: (tableId: string) => `/match/tables/${segment(tableId)}/join`,
  /**
   * 見るだけのページ（ログインなし。QR に入れる）。
   * @param viewToken 見るだけの札
   * @returns 道
   */
  view: (viewToken: string) => `/match/view/${segment(viewToken)}`,
  /**
   * 受付のページ（ログインなし。QR に入れる）。
   * @param joinToken 受付の札
   * @returns 道
   */
  join: (joinToken: string) => `/match/join/${segment(joinToken)}`,
};
