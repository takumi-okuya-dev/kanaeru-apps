// 試合表の画面の、読みこみ中・未ログイン・権限がない・ない・失敗の画面（EXPERIENCE.md の状態）。
// 試合表の道は LIFF を始めない（core-013）ので、account の SessionGate（getLiff() を読む）を使わず、窓口の 401 で未ログインを知る。
// 未ログインのときは、LIFF を始める道（設定 › アカウント）でログインしてもらう（その道へ移ると、組み立てがページを読み直して
// LIFF を始める。research R4）。
import { isNightStopWindow } from "@workspace/contracts/core";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";

/** ログインする道（LIFF を始める道。ログインしたら試合表に戻ってもらう）。 */
export const MATCH_LOGIN_PATH = "/settings/account";

/** MatchGate が受け取るもの。 */
export type MatchGateProps<T> = {
  /** 問い合わせ（TanStack Query の useQuery の答え） */
  query: { data: T | undefined; error: unknown; isPending: boolean; refetch: () => unknown };
  /** 読めたときに出す中身 */
  children: (data: T) => React.ReactNode;
};

/**
 * 読めたときだけ中身を出す（読みこみ中・未ログイン・権限がない・ない・失敗の画面を出す）。
 * @param props 問い合わせ（query）・中身（children）
 * @returns 中身か、状態の画面
 */
export function MatchGate<T>({ query, children }: MatchGateProps<T>) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  const error = query.error;
  if (error instanceof ApiError && error.status === 401) {
    return (
      <Page
        title="ログインしてください"
        lead="試合表を作って保存するには、LINE でログインします。ログインしたら、アプリの切り替えから試合表に戻ってください。"
      >
        <div>
          <a href={MATCH_LOGIN_PATH} className={buttonVariants({ variant: "primary" })}>
            ログインする
          </a>
        </div>
      </Page>
    );
  }
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    return (
      <Page title={error.status === 403 ? "開けません" : "見つかりません"} lead={error.message}>
        <div>
          <a href="/match" className="text-m text-text-link underline">
            試合表の一覧へ
          </a>
        </div>
      </Page>
    );
  }
  const night =
    error instanceof ApiError && error.code === "DB_UNAVAILABLE" && isNightStopWindow(new Date());
  return (
    <Page
      title={night ? "夜間（0時〜8時）は止まっています" : "読みこめませんでした"}
      lead={errorMessage(error)}
    >
      <div>
        <Button onClick={() => void query.refetch()}>もう一度</Button>
      </div>
    </Page>
  );
}
