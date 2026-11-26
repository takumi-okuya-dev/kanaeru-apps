// 分け方のタブ（レベル別・分けない・ミニゲーム。試合表・大きく映す・見るだけのページ。match-009）。
// 選んだ分け方が2つ以上のときだけ出す。作りは GroupTabs と同じ（role="tablist"・左右の矢印で移る）。中身は呼ぶ側が `${baseId}-panel` の
// ID で置き、レベル別の中で組が2つ以上なら、その中に組のタブ（GroupTabs）を置く。
import { MATCH_SET_LABELS } from "@workspace/contracts/match";
import type { MatchSet } from "@workspace/contracts/match";
import { cn } from "@workspace/ui/lib/cn";
import type * as React from "react";

/**
 * 分け方のタブ（role="tablist"。左右の矢印で移る）。
 * @param props 分け方（sets）・選んだ分け方（selected）・選んだとき（onSelect）・タブと中身の ID の頭（baseId）・字の大きさ（size）
 * @param props.sets 分け方（選んだもの。タブの順）
 * @param props.selected 選んだ分け方
 * @param props.onSelect 選んだとき
 * @param props.baseId タブと中身の ID の頭
 * @param props.size 字の大きさ（大きく映す画面は large）
 * @returns タブの要素
 */
export function SetTabs({
  sets,
  selected,
  onSelect,
  baseId,
  size = "normal",
}: {
  sets: readonly MatchSet[];
  selected: MatchSet;
  onSelect: (set: MatchSet) => void;
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
    const next = sets[(index + delta + sets.length) % sets.length];
    if (!next) return;
    onSelect(next);
    document.getElementById(`${baseId}-set-${next}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="分け方" className="flex flex-wrap gap-x3s">
      {sets.map((set, index) => {
        const active = set === selected;
        return (
          <button
            key={set}
            id={`${baseId}-set-${set}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${baseId}-set-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(set)}
            onKeyDown={(keyEvent) => move(keyEvent, index)}
            className={cn(
              "flex min-h-xl items-center rounded-sm border px-xs",
              size === "large" ? "text-xl" : "text-m",
              active
                ? "border-2 border-primary bg-primary-subtle font-bold"
                : "border-border-input bg-surface text-text-sub",
            )}
          >
            {MATCH_SET_LABELS[set]}
          </button>
        );
      })}
    </div>
  );
}
