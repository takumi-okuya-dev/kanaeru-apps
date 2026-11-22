// 名簿を入れた受付の交流会（match-007）：受付の交流会から入れると写しを置き・入れ直すと置きかわり・貼り付けで置きかえると外れ・
// 貼り付けで足しただけなら残る。題の下の文と、受付アプリで開けるかの見え方。電波なしで渡す QR には入らない。
import { INITIAL_CONTENT } from "@workspace/contracts/match";
import type {
  MatchReceptionSource,
  MatchTable,
  MatchTableContent,
} from "@workspace/contracts/match";
import { MatchTableContent as MatchTableContentSchema } from "@workspace/contracts/match";
import { describe, expect, it } from "vitest";
import { handoffOfTable } from "./handoff.ts";
import { receptionEventAccess, receptionEventText } from "./ReceptionEventNote.tsx";
import { importPeople } from "./roster-edit.ts";
import { assignNicknames } from "./roster-read.ts";

const A = "0193a1b2-0000-7000-8000-00000000000a";
const B = "0193a1b2-0000-7000-8000-00000000000b";

/** 交流会 A から入れたときの写し（日本時間 12/13 の 13:00）。 */
const FROM_A: MatchReceptionSource = {
  eventId: A,
  name: "練習会",
  startsAt: "2026-12-13T04:00:00.000Z",
};
/** 交流会 B から入れたときの写し。 */
const FROM_B: MatchReceptionSource = { ...FROM_A, eventId: B, name: "強化練習" };

/** 名簿に入れる2人（架空の名前）。 */
const PEOPLE = assignNicknames([
  { fullName: "中村 さき", level: "advanced" },
  { fullName: "山田 花子", level: null },
]);

describe("名簿を入れた受付の交流会の写し", () => {
  it("受付の交流会から入れると写しを置き、中身の約束に合う", () => {
    const { content } = importPeople(INITIAL_CONTENT, PEOPLE, "replace", FROM_A);
    expect(content.receptionEvent).toEqual(FROM_A);
    expect(MatchTableContentSchema.safeParse(content).success).toBe(true);
  });

  it("別の交流会から入れ直すと（置きかえても足しても）その交流会に置きかわる", () => {
    const first = importPeople(INITIAL_CONTENT, PEOPLE, "replace", FROM_A).content;
    expect(importPeople(first, PEOPLE, "replace", FROM_B).content.receptionEvent).toEqual(FROM_B);
    expect(importPeople(first, PEOPLE, "append", FROM_B).content.receptionEvent).toEqual(FROM_B);
  });

  it("貼り付け・CSV で置きかえると写しを外し（キーごと）、足しただけなら残す", () => {
    const first = importPeople(INITIAL_CONTENT, PEOPLE, "replace", FROM_A).content;
    const replaced = importPeople(first, PEOPLE, "replace").content;
    expect("receptionEvent" in replaced).toBe(false);
    expect(importPeople(first, PEOPLE, "append").content.receptionEvent).toEqual(FROM_A);
  });

  it("題の下の文は「受付：{名前}（{日本時間の日付}）から入れた」", () => {
    expect(receptionEventText(FROM_A)).toBe("受付：練習会（2026/12/13(日)）から入れた");
    // 日本時間で日付が変わる時刻（UTC では前の日）
    expect(receptionEventText({ ...FROM_A, startsAt: "2026-12-12T15:30:00.000Z" })).toBe(
      "受付：練習会（2026/12/13(日)）から入れた",
    );
  });

  it("開けるか：サーバーの答えが写しと同じ交流会のときだけ決まる（違えば送っていない入れ直し）", () => {
    const link = { eventId: A, name: "練習会", startsAt: FROM_A.startsAt, canOpen: true };
    expect(receptionEventAccess(FROM_A, link)).toBe("open");
    expect(receptionEventAccess(FROM_A, { ...link, canOpen: false })).toBe("unavailable");
    expect(receptionEventAccess(FROM_B, link)).toBe("pending");
    expect(receptionEventAccess(FROM_A, null)).toBe("pending");
    // 端末に置いた前の版の試合表には、見せ方の欄がない
    expect(receptionEventAccess(FROM_A, undefined)).toBe("pending");
    expect(receptionEventAccess(undefined, link)).toBe("pending");
  });

  it("電波なしで渡す QR の中身には、交流会の名前も ID も入れない（AD-26）", () => {
    const content: MatchTableContent = {
      ...importPeople(INITIAL_CONTENT, PEOPLE, "replace", FROM_A).content,
    };
    const table = {
      id: B,
      name: "12/13 試合表",
      playDate: "2026-12-13",
      organization: null,
      isOwner: true,
      receptionEvent: { ...FROM_A, canOpen: true },
      updatedAt: "2026-12-13T04:00:00.000Z",
      content,
      version: 2,
      seed: 1,
      editorDeviceId: "d",
      links: {
        viewExpiresAt: null,
        joinExpiresAt: null,
        joinClosedAt: null,
        viewHint: null,
        joinHint: null,
      },
    } satisfies MatchTable;
    const handoff = JSON.stringify(handoffOfTable(table, 2, Date.now()));
    expect(handoff).not.toContain("練習会");
    expect(handoff).not.toContain(A);
  });
});
