// 人物メモの交流会から作る会った場の約束（specs/person/002-event-meetings/contracts/person.md）：選べる交流会の形・
// 一覧の形・交流会から作る入力（eventId は uuid の形。知らない欄は誤り）・候補の上限。
import { describe, expect, it } from "vitest";
import {
  EventCandidate,
  EventCandidateList,
  MeetingFromEventInput,
  PERSON_EVENT_CANDIDATE_MAX,
} from "./index.ts";

const EVENT_ID = "0193a1b2-0000-7000-8000-000000000301";
const MEETING_ID = "0193a1b2-0000-7000-8000-000000000201";

describe("選べる交流会", () => {
  it("交流会の ID・名前・日付と、作った会った場（なければ null）を持つ", () => {
    expect(
      EventCandidate.safeParse({
        eventId: EVENT_ID,
        name: "11月の交流会",
        metOn: "2026-11-20",
        meetingId: null,
      }).success,
    ).toBe(true);
    expect(
      EventCandidate.safeParse({
        eventId: EVENT_ID,
        name: "11月の交流会",
        metOn: "2026-11-20",
        meetingId: MEETING_ID,
      }).success,
    ).toBe(true);
    // 日付は YYYY-MM-DD だけ
    expect(
      EventCandidate.safeParse({
        eventId: EVENT_ID,
        name: "11月の交流会",
        metOn: "2026-11-20T10:00:00Z",
        meetingId: null,
      }).success,
    ).toBe(false);
  });

  it("一覧は、受付アプリが見えるかと候補の並び", () => {
    expect(EventCandidateList.safeParse({ available: false, items: [] }).success).toBe(true);
    expect(
      EventCandidateList.safeParse({
        available: true,
        items: [{ eventId: EVENT_ID, name: "11月の交流会", metOn: "2026-11-20", meetingId: null }],
      }).success,
    ).toBe(true);
    expect(EventCandidateList.safeParse({ items: [] }).success).toBe(false);
  });

  it("候補の上限は50件（research R3）", () => {
    expect(PERSON_EVENT_CANDIDATE_MAX).toBe(50);
  });
});

describe("交流会から会った場を作る入力", () => {
  it("eventId は uuid の形だけを受ける（違えば日本語の誤り）", () => {
    expect(MeetingFromEventInput.safeParse({ eventId: EVENT_ID }).data).toEqual({
      eventId: EVENT_ID,
    });
    const wrong = MeetingFromEventInput.safeParse({ eventId: "abc" });
    expect(wrong.success).toBe(false);
    expect(wrong.error?.issues[0]?.path).toEqual(["eventId"]);
    expect(wrong.error?.issues[0]?.message).toBe("交流会を選び直してください。");
    expect(MeetingFromEventInput.safeParse({}).success).toBe(false);
  });

  it("知らない欄（名前・日付など）は誤り（名前と日付は API が交流会から写す）", () => {
    expect(MeetingFromEventInput.safeParse({ eventId: EVENT_ID, name: "勝手な名前" }).success).toBe(
      false,
    );
  });
});
