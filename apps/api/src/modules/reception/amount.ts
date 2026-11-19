// 金額の決め方（AD-6。research R5）。作るときと、支払い方法を直すときだけ呼ぶ。
import type { PaymentMethod } from "@workspace/contracts/reception";

/**
 * チェックインの金額を決める（無料なら0円、ほかはその時の参加費）。
 * @param paymentMethod 支払い方法
 * @param fee その時の交流会の参加費（円の整数。event の getEventSummary で引いたもの）
 * @returns 金額（円の整数）
 */
export function decideAmount(paymentMethod: PaymentMethod, fee: number): number {
  return paymentMethod === "free" ? 0 : fee;
}
