// 下から出す枠（ボトムシート）。スマホで、選ぶ所の並びを出すときに使う（アプリの切り替えなど）。
// shadcn/ui（Base UI の形）の Sheet（side="bottom"）を、DESIGN.md の値だけで描いたもの。surface・上の角 lg・影 layer3・うしろは scrim。
// Base UI の Dialog が、開いたら中にフォーカスを置き、Tab を枠の中で回し、Esc・幕を押すと閉じ、閉じたら開いた所へフォーカスを戻す。
// 下は端末の安全な余白を空ける。右上に「閉じる」のボタン（読み上げの名前は「閉じる」）。
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { dialogBackdropClassName } from "./dialog.tsx";

/** 下から出す枠が受け取るもの。 */
export type SheetProps = {
  /** 開いているか（呼ぶ側が持つ） */
  open: boolean;
  /** 開く・閉じるを伝える（Esc・幕を押した・閉じるボタン） */
  onOpenChange: (open: boolean) => void;
  /** 題 */
  title: string;
  /** 中身 */
  children?: React.ReactNode;
};

/**
 * 下から出す枠。
 * @param props 開いているか（open）・開く閉じるの知らせ（onOpenChange）・題・中身
 * @returns 枠の要素
 */
export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={dialogBackdropClassName} />
        <DialogPrimitive.Popup
          data-slot="sheet"
          className={cn(
            "fixed inset-x-0 bottom-0 flex max-h-full flex-col gap-xs overflow-y-auto",
            "rounded-t-lg bg-surface px-xs pt-s pb-safe text-text shadow-layer3",
          )}
        >
          <div className="flex items-center justify-between gap-xs">
            <DialogPrimitive.Title className="text-l leading-tight font-bold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="閉じる"
              className="-mr-xxs flex size-xl shrink-0 cursor-pointer items-center justify-center rounded-sm text-text hover:bg-surface-over"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="size-s"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </DialogPrimitive.Close>
          </div>
          <div className="pb-xs">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
