// 取り込みの行ごとの結果（純粋な関数）：入る・すでにある（数で比べる・取り消しも数える・媒体ごと）・名前が空・同じ名前の印。
import { describe, expect, it } from "vitest";
import { planImport } from "./importing.ts";
import type { ImportComparableEntry } from "./importing.ts";

/**
 * 名簿の行を作る。
 * @param name 名前
 * @param values ほかの列
 * @returns 行
 */
function entry(name: string, values: Partial<ImportComparableEntry> = {}): ImportComparableEntry {
  return { name, applicationSource: "peatix", entryKind: "import", status: "confirmed", ...values };
}

describe("取り込みの行ごとの結果", () => {
  it("空の名簿なら、名前のある行は入り、空の行は名前が空", () => {
    const plan = planImport(
      [
        { line: 2, name: "山田 花子" },
        { line: 3, name: "" },
      ],
      "peatix",
      [],
    );
    expect(plan.rows.map((row) => row.outcome)).toEqual(["insert", "empty"]);
    expect(plan.counts).toEqual({ insert: 1, existing: 0, empty: 1 });
  });

  it("同じ媒体の取り込みの行は、そろえた名前ごとに、その数まで「すでにある」（取り消しも数える）", () => {
    const plan = planImport(
      [
        { line: 2, name: "山田花子" },
        { line: 3, name: "山田 花子" },
        { line: 4, name: "鈴木 一郎" },
      ],
      "peatix",
      [entry("山田　花子"), entry("鈴木 一郎", { status: "cancelled" })],
    );
    expect(plan.rows.map((row) => row.outcome)).toEqual(["existing", "insert", "existing"]);
    expect(plan.counts).toEqual({ insert: 1, existing: 2, empty: 0 });
  });

  it("別の媒体の行や手で足した行は「すでにある」にせず、入る行に同じ名前の印を付ける", () => {
    const plan = planImport([{ line: 2, name: "山田 花子" }], "peatix", [
      entry("山田 花子", { applicationSource: "connpass" }),
      entry("山田 花子", { entryKind: "manual" }),
    ]);
    expect(plan.rows[0]).toMatchObject({ outcome: "insert", sameName: true });
  });

  it("同じ取り込みの中で同じ名前が2つ入るときも印を付ける。取り消しの行だけなら付けない", () => {
    const plan = planImport(
      [
        { line: 2, name: "佐藤 けん" },
        { line: 3, name: "佐藤けん" },
        { line: 4, name: "田中 りく" },
      ],
      "other",
      [entry("田中 りく", { applicationSource: "peatix", status: "cancelled" })],
    );
    expect(plan.rows.map((row) => row.sameName)).toEqual([true, true, false]);
  });

  it("もう一度同じものを取り込むと、すべて「すでにある」", () => {
    const rows = [
      { line: 2, name: "山田 花子" },
      { line: 3, name: "山田 花子" },
    ];
    const first = planImport(rows, "peatix", []);
    const inserted = first.rows
      .filter((row) => row.outcome === "insert")
      .map((row) => entry(row.name));
    expect(planImport(rows, "peatix", inserted).counts).toEqual({
      insert: 0,
      existing: 2,
      empty: 0,
    });
  });
});
