// プロンプトの材料（宣伝・リサーチ・投稿のルール）を最後に変えた日時を残す（threads-012。めぐるの strategy/materials.ts を写した）。
// 足す・直す・消す・状態を変えたあとに呼ぶ。投稿の案をためたときに、まとまりへ写す（反応の CSV の「材料の版」）。
import { eq } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { threadsAccount } from "./schema.ts";

/** 材料の種類（promotions：宣伝・research：参考の投稿とキーワード・coreRules：投稿のルール）。 */
export type MaterialKind = "promotions" | "research" | "coreRules";

/**
 * 材料を変えた日時を今にする。
 * @param db DB（トランザクションの中でもよい）
 * @param threadsAccountId 運用アカウントの ID
 * @param kind 材料の種類
 * @param now 今
 */
export async function touchMaterials(
  db: Executor,
  threadsAccountId: string,
  kind: MaterialKind,
  now: Date = new Date(),
): Promise<void> {
  const values =
    kind === "promotions"
      ? { promotionsChangedAt: now }
      : kind === "research"
        ? { researchChangedAt: now }
        : { coreRulesChangedAt: now };
  await db.update(threadsAccount).set(values).where(eq(threadsAccount.id, threadsAccountId));
}
