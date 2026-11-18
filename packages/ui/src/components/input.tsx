// shadcn/ui（Base UI の形）の Input を、DESIGN.md の「入力欄」に合わせて直した。
// surface の地・border-input のふち（3:1 以上）・角 sm。誤りは danger のふち（文は Field が欄の下に出す）。
// 文字は 16px（16px 未満だと iPhone が画面を勝手に広げるため）。Field の中では、名前・説明・誤りと結ぶ。
import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { useFieldControl } from "./field.tsx";

/** 入力欄の見た目（Textarea と共に使う）。 */
export const inputClassName = cn(
  "w-full min-w-0 rounded-sm border border-border-input bg-surface px-xxs text-m text-text",
  "placeholder:text-text-sub disabled:cursor-not-allowed disabled:bg-surface-sunken aria-invalid:border-danger",
);

/**
 * 入力欄。
 * @param props input の属性
 * @returns 入力欄の要素
 */
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  const control = useFieldControl();
  return (
    <InputPrimitive
      data-slot="input"
      {...control}
      {...props}
      className={cn(inputClassName, "min-h-l", className)}
    />
  );
}
