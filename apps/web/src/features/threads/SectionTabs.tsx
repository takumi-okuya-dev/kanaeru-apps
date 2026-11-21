// 区分のタブ（threads-018）：戦略・設定・チームの画面で、1区分ずつ見せるときの丸いタブの並び。押すと onSelect で区分を選び、
// 今の区分は aria-current で伝える。狭い画面では並びだけが横に送れ（画面は横に動かない）、まだ続きがある側の端をぼかして
// 「続きがある」と分かるようにする（ぼかしは飾りなので、押すのを邪魔しない）。見た目の値は tokens.css の名前だけ。
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@workspace/ui/lib/cn";

/** タブの1つ。 */
export type SectionTab<T extends string> = {
  /** 区分の ID */
  id: T;
  /** 名前 */
  label: string;
  /** 名前のうしろに添える小さな文字（「0/5」「✓」など。読み上げでは名前に続けて読む） */
  badge?: string;
  /** 読み上げだけに足す文字（「（済み）」など） */
  srSuffix?: string;
};

/** SectionTabs が受け取るもの。 */
export type SectionTabsProps<T extends string> = {
  /** 並びの名前（読み上げ。nav の名前） */
  label: string;
  /** タブ */
  tabs: readonly SectionTab<T>[];
  /** 今の区分 */
  current: T;
  /** 区分を選ぶ */
  onSelect: (id: T) => void;
};

/**
 * 並びの端に、まだ続きがあるかを調べる。
 * @param element 横に送れる並び
 * @returns 左と右に続きがあるか
 */
function edgesOf(element: HTMLElement): { start: boolean; end: boolean } {
  const max = element.scrollWidth - element.clientWidth;
  return { start: element.scrollLeft > 1, end: element.scrollLeft < max - 1 };
}

/**
 * 区分のタブ。
 * @param props 並びの名前・タブ・今の区分・選ぶ
 * @returns 要素
 */
export function SectionTabs<T extends string>({
  label,
  tabs,
  current,
  onSelect,
}: SectionTabsProps<T>) {
  const navRef = useRef<HTMLElement>(null);
  const [more, setMore] = useState({ start: false, end: false });
  const update = useCallback(() => {
    if (navRef.current) setMore(edgesOf(navRef.current));
  }, []);

  useEffect(() => {
    const element = navRef.current;
    if (!element) return;
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [update, tabs.length]);

  // 今の区分が見えるところまで並びを送る（「次の区分へ」で隠れたタブへ移ったとき）
  useEffect(() => {
    const element = navRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    element?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [current]);

  return (
    <div className="relative">
      <nav
        ref={navRef}
        aria-label={label}
        onScroll={update}
        className="flex gap-xxs overflow-x-auto pb-x3s"
      >
        {tabs.map((tab) => {
          const on = current === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "inline-flex min-h-l shrink-0 items-center gap-x3s rounded-full border px-xs text-s whitespace-nowrap",
                on
                  ? "border-primary bg-primary font-bold text-on-primary"
                  : "border-border-input bg-surface text-text hover:bg-surface-over",
              )}
            >
              {tab.label}
              {tab.badge ? (
                <>
                  {" "}
                  <span className="tabular-nums">{tab.badge}</span>
                </>
              ) : null}
              {tab.srSuffix ? <span className="sr-only">{tab.srSuffix}</span> : null}
            </button>
          );
        })}
      </nav>
      <span
        aria-hidden="true"
        data-edge="start"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-l bg-linear-to-r from-background to-transparent transition-opacity",
          more.start ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        aria-hidden="true"
        data-edge="end"
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-l bg-linear-to-l from-background to-transparent transition-opacity",
          more.end ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
