// 試合表の画面どうしで使う部品：組のタブ（試合表・大きく映す・見るだけのページ）と、今の試合の番号。
// タブは role="tablist"（左右の矢印で移る）。中身は呼ぶ側が `${baseId}-panel` の ID で置く。
import type { MatchGroup, MatchGroupPlan } from "@workspace/contracts/match";
import { cn } from "@workspace/ui/lib/cn";
import type * as React from "react";

/**
 * 今の試合の番号（チェックのない最初の試合。0から。みな終わっていれば試合の数）。
 * @param plan 組の試合
 * @returns 今の試合の番号
 */
export function currentGameIndex(plan: MatchGroupPlan | undefined): number {
  if (!plan) return 0;
  const index = plan.games.findIndex((game) => !game.done);
  return index < 0 ? plan.games.length : index;
}

/**
 * 組の今の試合の番号（1から。試合がない・みな終わっていれば null。タブの「第n試合」）。
 * @param plan 組の試合
 * @returns 今の試合の番号
 */
export function currentGameNumber(plan: MatchGroupPlan | undefined): number | null {
  if (!plan || plan.games.length === 0) return null;
  const now = currentGameIndex(plan);
  return now < plan.games.length ? now + 1 : null;
}

/**
 * 組のタブ（role="tablist"。左右の矢印で移る）。
 * @param props 組（groups）・選んだ組（selected）・選んだとき（onSelect）・今の試合（nowOf）・タブと中身の ID の頭（baseId）
 * @param props.groups 組
 * @param props.selected 選んだ組の key
 * @param props.onSelect 選んだとき
 * @param props.nowOf 組ごとの今の試合の番号（1から。終わっていれば null）
 * @param props.baseId タブと中身の ID の頭
 * @param props.size 字の大きさ（大きく映す画面は large）
 * @returns タブの要素
 */
export function GroupTabs({
  groups,
  selected,
  onSelect,
  nowOf,
  baseId,
  size = "normal",
}: {
  groups: readonly MatchGroup[];
  selected: string;
  onSelect: (key: string) => void;
  nowOf: (key: string) => number | null;
  baseId: string;
  size?: "normal" | "large";
}) {
  /**
   * 矢印で隣のタブへ移る。
   * @param keyEvent 押したキー
   * @param index 今のタブの番号
   */
  const move = (keyEvent: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = keyEvent.key === "ArrowRight" ? 1 : keyEvent.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    keyEvent.preventDefault();
    const next = groups[(index + delta + groups.length) % groups.length];
    if (!next) return;
    onSelect(next.key);
    document.getElementById(`${baseId}-tab-${next.key}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="レベル"
      className="flex flex-wrap gap-x3s border-b border-border"
    >
      {groups.map((group, index) => {
        const active = group.key === selected;
        const now = nowOf(group.key);
        return (
          <button
            key={group.key}
            id={`${baseId}-tab-${group.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${baseId}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(group.key)}
            onKeyDown={(keyEvent) => move(keyEvent, index)}
            className={cn(
              "-mb-px flex min-h-xl items-center gap-x3s border-b-2 px-xs",
              size === "large" ? "text-xl" : "text-m",
              active ? "border-primary font-bold" : "border-transparent text-text-sub",
            )}
          >
            {group.label}
            {now ? <span className="text-xs">第{now}試合</span> : null}
          </button>
        );
      })}
    </div>
  );
}
