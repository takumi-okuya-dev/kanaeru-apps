// 退会の手順を流す・確かめの中身を集める（AD-22。PRD 組織 FR-O36・FR-O54）。
// 手順は組み立て（app.ts）が「共通 → アプリの一覧の順」に並べて deps.withdrawalSteps で渡す。account はほかの領域を知らない。
// どの手順も2回流しても同じ結果になる形なので、途中で止まったら、退会をもう一度押せば続きから終わる。
import type { WithdrawalItem } from "@workspace/contracts/account";
import type { DomainRouteDeps } from "../../kernel/http.ts";

/**
 * 退会の前の手順を、渡された順に流す（アカウントを消す前に呼ぶ）。
 * @param deps 土台が渡す道具（withdrawalSteps）
 * @param accountId 退会する人
 */
export async function runWithdrawalSteps(
  deps: Pick<DomainRouteDeps, "db" | "withdrawalSteps">,
  accountId: string,
): Promise<void> {
  for (const step of deps.withdrawalSteps ?? []) await step.prepare(deps.db, accountId);
}

/**
 * 退会の確かめの中身を、手順と同じ順に集める。
 * @param deps 土台が渡す道具（withdrawalSteps）
 * @param accountId 退会する人
 * @returns 確かめの中身
 */
export async function collectWithdrawalPreview(
  deps: Pick<DomainRouteDeps, "db" | "withdrawalSteps">,
  accountId: string,
): Promise<WithdrawalItem[]> {
  const items: WithdrawalItem[] = [];
  for (const step of deps.withdrawalSteps ?? []) {
    for (const item of await step.preview(deps.db, accountId)) {
      items.push({ ...item, source: step.source });
    }
  }
  return items;
}
