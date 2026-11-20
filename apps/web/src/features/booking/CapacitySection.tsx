// 準備の画面の「定員とキャンセル待ち」の節（主催者だけ。使い方が名簿を使う・自前のとき。booking-004 US1・US6・research R16・
// モックアップ A1）。定員（空＝定員なし）と媒体の枠（connpass・Peatix・その他。席の数が空なら枠なし・管理ページの URL は任意）と
// 「定員を保存する」、席の内訳と変更の帯（SeatSummary）、自前なら「予約を中止する」（確かめの枠。戻せない）。
// 名簿を使う交流会では、定員は人数の目安と超えた人数だけ（キャンセル待ちにならない）。主のボタンは置かない。
import type {
  BookingSetting,
  CapacityInput as CapacityInputValue,
} from "@workspace/contracts/booking";
import {
  CAPACITY_MAX,
  CapacityInput,
  QUOTA_SOURCES,
  QUOTA_SOURCE_LABELS,
} from "@workspace/contracts/booking";
import type { QuotaSource } from "@workspace/contracts/booking";
import type { EventView } from "@workspace/contracts/event";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { BOOKING_QUERY_KEYS } from "./queries.ts";
import { SeatSummary } from "./SeatSummary.tsx";
import { cancelBooking, saveCapacity } from "./waitlist-api.ts";

/** 欄の値（文字のまま持つ）。 */
type FormValues = {
  capacity: string;
  quotas: Record<QuotaSource, { seats: string; manageUrl: string }>;
};

/**
 * 設定から欄の初めの値を作る。
 * @param setting 設定
 * @returns 欄の値
 */
function initialValues(setting: BookingSetting): FormValues {
  const quotas = Object.fromEntries(
    QUOTA_SOURCES.map((source) => {
      const quota = setting.quotas.find((item) => item.applicationSource === source);
      return [
        source,
        { seats: quota ? String(quota.seats) : "", manageUrl: quota?.manageUrl ?? "" },
      ];
    }),
  ) as FormValues["quotas"];
  return { capacity: setting.capacity === null ? "" : String(setting.capacity), quotas };
}

/**
 * 欄の値を入力の形にする（空の席は枠なし・空の URL は null）。
 * @param values 欄の値
 * @returns 入力
 */
function toInput(values: FormValues): CapacityInputValue {
  const number = (text: string) => (text.trim() === "" ? null : Number(text.trim()));
  return {
    capacity: number(values.capacity),
    quotas: QUOTA_SOURCES.flatMap((source) => {
      const seats = number(values.quotas[source].seats);
      if (seats === null) return [];
      const url = values.quotas[source].manageUrl.trim();
      return [{ applicationSource: source, seats, manageUrl: url === "" ? null : url }];
    }),
  };
}

/**
 * 「定員とキャンセル待ち」の節。
 * @param props 交流会と設定
 * @param props.event 交流会
 * @param props.setting 設定（使い方が受付だけでないもの）
 * @returns 節の要素
 */
export function CapacitySection({ event, setting }: { event: EventView; setting: BookingSetting }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormValues>(() => initialValues(setting));
  const [formError, setFormError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const selfPage = setting.mode === "self_page";

  /**
   * 答えを問い合わせに入れ、予約のほかの問い合わせも読み直す。
   * @param next 設定
   */
  const store = async (next: BookingSetting) => {
    queryClient.setQueryData(BOOKING_QUERY_KEYS.setting(event.id), next);
    await queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
  };
  const save = useMutation({
    mutationFn: (input: CapacityInputValue) => saveCapacity(event.id, input),
    onSuccess: async (next) => {
      setSaved(true);
      setValues(initialValues(next));
      await store(next);
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelBooking(event.id),
    onSuccess: async (next) => {
      setConfirmingCancel(false);
      await store(next);
    },
  });

  /**
   * 保存する。
   * @param submitted フォームの送信
   */
  const submit = (submitted: React.FormEvent<HTMLFormElement>) => {
    submitted.preventDefault();
    if (save.isPending) return;
    setSaved(false);
    const parsed = CapacityInput.safeParse(toInput(values));
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "入力を確かめてください。");
      return;
    }
    setFormError(undefined);
    save.mutate(parsed.data);
  };

  /**
   * 枠の欄を変える。
   * @param source 媒体
   * @param key 欄
   * @param text 値
   */
  const setQuota = (source: QuotaSource, key: "seats" | "manageUrl", text: string) => {
    setSaved(false);
    setValues({
      ...values,
      quotas: { ...values.quotas, [source]: { ...values.quotas[source], [key]: text } },
    });
  };

  return (
    <section
      aria-labelledby="setup-capacity"
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-xs"
    >
      <h3 id="setup-capacity" className="text-m leading-tight font-bold">
        {selfPage ? "定員とキャンセル待ち" : "定員（目安）"}
      </h3>
      <p className="text-s text-text-sub">
        {selfPage
          ? "定員を入れると、埋まった席（確定と打診中）が定員に届いたとき、申込みページはキャンセル待ちの受付に切り替わります。席が空くと、キャンセル待ちの先頭に期限つきで打診します。"
          : "名簿を使う交流会では、定員は人数の目安です。超えたら人数を出します（キャンセル待ちにはなりません）。"}
      </p>
      <SeatSummary eventId={event.id} setting={setting} organizer />
      <form noValidate onSubmit={submit} className="flex flex-col gap-xs">
        <Field label="定員" description={`空にすると定員なし（${CAPACITY_MAX}人まで）。`}>
          <Input
            inputMode="numeric"
            value={values.capacity}
            onChange={(change) => {
              setSaved(false);
              setValues({ ...values, capacity: change.target.value });
            }}
          />
        </Field>
        <fieldset className="flex flex-col gap-xxs">
          <legend className="text-s font-bold">媒体の枠（任意）</legend>
          <p className="text-s text-text-sub">
            外の媒体に回す席の数です。枠の席は、その媒体の申込みのために空けておきます（一度満員になったら空けておくのをやめ、空いた席はキャンセル待ちに回します）。
          </p>
          {QUOTA_SOURCES.map((source) => (
            <div key={source} className="grid gap-xxs wide:grid-cols-2">
              <Field label={`${QUOTA_SOURCE_LABELS[source]}の席の数`} description="空なら枠なし">
                <Input
                  inputMode="numeric"
                  value={values.quotas[source].seats}
                  onChange={(change) => setQuota(source, "seats", change.target.value)}
                />
              </Field>
              <Field
                label={`${QUOTA_SOURCE_LABELS[source]}の管理ページの URL`}
                description="任意。満員のとき、ここへのリンクを出します。"
              >
                <Input
                  type="url"
                  value={values.quotas[source].manageUrl}
                  onChange={(change) => setQuota(source, "manageUrl", change.target.value)}
                />
              </Field>
            </div>
          ))}
        </fieldset>
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit" className="min-h-xl" aria-busy={save.isPending || undefined}>
            {save.isPending ? "保存しています…" : "定員を保存する"}
          </Button>
          {formError ? <ResponseMessage tone="danger">{formError}</ResponseMessage> : null}
          {saved ? <ResponseMessage tone="success">定員を保存しました。</ResponseMessage> : null}
          {save.isError ? (
            <ResponseMessage tone="danger">
              {`保存できませんでした。${errorMessage(save.error)}`}
            </ResponseMessage>
          ) : null}
        </div>
      </form>
      {selfPage ? (
        setting.cancelled ? (
          <p className="text-m font-bold">
            予約を中止しました。申込みページは「中止になりました」を出しています。
          </p>
        ) : (
          <div className="flex flex-col items-start gap-x3s border-t border-border pt-xs">
            <Button
              variant="text"
              className="min-h-xl text-danger-text"
              onClick={() => {
                cancel.reset();
                setConfirmingCancel(true);
              }}
            >
              予約を中止する
            </Button>
            <p className="text-s text-text-sub">
              雨天などで会をやめるとき。申し込んだ人みなに中止を知らせます。
            </p>
          </div>
        )
      ) : null}
      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title="予約を中止しますか"
        confirmLabel="中止する"
        pendingLabel="中止しています…"
        danger
        pending={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : undefined}
        onConfirm={() => cancel.mutate()}
      >
        <p>{`${event.name}の確定・打診中・キャンセル待ちの申込みを、すべて取り消しにして中止を知らせます。`}</p>
        <p>中止は戻せません。申込みページは「中止になりました」になり、受付を開けなくなります。</p>
      </ConfirmDialog>
    </section>
  );
}
