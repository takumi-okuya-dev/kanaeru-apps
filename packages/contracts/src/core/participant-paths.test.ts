// 参加者が開く道と、LINEミニアプリの URL（パーマリンク）。
import { describe, expect, it } from "vitest";
import {
  MINI_APP_URL_BASE,
  PARTICIPANT_ROUTE_PATTERNS,
  miniAppPermalink,
  participantPaths,
} from "./participant-paths.ts";

const EVENT_ID = "0193a1b2-0000-7000-8000-000000000000";
const LIFF_ID = "1234567890-AbCdEfGh";

describe("参加者が開く道", () => {
  it("受付・アンケート・招待の道を作り、値は道の一部にできる形にする", () => {
    expect(participantPaths.checkin(EVENT_ID)).toBe(`/e/${EVENT_ID}/checkin`);
    expect(participantPaths.survey(EVENT_ID)).toBe(`/e/${EVENT_ID}/survey`);
    expect(participantPaths.invite("a b/c")).toBe("/invite/a%20b%2Fc");
    expect(() => participantPaths.checkin("")).toThrow(RangeError);
  });

  it("道を作る関数と、画面の道の形が同じ道を指す", () => {
    expect(PARTICIPANT_ROUTE_PATTERNS.checkin.replace("$eventId", EVENT_ID)).toBe(
      participantPaths.checkin(EVENT_ID),
    );
    expect(PARTICIPANT_ROUTE_PATTERNS.survey.replace("$eventId", EVENT_ID)).toBe(
      participantPaths.survey(EVENT_ID),
    );
    expect(PARTICIPANT_ROUTE_PATTERNS.invite.replace("$inviteToken", "abc")).toBe(
      participantPaths.invite("abc"),
    );
  });
});

describe("LINEミニアプリの URL（パーマリンク）", () => {
  it("LIFF URL に道（問い合わせ・# を含む）をそのまま足す", () => {
    expect(miniAppPermalink(LIFF_ID, participantPaths.checkin(EVENT_ID))).toBe(
      `https://miniapp.line.me/${LIFF_ID}/e/${EVENT_ID}/checkin`,
    );
    expect(miniAppPermalink(LIFF_ID, "/shop?search=shoes#item10")).toBe(
      `${MINI_APP_URL_BASE}/${LIFF_ID}/shop?search=shoes#item10`,
    );
  });

  it("LIFF ID の形が違う・道が / で始まらないときは投げる", () => {
    expect(() => miniAppPermalink("", "/e/x/checkin")).toThrow(RangeError);
    expect(() => miniAppPermalink("abc/def", "/e/x/checkin")).toThrow(RangeError);
    expect(() => miniAppPermalink(LIFF_ID, "e/x/checkin")).toThrow(RangeError);
    expect(() => miniAppPermalink(LIFF_ID, "//evil.example.com")).toThrow(RangeError);
  });
});
