// 準備の画面（A4）の「使い方」の節（主催者だけ。event の差しこみの場所 registerSetupSection から出す。booking-001 research R1・R13）。
// 選ぶカード（受付だけ・名簿を使う）と「使い方を変える」。名簿に行がある交流会を「受付だけ」に戻すときは確かめの枠を出す
// （名簿は消さずに隠す。FR-B13）。保存した使い方は、ナビの「名簿」も読む（同じ問い合わせの鍵）。
import type { EventView } from "@workspace/contracts/event";
import {
  BOOKING_MODES,
  BOOKING_MODE_DESCRIPTIONS,
  BOOKING_MODE_LABELS,
} from "@workspace/contracts/booking";
import type { BookingMode } from "@workspace/contracts/booking";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { cn } from "@workspace/ui/lib/cn";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { saveSetting } from "./api.ts";
import { BOOKING_QUERY_KEYS, useBookingSetting } from "./queries.ts";

/**
 * 「使い方」の節。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns 節の要素
 */
export function ModeSection({ event }: { event: EventView }) {
  const queryClient = useQueryClient();
  const setting = useBookingSetting(event.id);
  const [chosen, setChosen] = useState<BookingMode>();
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: (mode: BookingMode) => saveSetting(event.id, mode),
    onSuccess: async (next) => {
      queryClient.setQueryData(BOOKING_QUERY_KEYS.setting(event.id), next);
      setConfirming(false);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
    },
  });
  const current = setting.data?.mode;
  const selected = chosen ?? current ?? "reception";

  /** 保存する（受付だけに戻すときで名簿に行があれば、先に確かめる）。 */
  const save = () => {
    if (mutation.isPending) return;
    setSaved(false);
    mutation.reset();
    if (selected === "reception" && current === "roster" && (setting.data?.entryCount ?? 0) > 0) {
      setConfirming(true);
      return;
    }
    mutation.mutate(selected);
  };

  return (
    <section aria-labelledby="setup-booking-mode" className="flex flex-col gap-xs">
      <h2 id="setup-booking-mode" className="text-l leading-tight font-bold">
        使い方
      </h2>
      {setting.isError ? (
        <ResponseMessage tone="danger">{errorMessage(setting.error)}</ResponseMessage>
      ) : null}
      <fieldset className="flex flex-col gap-xxs">
        <legend className="sr-only">使い方</legend>
        <div className="grid gap-xxs wide:grid-cols-2">
          {BOOKING_MODES.map((mode) => {
            const checked = selected === mode;
            return (
              <label
                key={mode}
                className={cn(
                  "flex min-h-xl cursor-pointer items-start gap-xxs rounded-sm border bg-surface p-xs",
                  checked ? "border-primary bg-primary-subtle" : "border-border-input",
                )}
              >
                <input
                  type="radio"
                  name="booking-mode"
                  value={mode}
                  checked={checked}
                  onChange={() => {
                    setChosen(mode);
                    setSaved(false);
                  }}
                  className="mt-x3s size-xs accent-primary"
                />
                <span className="flex flex-col gap-x3s">
                  <span className="text-m font-bold">{BOOKING_MODE_LABELS[mode]}</span>
                  <span className={checked ? "text-s text-text" : "text-s text-text-sub"}>
                    {BOOKING_MODE_DESCRIPTIONS[mode]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="text-s text-text-sub">
        「自前で申込みを受ける」（申込みのページ・定員・キャンセル待ち）は、次の版で選べるようになります。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <Button aria-disabled={mutation.isPending || setting.isPending || undefined} onClick={save}>
          {mutation.isPending ? "変えています…" : "使い方を変える"}
        </Button>
        {saved ? (
          <ResponseMessage tone="success">
            {selected === "roster"
              ? "名簿を使うにしました。ナビの「名簿」から名簿を作れます。"
              : "受付だけにしました。"}
          </ResponseMessage>
        ) : null}
        {mutation.isError && !confirming ? (
          <ResponseMessage tone="danger">
            {`変えられませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="受付だけに戻しますか"
        confirmLabel="受付だけに戻す"
        pendingLabel="戻しています…"
        pending={mutation.isPending}
        error={mutation.isError ? errorMessage(mutation.error) : undefined}
        onConfirm={() => mutation.mutate("reception")}
      >
        <p>{`名簿の${setting.data?.entryCount ?? 0}人分は消さずに隠します。ナビから「名簿」が消え、受付係の画面でも名簿に当てられなくなります。`}</p>
        <p>また「名簿を使う」にすると、前の名簿が出ます。</p>
      </ConfirmDialog>
    </section>
  );
}
