// 札（状態の印。DESIGN.md Components の「札」）。角 sm、状態の色のふちと、ことば。色だけで伝えない（ことばを必ず入れる）。
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** 札の見た目の組み合わせ。 */
export const badgeVariants = cva(
  "inline-flex shrink-0 items-center rounded-sm border bg-surface px-x3s text-xs leading-normal font-bold whitespace-nowrap",
  {
    variants: {
      variant: {
        /** ふつう */
        neutral: "border-border-input text-text",
        /** できた・正しい */
        success: "border-success text-success-text",
        /** 危ない・誤り */
        danger: "border-danger text-danger-text",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

/**
 * 札。
 * @param props span の属性と見た目（variant）
 * @returns 札の要素
 */
export function Badge({
  className,
  variant = "neutral",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
