// 「詳しく」の開け閉め（core-010。DESIGN.md Typography「文字の量を抑える」）。長い説明・手順・注意・プロンプトを閉じておき、見たい人が開く。
// ブラウザの details と summary をそのまま使う（キーボードで開け閉めでき、読み上げは「折りたたみ・展開」と伝わる。JavaScript がなくても動く）。
// 見出しの文字はリンクの色と下線（押せることを色だけで伝えない）。印は右向きの山形で、開くと下を向く。押せる高さは狭い画面で 48px・広い画面で 40px。
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** 「詳しく」の開け閉めが受け取るもの。 */
export type DisclosureProps = {
  /** 閉じているときも見える文字（「詳しい手順」「プロンプトを見る」など。何が入っているかが分かる名前にする） */
  summary: React.ReactNode;
  /** 開いたときに見える中身 */
  children: React.ReactNode;
  /** 初めから開いておくか（既定は閉じる） */
  defaultOpen?: boolean;
  /** 追加の class（外側の details に付ける） */
  className?: string;
};

/**
 * 山形の印（開くと下を向く）。
 * @returns 印の要素
 */
function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-xs shrink-0 transition-transform group-open:rotate-90"
    >
      <path d="M7 4l6 6-6 6" />
    </svg>
  );
}

/**
 * 「詳しく」の開け閉め。
 * @param props 見出し（summary）・中身（children）・初めから開くか（defaultOpen）
 * @returns 開け閉めの要素
 */
export function Disclosure({ summary, children, defaultOpen = false, className }: DisclosureProps) {
  return (
    <details data-slot="disclosure" className={cn("group", className)} open={defaultOpen}>
      <summary className="inline-flex min-h-xl cursor-pointer list-none items-center gap-x3s text-m text-text-link underline underline-offset-2 wide:min-h-l">
        <Chevron />
        <span>{summary}</span>
      </summary>
      <div className="flex flex-col gap-xxs pt-x3s pb-xxs">{children}</div>
    </details>
  );
}
