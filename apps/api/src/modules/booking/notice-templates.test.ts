// 予約の知らせの文面の単体のテスト（booking-002）：6つの種類に名前・日時（日本時間）・場所・状態・リンクが入る・
// 渡さないリンクは出さない・5000文字を超えない・あいさつにリンクと期限が入る。
import { NOTICE_KINDS } from "@workspace/contracts/booking";
import { describe, expect, it } from "vitest";
import {
  NOTICE_TEXT_MAX,
  formatJstDateTime,
  greetingText,
  noticeEmailText,
  noticeSubject,
  noticeText,
  senderName,
} from "./notice-templates.ts";
import type { EntryNoticeKind, NoticeContext } from "./notice-templates.ts";

/** 2026-11-28（土）19:00 日本時間。 */
const STARTS = new Date("2026-11-28T10:00:00Z");

const BASE: NoticeContext = {
  holderName: "飲食チーム",
  eventName: "11月の交流会",
  startsAt: STARTS,
  venue: "渋谷の会議室",
};

const ENTRY_KINDS = NOTICE_KINDS.filter((kind): kind is EntryNoticeKind => kind !== "test");

describe("知らせの文面", () => {
  it("日時は日本時間・曜日つき（サーバーの時刻帯に頼らない）", () => {
    expect(formatJstDateTime(STARTS)).toBe("11月28日（土）19:00");
    expect(formatJstDateTime(new Date("2026-12-31T15:30:00Z"))).toBe("1月1日（金）00:30");
  });

  it("どの種類にも、交流会の名前・日時・場所・状態が入る", () => {
    for (const kind of ENTRY_KINDS) {
      const text = noticeText(kind, BASE);
      expect(text).toContain("11月の交流会");
      expect(text).toContain("11月28日（土）19:00");
      expect(text).toContain("渋谷の会議室");
      expect(text).toContain("あなたの状態：");
      expect(text).toContain("飲食チーム");
    }
  });

  it("状態と期限・何番目かが種類ごとに入る", () => {
    expect(noticeText("confirmed", BASE)).toContain("あなたの状態：確定");
    expect(noticeText("waitlisted", { ...BASE, waitlistPosition: 3 })).toContain(
      "キャンセル待ち（3番目）",
    );
    expect(
      noticeText("offered", { ...BASE, deadline: new Date("2026-11-27T00:00:00Z") }),
    ).toContain("返事の期限：11月27日（金）09:00");
    expect(noticeText("offer_expired", BASE)).toContain("あなたの状態：取り消し");
    expect(noticeText("cancelled_event", BASE)).toContain("中止になりました");
    const changed = noticeText("changed", {
      ...BASE,
      previous: { startsAt: new Date("2026-11-21T10:00:00Z"), venue: "新宿" },
    });
    expect(changed).toContain("前の日時：11月21日（土）19:00");
    expect(changed).toContain("前の場所：新宿");
  });

  it("渡したリンクだけを出す（確定にカレンダー、打診に返事、申込みを見る）", () => {
    const links = {
      entry: "https://example.com/entry",
      respond: "https://example.com/respond",
      calendar: "https://example.com/cal",
    };
    const confirmed = noticeText("confirmed", { ...BASE, links });
    expect(confirmed).toContain("カレンダーに追加：https://example.com/cal");
    expect(confirmed).toContain("申込みを見る・取り消す：https://example.com/entry");
    expect(confirmed).not.toContain("返事をする");
    expect(noticeText("offered", { ...BASE, links })).toContain(
      "返事をする：https://example.com/respond",
    );
    expect(noticeText("cancelled_event", { ...BASE, links })).not.toContain("https://");
    expect(noticeText("confirmed", BASE)).not.toContain("https://");
  });

  it("5000文字を超えない", () => {
    const long = noticeText("confirmed", { ...BASE, eventName: "あ".repeat(6000) });
    expect(long.length).toBeLessThanOrEqual(NOTICE_TEXT_MAX);
  });

  it("メールの題・送り主の名前・返信の案内", () => {
    expect(noticeSubject("confirmed", "11月の交流会")).toBe("【申込みの確定】11月の交流会");
    expect(senderName("飲食チーム")).toBe("飲食チーム（kanaeru）");
    expect(noticeEmailText("confirmed", BASE, true)).toContain("返信すると、飲食チームに届きます");
    expect(noticeEmailText("confirmed", BASE, false)).toContain("返信できません");
  });

  it("あいさつに持ち主の名前・リンク・期限が入る", () => {
    const text = greetingText("飲食チーム", "https://example.com/line-link/abc");
    expect(text).toContain("飲食チーム");
    expect(text).toContain("https://example.com/line-link/abc");
    expect(text).toContain("7日");
  });
});
