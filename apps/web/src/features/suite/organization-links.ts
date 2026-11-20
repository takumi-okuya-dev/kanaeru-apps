// 組織の招待のリンクと QR の中身（suite-001。AD-14・AD-22）。
// 道は @workspace/contracts/core の participantPaths.join、ミニアプリの URL は miniAppPermalink で作り、ここで作り直さない。
// LIFF ID（組み立てのときに埋めた __LIFF_ID__）がない手元・E2E だけ、画面の源＋道を入れる（本番は必ずミニアプリの URL）。
// event の links.ts と同じ形（suite は event を読めないので写した。2つ目が要るときに lib へ移す候補）。
import { miniAppPermalink, participantPaths } from "@workspace/contracts/core";

/** 組み立てのときに埋めた LIFF ID（空なら LINE につながない手元・テスト）。 */
const BUILT_LIFF_ID = __LIFF_ID__.trim();

/**
 * 組織の招待のリンク（QR にも同じものを入れる）。
 * @param token 招待の札
 * @param liffId LIFF ID（既定は組み立てのときに埋めた値）
 * @param origin 画面の源（LIFF ID がないときだけ使う。既定は今の画面の源）
 * @returns ミニアプリの URL（LIFF ID がなければ画面の源＋道）
 */
export function joinLinkValue(
  token: string,
  liffId: string = BUILT_LIFF_ID,
  origin: string = window.location.origin,
): string {
  const path = participantPaths.join(token);
  return liffId !== "" ? miniAppPermalink(liffId, path) : `${origin}${path}`;
}
