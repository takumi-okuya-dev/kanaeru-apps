// 知らせの帯（DESIGN.md Components の「知らせの帯」・EXPERIENCE.md 3「送った結果」）。
// 画面が切り替わったあと（消したあとに一覧へ戻るなど）や、ボタンの近くに出せないときだけ、画面の上に出す。
// すぐ消える知らせ（トースト）にしない。閉じるボタンを渡すと「閉じる」を出す。
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";
import { StatusIcon } from "./status-icon.tsx";
import type { StatusTone } from "./status-icon.tsx";

/** 状態ごとの左のふちの色。 */
const BORDER_CLASS: Record<StatusTone, string> = {
  success: "border-l-success",
  danger: "border-l-danger",
  info: "border-l-primary",
};

/** 知らせの帯が受け取るもの。 */
export type NotificationBarProps = {
  /** 状態（できた・誤り・お知らせ） */
  tone: StatusTone;
  /** 文 */
  children: React.ReactNode;
  /** 閉じたとき（渡すと「閉じる」を出す） */
  onClose?: () => void;
  /** 追加の class */
  className?: string;
};

/**
 * 知らせの帯。
 * @param props 状態（tone）・文（children）・閉じたとき（onClose）
 * @returns 知らせの帯の要素
 */
export function NotificationBar({ tone, children, onClose, className }: NotificationBarProps) {
  return (
    <div
      data-slot="notification-bar"
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-xxs rounded-md border border-l-4 border-border bg-surface px-xs py-xxs text-m text-text",
        BORDER_CLASS[tone],
        className,
      )}
    >
      <StatusIcon tone={tone} className="mt-x3s" />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose ? (
        <Button variant="text" size="small" onClick={onClose}>
          閉じる
        </Button>
      ) : null}
    </div>
  );
}
