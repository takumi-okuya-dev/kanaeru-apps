// .ics の単体のテスト（booking-003 research R16・S13）：CRLF・escape・75オクテットの折り返し・UID・終わりは2時間後。
import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, foldIcsLine } from "./calendar-ics.ts";

describe(".ics", () => {
  it("\\ ; , と改行を escape する（差しこみを止める）", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
    expect(escapeIcsText("X\r\nBEGIN:VEVENT")).toBe("X\\nBEGIN:VEVENT");
  });

  it("75オクテットで折り返し、文字の途中で切らない（続きの行は空白で始める）", () => {
    const folded = foldIcsLine(`SUMMARY:${"あ".repeat(40)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const [index, line] of lines.entries()) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      if (index > 0) expect(line.startsWith(" ")).toBe(true);
    }
    expect(lines.map((line, index) => (index === 0 ? line : line.slice(1))).join("")).toBe(
      `SUMMARY:${"あ".repeat(40)}`,
    );
    expect(foldIcsLine("SHORT")).toBe("SHORT");
  });

  it("1つの予定を CRLF で作る（UID・始まり・2時間後の終わり・会場・URL）", () => {
    const text = buildIcs(
      {
        eventId: "0193a1b2-0000-7000-8000-000000000001",
        name: "土曜の練習, 4面",
        startsAt: new Date("2026-12-06T13:00:00+09:00"),
        venue: "中央市民体育館",
        description: "主催：バドミントンの部",
        url: "https://example.com/e/0193a1b2-0000-7000-8000-000000000001",
      },
      new Date("2026-11-20T00:00:00Z"),
    );
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.split("\r\n")).toEqual(
      expect.arrayContaining([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:0193a1b2-0000-7000-8000-000000000001@kanaeru",
        "DTSTAMP:20261120T000000Z",
        "DTSTART:20261206T040000Z",
        "DTEND:20261206T060000Z",
        "SUMMARY:土曜の練習\\, 4面",
        "LOCATION:中央市民体育館",
        "END:VEVENT",
        "END:VCALENDAR",
      ]),
    );
    expect(text).not.toMatch(/[^\r]\n/);
  });
});
