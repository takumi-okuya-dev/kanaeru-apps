// 交流会の管理の画面の道（EXPERIENCE.md の A1〜A5 と困りごと・QR の印刷。research R9）。
// 参加者が外から開く道（AD-14）ではないので core には置かず、交流会の持ち主の event が1か所で持つ。
// event・reception・survey の画面は、この形で道を作り（TanStack Router の createRoute の path にそのまま使う）、
// 行き来のリンクは adminPaths で作る。道を変えるときは、ここだけを直す。zod を読まない。

/** 管理の画面の道の形（TanStack Router の path）。 */
export const ADMIN_ROUTE_PATTERNS = {
  /** A1 交流会の一覧（event） */
  eventList: "/admin/events",
  /** A2 交流会の作成（event） */
  eventNew: "/admin/events/new",
  /** A2 交流会の編集（event） */
  eventEdit: "/admin/events/$eventId/edit",
  /** A4 準備（event） */
  eventSetup: "/admin/events/$eventId/setup",
  /** QR の印刷（event。$kind は checkin・survey） */
  eventQrPrint: "/admin/events/$eventId/setup/qr/$kind",
  /** A3 一覧画面の参加者・合計（reception） */
  eventReception: "/admin/events/$eventId",
  /** A3 一覧画面の困りごと（survey。主催者だけ） */
  eventConcerns: "/admin/events/$eventId/concerns",
  /** A5 書き出しと削除（reception。困りごとの CSV は survey が節を足す。主催者だけ） */
  eventData: "/admin/events/$eventId/data",
} as const;

/** QR の種類（受付QR・アンケートQR）。 */
export const QR_KINDS = ["checkin", "survey"] as const;

/** QR の種類の型。 */
export type QrKind = (typeof QR_KINDS)[number];

/**
 * 道の値を、道の一部として使える形にする（空は止める）。
 * @param value 道の値（交流会の ID など）
 * @returns 道に入れる文字
 * @throws {RangeError} 値が空のとき
 */
function segment(value: string): string {
  if (value.length === 0) throw new RangeError("道の値が空です。");
  return encodeURIComponent(value);
}

/** 管理の画面の道を作る関数（値を入れた道）。 */
export const adminPaths = {
  /**
   * 交流会の一覧。
   * @returns `/admin/events`
   */
  eventList: (): string => ADMIN_ROUTE_PATTERNS.eventList,
  /**
   * 交流会の作成。
   * @returns `/admin/events/new`
   */
  eventNew: (): string => ADMIN_ROUTE_PATTERNS.eventNew,
  /**
   * 交流会の編集。
   * @param eventId 交流会の ID
   * @returns `/admin/events/{eventId}/edit`
   */
  eventEdit: (eventId: string): string => `/admin/events/${segment(eventId)}/edit`,
  /**
   * 準備。
   * @param eventId 交流会の ID
   * @returns `/admin/events/{eventId}/setup`
   */
  eventSetup: (eventId: string): string => `/admin/events/${segment(eventId)}/setup`,
  /**
   * QR の印刷。
   * @param eventId 交流会の ID
   * @param kind QR の種類
   * @returns `/admin/events/{eventId}/setup/qr/{kind}`
   */
  eventQrPrint: (eventId: string, kind: QrKind): string =>
    `/admin/events/${segment(eventId)}/setup/qr/${kind}`,
  /**
   * 一覧画面の参加者・合計。
   * @param eventId 交流会の ID
   * @returns `/admin/events/{eventId}`
   */
  eventReception: (eventId: string): string => `/admin/events/${segment(eventId)}`,
  /**
   * 一覧画面の困りごと。
   * @param eventId 交流会の ID
   * @returns `/admin/events/{eventId}/concerns`
   */
  eventConcerns: (eventId: string): string => `/admin/events/${segment(eventId)}/concerns`,
  /**
   * 書き出しと削除。
   * @param eventId 交流会の ID
   * @returns `/admin/events/{eventId}/data`
   */
  eventData: (eventId: string): string => `/admin/events/${segment(eventId)}/data`,
} satisfies Record<keyof typeof ADMIN_ROUTE_PATTERNS, (...args: never[]) => string>;
