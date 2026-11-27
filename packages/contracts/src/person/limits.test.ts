// 人物メモの約束の上限：字の数え方（コードポイント）と、上限の値。
import { describe, expect, it } from "vitest";
import { PERSON_MEETING_LIMITS, PERSON_NOTE_LIMITS, countChars } from "./index.ts";

describe("人物メモの上限", () => {
  it("字はコードポイントで数える（絵文字も1字）", () => {
    expect(countChars("たろう🍙")).toBe(4);
    expect(countChars("")).toBe(0);
    expect(countChars("Go")).toBe(2);
  });

  it("上限は research R10 の値", () => {
    expect(PERSON_NOTE_LIMITS).toEqual({
      fullName: 100,
      reading: 100,
      lineName: 100,
      appearance: 200,
      account: 200,
      talk: 20_000,
      nextTopic: 2_000,
      tag: 30,
    });
    expect(PERSON_MEETING_LIMITS.name).toBe(100);
  });
});
