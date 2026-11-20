// 打診の返事の期限の単体のテスト（booking-004 research R6）：24時間・夜の9時・ちょうど0時と9時・始まりの2時間前・
// 2時間前が夜なら0時・1時間ちょうどと1ミリ秒足りないとき・サーバーの時刻帯に頼らないこと。時刻はどれも日本時間で書く。
import { afterEach, describe, expect, it } from "vitest";
import { isSameDayWindow, offerDeadline } from "./deadline.ts";

/**
 * 日本時間の時刻を作る。
 * @param value `2026-12-01T10:00:00.000` の形（日本時間）
 * @returns 時刻
 */
function jst(value: string): Date {
  return new Date(`${value}+09:00`);
}

/** 遠い始まり（2時間前の決まりが効かない）。 */
const FAR = jst("2026-12-20T19:00:00.000");

describe("打診の返事の期限", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("打診から24時間", () => {
    expect(offerDeadline(jst("2026-12-01T10:00:00.000"), FAR)).toEqual(
      jst("2026-12-02T10:00:00.000"),
    );
  });

  it("夜（0時より後・9時より前）に切れるなら、その朝の9時", () => {
    expect(offerDeadline(jst("2026-12-01T08:30:00.000"), FAR)).toEqual(
      jst("2026-12-02T09:00:00.000"),
    );
    expect(offerDeadline(jst("2026-12-01T00:00:00.001"), FAR)).toEqual(
      jst("2026-12-02T09:00:00.000"),
    );
    expect(offerDeadline(jst("2026-12-01T08:59:59.999"), FAR)).toEqual(
      jst("2026-12-02T09:00:00.000"),
    );
  });

  it("ちょうど0時とちょうど9時は夜に含めない（そのまま）", () => {
    expect(offerDeadline(jst("2026-12-01T00:00:00.000"), FAR)).toEqual(
      jst("2026-12-02T00:00:00.000"),
    );
    expect(offerDeadline(jst("2026-12-01T09:00:00.000"), FAR)).toEqual(
      jst("2026-12-02T09:00:00.000"),
    );
  });

  it("始まりの2時間前より後なら、始まりの2時間前（ちょうどはそのまま）", () => {
    expect(offerDeadline(jst("2026-12-01T10:00:00.000"), jst("2026-12-02T11:00:00.000"))).toEqual(
      jst("2026-12-02T09:00:00.000"),
    );
    expect(offerDeadline(jst("2026-12-01T10:00:00.000"), jst("2026-12-02T12:00:00.000"))).toEqual(
      jst("2026-12-02T10:00:00.000"),
    );
    expect(offerDeadline(jst("2026-12-01T10:00:00.000"), jst("2026-12-02T12:00:00.001"))).toEqual(
      jst("2026-12-02T10:00:00.000"),
    );
  });

  it("始まりの2時間前が夜なら、その日の0時（前の夜の24時）", () => {
    expect(offerDeadline(jst("2026-12-01T14:00:00.000"), jst("2026-12-02T10:00:00.000"))).toEqual(
      jst("2026-12-02T00:00:00.000"),
    );
    // 2時間前が9時ちょうどなら夜ではない
    expect(offerDeadline(jst("2026-12-01T14:00:00.000"), jst("2026-12-02T11:00:00.000"))).toEqual(
      jst("2026-12-02T09:00:00.000"),
    );
  });

  it("1時間ちょうど取れれば打診し、1ミリ秒でも足りなければ打診しない", () => {
    const startsAt = jst("2026-12-02T00:00:00.000");
    expect(offerDeadline(jst("2026-12-01T21:00:00.000"), startsAt)).toEqual(
      jst("2026-12-01T22:00:00.000"),
    );
    expect(offerDeadline(jst("2026-12-01T21:00:00.001"), startsAt)).toBeNull();
  });

  it("0時に引き戻して1時間に足りなければ打診しない", () => {
    expect(
      offerDeadline(jst("2026-12-01T23:30:00.000"), jst("2026-12-02T10:00:00.000")),
    ).toBeNull();
  });

  it("始まりを過ぎていれば打診しない", () => {
    expect(
      offerDeadline(jst("2026-12-02T10:00:00.000"), jst("2026-12-02T09:00:00.000")),
    ).toBeNull();
  });

  it("サーバーの時刻帯に頼らない", () => {
    const now = jst("2026-12-01T08:30:00.000");
    const expected = offerDeadline(now, FAR);
    for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Pacific/Auckland"]) {
      process.env.TZ = tz;
      expect(offerDeadline(now, FAR)).toEqual(expected);
    }
  });

  it("当日の空きの時間は、始まりの前で期限が1時間取れないとき", () => {
    const startsAt = jst("2026-12-01T19:00:00.000");
    expect(isSameDayWindow(jst("2026-12-01T15:59:59.999"), startsAt)).toBe(false);
    expect(isSameDayWindow(jst("2026-12-01T16:00:00.001"), startsAt)).toBe(true);
    expect(isSameDayWindow(jst("2026-12-01T19:00:00.000"), startsAt)).toBe(false);
  });
});
