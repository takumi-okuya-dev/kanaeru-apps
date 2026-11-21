// Threads のチームの画面（/threads/teams/{teamId}。threads-016。threads-013 の組織の画面・運用状況を、チームごとの1つの画面にまとめた）。
// - 上のタブ（SectionTabs。threads-018）で「運用アカウント」「担当を決める」（組織の管理者とリーダーだけ）「運用状況」（管理者・リーダー・このチームで担当がある編集者だけ）を切り替える
// - 運用アカウント：名前・持ち主・接続・見せる状態。開き方は API が決める（自分のもの・担当・見せてもらう〈読むだけ〉・開けない）。
//   自分の運用アカウントは、ここから「チームに見せる」を変えられる
// - 担当を決める：チームの編集者と管理者ごとに、そのチームの運用アカウントをチェック（スマホでも横にスクロールしないよう、人ごとのまとまり）
// - 運用状況：数と日付だけ（本文・戦略・設定の中身は API が返さない）。印の付いたものが上（並びは API）
// 送った結果は押したチェックの近く（EXPERIENCE.md）。判定の正は API。
import type {
  ThreadsOrganizationAccount,
  ThreadsTeamStatus,
  ThreadsTeamView,
} from "@workspace/contracts/threads";
import { TEAM_ROLE_LABELS } from "@workspace/contracts/threads";
import { jstDate } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { SessionGate } from "../account/index.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { RoleDiagram } from "./RoleDiagram.tsx";
import { SectionTabs } from "./SectionTabs.tsx";
import type { SectionTab } from "./SectionTabs.tsx";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { setAccountShared, setAssignment } from "./api.ts";
import { THREADS_QUERY_KEYS, useTeamPage, useTeamStatus } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 画面の上の切り替え。 */
type TeamTab = "accounts" | "assignments" | "status";

/** 接続の状態の見せ方。 */
const CONNECTION_LABELS: Record<ThreadsOrganizationAccount["connectionStatus"], string> = {
  connected: "接続しています",
  needs_reconnect: "接続し直しが要る",
  not_connected: "接続していません",
};

/**
 * 運用アカウントの1行の開き方（持ち主・担当・見せてもらう・開けない）。
 * @param props チームの ID（teamId）・運用アカウント（account）
 * @returns 要素
 */
function OpenAction({ teamId, account }: { teamId: string; account: ThreadsOrganizationAccount }) {
  if (account.access === "manage" || account.access === "assigned") {
    return (
      <Link
        to="/threads/accounts/$accountId"
        params={{ accountId: account.id }}
        className={buttonVariants({ size: "small" })}
      >
        {account.access === "manage" ? "開く" : "担当として開く"}
      </Link>
    );
  }
  if (account.access === "shared") {
    return (
      <Link
        to="/threads/teams/$teamId/accounts/$accountId"
        params={{ teamId, accountId: account.id }}
        className={buttonVariants({ size: "small" })}
      >
        読むだけで見る
      </Link>
    );
  }
  return <p className="text-s text-text-sub">持ち主が見せていないので、開けません。</p>;
}

/**
 * チームに入っている運用アカウントの一覧。
 * @param props チームの画面（view）
 * @returns 節の要素
 */
function TeamAccounts({ view }: { view: ThreadsTeamView }) {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<Record<string, Result>>({});

  /**
   * 自分の運用アカウントの「チームに見せる」を切り替える（押すとすぐ保存する）。
   * @param account 運用アカウント
   * @param shared 見せるか
   */
  const toggleShared = async (account: ThreadsOrganizationAccount, shared: boolean) => {
    try {
      await setAccountShared(account.id, shared);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.teamPage(view.id) });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(account.id) });
      setResults((current) => ({
        ...current,
        [account.id]: {
          tone: "success",
          message: shared ? "チームに見せるようにしました。" : "チームに見せないようにしました。",
        },
      }));
    } catch (caught) {
      setResults((current) => ({
        ...current,
        [account.id]: { tone: "danger", message: `変えられませんでした。${errorMessage(caught)}` },
      }));
    }
  };

  return (
    <section aria-labelledby="threads-team-accounts" className="flex flex-col gap-xs">
      <h2 id="threads-team-accounts" className="text-l font-bold">
        運用アカウント
      </h2>
      {view.accounts.length === 0 ? (
        <p className="text-m">
          運用アカウントはまだありません。持ち主が、運用アカウントの設定の「チーム」から入れます。
        </p>
      ) : (
        <ul aria-label={`${view.name}の運用アカウント`} className="flex flex-col gap-xs">
          {view.accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
            >
              <h3 className="text-m font-bold break-words">{account.name}</h3>
              <p className="flex flex-wrap items-center gap-x-xxs text-s text-text-sub">
                <span>持ち主：{account.ownerName || "（名前なし）"}</span>
                {account.ownerIsMe ? <Badge>あなた</Badge> : null}
                <span>・{CONNECTION_LABELS[account.connectionStatus]}</span>
                <span>・{account.shared ? "チームに見せています" : "見せていません"}</span>
              </p>
              {account.ownerIsMe ? (
                <div className="flex flex-col gap-x3s">
                  <label className="flex min-h-l items-center gap-xxs text-m">
                    <input
                      type="checkbox"
                      className="size-s accent-primary"
                      checked={account.shared}
                      onChange={(change) => void toggleShared(account, change.target.checked)}
                    />
                    チームに見せる
                  </label>
                  {results[account.id] ? (
                    <ResponseMessage tone={results[account.id]?.tone ?? "success"}>
                      {results[account.id]?.message}
                    </ResponseMessage>
                  ) : null}
                </div>
              ) : null}
              <div>
                <OpenAction teamId={view.id} account={account} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * チームの担当を決める（組織の管理者と、そのチームのリーダー）。
 * @param props チームの画面（view）
 * @returns 節の要素
 */
function TeamAssignments({ view }: { view: ThreadsTeamView }) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<{ personId: string } & Result>();

  /**
   * 担当を付け外しする（押すとすぐ保存する）。
   * @param personId 担当の人
   * @param personName 担当の人の表示名
   * @param account 運用アカウント
   * @param assigned 付けるか
   */
  const toggle = async (
    personId: string,
    personName: string,
    account: ThreadsOrganizationAccount,
    assigned: boolean,
  ) => {
    try {
      await setAssignment(view.organization.id, {
        threadsAccountId: account.id,
        accountId: personId,
        assigned,
      });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.teamPage(view.id) });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.teamStatus(view.id) });
      setResult({
        personId,
        tone: "success",
        message: `${personName}さんを「${account.name}」の担当${assigned ? "にしました" : "から外しました"}。`,
      });
    } catch (caught) {
      setResult({
        personId,
        tone: "danger",
        message: `変えられませんでした。${errorMessage(caught)}`,
      });
    }
  };

  return (
    <section aria-labelledby="threads-team-assignments" className="flex flex-col gap-xs">
      <h2 id="threads-team-assignments" className="text-l font-bold">
        担当を決める
      </h2>
      <Disclosure summary="担当の人ができること">
        <p className="text-s text-text-sub">
          担当の人は、その運用アカウントの投稿の案と戦略を作れます。承認は、持ち主が任せたときだけです。担当にできるのは、このチームの編集者と管理者です（設定の「組織」で決めます）。
        </p>
      </Disclosure>
      {view.assignments.length === 0 || view.accounts.length === 0 ? (
        <p className="text-m">
          {view.accounts.length === 0
            ? "このチームの運用アカウントがまだありません。"
            : "このチームに編集者がまだいません。"}
        </p>
      ) : (
        <ul aria-label="担当を決める人" className="flex flex-col gap-xs">
          {view.assignments.map((person) => {
            const name = person.displayName || "（名前なし）";
            return (
              <li
                key={person.accountId}
                className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
              >
                <fieldset className="flex flex-col gap-x3s">
                  <legend className="flex flex-wrap items-center gap-x-xxs text-m font-bold">
                    {name}（{TEAM_ROLE_LABELS[person.role]}）
                    {person.isMe ? <Badge>あなた</Badge> : null}
                  </legend>
                  {view.accounts.map((account) =>
                    account.ownerAccountId === person.accountId ? (
                      <p
                        key={account.id}
                        className="flex min-h-l items-center text-m text-text-sub"
                      >
                        {account.name}：自分
                      </p>
                    ) : (
                      <label key={account.id} className="flex min-h-l items-center gap-xxs text-m">
                        <input
                          type="checkbox"
                          className="size-s accent-primary"
                          checked={person.assignedAccountIds.includes(account.id)}
                          onChange={(change) =>
                            void toggle(person.accountId, name, account, change.target.checked)
                          }
                        />
                        {account.name}
                      </label>
                    ),
                  )}
                </fieldset>
                {result?.personId === person.accountId ? (
                  <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

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
 * チームの運用状況（数と日付だけ。スマホでも横にスクロールしないよう、表にせず1行ずつのカードにする）。
 * @param props チームの画面（view）
 * @returns 節の要素
 */
function TeamStatusSection({ view }: { view: ThreadsTeamView }) {
  const query = useTeamStatus(view.id);
  if (query.isPending) return <Loading />;
  if (query.isError) {
    return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  }
  const status = query.data;
  return (
    <section aria-labelledby="threads-team-status" className="flex flex-col gap-s">
      <div className="flex flex-col gap-xxs">
        <h2 id="threads-team-status" className="text-l font-bold">
          運用状況
        </h2>
        <p className="text-s text-text-sub">
          {status.scope === "assigned"
            ? "このチームであなたが担当している運用アカウントと、その持ち主の動きと伸びの数と日付です。本文や戦略は出しません。"
            : "このチームの人と運用アカウントの、動きと伸びの数と日付です。本文や戦略は出しません。"}
        </p>
        <p role="status" className="text-m">
          止まっている人と運用アカウント：{status.stoppedCount}件（7日より長く動いていないもの）
        </p>
      </div>
      <div className="flex flex-col gap-xs">
        <h3 className="text-m font-bold">運用アカウント</h3>
        {status.accounts.length === 0 ? (
          <p className="text-m">このチームの運用アカウントはまだありません。</p>
        ) : (
          <ul aria-label="運用アカウントの運用状況" className="flex flex-col gap-xs">
            {status.accounts.map((account) => (
              <li
                key={account.threadsAccountId}
                className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
              >
                <h4 className="flex flex-wrap items-center gap-x-xxs text-m font-bold">
                  <span className="break-words">{account.name}</span>
                  {account.stopped ? <Badge variant="danger">止まっている</Badge> : null}
                  {account.growth.state === "poor" ? (
                    <Badge variant="danger">伸びていない</Badge>
                  ) : null}
                </h4>
                <p className="text-s text-text-sub">
                  持ち主：{account.ownerName || "（名前なし）"}
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
      </div>
      <div className="flex flex-col gap-xs">
        <h3 className="text-m font-bold">人</h3>
        {status.people.length === 0 ? (
          <p className="text-m">出す人はいません。</p>
        ) : (
          <ul aria-label="人の運用状況" className="flex flex-col gap-xs">
            {status.people.map((person) => (
              <li
                key={person.accountId}
                className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
              >
                <h4 className="flex flex-wrap items-center gap-x-xxs text-m font-bold">
                  <span className="break-words">{person.displayName || "（名前なし）"}</span>
                  <span className="text-s font-normal text-text-sub">
                    （{TEAM_ROLE_LABELS[person.role]}）
                  </span>
                  {person.isMe ? <Badge>あなた</Badge> : null}
                  {person.stopped ? <Badge variant="danger">止まっている</Badge> : null}
                </h4>
                <dl className="flex flex-wrap gap-x-s gap-y-x3s text-m">
                  <Stat label="最後に動いた日" value={dateOf(person.lastActiveAt)} />
                  <Stat label="この7日の動き" value={`${person.activeCount7d}件`} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Threads のチームの画面の中身（ログインのあと）。
 * @param props チームの ID（teamId）
 * @returns 画面の要素
 */
function Team({ teamId }: { teamId: string }) {
  const query = useTeamPage(teamId);
  const [tab, setTab] = useState<TeamTab>("accounts");
  if (query.isPending) return <Loading />;
  if (query.isError) {
    return (
      <LoadFailure
        error={query.error}
        retry={() => void query.refetch()}
        notFoundTitle="このチームは見つかりません"
      />
    );
  }
  const view = query.data;
  const tabs: SectionTab<TeamTab>[] = [
    { id: "accounts", label: "運用アカウント", badge: String(view.accounts.length) },
    ...(view.canAssign ? [{ id: "assignments" as const, label: "担当を決める" }] : []),
    ...(view.canSeeStatus ? [{ id: "status" as const, label: "運用状況" }] : []),
  ];
  const current = tabs.some((row) => row.id === tab) ? tab : "accounts";
  return (
    <ThreadsPage
      title={view.name}
      lead={`組織：${view.organization.name}・あなたの役割：${TEAM_ROLE_LABELS[view.myRole]}${view.leader ? "（このチームのリーダー）" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-xxs">
        {view.leader ? <Badge variant="success">リーダー</Badge> : null}
        <Link
          to="/threads/teams"
          className={buttonVariants({ variant: "secondary", size: "small" })}
        >
          チームの一覧へ
        </Link>
      </div>
      {tabs.length > 1 ? (
        <SectionTabs label="見るもの" tabs={tabs} current={current} onSelect={setTab} />
      ) : null}
      {current === "accounts" ? <TeamAccounts view={view} /> : null}
      {current === "assignments" ? <TeamAssignments view={view} /> : null}
      {current === "status" ? <TeamStatusSection view={view} /> : null}
      <RoleDiagram />
    </ThreadsPage>
  );
}

/**
 * Threads のチームの画面（ログインが要る）。
 * @param props チームの ID（teamId）
 * @param props.teamId チームの ID
 * @returns 画面の要素
 */
export function TeamPage({ teamId }: { teamId: string }) {
  return (
    <SessionGate>
      <Team teamId={teamId} />
    </SessionGate>
  );
}

const teamRouteApi = getRouteApi("/threads/teams/$teamId");

/**
 * Threads のチームの画面の道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function TeamRoute() {
  const { teamId } = teamRouteApi.useParams();
  return <TeamPage teamId={teamId} />;
}
