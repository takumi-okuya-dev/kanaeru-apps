// A3 の直す・取り消すの枠（EXPERIENCE.md：名前と3つのチップを直して「保存」。下に危ないの色で「取り消す」）。
// 取り消しの確かめは枠を重ねず、同じ枠の中で切り替えて出す（「このチェックインを取り消します。アンケートの回答があれば一緒に消えます」。AD-7）。
// 同じ名前の印がある手でのチェックインには、LINE のほうを残してまとめる1文を出す。
// 主催者が手でのチェックインを開いたときだけ、ほかの領域が登録した節（差しこみの場所。research R10）を出す。
// 割引（reception-002）：チップは交流会の使っている割引と、今の割引（使うのをやめていれば写した名前と額）。紹介者の名前は主催者だけが
// 読む：主催者は今の名前を出して直せ（空にすると消える）、受付係は空の欄に入れたときだけ置きかえる（空なら送らない。research R7）。
import type { EventView } from "@workspace/contracts/event";
import type { CheckinInput, CheckinView } from "@workspace/contracts/reception";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
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
import type { DiscountChoice } from "./format.ts";
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
 * 直す枠で選べる割引（交流会の使っている割引。今の割引が使うのをやめたものなら、写した名前と額で最後に足す）。
 * @param event 交流会
 * @param checkin チェックイン
 * @returns 割引
 */
function editableDiscounts(event: EventView, checkin: CheckinView): DiscountChoice[] {
  const discounts: DiscountChoice[] = [...event.discounts];
  if (
    checkin.discountId !== null &&
    checkin.discountName !== null &&
    checkin.discountAmount !== null &&
    !discounts.some((discount) => discount.id === checkin.discountId)
  ) {
    discounts.push({
      id: checkin.discountId,
      name: checkin.discountName,
      amount: checkin.discountAmount,
      asksReferrer: false,
    });
  }
  return discounts;
}

/**
 * 直す・取り消すの枠。
 * @param props 交流会（event）・チェックイン（checkin）・閉じる（onClose）・済んだとき（onDone）
 * @returns 枠の要素
 */
export function CheckinEditDialog({ event, checkin, onClose, onDone }: CheckinEditDialogProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const organizer = event.myRole === "organizer";
  // 受付係は紹介者の名前を読めない（答えでは null）ので、欄はいつも空で始まる
  const initialReferrer = organizer ? (checkin.referrerName ?? "") : "";
  const [values, setValues] = useState<CheckinFormValues>({
    name: checkin.name,
    applicationSource: checkin.applicationSource,
    referral: checkin.referral,
    paymentMethod: checkin.paymentMethod,
    discountId: checkin.discountId,
    referrerName: initialReferrer,
  });
  const discounts = editableDiscounts(event, checkin);

  /**
   * 欄の値を変える（割引を元の割引に戻したときは、紹介者の欄も元の値に戻す）。
   * @param next 新しい値
   */
  const changeValues = (next: CheckinFormValues) => {
    const backToOriginal =
      next.discountId !== values.discountId && next.discountId === checkin.discountId;
    setValues(backToOriginal ? { ...next, referrerName: initialReferrer } : next);
  };
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
  // ほかの端末で先に取り消されていたとき（404 CHECKIN_NOT_FOUND）も、deleteCheckin が取り消せたものとして返す
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
    const result = validateCheckinForm(values, { omitEmptyReferrer: !organizer });
    if (!result.ok) {
      setErrors(result.errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    save.mutate(result.input);
  };

  const manual = checkin.method === "manual";
  const sections = organizer && manual ? checkinPanelSections() : [];

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
          <ButtonRow>
            <Button
              type="button"
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
              aria-disabled={pending || undefined}
              aria-busy={remove.isPending || undefined}
              onClick={() => {
                if (!pending) remove.mutate();
              }}
            >
              {remove.isPending ? "取り消しています…" : "取り消す"}
            </Button>
          </ButtonRow>
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
            <CheckinFields
              values={values}
              onChange={changeValues}
              errors={errors}
              discounts={discounts}
              referrerDescription={
                organizer
                  ? "任意。主催者だけが読みます。空にすると消えます。"
                  : "任意。入れると前の名前を置きかえます。空のままなら変えません。"
              }
              forceReferrerField={
                organizer &&
                values.discountId === checkin.discountId &&
                checkin.referrerName !== null
              }
            />
            <div className="flex flex-col gap-xxs">
              <ButtonRow>
                <Button
                  type="button"
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
                  aria-disabled={pending || undefined}
                  aria-busy={save.isPending || undefined}
                >
                  {save.isPending ? "保存しています…" : "保存"}
                </Button>
              </ButtonRow>
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
          {/* 取り消す（消す操作）は、すぐ上の「保存」と押し間違えないよう、線の下の左に離して置く（ButtonRow にしない） */}
          <div className="flex flex-col items-start gap-xxs border-t border-border pt-xs">
            <Button
              type="button"
              variant="danger"
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
