// QR と招待のリンクの中身（構成の決めごと AD-14。research R8）。
// 参加者の道は @workspace/contracts/core の participantPaths、ミニアプリの URL は miniAppPermalink で作り、ここで作り直さない。
// LIFF ID（組み立てのときに埋めた __LIFF_ID__）がない手元・E2E だけ、画面の源＋道を入れる（本番は必ずミニアプリの URL）。
import { miniAppPermalink, participantPaths } from "@workspace/contracts/core";
import type { QrKind } from "@workspace/contracts/event";

/** 組み立てのときに埋めた LIFF ID（空なら LINE につながない手元・テスト）。 */
const BUILT_LIFF_ID = __LIFF_ID__.trim();

/**
 * ミニアプリの URL を使えるか（LIFF ID があるか）。
 * @param liffId LIFF ID（既定は組み立てのときに埋めた値）
 * @returns 使えるなら true
 */
export function usesMiniAppUrl(liffId: string = BUILT_LIFF_ID): boolean {
  return liffId !== "";
}

/**
 * 参加者が外から開く URL（QR と招待のリンクに入れる）。
 * @param path 参加者の道（participantPaths で作ったもの）
 * @param liffId LIFF ID（既定は組み立てのときに埋めた値）
 * @param origin 画面の源（LIFF ID がないときだけ使う。既定は今の画面の源）
 * @returns ミニアプリの URL（LIFF ID がなければ画面の源＋道）
 */
export function participantUrl(
  path: string,
  liffId: string = BUILT_LIFF_ID,
  origin: string = window.location.origin,
): string {
  return usesMiniAppUrl(liffId) ? miniAppPermalink(liffId, path) : `${origin}${path}`;
}

/**
 * 受付QRの中身。
 * @param eventId 交流会の ID
 * @param liffId LIFF ID（既定は組み立てのときに埋めた値）
 * @returns チェックインの画面の URL
 */
export function checkinQrValue(eventId: string, liffId: string = BUILT_LIFF_ID): string {
  return participantUrl(participantPaths.checkin(eventId), liffId);
}

/**
 * アンケートQRの中身。
 * @param eventId 交流会の ID
 * @param liffId LIFF ID（既定は組み立てのときに埋めた値）
 * @returns アンケートの画面の URL
 */
export function surveyQrValue(eventId: string, liffId: string = BUILT_LIFF_ID): string {
  return participantUrl(participantPaths.survey(eventId), liffId);
}

/**
 * 招待のリンク。
 * @param token 招待の印
 * @param liffId LIFF ID（既定は組み立てのときに埋めた値）
 * @returns 受付係の招待の画面の URL
 */
export function inviteLinkValue(token: string, liffId: string = BUILT_LIFF_ID): string {
  return participantUrl(participantPaths.invite(token), liffId);
}

/** QR の種類ごとの見出し。 */
export const QR_TITLES = {
  checkin: "受付QR",
  survey: "アンケートQR",
} as const satisfies Record<QrKind, string>;

/** QR の種類ごとの説明。 */
export const QR_DESCRIPTIONS = {
  checkin: "読むと、この交流会のチェックインの画面が開きます。",
  survey: "読むと、この交流会のアンケートの画面が開きます。",
} as const satisfies Record<QrKind, string>;

/**
 * QR の中身。
 * @param kind QR の種類
 * @param eventId 交流会の ID
 * @returns QR に入れる URL
 */
export function qrValue(kind: QrKind, eventId: string): string {
  return kind === "checkin" ? checkinQrValue(eventId) : surveyQrValue(eventId);
}
