// 手元のログインの画面（/dev/login）。LIFF ID のない手元・テスト・E2E で、試験用のログイン（AD-12）を使う。
// API は設定 TEST_LOGIN_ENABLED のときだけ受け付ける（staging・production では起動で止める）。LINE の画面では使えない旨だけを出す。
// 入力の誤りは欄のそば、送った結果はボタンの近く（EXPERIENCE.md）。
import { DISPLAY_NAME_MAX, TestLoginInput } from "@workspace/contracts/account";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { getLiff } from "../../lib/liff.ts";
import { Page } from "../../lib/page.tsx";
import { logout, testLogin } from "./api.ts";
import { setAuthenticated, setSignedOut, useSession } from "./session.ts";

/** 見本の LINE のユーザー ID（U と16進の32文字）。 */
export const SAMPLE_LINE_USER_ID = `U${"0".repeat(31)}1`;

/** 手元のログインの画面が受け取るもの。 */
export type DevLoginPageProps = {
  /** ログインのあとに戻る道（/ で始まる同じ源の道だけ） */
  redirect?: string | undefined;
};

/**
 * 手元のログインの画面。
 * @param props 戻る道（redirect）
 * @returns 画面の要素
 */
export function DevLoginPage({ redirect }: DevLoginPageProps) {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState({ lineUserId: SAMPLE_LINE_USER_ID, displayName: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(formRef.current);
  }, [focusRequest]);

  if (getLiff().mode === "line") {
    return (
      <Page
        title="手元のログイン"
        lead="この画面は、LINE につながない手元とテストだけで使えます。"
      />
    );
  }

  /**
   * 送る。
   * @param event 送る出来事
   */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFailure(undefined);
    const parsed = TestLoginInput.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await setAuthenticated(queryClient, await testLogin(parsed.data));
      if (redirect) await navigate({ to: redirect });
    } catch (error) {
      const fields = fieldErrorsFromApi(error);
      setErrors(fields);
      if (Object.keys(fields).length > 0) setFocusRequest((count) => count + 1);
      else setFailure(`ログインできませんでした。${errorMessage(error)}`);
    } finally {
      setPending(false);
    }
  };

  /** ログアウトする。 */
  const signOut = async () => {
    setFailure(undefined);
    try {
      await logout();
      setSignedOut(queryClient);
    } catch (error) {
      setFailure(`ログアウトできませんでした。${errorMessage(error)}`);
    }
  };

  return (
    <Page
      title="手元のログイン"
      lead="LINE につながない手元とテストで、試験用の利用者としてログインします。"
    >
      {session.status === "loading" ? (
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      ) : session.status === "authenticated" ? (
        <section aria-labelledby="dev-login-current" className="flex flex-col items-start gap-xs">
          <h2 id="dev-login-current" className="text-l leading-tight font-bold">
            ログインしています：{session.account.displayName || "（表示名なし）"}
            {session.account.isOrganizer ? "（主催者）" : ""}
          </h2>
          <div className="flex flex-wrap gap-xxs">
            {redirect ? (
              <Link to={redirect} className={buttonVariants({ variant: "primary" })}>
                もとの画面へ
              </Link>
            ) : null}
            <Button onClick={() => void signOut()}>ログアウト</Button>
          </div>
          {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
        </section>
      ) : (
        <form
          ref={formRef}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex max-w-xl flex-col gap-s"
        >
          <Field
            label="LINE のユーザー ID"
            description="U と16進（0〜9・a〜f）の32文字。主催者として試すときは、設定の ORGANIZER_LINE_USER_ID と同じ値にします。"
            error={errors.lineUserId}
            required
          >
            <Input
              name="lineUserId"
              autoComplete="off"
              spellCheck={false}
              value={values.lineUserId}
              onChange={(event) => setValues({ ...values, lineUserId: event.target.value })}
            />
          </Field>
          <Field
            label="表示名"
            description={`LINE の名前の代わり。${DISPLAY_NAME_MAX}文字まで。`}
            error={errors.displayName}
            required
          >
            <Input
              name="displayName"
              autoComplete="off"
              value={values.displayName}
              onChange={(event) => setValues({ ...values, displayName: event.target.value })}
            />
          </Field>
          <div className="flex flex-col items-start gap-xxs">
            <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
              {pending ? "ログインしています…" : "ログイン"}
            </Button>
            {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
          </div>
        </form>
      )}
    </Page>
  );
}
