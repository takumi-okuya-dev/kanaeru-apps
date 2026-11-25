// 直前に開いた交流会の記録（core-022）：読む・書く、利用者が替わったら消す（持ち主を比べる）。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notifyAccountChange } from "../../lib/account-events.ts";
import {
  LAST_EVENT_KEY,
  LAST_EVENT_OWNER_KEY,
  readLastEvent,
  registerLastEventReset,
  resetLastEventForAccount,
  writeLastEvent,
} from "./last-event.ts";

const EVENT_ID = "0193a1b2-0000-7000-8000-000000000000";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("直前に開いた交流会の記録", () => {
  it("書いたものを読める。何もなければ undefined", () => {
    expect(readLastEvent()).toBeUndefined();
    writeLastEvent({ eventId: EVENT_ID, role: "organizer" });
    expect(readLastEvent()).toEqual({ eventId: EVENT_ID, role: "organizer" });
  });

  it("壊れた値・知らない役目は、記録がないものとして扱う", () => {
    window.localStorage.setItem(LAST_EVENT_KEY, "{");
    expect(readLastEvent()).toBeUndefined();
    window.localStorage.setItem(LAST_EVENT_KEY, JSON.stringify({ eventId: EVENT_ID, role: "x" }));
    expect(readLastEvent()).toBeUndefined();
    window.localStorage.setItem(LAST_EVENT_KEY, JSON.stringify({ eventId: 1, role: "staff" }));
    expect(readLastEvent()).toBeUndefined();
  });

  it("localStorage が使えなくても、投げない（記録がないのと同じ）", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("使えない");
      },
    });
    try {
      expect(() => writeLastEvent({ eventId: EVENT_ID, role: "staff" })).not.toThrow();
      expect(readLastEvent()).toBeUndefined();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("利用者が替わったら消す", () => {
  it("ログアウト（null）で消し、持ち主も消す", () => {
    window.localStorage.setItem(LAST_EVENT_OWNER_KEY, "a1");
    writeLastEvent({ eventId: EVENT_ID, role: "organizer" });
    resetLastEventForAccount(null);
    expect(readLastEvent()).toBeUndefined();
    expect(window.localStorage.getItem(LAST_EVENT_OWNER_KEY)).toBeNull();
  });

  it("記録を置いた人と違う人がログインしたら消し、その人を持ち主にする。同じ人なら残す", () => {
    window.localStorage.setItem(LAST_EVENT_OWNER_KEY, "a1");
    writeLastEvent({ eventId: EVENT_ID, role: "organizer" });
    resetLastEventForAccount("a1");
    expect(readLastEvent()).toBeDefined();
    resetLastEventForAccount("b2");
    expect(readLastEvent()).toBeUndefined();
    expect(window.localStorage.getItem(LAST_EVENT_OWNER_KEY)).toBe("b2");
  });

  it("持ち主がわからない記録（この仕組みの前・持ち主を書けなかった）は、ログインした人と違うかもしれないので消す", () => {
    writeLastEvent({ eventId: EVENT_ID, role: "organizer" });
    resetLastEventForAccount("a1");
    expect(readLastEvent()).toBeUndefined();
    expect(window.localStorage.getItem(LAST_EVENT_OWNER_KEY)).toBe("a1");
  });

  it("ほかの鍵は消さない", () => {
    window.localStorage.setItem("kanaeru.other", "残す");
    resetLastEventForAccount(null);
    expect(window.localStorage.getItem("kanaeru.other")).toBe("残す");
  });

  it("利用者が替わった知らせ（onAccountChange）で片付く。外すと、もう受けない", async () => {
    window.localStorage.setItem(LAST_EVENT_OWNER_KEY, "a1");
    writeLastEvent({ eventId: EVENT_ID, role: "organizer" });
    const stop = registerLastEventReset();
    await notifyAccountChange("b2");
    expect(readLastEvent()).toBeUndefined();
    stop();
    window.localStorage.setItem(LAST_EVENT_OWNER_KEY, "b2");
    writeLastEvent({ eventId: EVENT_ID, role: "staff" });
    await notifyAccountChange(null);
    expect(readLastEvent()).toBeDefined();
  });
});
