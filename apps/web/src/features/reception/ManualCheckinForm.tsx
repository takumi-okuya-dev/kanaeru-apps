// A3 の手でのチェックイン（EXPERIENCE.md：参加者のタブの中に欄を開く。重ねない）。
// 済んだら欄を閉じ、一覧と合計をその場で読み直す（呼ぶ側の onDone）。
import type { CheckinInput, CheckinView } from "@workspace/contracts/reception";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { CheckinFields } from "./CheckinFields.tsx";
import { createManualCheckin } from "./api.ts";
import { EMPTY_CHECKIN_FORM, focusFirstCheckinError, validateCheckinForm } from "./checkin-form.ts";
import type { DiscountChoice } from "./format.ts";

/** ManualCheckinForm が受け取るもの。 */
export type ManualCheckinFormProps = {
  /** 交流会の ID */
  eventId: string;
  /** 交流会の使っている割引（reception-002） */
  discounts: readonly DiscountChoice[];
  /** 済んだとき（作った行） */
  onDone: (checkin: CheckinView) => void;
  /** やめたとき */
  onCancel: () => void;
};

/**
 * 手でのチェックインの欄。
 * @param props 交流会の ID（eventId）・割引（discounts）・済んだとき（onDone）・やめたとき（onCancel）
 * @returns 欄の要素
 */
export function ManualCheckinForm({
  eventId,
  discounts,
  onDone,
  onCancel,
}: ManualCheckinFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(EMPTY_CHECKIN_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const mutation = useMutation({
    mutationFn: (input: CheckinInput) => createManualCheckin(eventId, input),
    onSuccess: onDone,
    onError: (error) => {
      const fields = fieldErrorsFromApi(error);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setFocusRequest((count) => count + 1);
      }
    },
  });

  useEffect(() => {
    if (focusRequest > 0) focusFirstCheckinError(formRef.current);
  }, [focusRequest]);

  // 開いたら名前の欄から入れられるようにする
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  }, []);

  /**
   * 送る。
   * @param event フォームの送信
   */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const result = validateCheckinForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    mutation.mutate(result.input);
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      aria-labelledby="manual-checkin-title"
      className="flex flex-col gap-s rounded-md border border-border bg-surface p-xs"
    >
      <h3 id="manual-checkin-title" className="text-l leading-tight font-bold">
        手でチェックイン
      </h3>
      <CheckinFields values={values} onChange={setValues} errors={errors} discounts={discounts} />
      <div className="flex flex-col gap-xxs">
        <ButtonRow>
          <Button type="button" onClick={onCancel}>
            やめる
          </Button>
          <Button type="submit" variant="primary" aria-disabled={mutation.isPending || undefined}>
            {mutation.isPending ? "チェックインしています…" : "チェックインする"}
          </Button>
        </ButtonRow>
        {mutation.isError && Object.keys(fieldErrorsFromApi(mutation.error)).length === 0 ? (
          <ResponseMessage tone="danger">
            {`チェックインできませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
    </form>
  );
}
