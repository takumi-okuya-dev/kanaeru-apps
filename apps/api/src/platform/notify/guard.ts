// 知らせの守りの判定（AD-24）：送り方（off・allowlist・on）と許可リストから、その宛先に送ってよいかを決める。
// 業務を知らない（宛先が LINE のユーザー ID かメールアドレスかだけを見る）。
import type { NotifyMode } from "../../kernel/notifier.ts";

/** 守りの設定（設定の NOTIFY_MODE・NOTIFY_ALLOWLIST・環境から決めた fakeOnly）。 */
export type NotifyPolicy = {
  /** 送り方 */
  mode: NotifyMode;
  /** 送ってよい宛先（LINE のユーザー ID とメールアドレス。allowlist のときだけ見る） */
  allowlist: readonly string[];
  /** 偽の送り手だけを使うか（APP_ENV が local・test） */
  fakeOnly: boolean;
};

/** 判定の結果。 */
export type DeliveryDecision = "send" | "off" | "not_allowed";

/**
 * 宛先を比べる形にそろえる（メールアドレスは小文字。LINE のユーザー ID はそのまま）。
 * @param destination 宛先
 * @returns そろえた宛先
 */
function normalize(destination: string): string {
  return destination.includes("@") ? destination.trim().toLowerCase() : destination.trim();
}

/**
 * その宛先に送ってよいかを決める。
 * @param policy 守りの設定（送り方と許可リスト）
 * @param destination 宛先（LINE のユーザー ID かメールアドレス）
 * @returns send（送る）・off（止めている）・not_allowed（許可リストにない）
 */
export function decideDelivery(
  policy: Pick<NotifyPolicy, "mode" | "allowlist">,
  destination: string,
): DeliveryDecision {
  if (policy.mode === "off") return "off";
  if (policy.mode === "on") return "send";
  const target = normalize(destination);
  return policy.allowlist.some((item) => normalize(item) === target) ? "send" : "not_allowed";
}
