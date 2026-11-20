// 予約の約束の選択肢：code と言葉がそろう・受付の媒体と別の値を持たない。
import { describe, expect, it } from "vitest";
import {
  ATTENDANCES,
  ATTENDANCE_LABELS,
  BOOKING_MODES,
  BOOKING_MODE_DESCRIPTIONS,
  BOOKING_MODE_LABELS,
  ENTRY_KINDS,
  ENTRY_KIND_LABELS,
  ENTRY_STATUSES,
  ENTRY_STATUS_LABELS,
} from "./index.ts";

describe("予約の選択肢", () => {
  it("どの code にも言葉がある（並びと言葉の鍵がそろう）", () => {
    expect(Object.keys(BOOKING_MODE_LABELS)).toEqual([...BOOKING_MODES]);
    expect(Object.keys(BOOKING_MODE_DESCRIPTIONS)).toEqual([...BOOKING_MODES]);
    expect(Object.keys(ENTRY_KIND_LABELS)).toEqual([...ENTRY_KINDS]);
    expect(Object.keys(ENTRY_STATUS_LABELS)).toEqual([...ENTRY_STATUSES]);
    expect(Object.keys(ATTENDANCE_LABELS)).toEqual([...ATTENDANCES]);
  });

  it("使い方の最初は受付だけ（行がない交流会と同じ）", () => {
    expect(BOOKING_MODES[0]).toBe("reception");
  });
});
