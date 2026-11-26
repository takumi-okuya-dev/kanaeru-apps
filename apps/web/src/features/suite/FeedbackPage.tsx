// 設定 › 改善点を送る（/settings/feedback。suite-004）。ログインした人が、アプリの困りごと・ほしいことを開発者に送る。
// どのアプリについてか（任意）は、見えるアプリから選ぶ。本文に個人の情報を書かないよう案内する（Constitution II）。
// 送った改善点は運営者だけが「届いた改善点」で読む。送った人が自分の改善点を見る画面は作らない（この版）。
import { FEEDBACK_BODY_MAX, FeedbackInput } from "@workspace/contracts/suite";
import { Button } from "@workspace/ui/components/button";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { sendFeedback } from "./api.ts";
import { useVisibleApps } from "./queries.ts";

/**
 * Field の中に置く選ぶ欄（名前・説明・誤りを欄に結ぶ）。
 * @param props 値（value）・変えたとき（onChange）・選択肢（children）
 * @param props.value 選んだ値
 * @param props.onChange 変えたとき
 * @param props.children 選択肢
 * @returns 欄の要素
 */
function FieldSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-l`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      {children}
    </select>
  );
}

/**
 * 改善点を送るフォーム。
 * @returns 要素
 */
function FeedbackForm() {
  const visible = useVisibleApps();
  const apps = visible.apps;
  const form = useRef<HTMLFormElement>(null);
  const [appKey, setAppKey] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "danger"; text: string }>();

  /**
   * 送る。
   * @param submitEvent 送ったときの知らせ
   */
  const submit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    setResult(undefined);
    const parsed = FeedbackInput.safeParse({ body, appKey: appKey || null });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      requestAnimationFrame(() => focusFirstInvalid(form.current));
      return;
    }
    setErrors({});
    setPending(true);
    sendFeedback(parsed.data)
      .then(() => {
        setBody("");
        setAppKey("");
        setResult({ tone: "success", text: "送りました。ありがとうございます。" });
      })
      .catch((caught: unknown) => {
        const fields = fieldErrorsFromApi(caught);
        setErrors(fields);
        if (Object.keys(fields).length === 0) {
          setResult({ tone: "danger", text: `送れませんでした。${errorMessage(caught)}` });
        }
      })
      .finally(() => setPending(false));
  };

  return (
    <form ref={form} noValidate onSubmit={submit} className="flex max-w-form flex-col gap-s">
      <Field label="どのアプリについてですか（任意）" error={errors.appKey}>
        <FieldSelect value={appKey} onChange={setAppKey}>
          <option value="">選ばない（全体について）</option>
          {apps.map((app) => (
            <option key={app.key} value={app.key}>
              {app.name}
            </option>
          ))}
        </FieldSelect>
      </Field>
      <Field
        label="困ったこと・ほしいこと"
        description={`${FEEDBACK_BODY_MAX}文字まで。名前・連絡先など個人の情報は書かないでください。`}
        error={errors.body}
      >
        <Textarea
          name="body"
          rows={8}
          maxLength={FEEDBACK_BODY_MAX}
          value={body}
          onChange={(change) => {
            setBody(change.target.value);
            setResult(undefined);
          }}
        />
      </Field>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          送る
        </Button>
      </div>
      {result ? <ResponseMessage tone={result.tone}>{result.text}</ResponseMessage> : null}
    </form>
  );
}

/**
 * 改善点を送る画面。
 * @returns 画面の要素
 */
export function FeedbackPage() {
  return (
    <SessionGate>
      <Page
        title="改善点を送る"
        lead="使っていて困ったこと・ほしい機能を、開発者に送れます。返事はしませんが、すべて読んで改善に生かします。"
      >
        <FeedbackForm />
      </Page>
    </SessionGate>
  );
}
