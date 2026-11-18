// 状態のアイコン（できた・誤り・お知らせ）。知らせの帯と結果の文が、色とことばと一緒に使う（色だけで伝えない）。
// 線で描いた小さな SVG（アイコンの部品集に頼らない）。読み上げは、隣のことばが伝えるので隠す。
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** 状態の種類。 */
export type StatusTone = "success" | "danger" | "info";

/** 状態ごとの色（アイコン）。 */
const TONE_CLASS: Record<StatusTone, string> = {
  success: "text-success",
  danger: "text-danger",
  info: "text-primary",
};

/**
 * 状態のアイコン。
 * @param props 状態（tone）と追加の class
 * @returns アイコンの要素
 */
export function StatusIcon({ tone, className }: { tone: StatusTone; className?: string }) {
  const paths: Record<StatusTone, React.ReactNode> = {
    success: <path d="M5 10.5l3.2 3.2L15 7" />,
    danger: (
      <>
        <path d="M10 5.5v5.5" />
        <path d="M10 14.2v.3" />
      </>
    ),
    info: (
      <>
        <path d="M10 9v5.5" />
        <path d="M10 5.8v.3" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-xs shrink-0", TONE_CLASS[tone], className)}
    >
      <circle cx="10" cy="10" r="8.25" />
      {paths[tone]}
    </svg>
  );
}
