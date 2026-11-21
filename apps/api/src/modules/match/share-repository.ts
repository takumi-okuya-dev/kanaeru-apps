// 見るだけの札・受付の札・受付の行の読み書き（match の表だけを触る。AD-3・AD-26・AD-30）。
// 札は SHA-256 だけを持つ（tokens.ts）。受付の行は試合表の中身に直に書かず、1行ずつ足す（担当の端末が名簿に取り込む）。
import { MATCH_GROUPS, MatchTableContent, joinPlayerId } from "@workspace/contracts/match";
import type { MatchJoinEntry, MatchLevel, MatchView } from "@workspace/contracts/match";
import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { matchJoin, matchTable } from "./schema.ts";

/**
 * 見るだけの札を替える（前の札は使えなくなる）。
 * @param db DB
 * @param tableId 試合表の ID
 * @param hash 新しい札の SHA-256
 * @param expiresAt 期限
 */
export async function setViewToken(db: Executor, tableId: string, hash: string, expiresAt: Date) {
  await db
    .update(matchTable)
    .set({ viewTokenHash: hash, viewTokenExpiresAt: expiresAt })
    .where(eq(matchTable.id, tableId));
}

/**
 * 受付の札を替え、受付を開く（前の札は使えなくなる。締めた印を外す）。
 * @param db DB
 * @param tableId 試合表の ID
 * @param hash 新しい札の SHA-256
 * @param expiresAt 期限
 */
export async function setJoinToken(db: Executor, tableId: string, hash: string, expiresAt: Date) {
  await db
    .update(matchTable)
    .set({ joinTokenHash: hash, joinTokenExpiresAt: expiresAt, joinClosedAt: null })
    .where(eq(matchTable.id, tableId));
}

/**
 * 受付を締める（札はそのまま。開き直すときは札を作り直す）。
 * @param db DB
 * @param tableId 試合表の ID
 * @param now 締めた時刻
 */
export async function closeJoin(db: Executor, tableId: string, now: Date) {
  await db.update(matchTable).set({ joinClosedAt: now }).where(eq(matchTable.id, tableId));
}

/**
 * 見るだけの札から、見るだけのページの中身を作る（期限を過ぎた札・ない札は undefined）。
 * レベル・名簿の人の ID・氏名は出さない（組の言葉と呼び名だけ。AD-26）。
 * @param db DB
 * @param hash 札の SHA-256
 * @param now 今の時刻
 * @returns 見るだけのページの中身
 * @throws {Error} 中身の形が合わないとき
 */
export async function readView(
  db: Executor,
  hash: string,
  now: Date,
): Promise<MatchView | undefined> {
  const [row] = await db
    .select({
      name: matchTable.name,
      playDate: matchTable.playDate,
      version: matchTable.version,
      content: matchTable.content,
      updatedAt: matchTable.updatedAt,
      expiresAt: matchTable.viewTokenExpiresAt,
    })
    .from(matchTable)
    .where(and(eq(matchTable.viewTokenHash, hash), gt(matchTable.viewTokenExpiresAt, now)));
  if (!row?.expiresAt) return undefined;
  const parsed = MatchTableContent.safeParse(row.content);
  if (!parsed.success) throw new Error("試合表の中身の形が合いません。");
  const content = parsed.data;
  const names = new Map(content.players.map((player) => [player.id, player.nickname]));
  return {
    name: row.name,
    playDate: row.playDate,
    version: row.version,
    minutesPerGame: content.settings.minutesPerGame,
    groups: MATCH_GROUPS[content.settings.grouping].map((group) => ({
      key: group.key,
      label: group.label,
      games: (content.plan.find((plan) => plan.key === group.key)?.games ?? []).map((game) => ({
        players: game.players.map((id) => names.get(id) ?? ""),
        done: game.done,
      })),
    })),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/**
 * 見るだけの札から、版の番号だけを読む（30秒おきの確かめ）。
 * @param db DB
 * @param hash 札の SHA-256
 * @param now 今の時刻
 * @returns 版の番号（期限を過ぎた札・ない札は undefined）
 */
export async function readViewVersion(
  db: Executor,
  hash: string,
  now: Date,
): Promise<number | undefined> {
  const [row] = await db
    .select({ version: matchTable.version })
    .from(matchTable)
    .where(and(eq(matchTable.viewTokenHash, hash), gt(matchTable.viewTokenExpiresAt, now)));
  return row?.version;
}

/** 受付の札で見つけた試合表。 */
export type JoinTarget = {
  /** 試合表の ID */
  tableId: string;
  /** 名前 */
  name: string;
  /** 試合の日 */
  playDate: string;
};

/**
 * 受付の札から試合表を見つける（期限を過ぎた・締めた・ない札は undefined）。
 * @param db DB
 * @param hash 札の SHA-256
 * @param now 今の時刻
 * @param lock 試合表の行を押さえるか（受け付けるトランザクションの中だけ。人数の上限を同時に超えないため）
 * @returns 試合表
 */
export async function findJoinTarget(
  db: Executor,
  hash: string,
  now: Date,
  lock = false,
): Promise<JoinTarget | undefined> {
  const query = db
    .select({ tableId: matchTable.id, name: matchTable.name, playDate: matchTable.playDate })
    .from(matchTable)
    .where(
      and(
        eq(matchTable.joinTokenHash, hash),
        gt(matchTable.joinTokenExpiresAt, now),
        isNull(matchTable.joinClosedAt),
      ),
    );
  const [row] = lock ? await query.for("update") : await query;
  return row;
}

/**
 * 試合表の受付の数。
 * @param db DB
 * @param tableId 試合表の ID
 * @returns 数
 */
export async function countJoins(db: Executor, tableId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(matchJoin)
    .where(eq(matchJoin.matchTableId, tableId));
  return row?.value ?? 0;
}

/**
 * 受付を1行足す。
 * @param db DB
 * @param tableId 試合表の ID
 * @param input 呼び名とレベル
 * @param input.nickname 呼び名
 * @param input.level レベル
 */
export async function insertJoin(
  db: Executor,
  tableId: string,
  input: { nickname: string; level: MatchLevel },
): Promise<void> {
  await db.insert(matchJoin).values({ matchTableId: tableId, ...input });
}

/**
 * 呼び名を比べる形（NFKC にそろえ、空白を消す）。
 * @param nickname 呼び名
 * @returns 比べる形
 */
function nameKey(nickname: string): string {
  return nickname.normalize("NFKC").replace(/\s+/gu, "");
}

/**
 * 試合表の受付の一覧（受け付けた順）。同じ呼び名が、ほかの受付か名簿（その受付から入れた人を除く）にあれば印を付ける。
 * @param db DB
 * @param tableId 試合表の ID
 * @param content 試合表の中身（名簿の呼び名と比べる）
 * @returns 受付の行
 */
export async function listJoins(
  db: Executor,
  tableId: string,
  content: MatchTableContent,
): Promise<MatchJoinEntry[]> {
  const rows = await db
    .select({
      id: matchJoin.id,
      nickname: matchJoin.nickname,
      level: matchJoin.level,
      createdAt: matchJoin.createdAt,
    })
    .from(matchJoin)
    .where(eq(matchJoin.matchTableId, tableId))
    .orderBy(asc(matchJoin.createdAt), asc(matchJoin.id));
  const joinCounts = new Map<string, number>();
  for (const row of rows) {
    const key = nameKey(row.nickname);
    joinCounts.set(key, (joinCounts.get(key) ?? 0) + 1);
  }
  return rows.map((row) => {
    const key = nameKey(row.nickname);
    const own = joinPlayerId(row.id);
    const inRoster = content.players.some(
      (player) => player.id !== own && nameKey(player.nickname) === key,
    );
    // ほかの受付から名簿に入れた人は、受付どうしで数える（二重に数えない）
    const otherJoins = (joinCounts.get(key) ?? 0) > 1;
    return {
      id: row.id,
      nickname: row.nickname,
      level: row.level,
      createdAt: row.createdAt.toISOString(),
      duplicate: otherJoins || inRoster,
    };
  });
}

/**
 * 受付の行を消す。
 * @param db DB
 * @param tableId 試合表の ID
 * @param joinId 受付の ID
 * @returns 消したら true
 */
export async function deleteJoin(db: Executor, tableId: string, joinId: string): Promise<boolean> {
  const deleted = await db
    .delete(matchJoin)
    .where(and(eq(matchJoin.matchTableId, tableId), eq(matchJoin.id, joinId)))
    .returning({ id: matchJoin.id });
  return deleted.length > 0;
}

/**
 * 試合表の札の状態（運営の画面に出す。札そのものは持たない）。
 * @param row 試合表の行
 * @param row.viewTokenExpiresAt 見るだけの札の期限
 * @param row.joinTokenExpiresAt 受付の札の期限
 * @param row.joinClosedAt 締めた時刻
 * @param now 今の時刻
 * @returns 期限（過ぎていれば null）と締めた時刻
 */
export function linkStateOf(
  row: {
    viewTokenExpiresAt: Date | null;
    joinTokenExpiresAt: Date | null;
    joinClosedAt: Date | null;
  },
  now: Date,
) {
  const live = (value: Date | null) => (value && value > now ? value.toISOString() : null);
  return {
    viewExpiresAt: live(row.viewTokenExpiresAt),
    joinExpiresAt: live(row.joinTokenExpiresAt),
    joinClosedAt: row.joinClosedAt?.toISOString() ?? null,
  };
}
