// 運用状況（/threads/organizations/{organizationId}/status。threads-013。PRD 組織 5.5。めぐるの pages/team-status.tsx）。
// 管理者には組織のすべて、担当が1つ以上ある編集者には担当の運用アカウントとその持ち主の行だけ（範囲は API が決める）。
// 数と日付だけを出す（本文・戦略・設定の中身は API が返さない）。印の付いたものが上（並びは API）。
// スマホでも横にスクロールしないよう、表にせず1行ずつのカードにする（FR-T45）。
import type { ThreadsTeamStatus } from "@workspace/contracts/threads";
import { TEAM_ROLE_LABELS } from "@workspace/contracts/threads";
import { jstDate } from "@workspace/contracts/core";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { SessionGate } from "../account/index.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { useTeamStatus } from "./queries.ts";

/** 接続の状態の見せ方。 */
const CONNECTION_LABELS: Record<ThreadsTeamStatus["accounts"][number]["connectionStatus"], string> =
  {
    connected: "接続しています",
    needs_reconnect: "接続し直しが要る",
    not_connected: "接続していません",
  };

/**
 * 日付の見せ方（なければ「まだありません」）。
 * @param value 日時
 * @returns 文字
 */
function dateOf(value: string | null): string {
  return value ? jstDate(value) : "まだありません";
}

/**
 * 伸びの見せ方。
 * @param growth 伸び
 * @returns 文字
 */
function growthLabel(growth: ThreadsTeamStatus["accounts"][number]["growth"]): string {
  if (growth.state === "insufficient" || growth.ratio === null) return "まだ判定できません";
  return `×${growth.ratio.toFixed(2)}`;
}

/**
 * 1つの数と見出し。
 * @param props 見出し（label）・値（value）
 * @returns 要素
 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-x-xxs">
      <dt className="text-text-sub">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * 運用状況の中身（ログインのあと）。
 * @param props 組織の ID（organizationId）
 * @returns 画面の要素
 */
function TeamStatus({ organizationId }: { organizationId: string }) {
  const query = useTeamStatus(organizationId);
  if (query.isPending) return <Loading />;
  if (query.isError) {
    return (
      <LoadFailure
        error={query.error}
        retry={() => void query.refetch()}
        notFoundTitle="この組織は見つかりません"
      />
    );
  }
  const status = query.data;
  return (
    <ThreadsPage
      title="運用状況"
      lead={
        status.scope === "all"
          ? "組織のすべてのチームの人と運用アカウントの、動きと伸びの数と日付です。本文や戦略は出しません。"
          : status.scope === "team"
            ? "あなたがリーダーのチーム（と担当している運用アカウント）の人と運用アカウントの、動きと伸びの数と日付です。本文や戦略は出しません。"
            : "あなたが担当している運用アカウントと、その持ち主の動きと伸びの数と日付です。本文や戦略は出しません。"
      }
    >
      <div>
        <Link
          to="/threads/organizations/$organizationId"
          params={{ organizationId }}
          className={buttonVariants({ variant: "secondary" })}
        >
          組織に戻る
        </Link>
      </div>
      <p role="status" className="text-m">
        止まっている人と運用アカウント：{status.stoppedCount}件（7日より長く動いていないもの）
      </p>
      <section aria-labelledby="threads-status-accounts" className="flex flex-col gap-xs">
        <h2 id="threads-status-accounts" className="text-l font-bold">
          運用アカウント
        </h2>
        {status.accounts.length === 0 ? (
          <p className="text-m">チームに入っている運用アカウントはまだありません。</p>
        ) : (
          <ul aria-label="運用アカウントの運用状況" className="flex flex-col gap-xs">
            {status.accounts.map((account) => (
              <li
                key={account.threadsAccountId}
                className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
              >
                <h3 className="flex flex-wrap items-center gap-x-xxs text-m font-bold">
                  <span className="break-words">{account.name}</span>
                  {account.stopped ? <Badge variant="danger">止まっている</Badge> : null}
                  {account.growth.state === "poor" ? (
                    <Badge variant="danger">伸びていない</Badge>
                  ) : null}
                </h3>
                <p className="text-s text-text-sub">
                  チーム：{account.teamName}・持ち主：{account.ownerName || "（名前なし）"}
                  {account.ownerIsMe ? "（あなた）" : ""}・
                  {CONNECTION_LABELS[account.connectionStatus]}
                </p>
                <dl className="flex flex-wrap gap-x-s gap-y-x3s text-m">
                  <Stat label="最後に投稿した日" value={dateOf(account.lastPostedAt)} />
                  <Stat label="この7日の投稿" value={`${account.postCount7d}件`} />
                  <Stat label="承認済みの残り" value={`${account.approvedCount}件`} />
                  <Stat label="承認待ち" value={`${account.needsReviewCount}件`} />
                  <Stat label="伸び" value={growthLabel(account.growth)} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="threads-status-people" className="flex flex-col gap-xs">
        <h2 id="threads-status-people" className="text-l font-bold">
          人
        </h2>
        {status.people.length === 0 ? (
          <p className="text-m">出す人はいません。</p>
        ) : (
          <ul aria-label="人の運用状況" className="flex flex-col gap-xs">
            {status.people.map((person) => (
              <li
                key={person.accountId}
                className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
              >
                <h3 className="flex flex-wrap items-center gap-x-xxs text-m font-bold">
                  <span className="break-words">{person.displayName || "（名前なし）"}</span>
                  <span className="text-s font-normal text-text-sub">
                    （{TEAM_ROLE_LABELS[person.role]}）
                  </span>
                  {person.isMe ? <Badge>あなた</Badge> : null}
                  {person.stopped ? <Badge variant="danger">止まっている</Badge> : null}
                </h3>
                <dl className="flex flex-wrap gap-x-s gap-y-x3s text-m">
                  <Stat label="最後に動いた日" value={dateOf(person.lastActiveAt)} />
                  <Stat label="この7日の動き" value={`${person.activeCount7d}件`} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ThreadsPage>
  );
}

/**
 * 運用状況（ログインが要る）。
 * @param props 組織の ID（organizationId）
 * @param props.organizationId 組織の ID
 * @returns 画面の要素
 */
export function TeamStatusPage({ organizationId }: { organizationId: string }) {
  return (
    <SessionGate>
      <TeamStatus organizationId={organizationId} />
    </SessionGate>
  );
}

const statusRouteApi = getRouteApi("/threads/organizations/$organizationId/status");

/**
 * 運用状況の道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function TeamStatusRoute() {
  const { organizationId } = statusRouteApi.useParams();
  return <TeamStatusPage organizationId={organizationId} />;
}
