// 申込みページの URL（主催者がコピーして Threads などに貼る。構成の決めごと AD-14・booking-003 research R13）。
// 道は @workspace/contracts/core の participantPaths、ミニアプリの URL は miniAppPermalink で作り、ここで作り直さない。
// LIFF ID（組み立てのときに埋めた __LIFF_ID__）がない手元・E2E だけ、画面の源＋道を入れる（本番は必ずミニアプリの URL）。
import { miniAppPermalink, participantPaths } from "@workspace/contracts/core";

/** 組み立てのときに埋めた LIFF ID（空なら LINE につながない手元・テスト）。 */
const BUILT_LIFF_ID = __LIFF_ID__.trim();

/**
 * 申込みページの URL。
 * @param eventId 交流会の ID
 * @param liffId LIFF ID（既定は組み立てのときに埋めた値）
 * @param origin 画面の源（LIFF ID がないときだけ使う。既定は今の画面の源）
 * @returns ミニアプリの URL（LIFF ID がなければ画面の源＋道）
 */
export function applyPageUrl(
  eventId: string,
  liffId: string = BUILT_LIFF_ID,
  origin: string = window.location.origin,
): string {
  const path = participantPaths.apply(eventId);
  return liffId !== "" ? miniAppPermalink(liffId, path) : `${origin}${path}`;
}
