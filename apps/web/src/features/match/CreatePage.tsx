// M0 試合表を作る（/match/new）。名前・試合の日・入れる組織（任意。入っている組織があるときだけ）を入れて作り、名簿と設定へ移る。
// 作ったこの端末が担当の端末になる（AD-28）。名簿の入れ方（フォームから貼り付け・CSV・手で入れる）は、名簿の画面で選ぶ。
// 入力の誤りは欄のそば、送った結果はボタンの近く、移るときは画面の上の知らせの帯（EXPERIENCE.md）。
import { MatchTableCreateInput } from "@workspace/contracts/match";
import type { MatchOrganizationOptions } from "@workspace/contracts/match";
import { jstDate } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { createTable } from "./api.ts";
import { deviceId } from "./device.ts";
import { MatchGate } from "./MatchGate.tsx";
import { matchPaths } from "./paths.ts";
import { MATCH_QUERY_KEYS, useOrganizationOptions } from "./queries.ts";

/**
 * 組織を選ぶ欄（Field の中で使う）。
 * @param props 組織（options）・選んだ値（value）・選んだとき（onChange）
 * @param props.options 入れられる組織
 * @param props.value 選んだ組織の ID（なければ ""）
 * @param props.onChange 選んだとき
 * @returns 欄の要素
 */
function OrganizationSelect({
  options,
  value,
  onChange,
}: {
  options: MatchOrganizationOptions["organizations"];
  value: string;
  onChange: (value: string) => void;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-xl`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      <option value="">入れない（自分だけ）</option>
      {options.map((organization) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
        </option>
      ))}
    </select>
  );
}

/**
 * 作るフォーム。
 * @param props 入れられる組織（organizations）
 * @param props.organizations 入れられる組織
 * @returns フォームの要素
 */
function CreateForm({
  organizations,
}: {
  organizations: MatchOrganizationOptions["organizations"];
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [playDate, setPlayDate] = useState(() => jstDate(new Date()));
  const [organizationId, setOrganizationId] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setFailure(undefined);
    const parsed = MatchTableCreateInput.safeParse({
      name,
      playDate,
      organizationId: organizationId || null,
      deviceId: deviceId(),
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const created = await createTable(parsed.data);
      await queryClient.invalidateQueries({ queryKey: MATCH_QUERY_KEYS.list });
      queryClient.setQueryData(MATCH_QUERY_KEYS.table(created.id), created);
      const path = matchPaths.roster(created.id);
      showNotice({
        tone: "success",
        message: `「${created.name}」を作りました。フォームの回答を貼り付けるか、1人ずつ足して名簿を作ってください。`,
        path,
      });
      await navigate({ to: "/match/tables/$tableId", params: { tableId: created.id } });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      } else {
        setFailure(`作れませんでした。${errorMessage(caught)}`);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(submitEvent) => void submit(submitEvent)}
      className="flex max-w-form flex-col gap-xs"
    >
      <Field label="試合表の名前" description="例：12/13(日) 練習会" error={errors.name} required>
        <Input
          autoComplete="off"
          value={name}
          onChange={(change) => setName(change.target.value)}
        />
      </Field>
      <Field
        label="試合の日"
        description="試合の日から90日を過ぎると消えます。"
        error={errors.playDate}
        required
      >
        <Input
          type="date"
          value={playDate}
          onChange={(change) => setPlayDate(change.target.value)}
        />
      </Field>
      {organizations.length > 0 ? (
        <Field
          label="組織に入れる"
          description="入れると、組織の管理者と編集者も試合表を直せます。"
          error={errors.organizationId}
        >
          <OrganizationSelect
            options={organizations}
            value={organizationId}
            onChange={setOrganizationId}
          />
        </Field>
      ) : null}
      <div className="flex flex-col gap-xxs">
        <ButtonRow>
          <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
            {pending ? "作っています…" : "作る"}
          </Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/**
 * 試合表を作る画面。
 * @returns 画面の要素
 */
export function CreatePage() {
  const query = useOrganizationOptions();
  return (
    <MatchGate query={query}>
      {(options) => (
        <Page title="試合表を作る" lead="名前と試合の日を入れます。名簿は次の画面で入れます。">
          <CreateForm organizations={options.organizations} />
        </Page>
      )}
    </MatchGate>
  );
}
