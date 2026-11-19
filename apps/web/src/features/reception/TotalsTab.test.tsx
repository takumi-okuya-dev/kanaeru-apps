// 合計のタブ：内訳を初めに読めなかったときは、読みこみ中のまま止めず、内訳の節に文と「もう一度」を出す（合計は出したまま）。
import type { CheckinTotals } from "@workspace/contracts/reception";
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
});
