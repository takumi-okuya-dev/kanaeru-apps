// 予約の管理の画面の道（交流会の中の道。booking-001 research R13）。参加者が外から開く道（AD-14）ではないので core に置かず、
// booking が1か所で持つ。画面はこの形で道を作り（TanStack Router の createRoute の path にそのまま使う）、リンクは bookingPaths で作る。
// zod を読まない。

/** 予約の管理の画面の道の形（TanStack Router の path）。 */
export const BOOKING_ROUTE_PATTERNS = {
  /** A2 名簿（主催者・受付係） */
  roster: "/admin/events/$eventId/roster",
  /** A3 名簿に入れる（貼る・CSV。主催者だけ） */
  rosterImport: "/admin/events/$eventId/roster/import",
  /** S1 名簿に当てる（主催者・受付係） */
  rosterMatch: "/admin/events/$eventId/roster/match",
} as const;

/**
 * 道の値を、道の一部として使える形にする（空は止める）。
 * @param value 道の値（交流会の ID）
 * @returns 道に入れる文字
 * @throws {RangeError} 値が空のとき
 */
function segment(value: string): string {
  if (value.length === 0) throw new RangeError("道の値が空です。");
  return encodeURIComponent(value);
}

/** 予約の管理の画面の道を作る関数（値を入れた道）。 */
export const bookingPaths = {
  /**
   * 名簿。
   * @param eventId 交流会の ID
   * @returns `/admin/events/{eventId}/roster`
   */
  roster: (eventId: string): string => `/admin/events/${segment(eventId)}/roster`,
  /**
   * 名簿に入れる。
   * @param eventId 交流会の ID
   * @returns `/admin/events/{eventId}/roster/import`
   */
  rosterImport: (eventId: string): string => `/admin/events/${segment(eventId)}/roster/import`,
  /**
   * 名簿に当てる。
   * @param eventId 交流会の ID
   * @returns `/admin/events/{eventId}/roster/match`
   */
  rosterMatch: (eventId: string): string => `/admin/events/${segment(eventId)}/roster/match`,
} satisfies Record<keyof typeof BOOKING_ROUTE_PATTERNS, (eventId: string) => string>;
