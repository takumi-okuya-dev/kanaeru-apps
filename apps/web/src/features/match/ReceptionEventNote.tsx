// 名簿を入れた受付の交流会の一行（「受付：{名前}（{日付}）から入れた」。運営の画面の一覧と、名簿と設定・試合表の題の下。match-007）。
// - 名前と日付は、入れたときの写し（交流会があとで消えても・見られなくなっても出す）
// - 受付アプリで開けるとき（サーバーが canOpen を返したとき）は、交流会の一覧画面へのリンクを出す。受付アプリの道は LIFF を
//   始める道なので、画面の中の行き来（Link）にせず、ページを読み直すふつうのリンクにする（core-013）
// - 開けないとき（消えた・主催者でも受付係でもない・受付アプリが見えない）は「交流会は見られません」
// - 送っていない入れ直し（中身の写しの交流会が、サーバーが答えた交流会と違う）の間は、名前と日付だけを出す
// - 見るだけのページ・電波なしで渡す QR には出さない（AD-26。この部品は運営の画面だけが使う）
import type { MatchReceptionEventLink, MatchReceptionSource } from "@workspace/contracts/match";
import { jstDate } from "@workspace/contracts/core";
import { adminPaths } from "@workspace/contracts/event";
import { formatPlayDate } from "./format.ts";

/**
 * 「受付：{名前}（{日付}）から入れた」の文。
 * @param source 交流会の名前と始まりの日時
 * @param source.name 名前
 * @param source.startsAt 始まりの日時
 * @returns 文
 */
export function receptionEventText(source: { name: string; startsAt: string }): string {
  return `受付：${source.name}（${formatPlayDate(jstDate(new Date(source.startsAt)))}）から入れた`;
}

/**
 * 交流会を受付アプリで開けるかの見え方を決める。
 * @param source 中身の写し（今の画面の中身。なければ undefined）
 * @param link サーバーが答えた見せ方（端末に置いた古い試合表では undefined のことがある）
 * @returns 開ける・開けない・まだ分からない（送っていない入れ直し）
 */
export function receptionEventAccess(
  source: MatchReceptionSource | undefined,
  link: MatchReceptionEventLink | null | undefined,
): "open" | "unavailable" | "pending" {
  if (!source || !link || link.eventId !== source.eventId) return "pending";
  return link.canOpen ? "open" : "unavailable";
}

/**
 * 名簿を入れた受付の交流会の一行（試合表の題の下）。受付の交流会から入れていなければ何も出さない。
 * @param props 中身の写し（source）・サーバーが答えた見せ方（link）
 * @param props.source 中身の写し
 * @param props.link サーバーが答えた見せ方
 * @returns 要素
 */
export function ReceptionEventNote({
  source,
  link,
}: {
  source: MatchReceptionSource | undefined;
  link: MatchReceptionEventLink | null | undefined;
}) {
  if (!source) return null;
  const access = receptionEventAccess(source, link);
  return (
    <p className="flex flex-wrap items-center gap-x-xxs text-s text-text-sub">
      <span>{receptionEventText(source)}</span>
      {access === "open" ? (
        <a href={adminPaths.eventReception(source.eventId)} className="text-text-link underline">
          受付アプリで交流会を開く
        </a>
      ) : null}
      {access === "unavailable" ? <span>（交流会は見られません）</span> : null}
    </p>
  );
}
