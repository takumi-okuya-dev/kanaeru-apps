// 入っている組織（/threads/organizations。threads-013。PRD 組織 FR-T53）。組織ごとに、役割と、組織に入っている運用アカウントの数を出し、
// Threads の組織の画面へ移る。組織を作る・招くのは設定 › 組織（suite）。どこにも入っていなければ、設定 › 組織への入口を出す。
import { TEAM_ROLE_LABELS } from "@workspace/contracts/threads";
import { Link } from "@tanstack/react-router";
import { SessionGate } from "../account/index.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { useTeamOrganizations } from "./queries.ts";

/**
 * 入っている組織の中身（ログインのあと）。
 * @returns 画面の要素
 */
function TeamOrganizations() {
  const query = useTeamOrganizations();
  if (query.isPending) return <Loading />;
  if (query.isError) {
    return (
      <LoadFailure
        error={query.error}
        retry={() => void query.refetch()}
        notFoundTitle="この画面は使えません"
      />
    );
  }
  const { organizations } = query.data;
  return (
    <ThreadsPage
      title="組織"
      lead="組織の中のチームに入れた運用アカウントを、何人かで運用します。組織を作る・人を招く・チームを作るのは、設定の「組織」からです。"
    >
      {organizations.length === 0 ? (
        <p className="text-m">
          まだどの組織にも入っていません。
          <Link to="/settings/organizations" className="text-text-link underline">
            設定の「組織」
          </Link>
          から作るか、招待のリンクを開いてください。
        </p>
      ) : (
        <ul aria-label="入っている組織" className="flex flex-col gap-xs">
          {organizations.map((organization) => (
            <li
              key={organization.id}
              className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
            >
              <h2 className="text-l leading-tight font-bold">
                <Link
                  to="/threads/organizations/$organizationId"
                  params={{ organizationId: organization.id }}
                  className="text-text-link underline"
                >
                  {organization.name}
                </Link>
              </h2>
              <p className="text-m text-text-sub">
                あなたの役割：{TEAM_ROLE_LABELS[organization.myRole]}・運用アカウント{" "}
                {organization.accountCount}件
              </p>
            </li>
          ))}
        </ul>
      )}
    </ThreadsPage>
  );
}

/**
 * 入っている組織（ログインが要る）。
 * @returns 画面の要素
 */
export function TeamOrganizationsPage() {
  return (
    <SessionGate>
      <TeamOrganizations />
    </SessionGate>
  );
}
