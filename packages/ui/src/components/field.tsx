// 入力の欄のまとまり（名前・欄・説明・誤り）。shadcn/ui（Base UI の形）の Field を、DESIGN.md の「入力欄」と
// EXPERIENCE.md 3「入力の誤り」に合わせて小さくしたもの。
// 名前（label）と欄を結び、説明と誤りの文を aria-describedby で欄に結ぶ。誤りがあれば欄に aria-invalid をつけ、
// 誤りの文を欄のすぐ下（そば）に出す。欄（Input・Textarea）は useFieldControl で、この結びを受け取る。
import { createContext, useContext, useId } from "react";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** 欄が受け取る結び（id・説明と誤りの id・誤りがあるか）。 */
export type FieldControlProps = {
  /** 欄の id（名前の htmlFor と同じ） */
  id: string;
  /** 説明と誤りの文の id（なければ undefined） */
  "aria-describedby": string | undefined;
  /** 誤りがあれば true */
  "aria-invalid": true | undefined;
  /** 必ず入れる欄なら true */
  "aria-required": true | undefined;
};

const FieldContext = createContext<FieldControlProps | null>(null);

/**
 * まとまりの中の欄が、名前・説明・誤りとの結びを受け取る（まとまりの外では空）。
 * @returns 結び（まとまりの外では undefined）
 */
export function useFieldControl(): FieldControlProps | undefined {
  return useContext(FieldContext) ?? undefined;
}

/** 入力の欄のまとまりが受け取るもの。 */
export type FieldProps = {
  /** 見える名前 */
  label: string;
  /** 欄（Input・Textarea） */
  children: React.ReactNode;
  /** 名前の下に出す説明（任意） */
  description?: React.ReactNode;
  /** 誤りの文（あれば欄の下に出し、欄に aria-invalid をつける） */
  error?: string | undefined;
  /** 必ず入れる欄か（名前の横に「必須」を出す） */
  required?: boolean;
  /** まとまりの追加の class */
  className?: string;
};

/**
 * 入力の欄のまとまり。
 * @param props 名前（label）・欄（children）・説明（description）・誤り（error）・必須（required）
 * @returns まとまりの要素
 */
export function Field({
  label,
  children,
  description,
  error,
  required = false,
  className,
}: FieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");
  const control: FieldControlProps = {
    id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-required": required ? true : undefined,
  };
  return (
    <div data-slot="field" className={cn("flex flex-col gap-x3s", className)}>
      <label htmlFor={id} className="flex items-center gap-xxs text-m font-bold text-text">
        {label}
        {required ? (
          <span className="rounded-sm border border-border-input px-x3s text-xs font-normal text-text-sub">
            必須
          </span>
        ) : null}
      </label>
      {description ? (
        <p id={descriptionId} className="text-s text-text-sub">
          {description}
        </p>
      ) : null}
      <FieldContext.Provider value={control}>{children}</FieldContext.Provider>
      {error ? (
        <p id={errorId} data-slot="field-error" className="text-s text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
