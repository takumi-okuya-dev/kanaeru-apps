// 管理の画面の道：形（path）と、値を入れた道が食い違わない。
import { describe, expect, it } from "vitest";
import { ADMIN_ROUTE_PATTERNS, QR_KINDS, adminPaths } from "./index.ts";

/** 試しの交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000000";

describe("管理の画面の道", () => {
  it("値を入れた道は、形の $eventId・$kind を置きかえたもの", () => {
    const fill = (pattern: string, kind = "checkin") =>
      pattern.replace("$eventId", EVENT_ID).replace("$kind", kind);
    expect(adminPaths.eventList()).toBe(ADMIN_ROUTE_PATTERNS.eventList);
    expect(adminPaths.eventNew()).toBe(ADMIN_ROUTE_PATTERNS.eventNew);
    expect(adminPaths.eventEdit(EVENT_ID)).toBe(fill(ADMIN_ROUTE_PATTERNS.eventEdit));
    expect(adminPaths.eventSetup(EVENT_ID)).toBe(fill(ADMIN_ROUTE_PATTERNS.eventSetup));
    expect(adminPaths.eventReception(EVENT_ID)).toBe(fill(ADMIN_ROUTE_PATTERNS.eventReception));
    expect(adminPaths.eventConcerns(EVENT_ID)).toBe(fill(ADMIN_ROUTE_PATTERNS.eventConcerns));
    expect(adminPaths.eventData(EVENT_ID)).toBe(fill(ADMIN_ROUTE_PATTERNS.eventData));
    for (const kind of QR_KINDS) {
      expect(adminPaths.eventQrPrint(EVENT_ID, kind)).toBe(
        fill(ADMIN_ROUTE_PATTERNS.eventQrPrint, kind),
      );
    }
  });

  it("どの道も /admin/events で始まり、重ならない", () => {
    const patterns = Object.values(ADMIN_ROUTE_PATTERNS);
    for (const pattern of patterns) expect(pattern.startsWith("/admin/events")).toBe(true);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it("空の ID は止め、道に使えない文字は符号にする", () => {
    expect(() => adminPaths.eventSetup("")).toThrow(RangeError);
    expect(adminPaths.eventSetup("a/b")).toBe("/admin/events/a%2Fb/setup");
  });
});
