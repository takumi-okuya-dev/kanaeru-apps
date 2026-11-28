// 本の表紙（research R10・AD-33）。書影は openBD にあるときだけ、配信元から出す（写しを持たない）。
// 書影がない・読めないときは、書名の頭の文字で仮の表紙を描く（画像を作らない。tokens.css の値だけ。墨の地は使わない）。
import { useState } from "react";

/** Cover が受け取るもの。 */
export type CoverProps = {
  /** 書名 */
  title: string;
  /** 書影の URL（なければ null） */
  coverUrl: string | null;
};

/**
 * 本の表紙（幅 48px・高さ 64px）。
 * @param props 書名（title）・書影の URL（coverUrl）
 * @returns 表紙の要素（読み上げでは飛ばす。書名は横に文字で出す）
 */
export function Cover({ title, coverUrl }: CoverProps) {
  const [broken, setBroken] = useState(false);
  if (coverUrl && !broken) {
    return (
      <img
        src={coverUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-x3l w-xl shrink-0 rounded-sm border border-border object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      data-testid="placeholder-cover"
      className="flex h-x3l w-xl shrink-0 items-end overflow-hidden rounded-sm border border-border bg-surface-sunken p-x3s text-xs leading-tight font-bold break-all text-text-sub"
    >
      {[...title].slice(0, 6).join("")}
    </div>
  );
}
