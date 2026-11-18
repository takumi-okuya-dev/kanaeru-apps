// 複数行の欄（shadcn/ui の Textarea を、DESIGN.md の「入力欄」に合わせて直した）。
// Input と同じ地・ふち・角。縦にだけ広げられる。Enter は改行（送らない）。Field の中では、名前・説明・誤りと結ぶ。
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { useFieldControl } from "./field.tsx";
import { inputClassName } from "./input.tsx";

/**
 * 複数行の欄。
 * @param props textarea の属性
 * @returns 欄の要素
 */
export function Textarea({ className, rows = 6, ...props }: React.ComponentProps<"textarea">) {
  const control = useFieldControl();
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      {...control}
      {...props}
      className={cn(inputClassName, "resize-y py-xxs leading-normal", className)}
    />
  );
}
