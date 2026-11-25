// 自前の申込みページの約束：名前とメールアドレスの形・申込みページの設定の入力・カレンダーのリンク（booking-003）。名前・アドレスは架空のもの。
import { describe, expect, it } from "vitest";
import { CHECKIN_NAME_MAX } from "../reception/index.ts";
import {
  APPLY_NAME_MAX,
  ApplyInput,
  EmailApplyInput,
  SelfPageInput,
  calendarStamp,
  eventEndsAt,
  googleCalendarUrl,
} from "./index.ts";

/**
 * 誤りの欄と文を並べる。
 * @param result safeParse の結果
 * @param result.success 通ったか
 * @param result.error 誤り
 * @returns 欄と文の組
 */
function issuesOf(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}): [string, string][] {
  return (result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]);
}

describe("自前の申込みページの約束", () => {
  it("名前の上限は受付のチェックインの名前と同じ", () => {
    expect(APPLY_NAME_MAX).toBe(CHECKIN_NAME_MAX);
  });

  it("申し込む：名前は前後の空白を消し、空と51文字は誤り。案内の同意は任意", () => {
    expect(ApplyInput.parse({ name: " 中村 さき " })).toEqual({ name: "中村 さき" });
    expect(ApplyInput.parse({ name: "中村", consent: true })).toEqual({
      name: "中村",
      consent: true,
    });
    expect(issuesOf(ApplyInput.safeParse({ name: " " }))).toEqual([
      ["name", "名前を入れてください。"],
    ]);
    expect(ApplyInput.safeParse({ name: "あ".repeat(51) }).success).toBe(false);
    expect(ApplyInput.safeParse({ name: "中村", extra: 1 }).success).toBe(false);
  });

  it("メールで申し込む：アドレスは小文字にそろえ、形が違えば欄のそばの文", () => {
    expect(EmailApplyInput.parse({ name: "小林", email: "Guest@Example.com" })).toEqual({
      name: "小林",
      email: "guest@example.com",
    });
    expect(issuesOf(EmailApplyInput.safeParse({ name: "小林", email: "guest" }))).toEqual([
      ["email", "メールアドレスの形で入れてください（例：name@example.com）。"],
    ]);
    // 改行を含む値（ヘッダーへの差しこみ）は通さない
    expect(EmailApplyInput.safeParse({ name: "小林", email: "a@b.jp\nBcc: c@d.jp" }).success).toBe(
      false,
    );
  });

  it("申込みページの設定：受付と見せる範囲は両方要る", () => {
    expect(SelfPageInput.parse({ accepting: true, visibility: "members" })).toEqual({
      accepting: true,
      visibility: "members",
    });
    expect(issuesOf(SelfPageInput.safeParse({ accepting: true, visibility: "staff" }))).toEqual([
      ["visibility", "見せる範囲を選んでください。"],
    ]);
  });
});

describe("カレンダーに追加", () => {
  it("終わりは始まりの2時間後。時刻は UTC の形", () => {
    const starts = new Date("2026-12-06T13:00:00+09:00");
    expect(eventEndsAt(starts).toISOString()).toBe("2026-12-06T06:00:00.000Z");
    expect(calendarStamp(starts)).toBe("20261206T040000Z");
  });

  it("Google カレンダーのリンクに名前・時刻・会場・説明を入れる（会場がなければ入れない）", () => {
    const url = new URL(
      googleCalendarUrl({
        name: "土曜の練習 & 交流",
        startsAt: "2026-12-06T13:00:00+09:00",
        venue: "中央市民体育館",
        details: "主催：バドミントンの部",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("土曜の練習 & 交流");
    expect(url.searchParams.get("dates")).toBe("20261206T040000Z/20261206T060000Z");
    expect(url.searchParams.get("location")).toBe("中央市民体育館");
    expect(url.searchParams.get("details")).toBe("主催：バドミントンの部");
    const noVenue = new URL(
      googleCalendarUrl({ name: "勉強会", startsAt: "2026-12-06T13:00:00+09:00", venue: null }),
    );
    expect(noVenue.searchParams.has("location")).toBe(false);
  });
});
