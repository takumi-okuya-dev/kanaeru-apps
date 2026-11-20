// 席の内訳と変更の帯（主催者・受付係。準備の画面の「定員とキャンセル待ち」と名簿の画面の上で共に使う。booking-004 research R3・
// R10・R16・モックアップ A1・A2）。埋まった席・自前の残り・キャンセル待ち、満員なら「受付を止める媒体」（管理ページへのリンク）、
// 定員を超えたら「n人超えています」（勝手に取り消さない）、当日の空き。日時や場所が変わったら、主催者には「変更を知らせる」
// 「知らせずに済ませる」を出す。主のボタンは置かない（画面の主のボタンは画面の持ち主が決める）。
import type { BookingSetting, ScheduleChange } from "@workspace/contracts/booking";
import { QUOTA_SOURCE_LABELS } from "@workspace/contracts/booking";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { formatEventDateTime } from "../event/index.ts";
import { EXTERNAL_LINK } from "./apply-parts.tsx";
import { BOOKING_QUERY_KEYS } from "./queries.ts";
import { resolveChange } from "./waitlist-api.ts";

/**
 * 内訳の1つ。
 * @param props 名前（label）・中身（children）
 * @param props.label 名前
 * @param props.children 中身
 * @returns 要素
 */
function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-x3s rounded-md border border-border bg-surface px-xs py-xxs">
      <dt className="text-s text-text-sub">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * 日時や場所の変更の帯。
 * @param props 交流会の ID・変更・主催者か
 * @param props.eventId 交流会の ID
 * @param props.change 変更
 * @param props.organizer 主催者か（知らせるボタンを出す）
 * @param props.onResolved 済ませたあと（帯は消えるので、結果の文は呼ぶ側が出す）
 * @returns 帯の要素
 */
export function ChangeBanner({
  eventId,
  change,
  organizer,
  onResolved,
}: {
  eventId: string;
  change: ScheduleChange;
  organizer: boolean;
  onResolved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (notify: boolean) => resolveChange(eventId, notify),
    onSuccess: async (next, notify) => {
      onResolved(
        notify
          ? "申し込んだ人に変更を知らせました。"
          : "知らせずに済ませました（帯を消しました）。",
      );
      queryClient.setQueryData(BOOKING_QUERY_KEYS.setting(eventId), next);
      await queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
    },
  });
  const lines: string[] = [];
  if (change.previousStartsAt !== change.startsAt) {
    lines.push(
      `日時：${formatEventDateTime(change.previousStartsAt)} → ${formatEventDateTime(change.startsAt)}`,
    );
  }
  if (change.previousVenue !== change.venue) {
    lines.push(`場所：${change.previousVenue ?? "なし"} → ${change.venue ?? "なし"}`);
  }
  return (
    <section
      aria-labelledby={`change-${eventId}`}
      className="flex flex-col gap-xxs rounded-md border border-border bg-surface-over p-xs"
    >
      <h3 id={`change-${eventId}`} className="text-m font-bold">
        日時や場所が変わりました
      </h3>
      <ul className="flex flex-col gap-x3s text-m">
        {lines.map((line) => (
          <li key={line} className="break-words">
            {line}
          </li>
        ))}
      </ul>
      <p className="text-s text-text-sub">
        {change.autoNoticeAt
          ? `選ばないままなら、${formatEventDateTime(change.autoNoticeAt)}ごろに申し込んだ人へ自動で知らせます。`
          : "選ばないままなら、30分ほどたってから申し込んだ人へ自動で知らせます。"}
      </p>
      {organizer ? (
        <div className="flex flex-wrap gap-xxs">
          <Button
            className="min-h-xl"
            aria-busy={mutation.isPending || undefined}
            onClick={() => {
              if (!mutation.isPending) mutation.mutate(true);
            }}
          >
            変更を知らせる
          </Button>
          <Button
            variant="text"
            className="min-h-xl"
            onClick={() => {
              if (!mutation.isPending) mutation.mutate(false);
            }}
          >
            知らせずに済ませる
          </Button>
        </div>
      ) : null}
      {mutation.isError ? (
        <ResponseMessage tone="danger">
          {`済ませられませんでした。${errorMessage(mutation.error)}`}
        </ResponseMessage>
      ) : null}
    </section>
  );
}

/**
 * 席の内訳（定員があるとき）と変更の帯。
 * @param props 交流会の ID・設定・主催者か
 * @param props.eventId 交流会の ID
 * @param props.setting 設定
 * @param props.organizer 主催者か
 * @returns 要素（出すものがなければ null）
 */
export function SeatSummary({
  eventId,
  setting,
  organizer,
}: {
  eventId: string;
  setting: BookingSetting;
  organizer: boolean;
}) {
  const { seats, change } = setting;
  const [resolved, setResolved] = useState<string>();
  if (!seats && !change && !resolved) return null;
  const quotaLeft = seats?.quotas.filter((quota) => quota.remaining > 0) ?? [];
  return (
    <div className="flex flex-col gap-xs">
      {change ? (
        <ChangeBanner
          eventId={eventId}
          change={change}
          organizer={organizer}
          onResolved={setResolved}
        />
      ) : null}
      {resolved ? <ResponseMessage tone="success">{resolved}</ResponseMessage> : null}
      {seats ? (
        <div role="group" aria-label="席の内訳" className="flex flex-col gap-xxs">
          <dl className="grid grid-cols-2 gap-xxs wide:grid-cols-4">
            <Tile label="定員">{seats.capacity}</Tile>
            <Tile label="埋まった席">{seats.filled}</Tile>
            <Tile label="自前のページの残り">{seats.selfRemaining}</Tile>
            <Tile label="キャンセル待ち">{seats.waitlisted}</Tile>
          </dl>
          {seats.offered > 0 ? (
            <p className="text-s text-text-sub">{`埋まった席のうち、打診中（返事を待っている）が${seats.offered}人います。`}</p>
          ) : null}
          {seats.full ? (
            <div className="flex flex-col gap-x3s rounded-md border border-danger bg-surface p-xs">
              <p className="text-m font-bold text-danger-text">満員です</p>
              {seats.stopSources.length > 0 ? (
                <>
                  <p className="text-s">ほかの媒体の受付を止めてください：</p>
                  <ul className="flex flex-col gap-x3s">
                    {seats.stopSources.map((source) => (
                      <li key={source.applicationSource} className="flex flex-wrap gap-xxs text-m">
                        <span>{QUOTA_SOURCE_LABELS[source.applicationSource]}</span>
                        {source.manageUrl ? (
                          <a
                            href={source.manageUrl}
                            {...EXTERNAL_LINK}
                            className="inline-flex min-h-xl items-center text-text-link underline"
                          >
                            {`${QUOTA_SOURCE_LABELS[source.applicationSource]}の管理ページを開く`}
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-s">自前のページはキャンセル待ちの受付に切り替わりました。</p>
              )}
            </div>
          ) : seats.selfRemaining === 0 && quotaLeft.length > 0 ? (
            <p className="text-m">
              {`自前のページの席は埋まりました（キャンセル待ちを受け付けています）。媒体の枠の残り：${quotaLeft
                .map(
                  (quota) => `${QUOTA_SOURCE_LABELS[quota.applicationSource]} ${quota.remaining}`,
                )
                .join("・")}`}
            </p>
          ) : null}
          {seats.over > 0 ? (
            <p className="text-m font-bold text-danger-text">{`定員を${seats.over}人超えています（勝手に取り消しません）。`}</p>
          ) : null}
          {seats.sameDay ? (
            <p className="text-m">{`当日の空き：残り${seats.selfRemaining}席を、自前のページで先着で受け付けています。`}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
