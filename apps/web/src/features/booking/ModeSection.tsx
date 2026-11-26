// 準備の画面（A4）の「使い方」の節（主催者だけ。event の差しこみの場所 registerSetupSection から出す。booking-001 research R1・R13）。
// 選ぶカード（受付だけ・名簿を使う・自前で申込みを受ける〈booking-003〉）と「使い方を変える」。名簿に行がある交流会を「受付だけ」に戻すときは確かめの枠を出す
// （名簿は消さずに隠す。FR-B13）。保存した使い方は、ナビの「名簿」も読む（同じ問い合わせの鍵）。
// 今の使い方が自前なら、その下に「申込みページ」の節（受付を開く・閉じる・見せる範囲・URL。SelfPageSection）を出す。
// 名簿を使う・自前なら「定員とキャンセル待ち」の節（定員・媒体の枠・席の内訳・変更の帯・中止。CapacitySection。booking-004）。
// CapacitySection は約束の zod の形（CapacityInput）を読むので、開いたときに別に読む（この節は準備の画面と一緒に最初に読まれ、
// zod の設定〈jitless〉より先に形が作られると CSP の eval の違反になるため。booking-003 research R23）。
import type { EventView } from "@workspace/contracts/event";
import {
  BOOKING_MODES,
  BOOKING_MODE_DESCRIPTIONS,
  BOOKING_MODE_LABELS,
} from "@workspace/contracts/booking";
import type { BookingMode } from "@workspace/contracts/booking";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { cn } from "@workspace/ui/lib/cn";
import { Suspense, lazy, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { saveSetting } from "./api.ts";
import { SelfPageSection } from "./SelfPageSection.tsx";
import { BOOKING_QUERY_KEYS, useBookingSetting } from "./queries.ts";

/** 定員とキャンセル待ちの節（開いたときに読む）。 */
const CapacitySection = lazy(async () => ({
  default: (await import("./CapacitySection.tsx")).CapacitySection,
}));

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
    if (
      selected === "reception" &&
      current !== "reception" &&
      (setting.data?.entryCount ?? 0) > 0
    ) {
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
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button
            aria-disabled={mutation.isPending || setting.isPending || undefined}
            onClick={save}
          >
            {mutation.isPending ? "変えています…" : "使い方を変える"}
          </Button>
        </ButtonRow>
        {saved ? (
          <ResponseMessage tone="success">
            {selected === "roster"
              ? "名簿を使うにしました。ナビの「名簿」から名簿を作れます。"
              : selected === "self_page"
                ? "自前で申込みを受けるにしました。下の「申込みページ」で受付を開いてください。"
                : "受付だけにしました。"}
          </ResponseMessage>
        ) : null}
        {mutation.isError && !confirming ? (
          <ResponseMessage tone="danger">
            {`変えられませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
      {setting.data?.mode === "self_page" ? (
        <SelfPageSection event={event} setting={setting.data} />
      ) : null}
      {setting.data && setting.data.mode !== "reception" ? (
        <Suspense fallback={<p className="text-s text-text-sub">読みこんでいます…</p>}>
          <CapacitySection key={setting.data.mode} event={event} setting={setting.data} />
        </Suspense>
      ) : null}
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
        <p>{`名簿の${setting.data?.entryCount ?? 0}人分は消さずに隠します。ナビから「名簿」が消え、受付係の画面でも名簿に当てられなくなります。申込みページもなくなります。`}</p>
        <p>また「名簿を使う」にすると、前の名簿が出ます。</p>
      </ConfirmDialog>
    </section>
  );
}
