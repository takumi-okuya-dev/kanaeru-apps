// shadcn/ui（Base UI の形）の Button を、DESIGN.md の「ボタン」に合わせて直した。
// 初期の見た目（影・ring・opacity で薄くする押せない形）は残さない。値は tokens.css の名前だけを使う。
// 文字の大きさ（text-*）は行の高さを上書きするので、leading-* は大きさのあとに書く（tailwind-merge が前のものを消す）。
// 処理中は aria-disabled にして、フォーカスを残したまま押せない形にする（disabled にするとフォーカスが外れる）。
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** ボタンの見た目の組み合わせ（DESIGN.md Components の「ボタン」）。 */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-xxs rounded-sm border text-center font-bold whitespace-nowrap select-none",
    "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken disabled:text-text-disabled",
    "aria-disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        /** 主の操作（1つのまとまりに1つ） */
        primary:
          "border-primary bg-primary text-on-primary hover:not-disabled:border-primary-hover hover:not-disabled:bg-primary-hover",
        /** 二番の操作 */
        secondary: "border-border-input bg-surface text-text hover:not-disabled:bg-surface-over",
        /** 危ない操作（消す・元に戻せない） */
        danger: "border-danger bg-danger text-on-primary hover:not-disabled:shadow-layer1",
        /** 文字だけ（リンクのように見せる操作） */
        text: "border-transparent bg-transparent px-x3s text-text-link underline-offset-2 hover:not-disabled:underline",
      },
      size: {
        /** 標準（高さ 40px） */
        default: "min-h-l px-xs text-m leading-tight",
        /** 小さいもの（高さ 32px） */
        small: "min-h-m px-xxs text-s leading-tight",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

/** ボタンが受け取るもの。 */
export type ButtonProps = Omit<ButtonPrimitive.Props, "className"> &
  VariantProps<typeof buttonVariants> & {
    /** 追加の class */
    className?: string;
  };

/**
 * ボタン。押すと何が起きるかを動詞で書く（「保存」「削除」。EXPERIENCE.md 2）。
 * @param props ボタンの属性と見た目（variant・size）
 * @returns ボタンの要素
 */
export function Button({
  className,
  variant = "secondary",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
