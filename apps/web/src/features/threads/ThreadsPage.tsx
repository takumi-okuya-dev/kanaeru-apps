// Threads の運用のページ（共通の Page を、めぐると同じ本文の幅で中央に置く）。
// ふつうのページは文と入力が中心なので細く（max-w-content：768px）、表やグラフの広いページ（分析・外部メディアの掲載）は wide で広く（max-w-page）。
// 運用アカウントの画面（AccountGate の中）では、題の上に運用アカウントの切り替えを出す（threads-012）。
import { cn } from "@workspace/ui/lib/cn";
import { Page } from "../../lib/page.tsx";
import type { PageProps } from "../../lib/page.tsx";
import { AccountSwitcher, useCurrentThreadsAccount } from "./AccountSwitcher.tsx";

/** Threads のページが受け取るもの。 */
export type ThreadsPageProps = PageProps & {
  /** 表やグラフの広いページか（既定は細い） */
  wide?: boolean;
};

/**
 * Threads の運用のページ。
 * @param props 共通の Page と同じもの・広いページか（wide）
 * @returns ページの要素
 */
export function ThreadsPage({ wide = false, ...props }: ThreadsPageProps) {
  const account = useCurrentThreadsAccount();
  return (
    <div
      className={cn("mx-auto flex w-full flex-col gap-xs", wide ? "max-w-page" : "max-w-content")}
    >
      {account ? <AccountSwitcher account={account} /> : null}
      <Page {...props} />
    </div>
  );
}
