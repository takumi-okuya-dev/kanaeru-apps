// 設定の画面の「チーム」の節と、カード「このアカウントのチーム」（threads-013・threads-016。PRD 組織 FR-T1〜FR-T3・FR-T22・FR-T30〜FR-T33。
// めぐるの team/TeamSection.tsx・TeamRoster.tsx を、kanaeru の組織とチーム〈suite〉の上に作り直したもの）。
// - 持ち主：入っているチームの1つに入れる・外す（どのチームにも入っていなければ、この節を出さない）・チームに見せる・担当の人ごとに承認を任せる
// - 担当の人：カードだけ（変える操作は出さない）
// - カード：組織とチームの名前 → 管理者 → 持ち主 → 担当の人（承認を任されている人に印）。見ている人に「あなた」
// 送った結果は押したボタン・チェックの近く（EXPERIENCE.md）。判定の正は API。
import type { ThreadsAccountTeam, ThreadsTeamPerson } from "@workspace/contracts/threads";
import { TEAM_ROLE_LABELS } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { LoadFailure } from "./AccountGate.tsx";
import { RoleDiagram } from "./RoleDiagram.tsx";
import { placeAccount, setAccountShared, setDelegation } from "./api.ts";
import { THREADS_QUERY_KEYS, useAccountTeam } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** チームに入れるときの説明（FR-T1・threads-016）。 */
export const PLACEMENT_NOTE =
  "組織の管理者かチームのリーダーが担当を決めると、担当の人がこの運用アカウントの投稿の案と戦略を作れます。承認・設定・接続は、あなただけです。あなたが退会すると、この運用アカウントは組織の管理者に引き継がれます（Threads への接続は切れます）。";

/** 「入れない」の選択肢の値。 */
const NONE = "";

/** カードの立場の名前。 */
const POSITION_LABELS: Record<ThreadsTeamPerson["position"], string> = {
  admin: "管理者",
  owner: "持ち主",
  assignee: "担当",
};

/**
 * チームを選ぶ欄（組織ごとにまとめる。Field の中で使う）。
 * @param props 選択肢（candidates）・値（value）・変えたとき（onChange）
 * @returns 欄の要素
 */
function TeamSelect({
  candidates,
  value,
  onChange,
}: {
  candidates: ThreadsAccountTeam["candidates"];
  value: string;
  onChange: (value: string) => void;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-l`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      <option value={NONE}>チームに入れない（個人の運用）</option>
      {[...new Set(candidates.map((candidate) => candidate.organizationId))].map(
        (organizationId) => {
          const group = candidates.filter(
            (candidate) => candidate.organizationId === organizationId,
          );
          return (
            <optgroup key={organizationId} label={group[0]?.organizationName ?? ""}>
              {group.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </optgroup>
          );
        },
      )}
    </select>
  );
}

/**
 * カード「このアカウントのチーム」（チームに入っていなければ出さない。FR-T30〜FR-T32）。
 * @param props チーム（team）
 * @returns カードの要素
 */
export function TeamRosterCard({ team }: { team: ThreadsAccountTeam }) {
  if (!team.organization) return null;
  return (
    <section
      aria-labelledby="threads-team-roster"
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-s"
    >
      <h3 id="threads-team-roster" className="text-m font-bold">
        このアカウントのチーム
      </h3>
      <p className="text-m break-words">
        組織：{team.organization.name}
        {team.team ? ` › チーム：${team.team.name}` : null}
      </p>
      <ol aria-label="このアカウントのチームの人" className="flex flex-col gap-xxs">
        {team.people.map((person) => (
          <li
            key={`${person.position}-${person.accountId}`}
            className="flex flex-wrap items-center gap-x-xxs gap-y-x3s border-l-2 border-border pl-xs text-m"
          >
            <span className="text-s text-text-sub">{POSITION_LABELS[person.position]}</span>
            <span className="font-bold break-words">{person.displayName || "（名前なし）"}</span>
            <span className="text-s text-text-sub">（{TEAM_ROLE_LABELS[person.role]}）</span>
            {person.delegated ? <Badge variant="success">承認を任されている</Badge> : null}
            {person.isMe ? <Badge>あなた</Badge> : null}
          </li>
        ))}
      </ol>
      <RoleDiagram />
    </section>
  );
}

/**
 * 持ち主の操作（チームに入れる・見せる・承認を任せる）。
 * @param props 運用アカウントの ID（accountId）・チーム（team）
 * @returns 要素
 */
function OwnerControls({ accountId, team }: { accountId: string; team: ThreadsAccountTeam }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(team.team?.id ?? NONE);
  const [placement, setPlacement] = useState<Result>();
  const [shareResult, setShareResult] = useState<Result>();
  const [delegationResult, setDelegationResult] = useState<Result>();
  const [pending, setPending] = useState(false);

  /**
   * 変えたあとのチームを入れ、関わりの問い合わせを読み直す。
   * @param next 変えたあとのチーム
   */
  const apply = async (next: ThreadsAccountTeam) => {
    queryClient.setQueryData(THREADS_QUERY_KEYS.team(accountId), next);
    await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.access(accountId) });
    await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.organizations });
  };

  /** チームに入れる・外す。 */
  const savePlacement = async () => {
    if (pending) return;
    setPending(true);
    setPlacement(undefined);
    try {
      const next = await placeAccount(accountId, selected === NONE ? null : selected);
      await apply(next);
      setPlacement({
        tone: "success",
        message:
          next.organization && next.team
            ? `組織「${next.organization.name}」のチーム「${next.team.name}」に入れました。`
            : "チームから外しました。個人の運用に戻りました。",
      });
    } catch (caught) {
      setPlacement({ tone: "danger", message: `変えられませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  /**
   * チームに見せるを切り替える（押すとすぐ保存する）。
   * @param shared 見せるか
   */
  const toggleShared = async (shared: boolean) => {
    setShareResult(undefined);
    try {
      await apply(await setAccountShared(accountId, shared));
      setShareResult({
        tone: "success",
        message: shared ? "チームに見せるようにしました。" : "チームに見せないようにしました。",
      });
    } catch (caught) {
      setShareResult({ tone: "danger", message: `変えられませんでした。${errorMessage(caught)}` });
    }
  };

  /**
   * 承認を任せるを切り替える（押すとすぐ保存する）。
   * @param person 担当の人
   * @param delegated 任せるか
   */
  const toggleDelegation = async (person: ThreadsTeamPerson, delegated: boolean) => {
    setDelegationResult(undefined);
    try {
      await apply(await setDelegation(accountId, person.accountId, delegated));
      setDelegationResult({
        tone: "success",
        message: `${person.displayName}さんに${delegated ? "承認を任せました" : "承認を任せるのをやめました"}。`,
      });
    } catch (caught) {
      setDelegationResult({
        tone: "danger",
        message: `変えられませんでした。${errorMessage(caught)}`,
      });
    }
  };

  const assignees = team.people.filter((person) => person.position === "assignee");
  const changed = selected !== (team.team?.id ?? NONE);
  return (
    <div className="flex flex-col gap-s">
      <div className="flex flex-col gap-xxs">
        <Field label="入れるチーム" description={PLACEMENT_NOTE}>
          <TeamSelect candidates={team.candidates} value={selected} onChange={setSelected} />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <Button
            disabled={!changed}
            aria-disabled={pending || undefined}
            onClick={() => void savePlacement()}
          >
            {pending ? "変えています…" : "チームを変える"}
          </Button>
          {placement ? (
            <ResponseMessage tone={placement.tone}>{placement.message}</ResponseMessage>
          ) : null}
        </div>
      </div>
      {team.organization ? (
        <div className="flex flex-col gap-x3s">
          <label className="flex min-h-l items-center gap-xxs text-m">
            <input
              type="checkbox"
              className="size-s accent-primary"
              checked={team.shared}
              onChange={(change) => void toggleShared(change.target.checked)}
            />
            チームに見せる（チームの人と組織の管理者が、投稿の案と戦略を読むだけで見られます）
          </label>
          {shareResult ? (
            <ResponseMessage tone={shareResult.tone}>{shareResult.message}</ResponseMessage>
          ) : null}
        </div>
      ) : null}
      {team.organization ? (
        <fieldset className="flex flex-col gap-x3s">
          <legend className="text-m font-bold">承認を任せる</legend>
          <p className="text-s text-text-sub">
            任せられるのは承認・却下（と承認を戻す・承認済みと却下の案を消す）だけです。設定・接続・消すのは、あなただけです。
          </p>
          {assignees.length === 0 ? (
            <p className="text-m">
              担当の人はまだいません。組織の管理者かチームのリーダーが「担当を決める」で決めます。
            </p>
          ) : (
            assignees.map((person) => (
              <label key={person.accountId} className="flex min-h-l items-center gap-xxs text-m">
                <input
                  type="checkbox"
                  className="size-s accent-primary"
                  checked={person.delegated}
                  onChange={(change) => void toggleDelegation(person, change.target.checked)}
                />
                {person.displayName || "（名前なし）"}さんに承認を任せる
              </label>
            ))
          )}
          {delegationResult ? (
            <ResponseMessage tone={delegationResult.tone}>
              {delegationResult.message}
            </ResponseMessage>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}

/**
 * 設定の画面の「チーム」の節（持ち主がどのチームにも入っておらず、チームにも入れていなければ出さない）。
 * @param props 運用アカウントの ID（accountId）・持ち主か（owner）
 * @returns 節の要素
 */
export function TeamSection({ accountId, owner }: { accountId: string; owner: boolean }) {
  const query = useAccountTeam(accountId);
  if (query.isPending) return null;
  if (query.isError) {
    return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  }
  const team = query.data;
  if (!team.organization && (!owner || team.candidates.length === 0)) return null;
  return (
    <section aria-labelledby="threads-team" className="flex flex-col gap-xs">
      <h2 id="threads-team" className="text-l font-bold">
        チーム
      </h2>
      {owner ? <OwnerControls accountId={accountId} team={team} /> : null}
      <TeamRosterCard team={team} />
    </section>
  );
}
