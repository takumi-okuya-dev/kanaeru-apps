// 名簿と設定の手順（① 名簿を入れる → ② 分け方と試合の数を選ぶ → ③ 試合表を作る。match-011）。
// はじめての運営が、次にすることを画面だけで知るための部品（説明の文書やツアーに頼らない）。状態は steps.ts の rosterSteps。
// - 今の手順は、墨の地・「今」の文字・太字で伝え（色だけに頼らない）、読み上げには aria-current="step"。済んだ手順はチェックの印
// - ①②は押すと、その所の見出しへ移ってフォーカスを移す。③は、組んでいなければ「試合表を作る」のボタンへ、組んでいれば試合表の画面へ
import type { MatchTable } from "@workspace/contracts/match";
import { Link } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/cn";
import { ROSTER_STEPS, ROSTER_STEP_LABELS, rosterSteps } from "./steps.ts";
import type { RosterStep } from "./steps.ts";

/** 手順ごとの、移る先の要素の ID（名簿と設定の画面の中）。 */
export const ROSTER_STEP_TARGETS = {
  roster: "match-roster",
  settings: "match-settings",
  build: "match-build",
} as const satisfies Record<RosterStep, string>;

/**
 * 画面の中の要素へ移り、フォーカスを移す。
 * @param id 要素の ID
 */
function moveTo(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView?.({ block: "start", behavior: "smooth" });
  target.focus({ preventScroll: true });
}

/**
 * 手順の印（済みはチェック、まだは番号）。
 * @param props 番号（number）・済みか（done）・今か（current）
 * @param props.number 番号（1から）
 * @param props.done 済みか
 * @param props.current 今か
 * @returns 印の要素
 */
function StepMark({ number, done, current }: { number: number; done: boolean; current: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-m shrink-0 items-center justify-center rounded-full border text-s font-bold",
        current
          ? "border-on-primary bg-surface text-text"
          : done
            ? "border-primary bg-primary text-on-primary"
            : "border-border-input bg-surface text-text-sub",
      )}
    >
      {done ? (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-xs"
        >
          <path d="M5 10.5l3.2 3.2L15 7" />
        </svg>
      ) : (
        number
      )}
    </span>
  );
}

/**
 * 名簿と設定の手順。
 * @param props 試合表（table）
 * @param props.table 試合表
 * @returns 手順の要素
 */
export function RosterSteps({ table }: { table: MatchTable }) {
  const state = rosterSteps(table.content);
  return (
    <nav aria-label="試合表を作る手順">
      <ol className="grid grid-cols-1 gap-xxs wide:grid-cols-3">
        {ROSTER_STEPS.map((step, index) => {
          const current = state.current === step;
          const done = state.done.includes(step);
          const className = cn(
            "flex min-h-xl w-full items-center gap-xxs rounded-md border px-xs py-x3s text-left text-m",
            current
              ? "border-primary bg-primary font-bold text-on-primary"
              : done
                ? "border-border bg-surface text-text"
                : "border-border bg-surface-sunken text-text-sub",
          );
          const body = (
            <>
              <StepMark number={index + 1} done={done} current={current} />
              <span className="flex min-w-0 flex-col">
                <span>
                  <span className="sr-only">{`手順${index + 1}：`}</span>
                  {ROSTER_STEP_LABELS[step]}
                  {current ? <span className="ml-x3s text-xs">（今）</span> : null}
                  {done ? <span className="sr-only">（済み）</span> : null}
                </span>
                {step === "roster" && state.noLevel > 0 ? (
                  <span className={cn("text-xs", current ? "text-on-primary" : "text-danger-text")}>
                    {`レベルを選んでいない人が${state.noLevel}人`}
                  </span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={step}>
              {step === "build" && done ? (
                <Link
                  to="/match/tables/$tableId/board"
                  params={{ tableId: table.id }}
                  className={className}
                >
                  {body}
                  <span className="ml-auto text-s text-text-link underline">試合表を見る</span>
                </Link>
              ) : (
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  onClick={() => moveTo(ROSTER_STEP_TARGETS[step])}
                  className={cn(className, "cursor-pointer")}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
