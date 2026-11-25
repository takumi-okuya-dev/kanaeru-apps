// 前に入れたレベル（match_level_memory。AD-25・PRD FR-M4。match-006）。
// - 覚えるのは account のある人（LINE でチェックイン・申込みした人）だけ。CSV・貼り付け・手で入れた人・QR の受付の人は、
//   氏名も account も持たないので覚えない。
// - 覚えている持ち主（相手）は、試合表を入れた組織か、入れていなければ試合表の持ち主（運営）。同じ運営の次の試合表で使う。
// - 覚えるのは、担当の端末が中身を送ったとき（名簿で account のある人のレベルを入れた・変えたとき）。中身の前と比べ、
//   変わった人だけを書く。受付の交流会から入れるときに読む。
// - 名簿に残った account が消えた（退会した）人は、外部キーで書けないので飛ばす（中身の保存は止めない）。
import type { MatchLevel, MatchTableContent } from "@workspace/contracts/match";
import { MatchTableContent as MatchTableContentSchema } from "@workspace/contracts/match";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Executor, Tx } from "../../kernel/db.ts";
import { isForeignKeyViolation } from "../../kernel/pg-errors.ts";
import type { TableAccess } from "./access.ts";
import { matchLevelMemory } from "./schema.ts";

/** レベルを覚えている持ち主（組織か運営の account のどちらか1つ）。 */
export type LevelHolder = { organizationId: string } | { ownerAccountId: string };

/** 覚えるレベルの1人。 */
export type LevelEntry = {
  /** 人の account */
  accountId: string;
  /** レベル */
  level: MatchLevel;
};

/**
 * 試合表のレベルを覚えている持ち主（入れた組織。入れていなければ試合表の持ち主）。
 * @param access 権限を確かめた試合表
 * @returns 持ち主
 */
export function holderOf(access: Pick<TableAccess, "organizationId" | "ownerAccountId">) {
  return access.organizationId
    ? ({ organizationId: access.organizationId } satisfies LevelHolder)
    : ({ ownerAccountId: access.ownerAccountId } satisfies LevelHolder);
}

/**
 * 持ち主の行だけを選ぶ条件。
 * @param holder 持ち主
 * @returns where の条件
 */
function holderCondition(holder: LevelHolder) {
  return "organizationId" in holder
    ? eq(matchLevelMemory.organizationId, holder.organizationId)
    : eq(matchLevelMemory.ownerAccountId, holder.ownerAccountId);
}

/**
 * 覚えているレベルを読む。
 * @param db DB
 * @param holder 持ち主
 * @param accountIds 人の account（重なってよい）
 * @returns account → レベル（覚えていない人は入らない）
 */
export async function listRememberedLevels(
  db: Executor,
  holder: LevelHolder,
  accountIds: readonly string[],
): Promise<Map<string, MatchLevel>> {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ accountId: matchLevelMemory.accountId, level: matchLevelMemory.level })
    .from(matchLevelMemory)
    .where(and(holderCondition(holder), inArray(matchLevelMemory.accountId, ids)));
  return new Map(rows.map((row) => [row.accountId, row.level]));
}

/**
 * 中身の前と後を比べ、覚えるレベル（account のある人で、レベルが入っていて、前と違うか前にいなかった人）を選ぶ。
 * 前の中身の形が合わないときは、前にだれもいなかったとみなす。同じ account が2人いれば、後の人のレベルにする。
 * @param before 前の中身（DB の値。形を確かめる前のもの）
 * @param after 送られた中身（約束で確かめたもの）
 * @returns 覚えるレベル
 */
export function levelChanges(before: unknown, after: MatchTableContent): LevelEntry[] {
  const parsed = MatchTableContentSchema.safeParse(before);
  const previous = new Map<string, MatchLevel | null>();
  for (const player of parsed.success ? parsed.data.players : []) {
    if (player.accountId) previous.set(player.accountId, player.level);
  }
  const next = new Map<string, MatchLevel>();
  for (const player of after.players) {
    if (player.accountId && player.level) next.set(player.accountId, player.level);
  }
  return [...next]
    .filter(([accountId, level]) => previous.get(accountId) !== level)
    .map(([accountId, level]) => ({ accountId, level }));
}

/**
 * 1つの命令で覚える（あれば上書き）。
 * @param db 取引の中の DB
 * @param holder 持ち主
 * @param entries 覚えるレベル
 */
async function upsertLevels(db: Executor, holder: LevelHolder, entries: readonly LevelEntry[]) {
  const values = entries.map((entry) => ({ ...holder, ...entry }));
  const target =
    "organizationId" in holder
      ? {
          target: [matchLevelMemory.organizationId, matchLevelMemory.accountId],
          targetWhere: isNotNull(matchLevelMemory.organizationId),
        }
      : {
          target: [matchLevelMemory.ownerAccountId, matchLevelMemory.accountId],
          targetWhere: isNotNull(matchLevelMemory.ownerAccountId),
        };
  await db
    .insert(matchLevelMemory)
    .values(values)
    .onConflictDoUpdate({
      ...target,
      set: { level: sql`excluded.level`, updatedAt: sql`now()` },
    });
}

/**
 * レベルを覚える（取引の中で呼ぶ。消えた account の人は飛ばす）。
 * まとめて1つの命令で書き、消えた account が混ざって外部キーで止まったら、1人ずつ書き直して止まった人だけを飛ばす
 * （どちらも取引の中の区切り〈savepoint〉で行い、中身の保存は止めない）。
 * @param tx 取引の中の DB
 * @param holder 持ち主
 * @param entries 覚えるレベル
 * @returns 覚えた人数
 * @throws {Error} 外部キーの違反のほかの DB の誤り
 */
export async function rememberLevels(
  tx: Tx,
  holder: LevelHolder,
  entries: readonly LevelEntry[],
): Promise<number> {
  if (entries.length === 0) return 0;
  try {
    await tx.transaction((savepoint) => upsertLevels(savepoint, holder, entries));
    return entries.length;
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
  }
  let remembered = 0;
  for (const entry of entries) {
    try {
      await tx.transaction((savepoint) => upsertLevels(savepoint, holder, [entry]));
      remembered += 1;
    } catch (error) {
      if (!isForeignKeyViolation(error)) throw error;
    }
  }
  return remembered;
}
