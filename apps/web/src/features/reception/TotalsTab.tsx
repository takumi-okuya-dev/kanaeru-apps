// A3 の合計のタブ（DESIGN.md の合計のカード・UJ-4）と、主催者だけの内訳（FR-13。合計の下に置く。EXPERIENCE Open Questions 3）。
// 数字は桁がそろう数字で右寄せ。金額は「円」をつけ3桁ごとに区切る。現金の行も読み間違えない大きさにする。色で多い少ないを表さない。
// 内訳を初めに読めなかったときは、内訳の節に文と「もう一度」を出す（合計は出したまま）。
// 割引（reception-002）：割引があった交流会では、内訳に「割引の内訳」（人数・割引の額の合計）と、紹介者がいれば「紹介者」（人数）を足す。
// 紹介者の名前は主催者だけが読む（内訳は主催者だけの窓口）。
import type { CheckinBreakdown, CheckinTotals } from "@workspace/contracts/reception";
import {
  APPLICATION_SOURCE_LABELS,
  CHECKIN_QUESTION_LABELS,
  DISCOUNT_NONE_LABEL,
  PAYMENT_METHOD_LABELS,
  REFERRAL_LABELS,
} from "@workspace/contracts/reception";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { errorMessage } from "../../lib/api.ts";
import { formatFee } from "../event/index.ts";
import { formatCount } from "./format.ts";

/**
 * 支払い方法ごとの合計のカード。
 * @param props 合計（totals）
 * @param props.totals 支払い方法ごとの合計
 * @returns 要素
 */
function TotalsCard({ totals }: { totals: CheckinTotals }) {
  return (
    <div className="rounded-md border border-border bg-surface p-xs">
      <table className="w-full border-collapse text-l">
        <caption className="pb-xxs text-left text-m font-bold">支払い方法ごとの合計</caption>
        <thead>
          <tr className="text-s text-text-sub">
            <th scope="col" className="py-x3s text-left font-normal">
              支払い方法
            </th>
            <th scope="col" className="py-x3s pl-xs text-right font-normal">
              人数
            </th>
            <th scope="col" className="py-x3s pl-xs text-right font-normal">
              金額
            </th>
          </tr>
        </thead>
        <tbody>
          {totals.byPaymentMethod.map((row) => (
            <tr key={row.paymentMethod} className="border-t border-border">
              <th scope="row" className="py-xxs text-left font-normal break-keep">
                {PAYMENT_METHOD_LABELS[row.paymentMethod]}
              </th>
              <td className="py-xxs pl-xs text-right whitespace-nowrap tabular-nums">
                {formatCount(row.count)}
              </td>
              <td className="py-xxs pl-xs text-right whitespace-nowrap tabular-nums">
                {formatFee(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border text-xl font-bold">
            <th scope="row" className="pt-xxs text-left">
              合計
            </th>
            <td className="pt-xxs pl-xs text-right whitespace-nowrap tabular-nums">
              {formatCount(totals.total.count)}
            </td>
            <td className="pt-xxs pl-xs text-right whitespace-nowrap tabular-nums">
              {formatFee(totals.total.amount)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** 内訳の表が受け取るもの。 */
type BreakdownTableProps = {
  /** 題 */
  title: string;
  /** 行（言葉と人数） */
  rows: readonly { label: string; count: number }[];
};

/**
 * 内訳の表（選択肢ごとの人数）。
 * @param props 題（title）・行（rows）
 * @returns 要素
 */
function BreakdownTable({ title, rows }: BreakdownTableProps) {
  return (
    <table className="w-full border-collapse rounded-md border border-border bg-surface text-m">
      <caption className="pb-xxs text-left text-m font-bold">{title}</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t border-border first:border-t-0">
            <th scope="row" className="px-xs py-xxs text-left font-normal">
              {row.label}
            </th>
            <td className="px-xs py-xxs text-right tabular-nums">{formatCount(row.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 割引の内訳の表（割引ごとの人数と割引の額の合計。最後に割引なし）。
 * @param props 割引の内訳（rows）
 * @param props.rows 割引の内訳の行
 * @returns 要素
 */
function DiscountBreakdownTable({ rows }: { rows: CheckinBreakdown["discounts"] }) {
  return (
    <table className="w-full border-collapse rounded-md border border-border bg-surface text-m">
      <caption className="pb-xxs text-left text-m font-bold">{`${CHECKIN_QUESTION_LABELS.discount}の内訳`}</caption>
      <thead>
        <tr className="text-s text-text-sub">
          <th scope="col" className="px-xs py-x3s text-left font-normal">
            {CHECKIN_QUESTION_LABELS.discount}
          </th>
          <th scope="col" className="px-xs py-x3s text-right font-normal">
            人数
          </th>
          <th scope="col" className="px-xs py-x3s text-right font-normal">
            割引の額の合計
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.discountId ?? "none"} className="border-t border-border">
            <th scope="row" className="px-xs py-xxs text-left font-normal break-words">
              {row.name ?? DISCOUNT_NONE_LABEL}
              {row.active ? null : (
                <span className="text-s text-text-sub">（使うのをやめた割引）</span>
              )}
            </th>
            <td className="px-xs py-xxs text-right tabular-nums">{formatCount(row.count)}</td>
            <td className="px-xs py-xxs text-right tabular-nums">
              {row.discountId === null ? "—" : formatFee(row.discountTotal)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** TotalsTab が受け取るもの。 */
export type TotalsTabProps = {
  /** 合計（読みこみ中は undefined） */
  totals: CheckinTotals | undefined;
  /** 内訳（主催者だけ。受付係・読みこみ中は undefined） */
  breakdown: CheckinBreakdown | undefined;
  /** 内訳を出すか（主催者） */
  showBreakdown: boolean;
  /** 内訳を初めに読めなかったときの投げられたもの（読めた・読みこみ中は undefined） */
  breakdownError?: unknown;
  /** 内訳をもう一度読む */
  onRetryBreakdown?: () => void;
};

/**
 * 合計のタブの中身。
 * @param props 合計（totals）・内訳（breakdown）・内訳を出すか（showBreakdown）・内訳の失敗（breakdownError）・もう一度（onRetryBreakdown）
 * @returns 要素
 */
export function TotalsTab({
  totals,
  breakdown,
  showBreakdown,
  breakdownError,
  onRetryBreakdown,
}: TotalsTabProps) {
  if (!totals) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-s">
      <TotalsCard totals={totals} />
      {showBreakdown ? (
        <section aria-labelledby="breakdown-title" className="flex flex-col gap-xs">
          <h2 id="breakdown-title" className="text-l leading-tight font-bold">
            内訳
          </h2>
          {breakdown ? (
            <>
              <div className="grid gap-xs wide:grid-cols-2">
                <BreakdownTable
                  title={`${CHECKIN_QUESTION_LABELS.applicationSource}の内訳`}
                  rows={breakdown.applicationSource.map((row) => ({
                    label: APPLICATION_SOURCE_LABELS[row.value],
                    count: row.count,
                  }))}
                />
                <BreakdownTable
                  title={`${CHECKIN_QUESTION_LABELS.referral}の内訳`}
                  rows={breakdown.referral.map((row) => ({
                    label: REFERRAL_LABELS[row.value],
                    count: row.count,
                  }))}
                />
              </div>
              {breakdown.discounts.some((row) => row.discountId !== null) ? (
                <div className="grid items-start gap-xs wide:grid-cols-2">
                  <DiscountBreakdownTable rows={breakdown.discounts} />
                  {breakdown.referrers.length > 0 ? (
                    <BreakdownTable
                      title="紹介者（主催者だけが読めます）"
                      rows={breakdown.referrers.map((row) => ({
                        label: row.name,
                        count: row.count,
                      }))}
                    />
                  ) : null}
                </div>
              ) : null}
            </>
          ) : breakdownError ? (
            <div className="flex flex-col items-start gap-xxs">
              <ResponseMessage tone="danger">
                {`内訳を読みこめませんでした。${errorMessage(breakdownError)}`}
              </ResponseMessage>
              {onRetryBreakdown ? (
                <Button type="button" className="min-h-xl" onClick={onRetryBreakdown}>
                  もう一度
                </Button>
              ) : null}
            </div>
          ) : (
            <p aria-busy="true" className="text-m text-text-sub">
              読みこんでいます…
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
