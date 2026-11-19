// 操作の記録の読み書き（threads-005。めぐるの activity/activity-log.ts を写した）。
// 記録は操作が済んだあとに書く。書けなくても操作は失敗にしない（ログに ID だけを書く）【仮決め】。
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_LIST_MAX,
  ACTIVITY_LOG_RETENTION_DAYS,
  ACTIVITY_SUMMARY_CHARS,
} from "@workspace/contracts/threads";
import type { ActivityAction, ActivityEntry, ActivityKind } from "@workspace/contracts/threads";
import { and, desc, eq, lt } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { threadsActivityLog } from "./schema.ts";

/** 記録する操作。 */
export type ActivityInput = {
  kind: ActivityKind;
  action: ActivityAction;
  /** まとめての操作の数（既定は1） */
  itemCount?: number;
  /** 対象の要約（本文なら書き出しにする） */
  summary?: string | null;
};

/**
 * 本文の書き出し（1行目の30文字まで）。
 * @param body 本文
 * @returns 書き出し
 */
export function excerptOf(body: string): string {
  const line = body.trim().split("\n")[0] ?? "";
  const chars = [...line];
  return chars.length > ACTIVITY_SUMMARY_CHARS
    ? `${chars.slice(0, ACTIVITY_SUMMARY_CHARS).join("")}…`
    : line;
}

/**
 * 操作を記録する（書けなくても投げない）。
 * @param deps 土台が渡す道具（db と logger）
 * @param threadsAccountId 運用アカウントの ID
 * @param input 操作
 */
export async function recordActivity(
  deps: Pick<DomainRouteDeps, "db" | "logger">,
  threadsAccountId: string,
  input: ActivityInput,
): Promise<void> {
  try {
    await deps.db.insert(threadsActivityLog).values({
      threadsAccountId,
      kind: input.kind,
      action: input.action,
      itemCount: input.itemCount ?? 1,
      summary: input.summary ? excerptOf(input.summary) : null,
    });
  } catch (error) {
    deps.logger.warn(
      { threadsAccountId, errorName: (error as Error).name },
      "操作の記録を書けませんでした",
    );
  }
}

/**
 * 操作の記録の一覧（新しい順）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param kind 種類で絞る（なければすべて）
 * @returns 記録
 */
export async function listActivity(
  db: Executor,
  threadsAccountId: string,
  kind: ActivityKind | undefined,
): Promise<ActivityEntry[]> {
  const rows = await db
    .select()
    .from(threadsActivityLog)
    .where(
      and(
        eq(threadsActivityLog.threadsAccountId, threadsAccountId),
        kind ? eq(threadsActivityLog.kind, kind) : undefined,
      ),
    )
    .orderBy(desc(threadsActivityLog.createdAt), desc(threadsActivityLog.id))
    .limit(ACTIVITY_LIST_MAX);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    action: row.action,
    label: (ACTIVITY_ACTIONS as Record<string, string>)[row.action] ?? row.action,
    itemCount: row.itemCount,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * 90日を過ぎた記録を消す（定期の仕事の片付け）。
 * @param db DB
 * @param now 今
 */
export async function purgeActivity(db: Executor, now: Date): Promise<void> {
  await db
    .delete(threadsActivityLog)
    .where(
      lt(
        threadsActivityLog.createdAt,
        new Date(now.getTime() - ACTIVITY_LOG_RETENTION_DAYS * 86_400_000),
      ),
    );
}
