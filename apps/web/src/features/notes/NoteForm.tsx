// メモの入力のフォーム（追加と編集で共に使う）。EXPERIENCE.md 3 の型に合わせる：
// - 入力の誤りは、欄を離れたとき（入れ直した欄だけ）と送ったときに、その欄のそばに出す。送ったときは最初の誤りの欄にフォーカスを移す。
// - 送った結果は、押したボタンの近く（ボタンの下）に出す。失敗しても入れた値は消さない。
// 確かめは、API と同じ約束（@workspace/contracts/notes の NoteInput）で行う。API が返した欄ごとの理由も、欄のそばに出す。
import { NOTE_BODY_MAX, NOTE_TITLE_MAX, NoteInput } from "@workspace/contracts/notes";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { buttonVariants } from "@workspace/ui/components/button";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";

/** 欄の名前。 */
type FieldName = "title" | "body";

/** フォームの値（入れている途中の文字）。 */
type Values = Record<FieldName, string>;

/** フォームが受け取るもの。 */
export type NoteFormProps = {
  /** はじめの値（編集のとき） */
  initial?: Values;
  /** 送るボタンの名前（動詞。例：追加・保存） */
  submitLabel: string;
  /** 送っている間のボタンの名前（例：保存しています…） */
  pendingLabel: string;
  /** 確かめた値を送る（失敗したら投げる） */
  onSubmit: (input: NoteInput) => Promise<void>;
  /** 送れたときに、ボタンの近くに出す文（任意。画面が切り替わるときは渡さない） */
  successMessage?: string;
};

/**
 * 1つの欄の値を確かめ、誤りの文を返す。
 * @param name 欄の名前
 * @param value 値
 * @returns 誤りの文（合っていれば undefined）
 */
function validateField(name: FieldName, value: string): string | undefined {
  const result = NoteInput.shape[name].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

/**
 * メモの入力のフォーム。
 * @param props はじめの値（initial）・ボタンの名前（submitLabel・pendingLabel）・送る（onSubmit）・送れたときの文（successMessage）
 * @returns フォームの要素
 */
export function NoteForm({
  initial,
  submitLabel,
  pendingLabel,
  onSubmit,
  successMessage,
}: NoteFormProps) {
  const [values, setValues] = useState<Values>(initial ?? { title: "", body: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState<Partial<Record<FieldName, boolean>>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string }>();
  // 送ったあと、描き直してから最初の誤りの欄にフォーカスを移す合図
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(formRef.current);
  }, [focusRequest]);

  /**
   * 欄の値が変わった（誤りが出ている欄は、入れ直すたびに確かめ直す）。
   * @param name 欄の名前
   * @param value 値
   */
  const change = (name: FieldName, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setDirty((current) => ({ ...current, [name]: true }));
    setResult(undefined);
    if (errors[name])
      setErrors((current) => ({ ...current, [name]: validateField(name, value) ?? "" }));
  };

  /**
   * 欄を離れた（入れ直した欄だけ確かめる）。
   * @param name 欄の名前
   */
  const blur = (name: FieldName) => {
    if (!dirty[name]) return;
    setErrors((current) => ({ ...current, [name]: validateField(name, values[name]) ?? "" }));
  };

  /**
   * 送る。
   * @param event 送る出来事
   */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setResult(undefined);
    const parsed = NoteInput.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await onSubmit(parsed.data);
      setDirty({});
      if (successMessage) setResult({ tone: "success", message: successMessage });
    } catch (error) {
      const fields = fieldErrorsFromApi(error);
      setErrors(fields);
      if (Object.keys(fields).length > 0) setFocusRequest((count) => count + 1);
      setResult({ tone: "danger", message: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-s"
    >
      <Field
        label="題"
        description={`${NOTE_TITLE_MAX}文字まで`}
        error={errors.title || undefined}
        required
      >
        <Input
          name="title"
          autoComplete="off"
          value={values.title}
          onChange={(event) => change("title", event.target.value)}
          onBlur={() => blur("title")}
        />
      </Field>
      <Field label="本文" description={`${NOTE_BODY_MAX}文字まで`} error={errors.body || undefined}>
        <Textarea
          name="body"
          value={values.body}
          onChange={(event) => change("body", event.target.value)}
          onBlur={() => blur("body")}
        />
      </Field>
      <div className="flex flex-col gap-xxs">
        <div className="flex flex-wrap gap-xxs">
          <Button
            type="submit"
            variant="primary"
            aria-disabled={pending ? true : undefined}
            aria-busy={pending ? true : undefined}
          >
            {pending ? pendingLabel : submitLabel}
          </Button>
          <Link to="/notes" className={buttonVariants({ variant: "secondary" })}>
            キャンセル
          </Link>
        </div>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </form>
  );
}
