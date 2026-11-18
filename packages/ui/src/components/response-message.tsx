// 送った結果の文（EXPERIENCE.md 3「送った結果」：押したボタンの近くに出す）。
// できたは role="status"（静かに読み上げる）、誤りは role="alert"（すぐ読み上げる）。状態の色のアイコンとことばで伝える。
// 誤りの文は「何が起きたか・なぜか・どうすればよいか」（EXPERIENCE.md 2）を、呼ぶ側が渡す。
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { StatusIcon } from "./status-icon.tsx";
import type { StatusTone } from "./status-icon.tsx";

/** 状態ごとの文字の色（灰色の地の上でも 4.5:1 以上）。 */
const TEXT_CLASS: Record<StatusTone, string> = {
  success: "text-success-text",
  danger: "text-danger-text",
  info: "text-text",
};

/** 結果の文が受け取るもの。 */
export type ResponseMessageProps = {
  /** 状態（できた・誤り・お知らせ） */
  tone: StatusTone;
  /** 文 */
  children: React.ReactNode;
  /** 追加の class */
  className?: string;
};

/**
 * 送った結果の文（ボタンの近くに置く）。
 * @param props 状態（tone）・文（children）
 * @returns 結果の文の要素
 */
export function ResponseMessage({ tone, children, className }: ResponseMessageProps) {
  return (
    <p
      data-slot="response-message"
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-x3s text-s", TEXT_CLASS[tone], className)}
    >
      <StatusIcon tone={tone} />
      <span>{children}</span>
    </p>
  );
}
