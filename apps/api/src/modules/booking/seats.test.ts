// 席の数え方の単体のテスト（booking-004 research R2・R3・R4）：埋まった席・枠の未充足・押さえをやめたあと・自前の残り・満員・
// 超えた人数・止める媒体・期限を過ぎた打診中・新しい申込みの行き先・何番目か。
import { describe, expect, it } from "vitest";
import type { SeatConfig, SeatEntry } from "./seats.ts";
import { canConfirmNew, countSeats, toSeatSummary, waitlistPosition } from "./seats.ts";

const NOW = new Date("2026-12-01T03:00:00Z");

let serial = 0;

/**
 * 申込みを作る。
 * @param values 変える値
 * @returns 申込み
 */
function entry(values: Partial<SeatEntry> = {}): SeatEntry {
  serial += 1;
  return {
    id: `00000000-0000-7000-8000-${String(serial).padStart(12, "0")}`,
    status: "confirmed",
    applicationSource: "direct",
    appliedAt: new Date(NOW.getTime() - 1000 * (100 - serial)),
    offerDeadline: null,
    ...values,
  };
}

/**
 * 同じ形の申込みを n 個作る。
 * @param n 数
 * @param values 変える値
 * @returns 申込み
 */
function many(n: number, values: Partial<SeatEntry> = {}): SeatEntry[] {
  return Array.from({ length: n }, () => entry(values));
}

const CONFIG: SeatConfig = {
  capacity: 16,
  quotas: [{ applicationSource: "peatix", seats: 4, manageUrl: "https://example.com/m" }],
  quotasReleased: false,
};

describe("席の数え方", () => {
  it("埋まった席は確定と打診中。自前の残りは枠の未充足を引く", () => {
    const later = new Date(NOW.getTime() + 60_000);
    const count = countSeats(
      CONFIG,
      [
        ...many(10),
        ...many(2, { applicationSource: "peatix" }),
        entry({ status: "offered", offerDeadline: later }),
        ...many(3, { status: "cancelled" }),
        ...many(2, { status: "waitlisted" }),
      ],
      NOW,
    );
    expect(count.filled).toBe(13);
    expect(count.confirmed).toBe(12);
    expect(count.offered).toBe(1);
    expect(count.selfRemaining).toBe(16 - 13 - 2);
    expect(count.quotas[0]).toMatchObject({ filled: 2, remaining: 2 });
    expect(count.full).toBe(false);
    expect(count.stopSources).toEqual([]);
    expect(count.waitlist).toHaveLength(2);
  });

  it("期限を過ぎた打診中は席を押さえない", () => {
    const count = countSeats(
      { capacity: 2, quotas: [], quotasReleased: false },
      [entry(), entry({ status: "offered", offerDeadline: NOW })],
      NOW,
    );
    expect(count.filled).toBe(1);
    expect(count.selfRemaining).toBe(1);
  });

  it("満員なら止める媒体（枠のある媒体と、取り消しでない申込みのある直接でない媒体）", () => {
    const count = countSeats(
      CONFIG,
      [
        ...many(11),
        ...many(4, { applicationSource: "peatix" }),
        entry({ applicationSource: "connpass" }),
        entry({ applicationSource: "other", status: "cancelled" }),
      ],
      NOW,
    );
    expect(count.full).toBe(true);
    expect(count.selfRemaining).toBe(0);
    expect(count.stopSources).toEqual([
      { applicationSource: "connpass", manageUrl: null },
      { applicationSource: "peatix", manageUrl: "https://example.com/m" },
    ]);
  });

  it("押さえをやめたら、枠の空きも自前の残りになる。超えた人数を数える", () => {
    const entries = [...many(12), ...many(3, { applicationSource: "peatix" })];
    expect(countSeats(CONFIG, entries, NOW).selfRemaining).toBe(0);
    expect(countSeats({ ...CONFIG, quotasReleased: true }, entries, NOW).selfRemaining).toBe(1);
    const over = countSeats(CONFIG, [...entries, ...many(3)], NOW);
    expect(over.over).toBe(2);
    expect(over.selfRemaining).toBeLessThan(0);
  });

  it("定員なしは残りが限りなく、満員にならない", () => {
    const count = countSeats({ capacity: null, quotas: [], quotasReleased: false }, many(5), NOW);
    expect(count.selfRemaining).toBe(Number.POSITIVE_INFINITY);
    expect(count.full).toBe(false);
    expect(toSeatSummary(count, false, false)).toBeNull();
  });

  it("新しい申込みは、残りがありキャンセル待ちがいない（か当日の空き）ときだけ確定", () => {
    const config: SeatConfig = { capacity: 3, quotas: [], quotasReleased: false };
    expect(canConfirmNew(countSeats(config, many(2), NOW), false)).toBe(true);
    const waiting = countSeats(config, [...many(2), entry({ status: "waitlisted" })], NOW);
    expect(canConfirmNew(waiting, false)).toBe(false);
    expect(canConfirmNew(waiting, true)).toBe(true);
    expect(canConfirmNew(countSeats(config, many(3), NOW), true)).toBe(false);
  });

  it("キャンセル待ちの並びは申し込んだ日時の古い順・同じ時刻は ID の順", () => {
    const at = new Date(NOW.getTime() - 5000);
    const late = entry({ status: "waitlisted", appliedAt: NOW });
    const b = entry({ status: "waitlisted", appliedAt: at, id: "b" });
    const a = entry({ status: "waitlisted", appliedAt: at, id: "a" });
    const count = countSeats(CONFIG, [late, b, a], NOW);
    expect(count.waitlist).toEqual(["a", "b", late.id]);
    expect(waitlistPosition(count, late.id)).toBe(3);
    expect(waitlistPosition(count, "nothing")).toBeNull();
  });

  it("主催者の内訳は残りを0より下にせず、当日の空きは残りがあるときだけ", () => {
    const count = countSeats({ capacity: 1, quotas: [], quotasReleased: true }, many(2), NOW);
    expect(toSeatSummary(count, true, true)).toMatchObject({
      capacity: 1,
      filled: 2,
      selfRemaining: 0,
      over: 1,
      full: true,
      sameDay: false,
      quotasReleased: true,
    });
  });
});
