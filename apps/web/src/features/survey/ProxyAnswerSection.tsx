// A3 の直す枠に足す節「アンケートの回答」（主催者が手でのチェックインを開いたときだけ、reception が出す。research R11）。
// 「アンケートの回答を入れる」（回答があれば「アンケートの回答を直す」）で、節の中に P2 と同じ設問の欄を開く（枠を重ねない）。
// アンケートが閉じていても入れられる（AD-13・A9）。保存したら欄を閉じ、近くに結果を出し、困りごとの問い合わせを読み直す。
import type { EventView } from "@workspace/contracts/event";
import type { CheckinView } from "@workspace/contracts/reception";
import type { SurveyAnswerInput } from "@workspace/contracts/survey";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { SurveyFields } from "./SurveyFields.tsx";
import { putProxySurvey } from "./api.ts";
import { SURVEY_QUERY_KEYS, useProxySurvey } from "./queries.ts";
import { surveyFormFromAnswer, validateSurveyForm } from "./survey-form.ts";
import type { SurveyFormValues } from "./survey-form.ts";

/** ProxyAnswerSection が受け取るもの（reception の差しこみの場所の約束）。 */
export type ProxyAnswerSectionProps = {
  /** 交流会 */
  event: EventView;
  /** 開いた手でのチェックイン */
  checkin: CheckinView;
};

/** 欄が受け取るもの。 */
type ProxyFormProps = ProxyAnswerSectionProps & {
  /** 始めの値 */
  initial: SurveyFormValues;
  /** 保存したとき */
  onSaved: () => void;
  /** やめたとき */
  onCancel: () => void;
};

/**
 * 代わりに入れる欄（P2 と同じ設問と「回答を保存」「やめる」）。
 * @param props 交流会（event）・チェックイン（checkin）・始めの値（initial）・保存したとき（onSaved）・やめたとき（onCancel）
 * @returns 欄の要素
 */
function ProxyForm({ event, checkin, initial, onSaved, onCancel }: ProxyFormProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const mutation = useMutation({
    mutationFn: (input: SurveyAnswerInput) => putProxySurvey(event.id, checkin.id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SURVEY_QUERY_KEYS.all });
      onSaved();
    },
    onError: (error) => {
      const fields = fieldErrorsFromApi(error);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setFocusRequest((count) => count + 1);
      }
    },
  });

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(formRef.current);
  }, [focusRequest]);

  /**
   * 保存する。
   * @param submitEvent フォームの送信
   */
  const submit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (mutation.isPending) return;
    // 前に保存できなかった文を消してから確かめる（手元の誤りで止まったときに、古い「保存できませんでした」を残さない）
    mutation.reset();
    const result = validateSurveyForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    mutation.mutate(result.input);
  };

  const fieldError = mutation.error instanceof ApiError && mutation.error.fields.length > 0;
  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-s">
      <SurveyFields values={values} onChange={setValues} errors={errors} />
      <div className="flex flex-col gap-xxs">
        <div className="flex flex-col-reverse gap-xxs wide:flex-row wide:justify-end">
          <Button
            type="button"
            className="min-h-xl"
            aria-disabled={mutation.isPending || undefined}
            onClick={() => {
              if (!mutation.isPending) onCancel();
            }}
          >
            やめる
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="min-h-xl"
            aria-disabled={mutation.isPending || undefined}
            aria-busy={mutation.isPending || undefined}
          >
            {mutation.isPending ? "保存しています…" : "回答を保存"}
          </Button>
        </div>
        {mutation.isError && !fieldError ? (
          <ResponseMessage tone="danger">
            {`保存できませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
    </form>
  );
}

/**
 * A3 の直す枠の節「アンケートの回答」。
 * @param props 交流会（event）・手でのチェックイン（checkin）
 * @returns 節の要素
 */
export function ProxyAnswerSection({ event, checkin }: ProxyAnswerSectionProps) {
  const query = useProxySurvey(event.id, checkin.id);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const answer = query.data?.answer ?? null;

  return (
    <section
      aria-labelledby={`survey-proxy-${checkin.id}`}
      className="flex flex-col gap-xs border-t border-border pt-xs"
    >
      <h3 id={`survey-proxy-${checkin.id}`} className="text-m leading-tight font-bold">
        アンケートの回答
      </h3>
      {query.isPending ? (
        <p aria-busy="true" className="text-s text-text-sub">
          読みこんでいます…
        </p>
      ) : query.isError ? (
        <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>
      ) : open ? (
        <ProxyForm
          event={event}
          checkin={checkin}
          initial={surveyFormFromAnswer(answer)}
          onSaved={() => {
            setOpen(false);
            setSaved(true);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <div className="flex flex-col items-start gap-xxs">
          <p className="text-s text-text-sub">
            {answer
              ? "回答があります。聞き取って直せます（アンケートが閉じていても入れられます）。"
              : "まだ回答はありません。聞き取って代わりに入れられます（アンケートが閉じていても入れられます）。"}
          </p>
          <Button
            type="button"
            className="min-h-xl"
            onClick={() => {
              setSaved(false);
              setOpen(true);
            }}
          >
            {answer ? "アンケートの回答を直す" : "アンケートの回答を入れる"}
          </Button>
          {saved ? (
            <ResponseMessage tone="success">アンケートの回答を保存しました。</ResponseMessage>
          ) : null}
        </div>
      )}
    </section>
  );
}
