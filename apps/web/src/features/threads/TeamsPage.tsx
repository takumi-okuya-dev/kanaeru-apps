// 見られるチーム（/threads/teams。threads-016。ナビの「チーム」）。入っているチーム（管理者は組織のすべてのチーム）を組織ごとに並べ、
// チームの画面へ移る。運用状況を見られる人には、止まっている数を要約で出す（threads-020。押すとチームの画面の運用状況が開く）。チームが1つだけで、チームを作る人（管理者）でなければ、一覧を飛ばしてそのチームの画面を開く。
// どこにも入っていなければ、チームで運用できることと、組織とチームを作るフォームを出す（threads-021。組織の管理者なら「チームを足す」も）。
import type { ThreadsTeamList } from "@workspace/contracts/threads";
import { TEAM_ROLE_LABELS } from "@workspace/contracts/threads";
import { Link, Navigate } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { SessionGate } from "../account/index.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { TeamStartForm } from "./TeamStartForm.tsx";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { useTeams } from "./queries.ts";

/** チームで運用するときにできること（どこにも入っていない人への説明）。 */
const TEAM_POINTS = [
  "店舗や担当ごとのチームに、運用アカウントと人を分けます。",
  "スタッフ（編集者）を担当にすると、投稿の案と戦略を作ってもらえます。承認は、持ち主が任せたときだけです。",
  "管理者とチームのリーダーは、チームの運用状況（投稿の数・伸び・最後に動いた日）を見られます。",
] as const;

/**
 * どこにも入っていない・チームがないときの、始め方。
 * @param props チームの一覧（list）
 * @returns 要素
 */
function StartTeam({ list }: { list: ThreadsTeamList }) {
  return (
    <section
      aria-labelledby="threads-team-start"
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-s"
    >
      <h2 id="threads-team-start" className="text-l font-bold">
        チームで運用する
      </h2>
      <ul className="list-disc pl-s text-m">
        {TEAM_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {list.adminOrganizations.length > 0 ? (
        <>
          <p className="text-m">
            組織「{list.adminOrganizations.map((row) => row.name).join("」「")}
            」に、チームを作りましょう。
          </p>
          <TeamStartForm adminOrganizations={list.adminOrganizations} />
        </>
      ) : list.organizationCount > 0 ? (
        <p className="text-m">
          まだどのチームにも入っていません。組織の管理者に、チームへ足してもらってください。
        </p>
      ) : (
        <>
          <p className="text-m">
            ここで組織とチームを作れます。作ったあと、組織の設定の招待のリンクでスタッフを招きます。
          </p>
          <TeamStartForm adminOrganizations={[]} />
        </>
      )}
    </section>
  );
}

/**
 * 見られるチームの中身（ログインのあと）。
 * @returns 画面の要素
 */
function Teams() {
  const query = useTeams();
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
  const list = query.data;
  const [only] = list.teams;
  if (only && list.teams.length === 1 && list.adminOrganizations.length === 0) {
    return <Navigate to="/threads/teams/$teamId" params={{ teamId: only.id }} replace />;
  }
  const organizations = [...new Map(list.teams.map((row) => [row.organizationId, row])).values()];
  return (
    <ThreadsPage title="チーム" lead="チームに入れた運用アカウントを、何人かで運用します">
      {list.teams.length === 0 ? (
        <StartTeam list={list} />
      ) : (
        organizations.map((organization) => {
          const teams = list.teams.filter(
            (row) => row.organizationId === organization.organizationId,
          );
          const headingId = `threads-teams-${organization.organizationId}`;
          return (
            <section
              key={organization.organizationId}
              aria-labelledby={headingId}
              className="flex flex-col gap-xs"
            >
              <h2 id={headingId} className="text-l font-bold break-words">
                {organization.organizationName}
                <span className="ml-xxs text-s font-normal text-text-sub">
                  （あなたの役割：{TEAM_ROLE_LABELS[organization.myRole]}）
                </span>
              </h2>
              <ul
                aria-label={`${organization.organizationName}のチーム`}
                className="flex flex-col gap-xs"
              >
                {teams.map((team) => (
                  <li key={team.id}>
                    <Link
                      to="/threads/teams/$teamId"
                      params={{ teamId: team.id }}
                      className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs hover:bg-surface-over"
                    >
                      <span className="flex flex-wrap items-center gap-xxs text-m font-bold">
                        <span className="break-words">{team.name}</span>
                        {team.leader ? <Badge variant="success">リーダー</Badge> : null}
                        {!team.member ? <Badge>管理者として見る</Badge> : null}
                      </span>
                      <span className="text-s text-text-sub">
                        運用アカウント {team.accountCount}・人 {team.memberCount}
                      </span>
                      {team.stoppedCount === null ? null : team.stoppedCount > 0 ? (
                        <span className="flex flex-wrap items-center gap-xxs text-s">
                          <Badge variant="danger">止まっている {team.stoppedCount}</Badge>
                          運用状況を見る
                        </span>
                      ) : (
                        <span className="text-s">運用状況：止まっていません</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              {organization.myRole === "admin" ? (
                <>
                  <Disclosure summary="チームを足す">
                    <TeamStartForm
                      adminOrganizations={[
                        { id: organization.organizationId, name: organization.organizationName },
                      ]}
                    />
                  </Disclosure>
                  <div>
                    <Link
                      to="/settings/organizations/$organizationId"
                      params={{ organizationId: organization.organizationId }}
                      className={buttonVariants({ variant: "secondary", size: "small" })}
                    >
                      人を招く・チームに分ける
                    </Link>
                  </div>
                </>
              ) : null}
            </section>
          );
        })
      )}
    </ThreadsPage>
  );
}

/**
 * 見られるチーム（ログインが要る）。
 * @returns 画面の要素
 */
export function TeamsPage() {
  return (
    <SessionGate>
      <Teams />
    </SessionGate>
  );
}
