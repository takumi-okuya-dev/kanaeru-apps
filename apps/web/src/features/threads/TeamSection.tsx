// 設定の画面の「チーム」の節と、カード「このアカウントのチーム」（threads-013・threads-016。PRD 組織 FR-T1〜FR-T3・FR-T22・FR-T30〜FR-T33。
// めぐるの team/TeamSection.tsx・TeamRoster.tsx を、kanaeru の組織とチーム〈suite〉の上に作り直したもの）。
// - 持ち主：入っているチームの1つに入れる・外す（どのチームにも入っていなければ、この節を出さない）・チームに見せる・担当の人ごとに承認を任せる。
//   入れたあとは1枚のカード（チーム名と「チームを変える」・人の行の横に「承認を任せる」・チームに見せる）にまとめる（threads-020）
// - 担当の人：カードだけ（変える操作は出さない）
// - カード：組織とチームの名前 → 管理者 → 持ち主 → 担当の人（承認を任されている人に印）。見ている人に「あなた」
// 送った結果は押したボタン・チェックの近く（EXPERIENCE.md）。判定の正は API。
import type { ThreadsAccountTeam, ThreadsTeamPerson } from "@workspace/contracts/threads";
import { TEAM_ROLE_LABELS } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Dialog } from "@workspace/ui/components/dialog";
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

/** 承認を任せるときの説明。 */
const DELEGATION_NOTE =
  "任せられるのは承認・却下（と承認を戻す・承認済みと却下の案を消す）だけです。設定・接続・消すのは、あなただけです。担当の人は、組織の管理者かチームのリーダーがチームの画面の「担当を決める」で決めます。";

/**
 * 持ち主の操作（threads-020 で1枚のカードにまとめた）。
 * - チームに入っていなければ：入れるチームを選んで「チームに入れる」
 * - 入っていれば：カードに チーム名（組織）と「チームを変える」（枠で選ぶ）・人の行（担当の行の横に「承認を任せる」）・チームに見せる
 * @param props 運用アカウントの ID（accountId）・チーム（team）
 * @returns 要素
 */
function OwnerControls({ accountId, team }: { accountId: string; team: ThreadsAccountTeam }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(team.team?.id ?? NONE);
  const [changing, setChanging] = useState(false);
  const [placement, setPlacement] = useState<Result>();
  const [dialogError, setDialogError] = useState<string>();
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
    await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.teams });
    // 切り替えとホームのチームの印（threads-021）
    await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.accounts });
  };

  /**
   * チームに入れる・変える・外す。
   * @returns 変えられたか
   */
  const savePlacement = async (): Promise<boolean> => {
    if (pending) return false;
    setPending(true);
    setPlacement(undefined);
    setDialogError(undefined);
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
      return true;
    } catch (caught) {
      const message = `変えられませんでした。${errorMessage(caught)}`;
      if (changing) setDialogError(message);
      else setPlacement({ tone: "danger", message });
      return false;
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

  const changed = selected !== (team.team?.id ?? NONE);
  const placementMessage = placement ? (
    <ResponseMessage tone={placement.tone}>{placement.message}</ResponseMessage>
  ) : null;

  // まだどのチームにも入れていない：選んで入れる
  if (!team.organization || !team.team) {
    return (
      <div className="flex flex-col gap-xxs">
        <Field label="入れるチーム">
          <TeamSelect candidates={team.candidates} value={selected} onChange={setSelected} />
        </Field>
        <Disclosure summary="チームに入れると">
          <p className="text-s text-text-sub">{PLACEMENT_NOTE}</p>
        </Disclosure>
        <div className="flex flex-col items-start gap-xxs">
          <ButtonRow>
            <Button
              disabled={!changed}
              aria-disabled={pending || undefined}
              onClick={() => void savePlacement()}
            >
              {pending ? "入れています…" : "チームに入れる"}
            </Button>
          </ButtonRow>
          {placementMessage}
        </div>
      </div>
    );
  }

  const assignees = team.people.filter((person) => person.position === "assignee");
  return (
    <section
      aria-labelledby="threads-team-roster"
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-s"
    >
      <div className="flex flex-wrap items-start justify-between gap-xxs">
        <div className="flex flex-col">
          <h3 id="threads-team-roster" className="text-s text-text-sub">
            このアカウントのチーム
          </h3>
          <p className="text-l font-bold break-words">
            {team.team.name}
            <span className="ml-xxs text-s font-normal text-text-sub">
              （{team.organization.name}）
            </span>
          </p>
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={() => {
            setSelected(team.team?.id ?? NONE);
            setDialogError(undefined);
            setChanging(true);
          }}
        >
          チームを変える
        </Button>
      </div>
      {placementMessage}
      <ol aria-label="このアカウントのチームの人" className="flex flex-col gap-xxs">
        {team.people.map((person) => (
          <li
            key={`${person.position}-${person.accountId}`}
            className="flex flex-wrap items-center gap-x-xxs gap-y-x3s border-l-2 border-border pl-xs text-m"
          >
            <span className="text-s text-text-sub">{POSITION_LABELS[person.position]}</span>
            <span className="font-bold break-words">{person.displayName || "（名前なし）"}</span>
            <span className="text-s text-text-sub">（{TEAM_ROLE_LABELS[person.role]}）</span>
            {person.isMe ? <Badge>あなた</Badge> : null}
            {person.position === "assignee" ? (
              <label className="ml-auto flex min-h-l items-center gap-xxs text-s">
                <input
                  type="checkbox"
                  className="size-s accent-primary"
                  aria-label={`${person.displayName || "（名前なし）"}さんに承認を任せる`}
                  checked={person.delegated}
                  onChange={(change) => void toggleDelegation(person, change.target.checked)}
                />
                承認を任せる
              </label>
            ) : null}
          </li>
        ))}
      </ol>
      {assignees.length === 0 ? (
        <p className="text-s text-text-sub">
          担当の人はまだいません。組織の管理者かチームのリーダーが、チームの画面の「担当を決める」で決めます。
        </p>
      ) : null}
      {delegationResult ? (
        <ResponseMessage tone={delegationResult.tone}>{delegationResult.message}</ResponseMessage>
      ) : null}
      <Disclosure summary="承認を任せると">
        <p className="text-s text-text-sub">{DELEGATION_NOTE}</p>
      </Disclosure>
      <div className="flex flex-col gap-x3s border-t border-border pt-xs">
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
      <RoleDiagram />
      <Dialog
        open={changing}
        onOpenChange={(open) => {
          if (!pending) setChanging(open);
        }}
        title="チームを変える"
        footer={
          <>
            <Button
              variant="secondary"
              aria-disabled={pending || undefined}
              onClick={() => {
                // 保存の途中は閉じない（失敗したときの知らせを枠の中に出すため）
                if (!pending) setChanging(false);
              }}
            >
              やめる
            </Button>
            <Button
              disabled={!changed}
              aria-disabled={pending || undefined}
              onClick={() =>
                void savePlacement().then((done) => {
                  if (done) setChanging(false);
                })
              }
            >
              {pending ? "変えています…" : "変える"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-xs">
          <Field label="入れるチーム">
            <TeamSelect candidates={team.candidates} value={selected} onChange={setSelected} />
          </Field>
          <p className="text-s text-text-sub">{PLACEMENT_NOTE}</p>
          {dialogError ? <ResponseMessage tone="danger">{dialogError}</ResponseMessage> : null}
        </div>
      </Dialog>
    </section>
  );
}

/**
 * 設定の画面の「チーム」の節（持ち主がどのチームにも入っていなければ、始め方への案内だけ出す）。
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
  if (!team.organization && !owner) return null;
  // 持ち主がどのチームにも入っていない：設定のタブが空にならないよう、始め方へ案内する（threads-020）
  if (!team.organization && team.candidates.length === 0) {
    return (
      <section aria-labelledby="threads-team" className="flex flex-col gap-xs">
        <h2 id="threads-team" className="text-l font-bold">
          チーム
        </h2>
        <p className="text-m">
          まだどの組織のチームにも入っていません。組織のチームに入ると、この運用アカウントをチームで運用できます。
        </p>
        <Link to="/threads/teams" className="self-start text-m text-text-link underline">
          チームで運用するには
        </Link>
      </section>
    );
  }
  return (
    <section aria-labelledby="threads-team" className="flex flex-col gap-xs">
      <h2 id="threads-team" className="text-l font-bold">
        チーム
      </h2>
      {owner ? <OwnerControls accountId={accountId} team={team} /> : <TeamRosterCard team={team} />}
    </section>
  );
}
