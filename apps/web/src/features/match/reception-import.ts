// 受付の交流会から名簿を入れるときの、状態を持たない関数（入れる人の選び方・呼び名を作る形にする。match-006）。
import type { MatchReceptionPerson, MatchTable } from "@workspace/contracts/match";
import type { ImportMode } from "./roster-edit.ts";
import type { ReadPerson } from "./roster-read.ts";

/**
 * 入れる人を決める（後ろに足すときは、もう名簿にいる account の人を外す）。
 * @param people 選んだ人
 * @param table 試合表
 * @param mode 入れ方
 * @returns 入れる人と、名簿にいるので外した人数
 */
export function pickReceptionPeople(
  people: readonly MatchReceptionPerson[],
  table: Pick<MatchTable, "content">,
  mode: ImportMode,
): { people: MatchReceptionPerson[]; alreadyListed: number } {
  if (mode === "replace") return { people: [...people], alreadyListed: 0 };
  const listed = new Set(table.content.players.flatMap((player) => player.accountId ?? []));
  const picked = people.filter((person) => !person.accountId || !listed.has(person.accountId));
  return { people: picked, alreadyListed: people.length - picked.length };
}

/**
 * 受付の名前を、呼び名を作る形にする（前後と続きの空白をそろえる。account とレベルを引き継ぐ）。
 * @param person 受付の交流会の1人
 * @returns 読んだ1人
 */
export function toReadPerson(person: MatchReceptionPerson): ReadPerson {
  return {
    fullName: person.name.trim().replace(/\s+/gu, " "),
    level: person.level,
    ...(person.accountId ? { accountId: person.accountId } : {}),
  };
}
