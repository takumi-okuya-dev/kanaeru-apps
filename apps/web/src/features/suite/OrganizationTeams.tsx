// 設定 › 組織 › 組織の画面の「チーム」の区分（suite-003）。組織の中にチームを作り、人を分け、リーダーを決める。
// - チームの名前・人・リーダーは組織の人の全員に出す。見ている人に「あなた」
// - 管理者だけ：チームを作る・名前を直す・消す・人を足す・外す・リーダーにする／外す
// - アプリの記録（Threads の運用アカウントなど）はチームに入れる。チームを消す・人を外すと、アプリの中の「チームに入れる」・担当が外れる
// 判定の正は API（suite の requireOrganizationRole）。ここは出し分けるだけ。結果は押したボタンのそば（EXPERIENCE.md）。
import type { OrganizationDetail, TeamMemberView, TeamView } from "@workspace/contracts/suite";
import { ORGANIZATION_ROLE_LABELS, TeamNameInput } from "@workspace/contracts/suite";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import {
  createTeam,
  deleteTeam,
  removeTeamMember,
  renameTeam,
  setTeamMember,
} from "./organization-api.ts";
import { ORGANIZATION_QUERY_KEYS } from "./organization-queries.ts";

/** 押したボタンのそばに出す結果。 */
type Result = { tone: "success" | "danger"; message: string };

/**
 * 組織の問い合わせを読み直す（その組織と一覧）。
 * @returns 読み直す関数
 */
function useRefreshOrganizations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEYS.all });
}

/**
 * 名前を入れて送るフォーム（作る・名前を直すで使う）。
 * @param props 欄の名前（label）・初めの値（initial）・ボタン（submitLabel・pendingLabel）・送る（onSubmit）
 * @param props.label 欄の名前
 * @param props.initial 初めの値
 * @param props.submitLabel ボタンの文字
 * @param props.pendingLabel 送っている間のボタンの文字
 * @param props.onSubmit 送る（成功したら結果の文を返す）
 * @param props.resetOnSuccess 成功したら欄を空にするか
 * @returns フォームの要素
 */
function TeamNameForm({
  label,
  initial,
  submitLabel,
  pendingLabel,
  onSubmit,
  resetOnSuccess = false,
}: {
  label: string;
  initial: string;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (input: TeamNameInput) => Promise<string>;
  resetOnSuccess?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<Result | undefined>();
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setResult(undefined);
    const parsed = TeamNameInput.safeParse({ name });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const message = await onSubmit(parsed.data);
      setResult({ tone: "success", message });
      if (resetOnSuccess) setName("");
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setResult({ tone: "danger", message: errorMessage(caught) });
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-xs"
    >
      <Field label={label} required error={errors.name} description="30文字まで">
        <Input value={name} onChange={(change) => setName(change.target.value)} />
      </Field>
      <div className="flex flex-col items-start gap-xxs">
        <Button type="submit" aria-disabled={pending || undefined}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/**
 * チームに足す人を選ぶ欄（Field の中で使う）。
 * @param props 選べる人（members）・選んだ人（value）・選んだとき（onChange）
 * @param props.members 選べる人
 * @param props.value 選んだ人の ID（まだなら ""）
 * @param props.onChange 選んだとき
 * @returns 欄の要素
 */
function AddMemberSelect({
  members,
  value,
  onChange,
}: {
  members: OrganizationDetail["members"];
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
      <option value="">選んでください</option>
      {members.map((member) => (
        <option key={member.accountId} value={member.accountId}>
          {`${member.displayName || "名前のない人"}（${ORGANIZATION_ROLE_LABELS[member.role]}）`}
        </option>
      ))}
    </select>
  );
}

/**
 * チームの人の1行（管理者には、リーダーの切り替えと外すを出す）。
 * @param props 組織（organization）・チーム（team）・人（member）
 * @param props.organization 組織
 * @param props.team チーム
 * @param props.member チームの人
 * @returns 行の要素
 */
function TeamMemberRow({
  organization,
  team,
  member,
}: {
  organization: OrganizationDetail;
  team: TeamView;
  member: TeamMemberView;
}) {
  const refresh = useRefreshOrganizations();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | undefined>();
  const isAdmin = organization.myRole === "admin";
  const name = member.displayName || "名前のない人";

  /**
   * 送って読み直す（結果はこの行のそば）。
   * @param action 送る処理
   * @param message 成功したときの文
   */
  const run = async (action: () => Promise<unknown>, message: string) => {
    if (pending) return;
    setPending(true);
    setResult(undefined);
    try {
      await action();
      setResult({ tone: "success", message });
      await refresh();
    } catch (caught) {
      setResult({ tone: "danger", message: errorMessage(caught) });
    } finally {
      setPending(false);
    }
  };

  return (
    <li
      className="flex flex-col gap-x3s border-b border-border px-xs py-xxs last:border-b-0"
      aria-label={name}
    >
      <div className="flex flex-wrap items-center gap-xxs">
        <span className="min-w-0 text-m font-bold break-words">{name}</span>
        <span className="text-s text-text-sub">（{ORGANIZATION_ROLE_LABELS[member.role]}）</span>
        {member.leader ? <Badge variant="success">リーダー</Badge> : null}
        {member.isMe ? <Badge>あなた</Badge> : null}
      </div>
      {isAdmin ? (
        <div className="flex flex-col items-start gap-x3s" aria-busy={pending || undefined}>
          <div className="flex flex-wrap gap-xxs">
            <Button
              size="small"
              aria-disabled={pending || undefined}
              onClick={() =>
                void run(
                  () =>
                    setTeamMember(organization.id, team.id, member.accountId, {
                      leader: !member.leader,
                    }),
                  member.leader
                    ? `${name}さんをリーダーから外しました。`
                    : `${name}さんを「${team.name}」のリーダーにしました。`,
                )
              }
            >
              {member.leader ? "リーダーから外す" : "リーダーにする"}
            </Button>
            <Button
              size="small"
              variant="danger"
              aria-disabled={pending || undefined}
              onClick={() =>
                void run(
                  () => removeTeamMember(organization.id, team.id, member.accountId),
                  `${name}さんを「${team.name}」から外しました。`,
                )
              }
            >
              チームから外す
            </Button>
          </div>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * チームに人を足す（管理者だけ。チームにまだいない組織の人から選ぶ）。
 * @param props 組織（organization）・チーム（team）
 * @param props.organization 組織
 * @param props.team チーム
 * @returns 要素
 */
function AddTeamMember({
  organization,
  team,
}: {
  organization: OrganizationDetail;
  team: TeamView;
}) {
  const refresh = useRefreshOrganizations();
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | undefined>();
  const inTeam = new Set(team.members.map((member) => member.accountId));
  const candidates = organization.members.filter((member) => !inTeam.has(member.accountId));
  if (candidates.length === 0) {
    return <p className="text-s text-text-sub">組織の人は、全員このチームに入っています。</p>;
  }

  const add = async () => {
    if (pending || selected === "") return;
    setPending(true);
    setResult(undefined);
    const member = candidates.find((row) => row.accountId === selected);
    try {
      await setTeamMember(organization.id, team.id, selected, { leader: false });
      setResult({
        tone: "success",
        message: `${member?.displayName || "名前のない人"}さんを「${team.name}」に足しました。`,
      });
      setSelected("");
      await refresh();
    } catch (caught) {
      setResult({ tone: "danger", message: errorMessage(caught) });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-xxs">
      <Field label={`「${team.name}」に足す人`}>
        <AddMemberSelect members={candidates} value={selected} onChange={setSelected} />
      </Field>
      <div className="flex flex-col items-start gap-xxs">
        <Button
          disabled={selected === ""}
          aria-disabled={pending || undefined}
          onClick={() => void add()}
        >
          {pending ? "足しています…" : "チームに足す"}
        </Button>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </div>
  );
}

/**
 * 1つのチーム（人の一覧と、管理者には操作）。
 * @param props 組織（organization）・チーム（team）
 * @param props.organization 組織
 * @param props.team チーム
 * @returns 要素
 */
function TeamCard({ organization, team }: { organization: OrganizationDetail; team: TeamView }) {
  const refresh = useRefreshOrganizations();
  const isAdmin = organization.myRole === "admin";
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const headingId = `organization-team-${team.id}`;

  const remove = async () => {
    setPending(true);
    setError(undefined);
    try {
      await deleteTeam(organization.id, team.id);
      setConfirming(false);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-xs"
    >
      <h3 id={headingId} className="text-m font-bold break-words">
        {team.name}
      </h3>
      {team.members.length === 0 ? (
        <p className="text-s text-text-sub">まだ誰もいません。</p>
      ) : (
        <ul
          aria-label={`${team.name}の人`}
          className="flex flex-col rounded-md border border-border"
        >
          {team.members.map((member) => (
            <TeamMemberRow
              key={member.accountId}
              organization={organization}
              team={team}
              member={member}
            />
          ))}
        </ul>
      )}
      {isAdmin ? (
        <>
          <AddTeamMember organization={organization} team={team} />
          <details className="flex flex-col gap-xs">
            <summary className="min-h-l cursor-pointer text-m">名前を直す・消す</summary>
            <div className="flex flex-col gap-xs pt-xxs">
              <TeamNameForm
                key={team.name}
                label="チームの名前"
                initial={team.name}
                submitLabel="名前を保存する"
                pendingLabel="保存しています…"
                onSubmit={async (input) => {
                  await renameTeam(organization.id, team.id, input);
                  await refresh();
                  return "名前を直しました。";
                }}
              />
              <div>
                <Button
                  variant="danger"
                  onClick={() => {
                    setError(undefined);
                    setConfirming(true);
                  }}
                >
                  チームを消す
                </Button>
              </div>
            </div>
          </details>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={`チーム「${team.name}」を消しますか`}
            confirmLabel="チームを消す"
            pendingLabel="消しています…"
            pending={pending}
            error={error}
            onConfirm={() => void remove()}
          >
            <p>
              チームの人{team.members.length}
              人の分け方と、アプリの中の「チームに入れる」・担当が消えます。アプリの記録とそのデータは、持ち主の個人のものとして残ります。元に戻せません。
            </p>
          </ConfirmDialog>
        </>
      ) : null}
    </li>
  );
}

/**
 * 組織の画面の「チーム」の区分。
 * @param props 組織（organization）
 * @param props.organization 組織
 * @returns まとまりの要素
 */
export function TeamsSection({ organization }: { organization: OrganizationDetail }) {
  const refresh = useRefreshOrganizations();
  const isAdmin = organization.myRole === "admin";
  const full = organization.teams.length >= organization.teamLimit;
  return (
    <section aria-labelledby="organization-teams-heading" className="flex flex-col gap-xxs">
      <h2 id="organization-teams-heading" className="text-l leading-tight font-bold">
        チーム
      </h2>
      <p className="text-s text-text-sub">
        組織の中を、店舗や担当ごとのチームに分けます。アプリの記録（Threads
        の運用アカウントなど）はチームに入れ、そのチームの人と管理者が一緒に使います。リーダーは、アプリの中で自分のチームの担当を決められます。
        {organization.teams.length}チーム（上限{organization.teamLimit}）
      </p>
      {organization.teams.length === 0 ? (
        <p className="text-m">
          {isAdmin
            ? "チームはまだありません。下で作ってください。"
            : "チームはまだありません。管理者が作ります。"}
        </p>
      ) : (
        <ul aria-label="チーム" className="flex flex-col gap-xs">
          {organization.teams.map((team) => (
            <TeamCard key={team.id} organization={organization} team={team} />
          ))}
        </ul>
      )}
      {isAdmin ? (
        full ? (
          <p className="text-s text-text-sub">
            チームは{organization.teamLimit}まで作れます。使わないチームを消してから作ってください。
          </p>
        ) : (
          <TeamNameForm
            label="新しいチームの名前"
            initial=""
            submitLabel="チームを作る"
            pendingLabel="作っています…"
            resetOnSuccess
            onSubmit={async (input) => {
              await createTeam(organization.id, input);
              await refresh();
              return `チーム「${input.name}」を作りました。人を足してください。`;
            }}
          />
        )
      ) : null}
    </section>
  );
}
