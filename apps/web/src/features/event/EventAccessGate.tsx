// 交流会の管理の画面の入口の確かめ（AD-5・EXPERIENCE の「権限なし（403）」「交流会が見つからない」「夜間の停止」）。
// 交流会を読み（useEvent。自分の役目つき）、役目が合うときだけ中身を出す。reception・survey の管理の画面も使う。
// ログインの確かめは account の SessionGate（このまわりを包む）。
import { isNightStopWindow } from "@workspace/contracts/core";
import type { EventRole, EventView } from "@workspace/contracts/event";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { useEvent } from "./queries.ts";

/**
 * 交流会の一覧へのリンク。
 * @returns リンクの要素
 */
export function BackToEventList() {
  return (
    <p className="text-m">
      <Link to="/admin/events" className="text-text-link underline">
        交流会の一覧へ
      </Link>
    </p>
  );
}

/**
 * 主催者だけの画面を、主催者でない人が開いたとき。
 * @returns 画面の要素
 */
export function OrganizerOnlyPage() {
  return (
    <Page
      title="この画面は主催者だけが使えます"
      lead="交流会の一覧から、使える画面を開いてください。"
    >
      <BackToEventList />
    </Page>
  );
}

/**
 * 読みこみ中の印。
 * @returns 要素
 */
export function Loading() {
  return (
    <p aria-busy="true" className="text-m text-text-sub">
      読みこんでいます…
    </p>
  );
}

/** LoadFailure が受け取るもの。 */
type LoadFailureProps = {
  /** 投げられたもの */
  error: unknown;
  /** もう一度読む */
  retry: () => void;
};

/**
 * 交流会を読めなかったとき（403・404・夜間の停止・ほかの失敗）。
 * @param props 投げられたもの（error）・もう一度（retry）
 * @returns 画面の要素
 */
export function EventLoadFailure({ error, retry }: LoadFailureProps) {
  if (error instanceof ApiError && error.status === 403) {
    return (
      <Page title="この交流会の一覧画面は使えません" lead="主催者に確かめてください。">
        <BackToEventList />
      </Page>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <Page title="この交流会は見つかりません" lead="URL が違うか、消された可能性があります。">
        <BackToEventList />
      </Page>
    );
  }
  // 夜間の見出しは、日本時間 0時〜8時の DB に届かない 503 だけ。昼の 503 は下の「読みこめませんでした」と API の文
  if (error instanceof ApiError && error.code === "DB_UNAVAILABLE" && isNightStopWindow()) {
    return <Page title="夜間（0時〜8時）は止まっています" lead="8時からもう一度開いてください。" />;
  }
  return (
    <Page title="読みこめませんでした" lead={errorMessage(error)}>
      <div>
        <Button onClick={retry}>もう一度</Button>
      </div>
    </Page>
  );
}

/** EventAccessGate が受け取るもの。 */
export type EventAccessGateProps = {
  /** 交流会の ID */
  eventId: string;
  /** 中身を出す役目（主催者だけの画面は ["organizer"]） */
  roles: readonly EventRole[];
  /** 中身（読んだ交流会を受け取る） */
  children: (event: EventView) => React.ReactNode;
};

/**
 * 交流会を読み、役目が合うときだけ中身を出す。
 * @param props 交流会の ID（eventId）・役目（roles）・中身（children）
 * @returns 中身か、読みこみ中・使えない・見つからない・失敗の画面
 */
export function EventAccessGate({ eventId, roles, children }: EventAccessGateProps) {
  const query = useEvent(eventId);
  if (query.isPending) return <Loading />;
  if (query.isError) {
    return <EventLoadFailure error={query.error} retry={() => void query.refetch()} />;
  }
  if (!roles.includes(query.data.myRole)) return <OrganizerOnlyPage />;
  return <>{children(query.data)}</>;
}
