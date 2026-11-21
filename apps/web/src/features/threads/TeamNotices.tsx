// Threads のはじめの画面（運用アカウントの一覧とホーム）に1回だけ出す知らせ（threads-013。PRD 組織 FR-T52・FR-T66）。
// - 担当が付いた：「〇〇（持ち主）さんの △△ の担当になりました」
// - 退会で引き継いだ：「〇〇さんの退会で、△△ を引き継ぎました。Threads に接続し直してください」
// 出したら、見たことを API に知らせる（次からは出さない）。通知の一覧は作らない。
// ここで入っている組織も読む（外枠のナビの「組織」は、この読みこみの結果を使い、ナビのために問い合わせを始めない）。
import type { ThreadsTeamNotices } from "@workspace/contracts/threads";
import { Link } from "@tanstack/react-router";
import { NotificationBar } from "@workspace/ui/components/notification-bar";
import { useEffect, useRef, useState } from "react";
import { seeTeamNotices } from "./api.ts";
import { useTeamNotices } from "./queries.ts";

/**
 * 知らせがあるか。
 * @param notices 知らせ
 * @returns あれば true
 */
export function hasTeamNotices(notices: ThreadsTeamNotices | undefined): boolean {
  return (notices?.assignments.length ?? 0) + (notices?.handovers.length ?? 0) > 0;
}

/**
 * はじめの画面の知らせ（なければ何も出さない）。
 * @returns 要素
 */
export function TeamNotices() {
  const query = useTeamNotices();
  // 一度読んだ知らせは、見たことにしたあとも、この画面にいる間は出しておく
  const [shown, setShown] = useState<ThreadsTeamNotices>();
  const marked = useRef(false);
  const notices = shown ?? query.data;
  useEffect(() => {
    if (marked.current || !hasTeamNotices(query.data)) return;
    marked.current = true;
    setShown(query.data);
    void seeTeamNotices().catch(() => {
      marked.current = false;
    });
  }, [query.data]);
  if (!notices || !hasTeamNotices(notices)) return null;
  return (
    <div className="flex flex-col gap-xxs">
      {notices.handovers.map((notice) => (
        <NotificationBar key={`handover-${notice.threadsAccountId}`} tone="danger">
          {notice.fromName}さんの退会で、「{notice.accountName}」を引き継ぎました。
          <Link
            to="/threads/accounts/$accountId/settings"
            params={{ accountId: notice.threadsAccountId }}
            className="text-text-link underline"
          >
            Threads に接続し直してください
          </Link>
          。
        </NotificationBar>
      ))}
      {notices.assignments.map((notice) => (
        <NotificationBar key={`assignment-${notice.threadsAccountId}`} tone="info">
          組織「{notice.organizationName}」で、{notice.ownerName}さんの「{notice.accountName}
          」の担当になりました。
          <Link
            to="/threads/accounts/$accountId"
            params={{ accountId: notice.threadsAccountId }}
            className="text-text-link underline"
          >
            開く
          </Link>
        </NotificationBar>
      ))}
    </div>
  );
}
