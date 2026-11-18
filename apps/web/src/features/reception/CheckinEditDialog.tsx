// A3 の直す・取り消すの枠（EXPERIENCE.md：名前と3つのチップを直して「保存」。下に危ないの色で「取り消す」）。
// 取り消しの確かめは枠を重ねず、同じ枠の中で切り替えて出す（「このチェックインを取り消します。アンケートの回答があれば一緒に消えます」。AD-7）。
// 同じ名前の印がある手でのチェックインには、LINE のほうを残してまとめる1文を出す。
// 主催者が手でのチェックインを開いたときだけ、ほかの領域が登録した節（差しこみの場所。research R10）を出す。
import type { EventView } from "@workspace/contracts/event";
import type { CheckinInput, CheckinView } from "@workspace/contracts/reception";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Dialog } from "@workspace/ui/components/dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { CheckinFields } from "./CheckinFields.tsx";
import { deleteCheckin, updateCheckin } from "./api.ts";
import { focusFirstCheckinError, validateCheckinForm } from "./checkin-form.ts";
import type { CheckinFormValues } from "./checkin-form.ts";
import { ManualFlag, SameNameFlag } from "./flags.tsx";
import { checkinPanelSections } from "./slots.ts";

/** CheckinEditDialog が受け取るもの。 */
export type CheckinEditDialogProps = {
  /** 交流会（役目つき） */
  event: EventView;
  /** 開いたチェックイン */
  checkin: CheckinView;
  /** 閉じるとき */
  onClose: () => void;
  /** 保存・取り消しが済んだとき（ボタンの近くに出す文） */
  onDone: (message: string) => void;
};

/**
 * 直す・取り消すの枠。
 * @param props 交流会（event）・チェックイン（checkin）・閉じる（onClose）・済んだとき（onDone）
 * @returns 枠の要素
 */
export function CheckinEditDialog({ event, checkin, onClose, onDone }: CheckinEditDialogProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [values, setValues] = useState<CheckinFormValues>({
    name: checkin.name,
    applicationSource: checkin.applicationSource,
    referral: checkin.referral,
    paymentMethod: checkin.paymentMethod,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const save = useMutation({
    mutationFn: (input: CheckinInput) => updateCheckin(event.id, checkin.id, input),
    onSuccess: (updated) => onDone(`${updated.name}さんのチェックインを直しました。`),
    onError: (error) => {
      const fields = fieldErrorsFromApi(error);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setFocusRequest((count) => count + 1);
      }
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteCheckin(event.id, checkin.id),
    onSuccess: () => onDone(`${checkin.name}さんのチェックインを取り消しました。`),
  });
  const pending = save.isPending || remove.isPending;

  useEffect(() => {
    if (focusRequest > 0) focusFirstCheckinError(formRef.current);
  }, [focusRequest]);

  /**
   * 保存する。
   * @param submitEvent フォームの送信
   */
  const submit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    const result = validateCheckinForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    save.mutate(result.input);
  };

  const manual = checkin.method === "manual";
  const sections = event.myRole === "organizer" && manual ? checkinPanelSections() : [];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={confirming ? "このチェックインを取り消しますか" : `${checkin.name}さんのチェックイン`}
    >
      {confirming ? (
        <div className="flex flex-col gap-xs">
          <p className="text-m">
            このチェックインを取り消します。アンケートの回答があれば一緒に消えます。
          </p>
          {remove.isError ? (
            <ResponseMessage tone="danger">
              {`取り消せませんでした。${errorMessage(remove.error)}`}
            </ResponseMessage>
          ) : null}
          <div className="flex flex-col-reverse gap-xxs wide:flex-row wide:justify-end">
            <Button
              type="button"
              className="min-h-xl"
              aria-disabled={pending || undefined}
              onClick={() => {
                if (!pending) setConfirming(false);
              }}
            >
              やめる
            </Button>
            <Button
              type="button"
              variant="danger"
              className="min-h-xl"
              aria-disabled={pending || undefined}
              aria-busy={remove.isPending || undefined}
              onClick={() => {
                if (!pending) remove.mutate();
              }}
            >
              {remove.isPending ? "取り消しています…" : "取り消す"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-s">
          {manual || checkin.sameName ? (
            <div className="flex flex-wrap gap-x3s">
              {manual ? <ManualFlag enteredByName={checkin.enteredByName} /> : null}
              {checkin.sameName ? <SameNameFlag /> : null}
            </div>
          ) : null}
          {checkin.sameName && manual ? (
            <p className="text-s">
              同じ人を1人にまとめるときは、LINEのほうを残し、この手でのチェックインを取り消してください。
            </p>
          ) : null}
          <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-s">
            <CheckinFields values={values} onChange={setValues} errors={errors} />
            <div className="flex flex-col gap-xxs">
              <div className="flex flex-col-reverse gap-xxs wide:flex-row wide:justify-end">
                <Button
                  type="button"
                  className="min-h-xl"
                  aria-disabled={pending || undefined}
                  onClick={() => {
                    if (!pending) onClose();
                  }}
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="min-h-xl"
                  aria-disabled={pending || undefined}
                  aria-busy={save.isPending || undefined}
                >
                  {save.isPending ? "保存しています…" : "保存"}
                </Button>
              </div>
              {save.isError && Object.keys(fieldErrorsFromApi(save.error)).length === 0 ? (
                <ResponseMessage tone="danger">
                  {`保存できませんでした。${errorMessage(save.error)}`}
                </ResponseMessage>
              ) : null}
            </div>
          </form>
          {sections.map(({ id, Component }) => (
            <Component key={id} event={event} checkin={checkin} />
          ))}
          <div className="flex flex-col items-start gap-xxs border-t border-border pt-xs">
            <Button
              type="button"
              variant="danger"
              className="min-h-xl"
              aria-disabled={pending || undefined}
              onClick={() => {
                if (!pending) setConfirming(true);
              }}
            >
              取り消す
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
