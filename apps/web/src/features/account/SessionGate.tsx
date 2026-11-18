// ログインしているときだけ中身を出す（AD-12。EXPERIENCE.md の「未ログイン」「夜間の停止」「失敗」の状態）。
// ほかの領域は、ログインが要る画面の部品を <SessionGate> で包む（ページごと包む。題 h1 はここか中身が出す）。
// - 読みこみ中：読みこみの印
// - 未ログイン：LINE なら「LINEでログインし直す」（LINE の中は開き直し、外のブラウザは LINE のログインへ）、
//   LIFF ID のない手元・テストなら手元のログインへの案内
// - 失敗：夜間の停止は見出しで「夜間（0時〜8時）は止まっています」、ほかは「読みこめませんでした」と「もう一度」
import { Link, useLocation } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { getLiff } from "../../lib/liff.ts";
import { Page } from "../../lib/page.tsx";
import { useSession } from "./session.ts";

/** SessionGate が受け取るもの。 */
export type SessionGateProps = {
  /** ログインしているときに出す中身 */
  children: React.ReactNode;
};

/**
 * 未ログインのときの画面。
 * @returns 画面の要素
 */
function LoginRequired() {
  const liff = getLiff();
  const location = useLocation();
  if (liff.mode === "fake") {
    return (
      <Page
        title="ログインしていません"
        lead="LINE につながない手元とテストでは、手元のログインから入ります。"
      >
        <div>
          <Link
            to="/dev/login"
            search={{ redirect: location.href }}
            className={buttonVariants({ variant: "primary" })}
          >
            手元のログインへ
          </Link>
        </div>
      </Page>
    );
  }
  return (
    <Page
      title="LINEでログインし直してください"
      lead="ログインが切れたか、確かめられませんでした。"
    >
      <div>
        <Button
          variant="primary"
          onClick={() => {
            // LINE の中は開き直せば liff.init() でログインが済む。外のブラウザは LINE のログインへ移り、同じ道に戻る
            if (liff.isInClient()) window.location.reload();
            else liff.login();
          }}
        >
          LINEでログインし直す
        </Button>
      </div>
    </Page>
  );
}

/**
 * ログインしているときだけ中身を出す。
 * @param props 中身（children）
 * @returns 中身か、読みこみ中・未ログイン・失敗の画面
 */
export function SessionGate({ children }: SessionGateProps) {
  const session = useSession();
  if (session.status === "loading") {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (session.status === "unauthenticated") return <LoginRequired />;
  if (session.status === "error") {
    const night = session.error instanceof ApiError && session.error.code === "DB_UNAVAILABLE";
    return night ? (
      <Page title="夜間（0時〜8時）は止まっています" lead="8時からもう一度開いてください。" />
    ) : (
      <Page title="読みこめませんでした" lead={errorMessage(session.error)}>
        <div>
          <Button onClick={session.retry}>もう一度</Button>
        </div>
      </Page>
    );
  }
  return <>{children}</>;
}
