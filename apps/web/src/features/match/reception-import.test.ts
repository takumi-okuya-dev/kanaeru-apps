// 受付の交流会から名簿を入れる（match-006）：入れる人の選び方（後ろに足すときは名簿にいる account の人を外す）・名前の形・
// 呼び名は貼り付けと同じ決まり（LINE の表示名で空白がなければ印）・名簿に account とレベルを引き継ぐ。名前はどれも架空のもの。
import { INITIAL_CONTENT } from "@workspace/contracts/match";
import type { MatchReceptionPerson, MatchTableContent } from "@workspace/contracts/match";
import { MatchTableContent as MatchTableContentSchema } from "@workspace/contracts/match";
import { describe, expect, it } from "vitest";
import { pickReceptionPeople, toReadPerson } from "./reception-import.ts";
import { importPeople } from "./roster-edit.ts";
import { assignNicknames } from "./roster-read.ts";

const A = "0193a1b2-0000-7000-8000-00000000000a";
const B = "0193a1b2-0000-7000-8000-00000000000b";

/** 受付の交流会の見本（LINE でチェックインした2人と、手で入れた1人）。 */
const PEOPLE: MatchReceptionPerson[] = [
  { name: " 中村　さき ", accountId: A, level: "intermediate" },
  { name: "Taro", accountId: B, level: null },
  { name: "飛び入り 太郎", accountId: null, level: null },
];

describe("受付の交流会から名簿を入れる", () => {
  it("名前の空白をそろえ、account とレベルを引き継ぐ（account のない人は持たない）", () => {
    expect(PEOPLE.map(toReadPerson)).toEqual([
      { fullName: "中村 さき", level: "intermediate", accountId: A },
      { fullName: "Taro", level: null, accountId: B },
      { fullName: "飛び入り 太郎", level: null },
    ]);
  });

  it("呼び名は貼り付けと同じ決まり：姓。空白のない LINE の表示名は頭の2字で、確かめてほしい印", () => {
    const named = assignNicknames(PEOPLE.map(toReadPerson));
    expect(named.map((person) => [person.nickname, person.nameCheck])).toEqual([
      ["中村", false],
      ["Ta", true],
      ["飛び入り", false],
    ]);
  });

  it("名簿に入れると account とレベルが残り、中身の約束に合う（氏名は中身に入れない）", () => {
    const { content, fullNames } = importPeople(
      INITIAL_CONTENT,
      assignNicknames(PEOPLE.map(toReadPerson)),
      "replace",
    );
    expect(
      content.players.map(({ nickname, level, accountId }) => ({ nickname, level, accountId })),
    ).toEqual([
      { nickname: "中村", level: "intermediate", accountId: A },
      { nickname: "Ta", level: null, accountId: B },
      { nickname: "飛び入り", level: null, accountId: undefined },
    ]);
    expect("accountId" in (content.players[2] ?? {})).toBe(false);
    expect(MatchTableContentSchema.safeParse(content).success).toBe(true);
    expect(JSON.stringify(content)).not.toContain("さき");
    expect([...fullNames.values()]).toContain("中村 さき");
  });

  it("後ろに足すときは、もう名簿にいる account の人を外す（account のない人は外さない）。置きかえるときは外さない", () => {
    const content: MatchTableContent = {
      ...INITIAL_CONTENT,
      players: [
        { id: "x1", nickname: "中村", level: "intermediate", status: "present", accountId: A },
      ],
    };
    const appended = pickReceptionPeople(PEOPLE, { content }, "append");
    expect(appended.people.map((person) => person.name)).toEqual(["Taro", "飛び入り 太郎"]);
    expect(appended.alreadyListed).toBe(1);
    expect(pickReceptionPeople(PEOPLE, { content }, "replace")).toEqual({
      people: PEOPLE,
      alreadyListed: 0,
    });
  });
});
