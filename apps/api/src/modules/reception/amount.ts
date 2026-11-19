// 金額の決め方（AD-6。research R5。reception-002 で割引を足した）。作るときと、支払い方法か割引を直すときだけ呼ぶ。
import type { PaymentMethod } from "@workspace/contracts/reception";

/**
 * チェックインの金額を決める（無料なら0円、ほかはその時の参加費から割引の額を引いたもの。0円より下にしない）。
 * @param paymentMethod 支払い方法
 * @param fee その時の交流会の参加費（円の整数。event の getEventSummary で引いたもの）
 * @param discountAmount 割引の額（円の整数。チェックインに写したもの。割引なしは null）
 * @returns 金額（円の整数）
 */
export function decideAmount(
  paymentMethod: PaymentMethod,
  fee: number,
  discountAmount: number | null = null,
): number {
  if (paymentMethod === "free") return 0;
  return Math.max(fee - (discountAmount ?? 0), 0);
}
