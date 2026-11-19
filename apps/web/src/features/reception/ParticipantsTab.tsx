// A3 の参加者のタブ（EXPERIENCE.md：名前・チェックインの時刻・申し込みの媒体・知ったきっかけ・支払い方法〈割引の名前を添える〉と印）。
// 広い画面は表、狭い画面はカードの形。名前を押すと直す・取り消すの枠を開く。上に「手でチェックイン」（タブの中に欄を開く）。
// 5秒おきの読み直しで、画面の位置・フォーカス・開いている枠を動かさない（枠は開いたときの行を持つ）。
import type { EventView } from "@workspace/contracts/event";
import type { CheckinList, CheckinView } from "@workspace/contracts/reception";
import {
  APPLICATION_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  REFERRAL_LABELS,
} from "@workspace/contracts/reception";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { useState } from "react";
import { CheckinEditDialog } from "./CheckinEditDialog.tsx";
import { ManualCheckinForm } from "./ManualCheckinForm.tsx";
import { ManualFlag, SameNameFlag } from "./flags.tsx";
import { formatCheckinTime, formatCount } from "./format.ts";
import { RECEPTION_QUERY_KEYS } from "./queries.ts";

/**
 * 支払い方法の言葉（割引を選んでいれば名前を添える。例：PayPay・紹介割。reception-002）。
 * @param checkin チェックイン
 * @returns 言葉
 */
function paymentLabel(checkin: CheckinView): string {
  const payment = PAYMENT_METHOD_LABELS[checkin.paymentMethod];
  return checkin.discountName ? `${payment}・${checkin.discountName}` : payment;
}

/** 名前のボタンの見た目（文字だけのボタンは下線つき。押せる高さを取る）。 */
const nameButtonClassName =
  "min-h-l cursor-pointer text-left text-m font-bold break-words text-text-link underline underline-offset-2";

/**
 * 行の印（手でのチェックイン・同じ名前）。
 * @param props チェックイン（checkin）
 * @param props.checkin チェックイン
 * @returns 印の要素（なければ null）
 */
function RowFlags({ checkin }: { checkin: CheckinView }) {
  if (checkin.method !== "manual" && !checkin.sameName) return null;
  return (
    <span className="flex flex-wrap gap-x3s">
      {checkin.method === "manual" ? <ManualFlag enteredByName={checkin.enteredByName} /> : null}
      {checkin.sameName ? <SameNameFlag /> : null}
    </span>
  );
}

/** 名前のボタンが受け取るもの。 */
type NameButtonProps = {
  /** チェックイン */
  checkin: CheckinView;
  /** 押したとき */
  onOpen: (checkin: CheckinView) => void;
};

/**
 * 名前のボタン（押すと直す・取り消すの枠を開く）。
 * @param props チェックイン（checkin）・押したとき（onOpen）
 * @returns ボタンの要素
 */
function NameButton({ checkin, onOpen }: NameButtonProps) {
  return (
    <button type="button" className={nameButtonClassName} onClick={() => onOpen(checkin)}>
      {checkin.name}
      <span className="sr-only">（直す・取り消す）</span>
    </button>
  );
}

/** ParticipantsTab が受け取るもの。 */
export type ParticipantsTabProps = {
  /** 交流会（役目つき） */
  event: EventView;
  /** チェックインの一覧（読みこみ中は undefined） */
  list: CheckinList | undefined;
};

/**
 * 参加者のタブの中身。
 * @param props 交流会（event）・一覧（list）
 * @returns 要素
 */
export function ParticipantsTab({ event, list }: ParticipantsTabProps) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<CheckinView>();
  const [message, setMessage] = useState<string>();

  /**
   * 書いたあとに、一覧と合計をその場で読み直す。
   * @param text ボタンの近くに出す文
   */
  const afterWrite = (text: string) => {
    setMessage(text);
    void queryClient.invalidateQueries({ queryKey: RECEPTION_QUERY_KEYS.all });
  };

  const checkins = list?.checkins ?? [];
  return (
    <div className="flex flex-col gap-xs">
      {adding ? (
        <ManualCheckinForm
          eventId={event.id}
          discounts={event.discounts}
          onCancel={() => setAdding(false)}
          onDone={(created) => {
            setAdding(false);
            afterWrite(`${created.name}さんをチェックインしました。`);
          }}
        />
      ) : (
        <div>
          <Button
            variant="primary"
            className="min-h-xl"
            onClick={() => {
              setMessage(undefined);
              setAdding(true);
            }}
          >
            手でチェックイン
          </Button>
        </div>
      )}
      {message ? <ResponseMessage tone="success">{message}</ResponseMessage> : null}
      {list === undefined ? (
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      ) : checkins.length === 0 ? (
        <p className="text-m">まだチェックインした人はいません。</p>
      ) : (
        <>
          <p className="text-m">{`${formatCount(checkins.length)}がチェックインしています。`}</p>
          <div className="hidden wide:block">
            <Table>
              <TableCaption className="sr-only">参加者（チェックインの新しい順）</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>名前</TableHead>
                  <TableHead>時刻</TableHead>
                  <TableHead>申し込みの媒体</TableHead>
                  <TableHead>知ったきっかけ</TableHead>
                  <TableHead>支払い方法</TableHead>
                  <TableHead>印</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkins.map((checkin) => (
                  <TableRow key={checkin.id}>
                    {/* 名前は途中で折り返さない（「佐藤 一 / 郎」にしない。印の列が残りの幅を使う） */}
                    <TableCell className="whitespace-nowrap">
                      <NameButton checkin={checkin} onOpen={setTarget} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCheckinTime(checkin.checkedInAt)}
                    </TableCell>
                    <TableCell>{APPLICATION_SOURCE_LABELS[checkin.applicationSource]}</TableCell>
                    <TableCell>{REFERRAL_LABELS[checkin.referral]}</TableCell>
                    <TableCell>{paymentLabel(checkin)}</TableCell>
                    <TableCell>
                      <RowFlags checkin={checkin} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul
            aria-label="参加者（チェックインの新しい順）"
            className="flex flex-col gap-xxs wide:hidden"
          >
            {checkins.map((checkin) => (
              <li
                key={checkin.id}
                className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
              >
                <div className="flex items-start justify-between gap-xs">
                  <NameButton checkin={checkin} onOpen={setTarget} />
                  <span className="shrink-0 text-s text-text-sub tabular-nums">
                    {formatCheckinTime(checkin.checkedInAt)}
                  </span>
                </div>
                <p className="text-s">
                  {`${paymentLabel(checkin)}・${APPLICATION_SOURCE_LABELS[checkin.applicationSource]}・${REFERRAL_LABELS[checkin.referral]}`}
                </p>
                <RowFlags checkin={checkin} />
              </li>
            ))}
          </ul>
        </>
      )}
      {target ? (
        <CheckinEditDialog
          key={target.id}
          event={event}
          checkin={target}
          onClose={() => setTarget(undefined)}
          onDone={(text) => {
            setTarget(undefined);
            afterWrite(text);
          }}
        />
      ) : null}
    </div>
  );
}
