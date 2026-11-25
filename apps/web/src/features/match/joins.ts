// QR の受付の行を名簿に入れる（担当の端末だけ。AD-30）。状態を持たない関数だけ。
// 受付の行は DB に残し、名簿の人の ID を受付の ID から決める（joinPlayerId）ので、同じ受付を二度入れない。
// 名簿から消すときは、受付の行も消す（呼ぶ側。消さないと、次に読んだときにまた入る）。
import { ROSTER_MAX, joinPlayerId } from "@workspace/contracts/match";
import type { MatchJoinEntry, MatchTableContent } from "@workspace/contracts/match";

/**
 * まだ名簿に入れていない受付。
 * @param content 試合表の中身
 * @param joins 受付の行
 * @returns まだの受付（受け付けた順）
 */
export function pendingJoins(
  content: Pick<MatchTableContent, "players">,
  joins: readonly MatchJoinEntry[],
): MatchJoinEntry[] {
  const ids = new Set(content.players.map((player) => player.id));
  return joins.filter((join) => !ids.has(joinPlayerId(join.id)));
}

/**
 * まだの受付を名簿の後ろに入れる（当日の印は「来る」。人数の上限を超える分は入れない）。
 * @param content 試合表の中身
 * @param joins 受付の行
 * @returns 新しい中身と、入れた人数
 */
export function importJoins(
  content: MatchTableContent,
  joins: readonly MatchJoinEntry[],
): { content: MatchTableContent; added: number } {
  const room = Math.max(0, ROSTER_MAX - content.players.length);
  const added = pendingJoins(content, joins)
    .slice(0, room)
    .map((join) => ({
      id: joinPlayerId(join.id),
      nickname: join.nickname,
      level: join.level,
      status: "present" as const,
    }));
  if (added.length === 0) return { content, added: 0 };
  return { content: { ...content, players: [...content.players, ...added] }, added: added.length };
}

/**
 * 名簿の人が受付から入った人なら、その受付の ID。
 * @param playerId 名簿の人の ID
 * @param joins 受付の行
 * @returns 受付の ID（受付から入った人でなければ undefined）
 */
export function joinIdOfPlayer(
  playerId: string,
  joins: readonly MatchJoinEntry[],
): string | undefined {
  return joins.find((join) => joinPlayerId(join.id) === playerId)?.id;
}
