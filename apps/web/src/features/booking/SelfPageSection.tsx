// 準備の画面の「申込みページ」の節（主催者だけ。使い方が自前のとき。booking-003 US2・research R13・モックアップ A1）。
// 受付の状態（受付中・閉じています・始まりを過ぎたので閉じました）と「受付を開く」／「受付を閉じる」、見せる範囲（誰でも・部員だけ。
// 組織に入れていなければ部員だけを選べない）、ページの URL とコピー。既定は閉じる（ステージングなしの守り）。
import type { BookingSetting, Visibility } from "@workspace/contracts/booking";
import { VISIBILITIES, VISIBILITY_LABELS } from "@workspace/contracts/booking";
import type { EventView } from "@workspace/contracts/event";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { cn } from "@workspace/ui/lib/cn";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { saveSelfPage } from "./apply-api.ts";
import { applyPageUrl } from "./links.ts";
import { BOOKING_QUERY_KEYS } from "./queries.ts";

/**
 * 受付の状態の文。
 * @param setting 設定
 * @returns 文
 */
function stateText(setting: BookingSetting): string {
  if (setting.cancelled) return "予約を中止したので、申込みは受け付けていません。";
  if (setting.started) return "始まりを過ぎたので、受付は自動で閉じました。";
  return setting.accepting
    ? "受付中です。ページから申し込めます。"
    : "受付を閉じています。開くまで、ページから申し込めません。";
}

/**
 * 「申込みページ」の節。
 * @param props 交流会と設定
 * @param props.event 交流会
 * @param props.setting 設定（使い方が自前のもの）
 * @returns 節の要素
 */
export function SelfPageSection({ event, setting }: { event: EventView; setting: BookingSetting }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const mutation = useMutation({
    mutationFn: (input: { accepting: boolean; visibility: Visibility }) =>
      saveSelfPage(event.id, input),
    onSuccess: (next, input) => {
      queryClient.setQueryData(BOOKING_QUERY_KEYS.setting(event.id), next);
      setMessage(
        input.accepting !== setting.accepting
          ? input.accepting
            ? "受付を開きました。"
            : "受付を閉じました。"
          : `見せる範囲を「${VISIBILITY_LABELS[input.visibility]}」にしました。`,
      );
    },
  });
  const url = applyPageUrl(event.id);

  /**
   * 変える。
   * @param input 受付と見せる範囲
   * @param input.accepting 受付を開くか
   * @param input.visibility 見せる範囲
   */
  const save = (input: { accepting: boolean; visibility: Visibility }) => {
    if (mutation.isPending) return;
    setMessage(undefined);
    mutation.mutate(input);
  };

  /** URL をコピーする。 */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("コピーしました。");
    } catch {
      setCopied("コピーできませんでした。URL を選んでコピーしてください。");
    }
  };

  return (
    <section
      aria-labelledby="setup-self-page"
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-xs"
    >
      <h3 id="setup-self-page" className="text-m leading-tight font-bold">
        申込みページ
      </h3>
      <p className="text-m">{stateText(setting)}</p>
      {setting.started || setting.cancelled ? null : (
        <ButtonRow>
          <Button
            aria-busy={mutation.isPending || undefined}
            onClick={() => save({ accepting: !setting.accepting, visibility: setting.visibility })}
          >
            {setting.accepting ? "受付を閉じる" : "受付を開く"}
          </Button>
        </ButtonRow>
      )}
      <fieldset className="flex flex-col gap-xxs">
        <legend className="text-s font-bold">見せる範囲</legend>
        <div className="flex flex-wrap gap-xxs">
          {VISIBILITIES.map((visibility) => {
            const disabled = visibility === "members" && !setting.inOrganization;
            const checked = setting.visibility === visibility;
            return (
              <label
                key={visibility}
                className={cn(
                  "flex min-h-xl items-center gap-xxs rounded-sm border px-xs",
                  checked ? "border-primary bg-primary-subtle font-bold" : "border-border-input",
                  disabled ? "text-text-sub" : "cursor-pointer",
                )}
              >
                <input
                  type="radio"
                  name="self-page-visibility"
                  value={visibility}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => save({ accepting: setting.accepting, visibility })}
                  className="size-xs accent-primary"
                />
                {VISIBILITY_LABELS[visibility]}
              </label>
            );
          })}
        </div>
        <p className="text-s text-text-sub">
          {setting.inOrganization
            ? "部員だけにすると、部員と主催者だけがページを見て申し込めます。"
            : "部員だけにするには、交流会を組織に入れてください（組織に入れると選べます）。"}
        </p>
      </fieldset>
      <div className="flex flex-col gap-xxs">
        <p className="text-s font-bold">ページの URL</p>
        <p className="rounded-sm border border-border bg-surface-over p-xxs text-s break-all">
          <code>{url}</code>
        </p>
        <div className="flex flex-col items-start gap-xxs">
          <ButtonRow>
            <Button onClick={() => void copy()}>URL をコピーする</Button>
          </ButtonRow>
          {copied ? <ResponseMessage tone="info">{copied}</ResponseMessage> : null}
        </div>
        <p className="text-s text-text-sub">
          Threads
          や掲載サイトの本文に貼ります。始まりを過ぎると自動で閉じます。定員は下の「定員とキャンセル待ち」で入れられます。
        </p>
      </div>
      {message ? <ResponseMessage tone="success">{message}</ResponseMessage> : null}
      {mutation.isError ? (
        <ResponseMessage tone="danger">
          {`変えられませんでした。${errorMessage(mutation.error)}`}
        </ResponseMessage>
      ) : null}
    </section>
  );
}
