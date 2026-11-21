// 投稿の案の画面の上に出す「自動投稿」のまとまり（threads-002）：次の投稿・承認済みの残り・知らせ。
// 知らせは API が読むたびに今の状態から決めたもの（保存しない）。「直前に承認待ちへ戻した」の知らせだけ閉じられる。
import { PUBLISH_ERROR_LABELS } from "@workspace/contracts/threads";
import type { AutoPostNotice, DraftListStatus } from "@workspace/contracts/threads";
import { jstDateTime } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { NotificationBar } from "@workspace/ui/components/notification-bar";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { seeBlockedNotice } from "./api.ts";
import { THREADS_QUERY_KEYS, useAutoPost } from "./queries.ts";

/** AutoPostPanel が受け取るもの。 */
export type AutoPostPanelProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 一覧の状態を切り替える（知らせから、投稿に失敗した案などを見る） */
  onShowStatus: (status: DraftListStatus) => void;
};

/**
 * 設定の画面へのリンク。
 * @param props 運用アカウントの ID（accountId）と文（children）
 * @param props.accountId 運用アカウントの ID
 * @param props.hash 開く区分の見出しの id（設定の # 。threads-019）
 * @param props.children 文
 * @returns リンクの要素
 */
function SettingsLink({
  accountId,
  hash,
  children,
}: {
  accountId: string;
  hash?: string;
  children: string;
}) {
  return (
    <Link
      to="/threads/accounts/$accountId/settings"
      params={{ accountId }}
      hash={hash}
      className="text-text-link underline"
    >
      {children}
    </Link>
  );
}

/**
 * 自動投稿のまとまり。
 * @param props 運用アカウントの ID（accountId）・一覧の状態を切り替える（onShowStatus）
 * @returns 要素（読めないときは何も出さない。一覧の画面の読みこみの誤りは一覧が出す）
 */
export function AutoPostPanel({ accountId, onShowStatus }: AutoPostPanelProps) {
  const queryClient = useQueryClient();
  const query = useAutoPost(accountId);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string>();
  if (!query.data) return null;
  const { autoPost, next, approvedCount, daysLeft, notices } = query.data;

  /** 「直前に承認待ちへ戻した」の知らせを閉じる。 */
  const closeBlocked = async () => {
    if (closing) return;
    setCloseError(undefined);
    setClosing(true);
    try {
      await seeBlockedNotice(accountId);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.autoPost(accountId) });
    } catch (caught) {
      setCloseError(`閉じられませんでした。${errorMessage(caught)}`);
    } finally {
      setClosing(false);
    }
  };

  /**
   * 知らせの1つ。
   * @param notice 知らせ
   * @returns 要素
   */
  const renderNotice = (notice: AutoPostNotice) => {
    switch (notice.kind) {
      case "not_connected":
        return (
          <NotificationBar key={notice.kind} tone="info">
            Threads にまだつないでいません。
            <SettingsLink accountId={accountId} hash="threads-connection">
              設定の「Threads への接続」
            </SettingsLink>
            でつなぎ、自動投稿をオンにすると、承認した案を決めた時刻に投稿します。
          </NotificationBar>
        );
      case "needs_reconnect":
        return (
          <NotificationBar key={notice.kind} tone="danger">
            Threads のトークンが使えなくなったため、自動投稿が止まっています。
            <SettingsLink accountId={accountId} hash="threads-connection">
              設定
            </SettingsLink>
            で新しいトークンを貼って、つなぎ直してください。
          </NotificationBar>
        );
      case "rate_limited":
        return (
          <NotificationBar key={notice.kind} tone="info">
            Threads の投稿の上限に達したため、{jstDateTime(notice.until)}{" "}
            まで自動投稿を止めています。止めている間の案は、そのあとの時刻に投稿します。
          </NotificationBar>
        );
      case "publish_failed":
        return (
          <NotificationBar key={notice.kind} tone="danger">
            <span>
              {notice.count}件の投稿に失敗しました（いちばん新しいもの：
              {PUBLISH_ERROR_LABELS[notice.latestError]}・{jstDateTime(notice.latestAt)}）。
            </span>
            <Button variant="text" size="small" onClick={() => onShowStatus("publish_failed")}>
              投稿に失敗した案を見る
            </Button>
          </NotificationBar>
        );
      case "blocked":
        return (
          <NotificationBar key={notice.kind} tone="danger" onClose={() => void closeBlocked()}>
            {notice.count}件の案を、投稿の直前に承認待ちへ戻しました（
            {notice.latestReason === "ng_word"
              ? `NGワード：${notice.latestWords.join("、")}`
              : "Threads の上限を超えている"}
            ）。直してから承認し直してください。
          </NotificationBar>
        );
      case "no_approved":
        return (
          <NotificationBar key={notice.kind} tone="info">
            承認済みの案がありません。
            {notice.nextSlotAt ? `次の時刻（${jstDateTime(notice.nextSlotAt)}）までに` : ""}
            承認すると、自動で投稿します。
          </NotificationBar>
        );
    }
  };

  return (
    <section aria-labelledby="threads-autopost" className="flex flex-col gap-xxs">
      <h2 id="threads-autopost" className="text-l font-bold">
        自動投稿
      </h2>
      {autoPost.enabled ? (
        <p className="text-m">
          {next
            ? `次の投稿：${jstDateTime(next.at)}「${next.draft.excerpt}${next.draft.excerpt.length >= 40 ? "…" : ""}」`
            : "次の投稿の予定はまだありません。"}
          {` 承認済み ${approvedCount}件`}
          {daysLeft !== null ? `（あと約${daysLeft}日分）` : ""}
        </p>
      ) : (
        <p className="text-m">
          自動投稿はオフです。
          <SettingsLink accountId={accountId} hash="threads-schedule">
            設定の「自動投稿」
          </SettingsLink>
          で時刻を決めてオンにすると、承認した案を投稿します。
        </p>
      )}
      {notices.map(renderNotice)}
      {closeError ? <ResponseMessage tone="danger">{closeError}</ResponseMessage> : null}
    </section>
  );
}
