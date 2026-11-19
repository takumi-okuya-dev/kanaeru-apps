// 選択肢のチップ（DESIGN.md Components の「選択肢のチップ」・EXPERIENCE.md Component Patterns・Accessibility Floor）。
// shadcn/ui と同じ元の Base UI の RadioGroup・Radio を、DESIGN.md の choice-chip の値で描いたもの。
// 1つの設問で1つだけ選ぶ（ラジオのまとまり）。チップそのものが role="radio"（文字が名前）、まとまりは設問の見出しと結ぶ。
// 矢印で移り、押すとすぐ選んだ状態になる。選んだことは、地の色だけでなく、2px の墨のふち・チェックの印・太字で伝える。
// 誤りは設問の下（そば）に出し、まとまりに aria-invalid と aria-describedby を付ける。押せる高さは 48px（44px 以上）。
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useId } from "react";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** 選択肢。 */
export type ChoiceOption<V extends string> = {
  /** 値（英語の短い code） */
  value: V;
  /** 画面の言葉 */
  label: string;
};

/** 選択肢のチップが受け取るもの。 */
export type ChoiceChipsProps<V extends string> = {
  /** 設問の名前（見出し。まとまりの名前になる） */
  label: string;
  /** 選択肢（並びは画面の順） */
  options: readonly ChoiceOption<V>[];
  /** 選んだ値（まだなら null） */
  value: V | null;
  /** 選んだとき */
  onValueChange: (value: V) => void;
  /** 見出しの下の説明（任意） */
  description?: React.ReactNode;
  /** 誤りの文（あれば設問の下に出し、まとまりに aria-invalid を付ける） */
  error?: string | undefined;
  /** 設問の名前を、読み上げだけにするか（表の行のように、名前が見出しや列で分かるとき。既定 false） */
  labelHidden?: boolean;
  /** まとまりの追加の class */
  className?: string;
};

/** チップの見た目（DESIGN.md の choice-chip・choice-chip-selected）。 */
const chipClassName = cn(
  "inline-flex min-h-xl cursor-pointer items-center gap-x3s rounded-sm border border-border-input bg-surface px-xs py-x3s text-left text-m text-text select-none",
  "hover:bg-surface-over",
  "data-checked:border-2 data-checked:border-primary data-checked:bg-primary-subtle data-checked:font-bold",
);

/**
 * チェックの印（選んだときだけ出す。読み上げは選んだかの状態が伝えるので隠す）。
 * @returns 印の要素
 */
function CheckMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-xs shrink-0 text-primary"
    >
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

/**
 * 選択肢のチップ（1つの設問）。
 * @param props 設問の名前（label）・選択肢（options）・選んだ値（value）・選んだとき（onValueChange）・説明・誤り・名前を隠すか
 * @returns 設問のまとまりの要素
 */
export function ChoiceChips<V extends string>({
  label,
  options,
  value,
  onValueChange,
  description,
  error,
  labelHidden = false,
  className,
}: ChoiceChipsProps<V>) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div data-slot="choice-chips" className={cn("flex flex-col gap-x3s", className)}>
      <p id={labelId} className={cn("text-m font-bold text-text", labelHidden && "sr-only")}>
        {label}
      </p>
      {description ? (
        <p id={descriptionId} className="text-s text-text-sub">
          {description}
        </p>
      ) : null}
      <RadioGroup<V | null>
        value={value}
        onValueChange={(next) => {
          if (next !== null) onValueChange(next);
        }}
        aria-labelledby={labelId}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className="flex flex-wrap gap-xxs"
      >
        {options.map((option) => (
          <Radio.Root key={option.value} value={option.value} className={chipClassName}>
            <Radio.Indicator className="inline-flex">
              <CheckMark />
            </Radio.Indicator>
            <span>{option.label}</span>
          </Radio.Root>
        ))}
      </RadioGroup>
      {error ? (
        <p id={errorId} data-slot="field-error" className="text-s text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * まとまりの中で、フォーカスを置くチップ（選んだもの、なければ最初のもの）にフォーカスを移す（誤りの設問へ動くとき）。
 * @param group まとまり（role="radiogroup" の要素）
 */
export function focusChoiceGroup(group: Element): void {
  const target =
    group.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
    group.querySelector<HTMLElement>('[role="radio"]');
  target?.focus();
}
