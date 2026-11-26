// 設定 › 組織（/settings/organizations。suite-001・PRD 組織 FR-O1・FR-O52）。入っている組織の一覧と「組織を作る」。
// 組織はスイートに1つの人の集まりで、どのアプリからも使う。アプリの記録を持っていなくても作れる。
// 作ったら、その組織の画面へ移り、画面の上の知らせの帯で伝える（画面が切り替わるため）。
import { ORGANIZATION_ROLE_LABELS, OrganizationNameInput } from "@workspace/contracts/suite";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Icon } from "../../lib/icon.tsx";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { createOrganization } from "./organization-api.ts";
import { ORGANIZATION_QUERY_KEYS, useOrganizations } from "./organization-queries.ts";
import { organizationPath } from "./organization-paths.ts";

/**
 * 組織を作るフォーム。
 * @param props 管理者として持っている数（adminCount）と上限（adminLimit）
 * @param props.adminCount 管理者として持っている組織の数
 * @param props.adminLimit 上限
 * @returns フォームの要素
 */
function CreateForm({ adminCount, adminLimit }: { adminCount: number; adminLimit: number }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFailure(undefined);
    const parsed = OrganizationNameInput.safeParse({ name });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const created = await createOrganization(parsed.data);
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEYS.all });
      const to = organizationPath(created.id);
      showNotice({ tone: "success", message: "組織を作りました。", path: to });
      await navigate({ to });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFailure(errorMessage(caught));
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="create-organization-heading" className="flex flex-col gap-xxs">
      <h2 id="create-organization-heading" className="text-l leading-tight font-bold">
        組織を作る
      </h2>
      <p className="text-s text-text-sub">
        作った人が管理者になります。管理者として持てる組織は{adminLimit}までです（今は{adminCount}
        ）。
      </p>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-xs"
      >
        <Field label="組織の名前" required error={errors.name} description="50文字まで">
          <Input value={name} onChange={(change) => setName(change.target.value)} />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <ButtonRow>
            <Button
              type="submit"
              variant="primary"
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
            >
              {pending ? "作っています…" : "組織を作る"}
            </Button>
          </ButtonRow>
          {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
        </div>
      </form>
    </section>
  );
}

/**
 * 組織の一覧の中身（ログインしているとき）。
 * @returns 要素
 */
function OrganizationsContent() {
  const query = useOrganizations();
  return (
    <Page
      title="組織"
      lead="運用代行の会社やお店の集まりなど、何人かでアプリを使うためのまとまりです。どのアプリからも同じ組織を使います。"
    >
      {query.isPending ? (
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      ) : query.isError ? (
        <div className="flex flex-col items-start gap-xxs">
          <p className="text-m">{errorMessage(query.error)}</p>
          <ButtonRow>
            <Button onClick={() => void query.refetch()}>もう一度</Button>
          </ButtonRow>
        </div>
      ) : (
        <>
          <section aria-labelledby="organization-list-heading" className="flex flex-col gap-xxs">
            <h2 id="organization-list-heading" className="text-l leading-tight font-bold">
              入っている組織
            </h2>
            {query.data.organizations.length === 0 ? (
              <p className="text-m text-text-sub">
                まだどの組織にも入っていません。組織を作るか、管理者から招待のリンクをもらってください。
              </p>
            ) : (
              <ul className="flex flex-col rounded-md border border-border bg-surface">
                {query.data.organizations.map((organization) => (
                  <li key={organization.id} className="border-b border-border last:border-b-0">
                    <Link
                      to={organizationPath(organization.id)}
                      className="flex min-h-xxl items-center justify-between gap-xs px-xs py-xxs text-m text-text hover:bg-surface-over"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-xxs">
                        <span className="min-w-0 font-bold break-words">{organization.name}</span>
                        <Badge>{ORGANIZATION_ROLE_LABELS[organization.myRole]}</Badge>
                        <span className="text-s text-text-sub">{organization.memberCount}人</span>
                      </span>
                      <Icon name="chevron" className="shrink-0 text-text-sub" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <CreateForm adminCount={query.data.adminCount} adminLimit={query.data.adminLimit} />
        </>
      )}
    </Page>
  );
}

/**
 * 設定 › 組織の画面。
 * @returns 画面の要素
 */
export function OrganizationsPage() {
  return (
    <SessionGate>
      <OrganizationsContent />
    </SessionGate>
  );
}
