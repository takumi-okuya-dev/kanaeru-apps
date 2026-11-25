// Threads の画面から、組織とチームを作って運用アカウントを入れる（threads-021）。
// - 組織がない人：組織の名前・チームの名前・入れる運用アカウント → 組織を作る → チームを作る → 自分をリーダーで足す → 運用アカウントを入れる
// - 組織の管理者：組織を選び（1つなら選ばない）、チームの名前・入れる運用アカウント → チームを作る → 自分をリーダーで足す → 入れる
// 途中で失敗したら、作れたもの（組織・チーム）を覚えておき、もう一度押したときは続きからにする（同じ組織を2つ作らない）。
// 作り終えたら、そのチームの画面へ移る。人を招くのは組織の設定の招待のリンク（suite）。入力の誤りは欄のそば（EXPERIENCE.md）。
import { OrganizationNameInput, TeamNameInput } from "@workspace/contracts/suite";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { useKnownAccount } from "../account/index.ts";
import { placeAccount } from "./api.ts";
import { THREADS_QUERY_KEYS, useThreadsAccounts } from "./queries.ts";
import { addToTeam, createOrganizationForTeam, createTeamIn } from "./team-start-api.ts";

/** TeamStartForm が受け取るもの。 */
export type TeamStartFormProps = {
  /** 今の利用者が管理者の組織（空なら、組織から作る） */
  adminOrganizations: readonly { id: string; name: string }[];
};

/**
 * 組織を選ぶ欄（Field の中で使う）。
 * @param props 選択肢（organizations）・値（value）・変えたとき（onChange）
 * @returns 欄の要素
 */
function OrganizationSelect({
  organizations,
  value,
  onChange,
}: {
  organizations: readonly { id: string; name: string }[];
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
      {organizations.map((row) => (
        <option key={row.id} value={row.id}>
          {row.name}
        </option>
      ))}
    </select>
  );
}

/**
 * 組織とチームを作るフォーム。
 * @param props 管理者の組織（adminOrganizations）
 * @returns フォームの要素
 */
export function TeamStartForm({ adminOrganizations }: TeamStartFormProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useKnownAccount();
  const accounts = useThreadsAccounts();
  const needOrganization = adminOrganizations.length === 0;
  const [organizationName, setOrganizationName] = useState("");
  const [organizationId, setOrganizationId] = useState(adminOrganizations[0]?.id ?? "");
  const [teamName, setTeamName] = useState("チーム1");
  // 押して既定から変えた運用アカウント（既定は、まだどのチームにも入っていないものだけ入れる。ほかのチームから黙って移さない）
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  // 途中で失敗したときに、作れたものを覚えておく（もう一度押したら続きから）
  const [made, setMade] = useState<{ organizationId?: string; teamId?: string; joined?: boolean }>(
    {},
  );

  const own = accounts.data?.accounts ?? [];
  const placedTeam = new Map(
    (accounts.data?.placements ?? []).map((row) => [row.threadsAccountId, row.teamName]),
  );
  /**
   * その運用アカウントを入れるか。
   * @param id 運用アカウントの ID
   * @returns 入れるなら true
   */
  const isChecked = (id: string) => placedTeam.has(id) === toggled.has(id);

  /** 作る。 */
  const submit = async () => {
    if (pending || !me) return;
    setFailure(undefined);
    const nextErrors: FieldErrors = {};
    if (needOrganization && !made.organizationId) {
      const parsed = OrganizationNameInput.safeParse({ name: organizationName.trim() });
      if (!parsed.success) {
        nextErrors.organizationName = fieldErrorsFromIssues(parsed.error.issues).name ?? "";
      }
    }
    const team = TeamNameInput.safeParse({ name: teamName.trim() });
    if (!team.success) nextErrors.teamName = fieldErrorsFromIssues(team.error.issues).name ?? "";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    const progress = { ...made };
    let step: "organization" | "team" | "other" = "other";
    try {
      if (needOrganization && !progress.organizationId) {
        step = "organization";
        progress.organizationId = (await createOrganizationForTeam(organizationName.trim())).id;
        setMade({ ...progress });
      }
      const targetOrganization = needOrganization ? progress.organizationId : organizationId;
      if (!targetOrganization) return;
      if (!progress.teamId) {
        step = "team";
        progress.teamId = (await createTeamIn(targetOrganization, teamName.trim())).id;
        setMade({ ...progress });
      }
      step = "other";
      const teamId = progress.teamId;
      if (!progress.joined) {
        // 作った人をリーダーでチームに足す（運用アカウントを入れるには、持ち主がチームの人であることが要る）
        await addToTeam(targetOrganization, teamId, me.id, true);
        progress.joined = true;
        setMade({ ...progress });
      }
      for (const account of own) {
        if (isChecked(account.id)) await placeAccount(account.id, teamId);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.teams }),
        queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.accounts }),
      ]);
      await navigate({ to: "/threads/teams/$teamId", params: { teamId } });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.name && step !== "other") {
        setErrors({ [step === "organization" ? "organizationName" : "teamName"]: fields.name });
      } else {
        setFailure(`作れませんでした。${errorMessage(caught)}`);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-s"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {needOrganization ? (
        <Field
          label="組織の名前"
          description="会社や団体の名前。あとで組織の設定から直せます。"
          error={errors.organizationName}
          required
        >
          <Input
            autoComplete="organization"
            value={organizationName}
            disabled={made.organizationId !== undefined}
            onChange={(change) => setOrganizationName(change.target.value)}
          />
        </Field>
      ) : adminOrganizations.length > 1 ? (
        <Field label="チームを作る組織">
          <OrganizationSelect
            organizations={adminOrganizations}
            value={organizationId}
            onChange={setOrganizationId}
          />
        </Field>
      ) : null}
      <Field
        label="チームの名前"
        description="店舗や担当ごとの名前（例：渋谷店）。"
        error={errors.teamName}
        required
      >
        <Input
          autoComplete="off"
          value={teamName}
          disabled={made.teamId !== undefined}
          onChange={(change) => setTeamName(change.target.value)}
        />
      </Field>
      {own.length > 0 ? (
        <fieldset className="flex flex-col gap-x3s">
          <legend className="text-m font-bold">このチームに入れる運用アカウント</legend>
          {own.map((account) => (
            <label key={account.id} className="flex min-h-l items-center gap-xxs text-m">
              <input
                type="checkbox"
                className="size-s accent-primary"
                checked={isChecked(account.id)}
                onChange={() => {
                  const next = new Set(toggled);
                  if (next.has(account.id)) next.delete(account.id);
                  else next.add(account.id);
                  setToggled(next);
                }}
              />
              {account.name}
              {placedTeam.has(account.id) ? (
                <span className="text-s text-text-sub">
                  （今は「{placedTeam.get(account.id)}」。入れると移ります）
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>
      ) : null}
      <p className="text-s text-text-sub">
        あなたはこのチームのリーダーになります。スタッフは、作ったあとに組織の設定の招待のリンクで招きます。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <Button type="submit" aria-disabled={pending || undefined}>
          {pending ? "作っています…" : needOrganization ? "組織とチームを作る" : "チームを作る"}
        </Button>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </form>
  );
}
