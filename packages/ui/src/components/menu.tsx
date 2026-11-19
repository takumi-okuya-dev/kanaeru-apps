// メニュー（ボタンから開く、行き先の並び）。shadcn/ui（Base UI の形）の DropdownMenu を、DESIGN.md の値だけで描いたもの。
// 白の地・角 lg・影 layer3・ふち border。項目は押せる高さ 48px（44px 以上）、指した項目は surface-over の地。
// Base UI が、開いたら最初の項目にフォーカスを置き、矢印で移り、Esc・外を押すと閉じ、閉じたら開いたボタンへフォーカスを戻す。
// 行き先の項目（MenuLinkItem）は a の要素。道の道具のリンク（TanStack Router の Link）は render で渡す。
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** メニューの根（開いているかを持つ。open・onOpenChange で呼ぶ側が持ってもよい）。 */
export const Menu = MenuPrimitive.Root;

/** メニューを開くボタン（aria-expanded・aria-haspopup は Base UI が付ける）。 */
export const MenuTrigger = MenuPrimitive.Trigger;

/** メニューの中身が受け取るもの。 */
export type MenuContentProps = {
  /** 中身（項目・区切り・見出し） */
  children: React.ReactNode;
  /** ボタンのどちら側に出すか（既定は下） */
  side?: "top" | "bottom" | "left" | "right";
  /** ボタンのどこにそろえるか（既定は始め） */
  align?: "start" | "center" | "end";
  /** 中身の追加の class（幅など） */
  className?: string;
};

/**
 * メニューの中身（ボタンのそばに重ねて出す）。
 * @param props 中身（children）・出す側（side）・そろえ方（align）・追加の class
 * @returns 中身の要素
 */
export function MenuContent({
  children,
  side = "bottom",
  align = "start",
  className,
}: MenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} align={align} sideOffset={8} collisionPadding={8}>
        <MenuPrimitive.Popup
          data-slot="menu"
          className={cn(
            "flex max-h-(--available-height) min-w-(--anchor-width) flex-col gap-x3s overflow-y-auto rounded-lg border border-border bg-surface p-xxs text-text shadow-layer3 outline-none",
            className,
          )}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

/** 項目の見た目（指した項目は surface-over の地。今の項目は primary-subtle の地。呼ぶ側が data-current を付ける）。 */
export const menuItemClassName = cn(
  "flex min-h-xl cursor-pointer items-center gap-xs rounded-md px-xs text-m text-text no-underline outline-none select-none",
  "data-highlighted:bg-surface-over data-current:bg-primary-subtle",
);

/**
 * 行き先の項目（a の要素。押すとメニューを閉じる）。
 * @param props Base UI の LinkItem の属性（render で道の道具のリンクを渡す）
 * @returns 項目の要素
 */
export function MenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem
      closeOnClick
      className={cn(menuItemClassName, typeof className === "string" ? className : undefined)}
      {...props}
    />
  );
}

/**
 * 項目の並びのまとまりと、その見出し（読み上げはまとまりの名前になる）。
 * @param props 見出し（label）・中身（children）
 * @returns まとまりの要素
 */
export function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <MenuPrimitive.Group className="flex flex-col gap-x3s">
      <MenuPrimitive.GroupLabel className="px-xxs pt-x3s pb-x3s text-xs text-text-sub">
        {label}
      </MenuPrimitive.GroupLabel>
      {children}
    </MenuPrimitive.Group>
  );
}

/**
 * 項目の区切りの線。
 * @returns 区切りの要素
 */
export function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-x3s h-px bg-border" />;
}
