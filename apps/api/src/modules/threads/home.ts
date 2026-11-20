// 運用アカウントのホームと、開いた記録（threads-012。めぐるの accounts/account-service.ts の openAccount と
// connection-service.ts の verifyConnection、profile-status の数を写した）。
import { STRATEGY_TOTAL, countFilled, jstToday } from "@workspace/contracts/threads";
import type { AccountHome } from "@workspace/contracts/threads";
import { and, count, eq, gte, isNull, or, sql } from "drizzle-orm";
import { AppError } from "../../kernel/errors.ts";
import type { Executor } from "../../kernel/db.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { verifyConnection } from "./connection.ts";
import { findStrategy, markAccountOpened, toStrategyValues } from "./repository.ts";
import { threadsPromotion, threadsReferencePost, threadsResearchKeyword } from "./schema.ts";

/**
 * ホームの材料の数を読む（戦略の入れた数・宣伝の数と宣伝の対象の数・参考の投稿とキーワードの数）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID（持ち主を確かめたもの）
 * @param now 今の時刻（宣伝の期限を比べる）
 * @returns 材料の数
 */
export async function readAccountHome(
  db: Executor,
  threadsAccountId: string,
  now: Date,
): Promise<AccountHome> {
  const today = jstToday(now);
  const [strategy, [promotions], [references], [keywords]] = await Promise.all([
    findStrategy(db, threadsAccountId),
    db
      .select({
        total: count(),
        // 宣伝中で、期限がないか今日より前でない（約束の isTargetable と同じ）
        targetable: sql<number>`count(*) filter (where ${and(
          eq(threadsPromotion.status, "active"),
          or(isNull(threadsPromotion.validUntil), gte(threadsPromotion.validUntil, today)),
        )})`.mapWith(Number),
      })
      .from(threadsPromotion)
      .where(eq(threadsPromotion.threadsAccountId, threadsAccountId)),
    db
      .select({ total: count() })
      .from(threadsReferencePost)
      .where(eq(threadsReferencePost.threadsAccountId, threadsAccountId)),
    db
      .select({ total: count() })
      .from(threadsResearchKeyword)
      .where(eq(threadsResearchKeyword.threadsAccountId, threadsAccountId)),
  ]);
  return {
    strategy: { filledCount: countFilled(toStrategyValues(strategy)), total: STRATEGY_TOTAL },
    promotions: {
      totalCount: promotions?.total ?? 0,
      targetableCount: promotions?.targetable ?? 0,
    },
    research: {
      referencePostCount: references?.total ?? 0,
      keywordCount: keywords?.total ?? 0,
    },
  };
}

/**
 * 運用アカウントを開いたことを残し、つないでいれば持っているトークンでプロフィールを読み直す
 * （名前・ユーザー名・画像を新しくし、認証のエラーなら接続し直しが要る状態にする）。
 * Threads が答えない・トークンを開けないときは、開くことを止めずに、接続の状態を変えない。
 * @param deps 土台が渡す道具
 * @param threadsAccountId 運用アカウントの ID（持ち主を確かめたもの）
 * @param openedAt 要求を受け取った日時
 */
export async function openAccount(
  deps: DomainRouteDeps,
  threadsAccountId: string,
  openedAt: Date,
): Promise<void> {
  await markAccountOpened(deps.db, threadsAccountId, openedAt);
  try {
    await verifyConnection(deps, threadsAccountId);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    deps.logger.warn({ code: error.code }, "開いたときの Threads の確かめができませんでした");
  }
}
