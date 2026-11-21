// 戦略の進み（threads-012。めぐるの components/strategy/ProgressCard.tsx・SectionChips.tsx）。
// 1行の数（十分・短め・活動の目的）・進みの棒・「次におすすめ」（threads-018 で短くした）。区分のタブ（上に固定。区分ごとの十分の数）は StrategySectionTabs。
// 進みの棒は16の目盛りで描く（見た目の値は tokens.css の名前だけ。幅の値を直に書かない）。
import { STRATEGY_SECTIONS, STRATEGY_TOTAL, strategyFieldOf } from "@workspace/contracts/threads";
import type { StrategyCheck, StrategySectionId } from "@workspace/contracts/threads";
import type * as React from "react";
import { jstDateTime } from "@workspace/contracts/core";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/cn";
import { SectionTabs } from "./SectionTabs.tsx";

/**
 * 区分の要素の id（チップから移る先）。
 * @param id 区分の ID
 * @returns 要素の id
 */
export function strategySectionElementId(id: StrategySectionId): string {
  return `strategy-section-${id}`;
}

/**
 * 項目の要素の id（ほかの画面のリンク〈#field-<key>〉と「次におすすめ」の移る先）。
 * @param key 項目のキー
 * @returns 要素の id
 */
export function strategyFieldElementId(key: string): string {
  return `field-${key}`;
}

/**
 * 項目へ移り、入力の欄にフォーカスを置く。
 * @param key 項目のキー
 */
export function goToStrategyField(key: string): void {
  const element = document.getElementById(strategyFieldElementId(key));
  if (!element) return;
  element.scrollIntoView?.({ behavior: "smooth", block: "center" });
  element.querySelector<HTMLElement>("textarea, input")?.focus({ preventScroll: true });
}

/** StrategyProgress が受け取るもの。 */
export type StrategyProgressProps = {
  /** 自動チェック */
  check: StrategyCheck;
  /** 最後に保存した日時（まだなら null） */
  updatedAt: string | null;
  /** 項目へ移る（その項目の区分を見せてから移る） */
  onGoToField: (key: string) => void;
  /** カードの下に足すもの（全体を AI と見直す） */
  children?: React.ReactNode;
};

/**
 * 戦略の進みのカード（threads-018 で短くした。十分に書けた数は上に固定した区分のタブの「完了 n/16」で見せるので、ここは
 * 短めの数・活動の目的の n/5問・進みの棒・「次におすすめ」・最後に保存した日時だけ）。
 * @param props 自動チェック（check）・最後に保存した日時（updatedAt）・項目へ移る（onGoToField）・下に足すもの（children）
 * @returns 要素
 */
export function StrategyProgress({
  check,
  updatedAt,
  onGoToField,
  children,
}: StrategyProgressProps) {
  const next = check.next ? strategyFieldOf(check.next) : null;
  return (
    <section
      aria-labelledby="threads-strategy-progress"
      className="flex flex-col gap-xxs rounded-sm border border-border bg-surface p-xs"
    >
      <div className="flex flex-wrap items-baseline gap-x-xs gap-y-x3s">
        <h2 id="threads-strategy-progress" className="text-m font-bold">
          進み
        </h2>
        <p className="text-s tabular-nums">
          {`十分 ${check.done}/${STRATEGY_TOTAL}項目・短め ${check.review}件・活動の目的 ${check.purposeDone}/5問`}
        </p>
        <p className="text-s text-text-sub">
          {updatedAt ? `最後に保存：${jstDateTime(updatedAt)}` : "まだ保存していません"}
        </p>
      </div>
      <div aria-hidden="true" className="flex gap-x3s">
        {Array.from({ length: STRATEGY_TOTAL }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-x3s flex-1 rounded-full",
              index < check.done ? "bg-primary" : "bg-surface-sunken",
            )}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-xxs">
        {next ? (
          <Button
            size="small"
            variant="secondary"
            aria-label={`次におすすめ：${next.label}`}
            className="max-w-full justify-start py-x3s text-left whitespace-normal"
            onClick={() => onGoToField(next.key)}
          >
            {`次におすすめ：${next.label}`}
          </Button>
        ) : (
          <p className="text-m font-bold">すべての項目が十分に書けています。</p>
        )}
        {children}
      </div>
    </section>
  );
}

/** StrategySectionTabs が受け取るもの。 */
export type StrategySectionTabsProps = {
  /** 自動チェック */
  check: StrategyCheck;
  /** 今の区分 */
  current: StrategySectionId;
  /** 区分を選ぶ */
  onSelect: (id: StrategySectionId) => void;
  /** 右の操作（保存） */
  actions?: React.ReactNode;
};

/**
 * 区分のタブ（画面の上に固定する。完了の数・区分ごとの「十分」の数・今の区分。めぐるの SectionChips の形。threads-017）。
 * 並びは SectionTabs（狭い画面では並びだけが横に送れ、続きのある端をぼかす。threads-018）。重なりの値は付けない（ダイアログが上に来る。DESIGN.md zIndex）。
 * @param props 自動チェック・今の区分・選ぶ・右の操作
 * @returns 要素
 */
export function StrategySectionTabs({
  check,
  current,
  onSelect,
  actions,
}: StrategySectionTabsProps) {
  const tabs = STRATEGY_SECTIONS.map((section) => {
    const counts = check.sections[section.id];
    const complete = counts !== null && counts.done === counts.total;
    return {
      id: section.id,
      label: section.chip,
      badge: counts ? (complete ? "✓" : `${counts.done}/${counts.total}`) : undefined,
      srSuffix: complete ? "（済み）" : undefined,
    };
  });
  return (
    <div className="sticky top-0 -mx-xs flex flex-col gap-x3s border-b border-border bg-background px-xs py-xxs">
      <div className="flex items-center gap-xxs">
        <p className="shrink-0 text-s tabular-nums">{`完了 ${check.done}/${STRATEGY_TOTAL}`}</p>
        <div className="flex-1" />
        {actions}
      </div>
      <SectionTabs label="区分" tabs={tabs} current={current} onSelect={onSelect} />
    </div>
  );
}
