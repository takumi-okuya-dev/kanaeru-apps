// 戦略の進み（threads-012。めぐるの components/strategy/ProgressCard.tsx・SectionChips.tsx）。
// 十分に書けた項目の数・短めの数・活動の目的の n/5問・進みの棒・「次におすすめ」と、区分へ移るチップ（区分ごとの十分の数）。
// 進みの棒は16の目盛りで描く（見た目の値は tokens.css の名前だけ。幅の値を直に書かない）。
import { STRATEGY_SECTIONS, STRATEGY_TOTAL, strategyFieldOf } from "@workspace/contracts/threads";
import type { StrategyCheck, StrategySectionId } from "@workspace/contracts/threads";
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
 * 閉じている区分（「詳しく」の開け閉め）の中にあれば、外側から開く（threads-017）。
 * @param element 移る先の要素
 */
export function openAncestors(element: HTMLElement): void {
  let details = element.closest("details");
  while (details) {
    details.open = true;
    details = details.parentElement?.closest("details") ?? null;
  }
}

/**
 * 項目へ移り、入力の欄にフォーカスを置く。
 * @param key 項目のキー
 */
export function goToStrategyField(key: string): void {
  const element = document.getElementById(strategyFieldElementId(key));
  if (!element) return;
  openAncestors(element);
  element.scrollIntoView?.({ behavior: "smooth", block: "center" });
  element.querySelector<HTMLElement>("textarea, input")?.focus({ preventScroll: true });
}

/** StrategyProgress が受け取るもの。 */
export type StrategyProgressProps = {
  /** 自動チェック */
  check: StrategyCheck;
  /** 最後に保存した日時（まだなら null） */
  updatedAt: string | null;
};

/**
 * 戦略の進みのカードと、区分へ移るチップ。
 * @param props 自動チェック（check）・最後に保存した日時（updatedAt）
 * @returns 要素
 */
export function StrategyProgress({ check, updatedAt }: StrategyProgressProps) {
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
            onClick={() => goToStrategyField(next.key)}
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
      <nav aria-label="区分へ移る" className="flex flex-wrap gap-xxs">
        {STRATEGY_SECTIONS.map((section) => {
          const counts = check.sections[section.id];
          const complete = counts !== null && counts.done === counts.total;
          const mark =
            counts === null ? "" : complete ? "（済み）" : `（${counts.done}/${counts.total}）`;
          return (
            <Button
              key={section.id}
              size="small"
              variant="secondary"
              onClick={() => {
                const target = document.getElementById(strategySectionElementId(section.id));
                if (!target) return;
                openAncestors(target);
                if (target instanceof HTMLDetailsElement) target.open = true;
                target.scrollIntoView?.({ behavior: "smooth", block: "start" });
              }}
            >
              {`${section.chip}${mark}`}
            </Button>
          );
        })}
      </nav>
    </section>
  );
}
