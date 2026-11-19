// 合計のタブ：内訳を初めに読めなかったときは、読みこみ中のまま止めず、内訳の節に文と「もう一度」を出す（合計は出したまま）。
import type { CheckinBreakdown, CheckinTotals } from "@workspace/contracts/reception";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api.ts";
import { TotalsTab } from "./TotalsTab.tsx";

/** 合計の見本。 */
const TOTALS: CheckinTotals = {
  byPaymentMethod: [
    { paymentMethod: "paypay", count: 1, amount: 1000 },
    { paymentMethod: "cash", count: 0, amount: 0 },
    { paymentMethod: "free", count: 0, amount: 0 },
  ],
  total: { count: 1, amount: 1000 },
};

describe("合計のタブ", () => {
  it("内訳を初めに読めなかったら、API の文と「もう一度」を出し、押すと読み直す", async () => {
    const retry = vi.fn();
    const error = new ApiError(500, {
      code: "INTERNAL",
      message: "うまくいきませんでした。",
      requestId: "r",
    });
    render(
      <TotalsTab
        totals={TOTALS}
        breakdown={undefined}
        showBreakdown
        breakdownError={error}
        onRetryBreakdown={retry}
      />,
    );
    expect(screen.getByRole("table", { name: "支払い方法ごとの合計" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "内訳を読みこめませんでした。うまくいきませんでした。",
    );
    expect(screen.queryByText("読みこんでいます…")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "もう一度" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("内訳の読みこみ中は「読みこんでいます…」", () => {
    render(<TotalsTab totals={TOTALS} breakdown={undefined} showBreakdown />);
    expect(screen.getByText("読みこんでいます…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "もう一度" })).toBeNull();
  });

  it("割引があった交流会は、割引の内訳（人数・割引の額の合計）と紹介者の人数を出す。割引がなければ出さない", () => {
    const base: CheckinBreakdown = {
      applicationSource: [{ value: "connpass", count: 2 }],
      referral: [{ value: "friend", count: 2 }],
      total: 2,
      discounts: [{ discountId: null, name: null, active: true, count: 2, discountTotal: 0 }],
      referrers: [],
    };
    const { rerender } = render(<TotalsTab totals={TOTALS} breakdown={base} showBreakdown />);
    expect(screen.queryByRole("table", { name: "割引の内訳" })).toBeNull();

    rerender(
      <TotalsTab
        totals={TOTALS}
        breakdown={{
          ...base,
          discounts: [
            {
              discountId: "0193a1b2-0000-7000-8000-00000000000a",
              name: "紹介割",
              active: true,
              count: 1,
              discountTotal: 1000,
            },
            {
              discountId: "0193a1b2-0000-7000-8000-00000000000b",
              name: "学割",
              active: false,
              count: 0,
              discountTotal: 0,
            },
            { discountId: null, name: null, active: true, count: 1, discountTotal: 0 },
          ],
          referrers: [{ name: "田中 花子", count: 1 }],
        }}
        showBreakdown
      />,
    );
    const discounts = screen.getByRole("table", { name: "割引の内訳" });
    expect(discounts).toHaveTextContent("紹介割1人1,000円");
    expect(discounts).toHaveTextContent("学割（使うのをやめた割引）0人0円");
    expect(discounts).toHaveTextContent("割引なし1人—");
    expect(screen.getByRole("table", { name: /紹介者/ })).toHaveTextContent("田中 花子1人");
  });
});
