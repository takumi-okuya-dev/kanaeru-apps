// QR と招待のリンクの中身：LIFF ID があればミニアプリの URL（AD-14）、なければ画面の源＋参加者の道。
import { describe, expect, it } from "vitest";
import {
  checkinQrValue,
  inviteLinkValue,
  participantUrl,
  surveyQrValue,
  usesMiniAppUrl,
} from "./links.ts";

/** 試しの LIFF ID。 */
const LIFF_ID = "1234567890-AbCdEfGh";

/** 試しの交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000000";

describe("QR と招待のリンクの中身", () => {
  it("LIFF ID があれば、ミニアプリの URL に参加者の道を入れる", () => {
    expect(usesMiniAppUrl(LIFF_ID)).toBe(true);
    expect(checkinQrValue(EVENT_ID, LIFF_ID)).toBe(
      `https://miniapp.line.me/${LIFF_ID}/e/${EVENT_ID}/checkin`,
    );
    expect(surveyQrValue(EVENT_ID, LIFF_ID)).toBe(
      `https://miniapp.line.me/${LIFF_ID}/e/${EVENT_ID}/survey`,
    );
    expect(inviteLinkValue("abc_DEF-123", LIFF_ID)).toBe(
      `https://miniapp.line.me/${LIFF_ID}/invite/abc_DEF-123`,
    );
  });

  it("別の交流会では、別の道になる", () => {
    const other = "0193a1b2-0000-7000-8000-000000000001";
    expect(checkinQrValue(other, LIFF_ID)).not.toBe(checkinQrValue(EVENT_ID, LIFF_ID));
  });

  it("LIFF ID のない手元・テストは、画面の源＋参加者の道", () => {
    expect(usesMiniAppUrl("")).toBe(false);
    expect(participantUrl("/e/x/checkin", "", "http://127.0.0.1:9787")).toBe(
      "http://127.0.0.1:9787/e/x/checkin",
    );
    // テストの組み立ては LIFF ID が空
    expect(checkinQrValue(EVENT_ID)).toBe(`${window.location.origin}/e/${EVENT_ID}/checkin`);
  });
});
