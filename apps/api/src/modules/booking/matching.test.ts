// 当ての決め方（純粋な関数）：手・自動・候補がちょうど1つ・2つなら出ない・ちがう人・取り消しは当てない・来なかった・同じ名前の印。
import { describe, expect, it } from "vitest";
import { attendanceOf, resolveMatches, sameNameEntryIds } from "./matching.ts";
import type { MatchableEntry } from "./matching.ts";

/**
 * 名簿の行を作る。
 * @param id 行の ID
 * @param name 名前
 * @param values ほかの列
 * @returns 行
 */
function entry(id: string, name: string, values: Partial<MatchableEntry> = {}): MatchableEntry {
  return {
    id,
    name,
    entryKind: "import",
    status: "confirmed",
    accountId: null,
    checkinId: null,
    ...values,
  };
}

describe("当ての決め方", () => {
  it("手で当てた行・飛び入りの行は、その状態で当たる", () => {
    const result = resolveMatches(
      [
        entry("e1", "山田", { checkinId: "c1" }),
        entry("e2", "井上", { checkinId: "c2", entryKind: "walk_in" }),
      ],
      [
        { checkinId: "c1", name: "やまだ", accountId: "a1" },
        { checkinId: "c2", name: "井上", accountId: null },
      ],
      [],
    );
    expect(result.byCheckin.get("c1")).toEqual({ state: "matched_manual", entryId: "e1" });
    expect(result.byCheckin.get("c2")).toEqual({ state: "walk_in", entryId: "e2" });
    expect(result.byEntry.get("e1")).toEqual({ checkinId: "c1", kind: "manual" });
  });

  it("同じアカウントの行は自動で当たる（取り消しの行は当てない）", () => {
    const result = resolveMatches(
      [
        entry("e1", "中村", { accountId: "a1" }),
        entry("e2", "森", { accountId: "a2", status: "cancelled" }),
      ],
      [
        { checkinId: "c1", name: "さき", accountId: "a1" },
        { checkinId: "c2", name: "森", accountId: "a2" },
      ],
      [],
    );
    expect(result.byCheckin.get("c1")).toEqual({ state: "matched_auto", entryId: "e1" });
    expect(result.byEntry.get("e1")?.kind).toBe("auto");
    expect(result.byCheckin.get("c2")).toEqual({ state: "unmatched", entryId: null });
  });

  it("名前がそろう当たっていない確定の行がちょうど1つなら候補。2つ・0なら名簿にいない", () => {
    const result = resolveMatches(
      [entry("e1", "佐藤 けん"), entry("e2", "鈴木 一郎"), entry("e3", "鈴木一郎")],
      [
        { checkinId: "c1", name: "佐藤けん", accountId: "a1" },
        { checkinId: "c2", name: "鈴木 一郎", accountId: "a2" },
        { checkinId: "c3", name: "Haru", accountId: "a3" },
      ],
      [],
    );
    expect(result.byCheckin.get("c1")).toEqual({ state: "candidate", entryId: "e1" });
    expect(result.byCheckin.get("c2")).toEqual({ state: "unmatched", entryId: null });
    expect(result.byCheckin.get("c3")).toEqual({ state: "unmatched", entryId: null });
    expect(result.byEntry.size).toBe(0);
  });

  it("ちがう人にした組と、取り消し・当たった行は候補にしない", () => {
    const result = resolveMatches(
      [
        entry("e1", "佐藤"),
        entry("e2", "田中", { status: "cancelled" }),
        entry("e3", "森", { checkinId: "c9" }),
      ],
      [
        { checkinId: "c1", name: "佐藤", accountId: null },
        { checkinId: "c2", name: "田中", accountId: null },
        { checkinId: "c3", name: "森", accountId: null },
        { checkinId: "c9", name: "もり", accountId: null },
      ],
      [{ checkinId: "c1", entryId: "e1" }],
    );
    expect(result.byCheckin.get("c1")?.state).toBe("unmatched");
    expect(result.byCheckin.get("c2")?.state).toBe("unmatched");
    expect(result.byCheckin.get("c3")?.state).toBe("unmatched");
  });

  it("来たか：当たれば来た・日が終わった確定は来なかった・取り消しとまだの日はまだ", () => {
    expect(attendanceOf({ status: "confirmed" }, true, false)).toBe("came");
    expect(attendanceOf({ status: "confirmed" }, false, true)).toBe("no_show");
    expect(attendanceOf({ status: "cancelled" }, false, true)).toBe("pending");
    expect(attendanceOf({ status: "confirmed" }, false, false)).toBe("pending");
  });

  it("同じ名前の印は、取り消しでない行のうち2つ以上のものだけ", () => {
    const ids = sameNameEntryIds([
      { id: "e1", name: "佐藤 けん", status: "confirmed" },
      { id: "e2", name: "佐藤けん", status: "confirmed" },
      { id: "e3", name: "田中", status: "confirmed" },
      { id: "e4", name: "田中", status: "cancelled" },
    ]);
    expect([...ids].sort()).toEqual(["e1", "e2"]);
  });
});
