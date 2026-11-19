// A2 の割引の節（reception-002。EXPERIENCE.md の A2）。行ごとに名前・額（円）・「紹介者の名前を聞く」と「外す」、下に「割引を足す」。
// 交流会と同じ「作る」「保存」で一緒に送る（送った並びが、その交流会で使う割引のすべて。外した割引は使うのをやめる。research R2）。
// 誤りは行の欄のそば（discounts.N.name・discounts.N.amount）。並び全体の誤り（10まで）は節の下。
import { EVENT_DISCOUNTS_MAX } from "@workspace/contracts/event";
import type { EventDiscountView } from "@workspace/contracts/event";
import { Button } from "@workspace/ui/components/button";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { useId } from "react";
import type { FieldErrors } from "../../lib/form.ts";

/** 割引の1行の欄の値（額は文字のまま）。 */
export type DiscountRowValues = {
  /** 画面の中だけの鍵（行を足し・外しても欄の入力を取り違えない） */
  key: string;
  /** 割引の ID（足したばかりの行はなし） */
  id?: string;
  /** 名前 */
  name: string;
  /** 額（欄の文字） */
  amount: string;
  /** 紹介者の名前を聞くか */
  asksReferrer: boolean;
};

let nextKey = 0;

/**
 * 画面の中だけの鍵を作る。
 * @returns 鍵
 */
function newKey(): string {
  nextKey += 1;
  return `discount-${nextKey}`;
}

/**
 * 交流会の割引を、欄の値にする（直すときの初期値）。
 * @param discounts 使っている割引
 * @returns 欄の値の並び
 */
export function toDiscountRows(discounts: readonly EventDiscountView[]): DiscountRowValues[] {
  return discounts.map((discount) => ({
    key: newKey(),
    id: discount.id,
    name: discount.name,
    amount: String(discount.amount),
    asksReferrer: discount.asksReferrer,
  }));
}

/** DiscountFields が受け取るもの。 */
export type DiscountFieldsProps = {
  /** 行の値 */
  rows: readonly DiscountRowValues[];
  /** 行が変わったとき */
  onChange: (rows: DiscountRowValues[]) => void;
  /** 欄の名前ごとの誤り（discounts.N.name など） */
  errors: FieldErrors;
  /** 直すときか（すでにあるチェックインは変わらないことを添える） */
  editing: boolean;
};

/**
 * 割引の節。
 * @param props 行（rows）・変わったとき（onChange）・誤り（errors）・直すときか（editing）
 * @returns 節の要素
 */
export function DiscountFields({ rows, onChange, errors, editing }: DiscountFieldsProps) {
  const id = useId();
  const descriptionId = `${id}-description`;

  /**
   * 1つの行を直す。
   * @param key 行の鍵
   * @param change 変える欄
   */
  const update = (key: string, change: Partial<DiscountRowValues>): void => {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  };

  return (
    <fieldset aria-describedby={descriptionId} className="flex flex-col gap-xs">
      <legend className="pb-x3s text-m font-bold text-text">割引</legend>
      <p id={descriptionId} className="text-s text-text-sub">
        {`任意。紹介割などを足すと、チェックインの画面で参加者が選べます（金額は参加費から割引の額を引いたもの）。${
          editing
            ? "割引を直しても外しても、すでにあるチェックインの割引と金額は変わりません。"
            : ""
        }`}
      </p>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-xs">
          {rows.map((row, index) => (
            <li
              key={row.key}
              aria-label={`割引 ${index + 1}`}
              className="flex flex-col gap-xs rounded-md border border-border bg-surface p-xs"
            >
              <div className="flex flex-wrap gap-xs">
                <Field
                  label="割引の名前"
                  description="例：紹介割"
                  error={errors[`discounts.${index}.name`]}
                  required
                  className="min-w-0 flex-1"
                >
                  <Input
                    autoComplete="off"
                    value={row.name}
                    onChange={(event) => update(row.key, { name: event.target.value })}
                  />
                </Field>
                <Field
                  label="割引の額（円）"
                  description="例：1000"
                  error={errors[`discounts.${index}.amount`]}
                  required
                  className="min-w-0 flex-1"
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={row.amount}
                    onChange={(event) => update(row.key, { amount: event.target.value })}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-xs">
                <label className="inline-flex min-h-xl cursor-pointer items-center gap-xxs text-m">
                  <input
                    type="checkbox"
                    checked={row.asksReferrer}
                    onChange={(event) => update(row.key, { asksReferrer: event.target.checked })}
                    className="size-s shrink-0 accent-primary"
                  />
                  紹介者の名前を聞く
                </label>
                <Button
                  type="button"
                  className="min-h-xl"
                  onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                >
                  外す
                  <span className="sr-only">{`（${row.name || `割引 ${index + 1}`}）`}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {errors.discounts ? (
        <p data-slot="field-error" className="text-s text-danger-text">
          {errors.discounts}
        </p>
      ) : null}
      {rows.length < EVENT_DISCOUNTS_MAX ? (
        <div>
          <Button
            type="button"
            className="min-h-xl"
            onClick={() =>
              onChange([...rows, { key: newKey(), name: "", amount: "", asksReferrer: false }])
            }
          >
            割引を足す
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
