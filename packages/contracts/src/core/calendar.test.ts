// カレンダーに入れる道具（Google カレンダーの URL・時刻の形）。
import { describe, expect, it } from "vitest";
import { calendarStamp, googleCalendarUrl } from "./calendar.ts";

describe("カレンダーの時刻の形", () => {
  it.each([
    ["2026-12-11T03:00:00.000Z", "20261211T030000Z"],
    ["2026-12-11T12:00:00+09:00", "20261211T030000Z"],
    ["2026-12-31T23:59:59.999Z", "20261231T235959Z"],
  ])("%s → %s", (instant, expected) => {
    expect(calendarStamp(new Date(instant))).toBe(expected);
  });
});

describe("Google カレンダーの追加の画面の URL", () => {
  it("題・始まりと終わり・場所・説明を入れる", () => {
    const url = new URL(
      googleCalendarUrl({
        title: "設計レビューで図1枚で説明する",
        startsAt: new Date("2026-12-11T12:00:00+09:00"),
        endsAt: new Date("2026-12-11T12:30:00+09:00"),
        location: "会議室 A",
        details: "https://example.com/reading/remind/1",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("設計レビューで図1枚で説明する");
    expect(url.searchParams.get("dates")).toBe("20261211T030000Z/20261211T033000Z");
    expect(url.searchParams.get("location")).toBe("会議室 A");
    expect(url.searchParams.get("details")).toBe("https://example.com/reading/remind/1");
  });

  it("場所と説明がなければ入れない", () => {
    const url = new URL(
      googleCalendarUrl({
        title: "題",
        startsAt: new Date("2026-12-11T03:00:00Z"),
        endsAt: new Date("2026-12-11T04:00:00Z"),
        location: null,
      }),
    );
    expect(url.searchParams.has("location")).toBe(false);
    expect(url.searchParams.has("details")).toBe(false);
  });
});
