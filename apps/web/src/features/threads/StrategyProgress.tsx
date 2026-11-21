// 戦略の進み（threads-012。めぐるの components/strategy/ProgressCard.tsx・SectionChips.tsx）。
// 十分に書けた項目の数・短めの数・活動の目的の n/5問・進みの棒・「次におすすめ」。区分のタブ（上に固定。区分ごとの十分の数）は StrategySectionTabs。
// 進みの棒は16の目盛りで描く（見た目の値は tokens.css の名前だけ。幅の値を直に書かない）。
import { STRATEGY_SECTIONS, STRATEGY_TOTAL, strategyFieldOf } from "@workspace/contracts/threads";
import type { StrategyCheck, StrategySectionId } from "@workspace/contracts/threads";
import type * as React from "react";
import { jstDateTime } from "@workspace/contracts/core";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/cn";

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
 * 戦略の進みのカードと、区分へ移るチップ。
 * @param props 自動チェック（check）・最後に保存した日時（updatedAt）
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
      className="flex flex-col gap-xs rounded-sm border border-border bg-surface p-xs"
    >
      <h2 id="threads-strategy-progress" className="text-l font-bold">
        進み
      </h2>
      <dl className="flex flex-wrap gap-x-m gap-y-xxs">
        <div className="flex flex-col">
          <dt className="text-s text-text-sub">十分に書けた項目</dt>
          <dd className="text-xl font-bold tabular-nums">
            {check.done}
            <span className="text-m font-normal text-text-sub">{` / ${STRATEGY_TOTAL}項目`}</span>
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-s text-text-sub">短め（見直すとよい）</dt>
          <dd className="text-xl font-bold tabular-nums">
            {check.review}
            <span className="text-m font-normal text-text-sub">件</span>
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-s text-text-sub">活動の目的</dt>
          <dd className="text-xl font-bold tabular-nums">
            {check.purposeDone}
            <span className="text-m font-normal text-text-sub"> / 5問</span>
          </dd>
        </div>
      </dl>
      <div aria-hidden="true" className="flex gap-x3s">
        {Array.from({ length: STRATEGY_TOTAL }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-xxs flex-1 rounded-full",
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
            onClick={() => onGoToField(next.key)}
          >
            {`次におすすめ：${next.label}`}
          </Button>
        ) : (
          <p className="text-m font-bold">すべての項目が十分に書けています。</p>
        )}
        <p className="text-s text-text-sub">
          {updatedAt ? `最後に保存：${jstDateTime(updatedAt)}` : "まだ保存していません"}
        </p>
      </div>
      {children}
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
 * 狭い画面では、タブの並びだけが横に送れる（画面は横に動かない）。重なりの値は付けない（ダイアログが上に来る。DESIGN.md zIndex）。
 * @param props 自動チェック・今の区分・選ぶ・右の操作
 * @returns 要素
 */
export function StrategySectionTabs({
  check,
  current,
  onSelect,
  actions,
}: StrategySectionTabsProps) {
  return (
    <div className="sticky top-0 -mx-xs flex flex-col gap-x3s border-b border-border bg-background px-xs py-xxs">
      <div className="flex items-center gap-xxs">
        <p className="shrink-0 text-s tabular-nums">{`完了 ${check.done}/${STRATEGY_TOTAL}`}</p>
        <div className="flex-1" />
        {actions}
      </div>
      <nav aria-label="区分" className="flex gap-xxs overflow-x-auto pb-x3s">
        {STRATEGY_SECTIONS.map((section) => {
          const counts = check.sections[section.id];
          const complete = counts !== null && counts.done === counts.total;
          const on = current === section.id;
          return (
            <button
              key={section.id}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onSelect(section.id)}
              className={cn(
                "inline-flex min-h-l shrink-0 items-center gap-x3s rounded-full border px-xs text-s whitespace-nowrap",
                on
                  ? "border-primary bg-primary font-bold text-on-primary"
                  : "border-border-input bg-surface text-text hover:bg-surface-over",
              )}
            >
              {section.chip}
              {counts ? (
                <>
                  {" "}
                  <span className="tabular-nums">
                    {complete ? "✓" : `${counts.done}/${counts.total}`}
                  </span>
                </>
              ) : null}
              {complete ? <span className="sr-only">（済み）</span> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
