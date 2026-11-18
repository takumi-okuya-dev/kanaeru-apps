// 重ねる枠（DESIGN.md Components の「ダイアログ」）。shadcn/ui（Base UI の形）の Dialog を、値だけ直したもの。
// surface・角 lg・影 layer3・うしろは scrim。ふだんの操作は画面の中で行い、影響が大きい操作だけに使う（EXPERIENCE.md 3）。
// Base UI が、開いたら中にフォーカスを置き、Tab を枠の中で回し、Esc で閉じ、閉じたら開いた所へフォーカスを戻す。
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** 幕（ダイアログのうしろ）の見た目（ConfirmDialog と共に使う）。 */
export const dialogBackdropClassName = "fixed inset-0 bg-scrim";

/** 枠の見た目（ConfirmDialog と共に使う）。狭い画面では左右に 16px を空ける。 */
export const dialogPopupClassName = cn(
  "fixed inset-x-xs top-1/2 mx-auto flex max-h-full max-w-dialog -translate-y-1/2 flex-col gap-xs overflow-y-auto",
  "rounded-lg bg-surface p-s text-text shadow-layer3",
);

/** 重ねる枠が受け取るもの。 */
export type DialogProps = {
  /** 開いているか（呼ぶ側が持つ） */
  open: boolean;
  /** 開く・閉じるを伝える（Esc・幕を押した・閉じるボタン） */
  onOpenChange: (open: boolean) => void;
  /** 題 */
  title: string;
  /** 題の下の説明（任意） */
  description?: React.ReactNode;
  /** 中身 */
  children?: React.ReactNode;
  /** 下に並べる操作のボタン（任意） */
  footer?: React.ReactNode;
};

/**
 * 重ねる枠。
 * @param props 開いているか（open）・開く閉じるの知らせ（onOpenChange）・題・説明・中身・下の操作（footer）
 * @returns 枠の要素
 */
export function Dialog({ open, onOpenChange, title, description, children, footer }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={dialogBackdropClassName} />
        <DialogPrimitive.Popup data-slot="dialog" className={dialogPopupClassName}>
          <DialogPrimitive.Title className="text-l leading-tight font-bold">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-m text-text">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children}
          {footer ? (
            <div className="flex flex-col-reverse gap-xxs wide:flex-row wide:justify-end">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
