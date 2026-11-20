// Threads の組織の画面（/threads/organizations/{organizationId}。threads-013。PRD 組織 5.1〜5.3。めぐるの pages/team.tsx・team-assign.tsx）。
// - 組織に入っている運用アカウント：名前・持ち主・接続・見せる状態はどの組織の人にも見える。開き方は API が決める
//   （自分のもの・担当・見せてもらう〈読むだけ〉・開けない「見せていません」）。自分の運用アカウントは、ここから「組織に見せる」を変えられる
// - 担当を決める（管理者だけ）：編集者と管理者ごとに、組織に入っている運用アカウントをチェック。持ち主自身の運用アカウントは「自分」と出す
//   （スマホでも横にスクロールしないよう、人ごとのまとまりにする）
// - 運用状況への入口（管理者と、担当が1つ以上ある編集者だけ）
// 送った結果は押したチェックの近く（EXPERIENCE.md）。判定の正は API。
import type {
  ThreadsOrganizationAccount,
  ThreadsOrganizationView,
} from "@workspace/contracts/threads";
import { TEAM_ROLE_LABELS } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { SessionGate } from "../account/index.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { RoleDiagram } from "./RoleDiagram.tsx";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { setAccountShared, setAssignment } from "./api.ts";
import { THREADS_QUERY_KEYS, useTeamOrganization } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 接続の状態の見せ方。 */
const CONNECTION_LABELS: Record<ThreadsOrganizationAccount["connectionStatus"], string> = {
  connected: "接続しています",
  needs_reconnect: "接続し直しが要る",
  not_connected: "接続していません",
};

/**
 * 運用アカウントの1行の開き方（持ち主・担当・見せてもらう・開けない）。
 * @param props 組織の ID（organizationId）・運用アカウント（account）
 * @returns 要素
 */
function OpenAction({
  organizationId,
  account,
}: {
  organizationId: string;
  account: ThreadsOrganizationAccount;
}) {
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
        to="/threads/organizations/$organizationId/accounts/$accountId"
        params={{ organizationId, accountId: account.id }}
        className={buttonVariants({ size: "small" })}
      >
        読むだけで見る
      </Link>
    );
  }
  return <p className="text-s text-text-sub">見せていません</p>;
}

/**
 * 組織に入っている運用アカウントの一覧。
 * @param props 組織の画面（view）
 * @returns 節の要素
 */
function AccountsSection({ view }: { view: ThreadsOrganizationView }) {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<Record<string, Result>>({});

  /**
   * 自分の運用アカウントの「組織に見せる」を切り替える（押すとすぐ保存する）。
   * @param account 運用アカウント
   * @param shared 見せるか
   */
  const toggleShared = async (account: ThreadsOrganizationAccount, shared: boolean) => {
    try {
      await setAccountShared(account.id, shared);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.organization(view.id) });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(account.id) });
      setResults((current) => ({
        ...current,
        [account.id]: {
          tone: "success",
          message: shared ? "組織に見せるようにしました。" : "組織に見せないようにしました。",
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
    <section aria-labelledby="threads-org-accounts" className="flex flex-col gap-xs">
      <h2 id="threads-org-accounts" className="text-l font-bold">
        組織に入っている運用アカウント
      </h2>
      {view.accounts.length === 0 ? (
        <p className="text-m">
          まだありません。持ち主が、運用アカウントの設定の「組織」から入れます。
        </p>
      ) : (
        <ul aria-label="組織に入っている運用アカウント" className="flex flex-col gap-xs">
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
                <span>・{account.shared ? "組織に見せています" : "見せていません"}</span>
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
                    組織に見せる
                  </label>
                  {results[account.id] ? (
                    <ResponseMessage tone={results[account.id]?.tone ?? "success"}>
                      {results[account.id]?.message}
                    </ResponseMessage>
                  ) : null}
                </div>
              ) : null}
              <div>
                <OpenAction organizationId={view.id} account={account} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 担当を決める（管理者だけ）。
 * @param props 組織の画面（view）
 * @returns 節の要素
 */
function AssignmentsSection({ view }: { view: ThreadsOrganizationView }) {
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
      const next = await setAssignment(view.id, {
        threadsAccountId: account.id,
        accountId: personId,
        assigned,
      });
      queryClient.setQueryData(THREADS_QUERY_KEYS.organization(view.id), next);
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
    <section aria-labelledby="threads-org-assignments" className="flex flex-col gap-xs">
      <h2 id="threads-org-assignments" className="text-l font-bold">
        担当を決める
      </h2>
      <p className="text-s text-text-sub">
        担当の人は、その運用アカウントの投稿の案と戦略を作れます。承認は、持ち主が任せたときだけです。編集者にするのは、設定の「組織」からです。
      </p>
      {view.assignments.length === 0 || view.accounts.length === 0 ? (
        <p className="text-m">
          {view.accounts.length === 0
            ? "組織に入っている運用アカウントがまだありません。"
            : "編集者がまだいません。"}
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
 * Threads の組織の画面の中身（ログインのあと）。
 * @param props 組織の ID（organizationId）
 * @returns 画面の要素
 */
function TeamOrganization({ organizationId }: { organizationId: string }) {
  const query = useTeamOrganization(organizationId);
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
  const view = query.data;
  return (
    <ThreadsPage title={view.name} lead={`あなたの役割：${TEAM_ROLE_LABELS[view.myRole]}`}>
      <div className="flex flex-wrap items-center gap-xxs">
        {view.canSeeStatus ? (
          <Link
            to="/threads/organizations/$organizationId/status"
            params={{ organizationId }}
            className={buttonVariants({ variant: "primary" })}
          >
            運用状況を見る
          </Link>
        ) : null}
        <Link to="/threads/organizations" className={buttonVariants({ variant: "secondary" })}>
          組織の一覧へ
        </Link>
      </div>
      <AccountsSection view={view} />
      {view.canAssign ? <AssignmentsSection view={view} /> : null}
      <RoleDiagram />
    </ThreadsPage>
  );
}

/**
 * Threads の組織の画面（ログインが要る）。
 * @param props 組織の ID（organizationId）
 * @param props.organizationId 組織の ID
 * @returns 画面の要素
 */
export function TeamOrganizationPage({ organizationId }: { organizationId: string }) {
  return (
    <SessionGate>
      <TeamOrganization organizationId={organizationId} />
    </SessionGate>
  );
}

const organizationRouteApi = getRouteApi("/threads/organizations/$organizationId");

/**
 * Threads の組織の画面の道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function TeamOrganizationRoute() {
  const { organizationId } = organizationRouteApi.useParams();
  return <TeamOrganizationPage organizationId={organizationId} />;
}
