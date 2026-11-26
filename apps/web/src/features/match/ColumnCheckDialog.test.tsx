// 列の確かめの枠の試験：氏名の列がなければ押せない・選ぶと押せる・読めない選択肢が残ると押せない・取り込む結果（match-008）。
// 名前はどれも架空のもの。
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseCsv } from "../../lib/csv-read.ts";
import { ColumnCheckDialog } from "./ColumnCheckDialog.tsx";
import type { RosterReadResult } from "./roster-read.ts";

describe("列の確かめの枠", () => {
  it("氏名の列が見つからないと知らせを出して押せず、選ぶと人数が出て取り込める", async () => {
    const parsed = parseCsv(
      ["タイムスタンプ,メールアドレス,参加者", "2026/11/20 9:12:45,a@example.com,山田 太郎", "2026/11/20 9:30:00,b@example.com,佐藤 花子"].join("\n"),
    );
    const onImport = vi.fn((_result: RosterReadResult) => true);
    render(<ColumnCheckDialog parsed={parsed} sourceLabel="form.csv" onClose={() => {}} onImport={onImport} />);
    expect(screen.getByText(/氏名の列が見つかりませんでした/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "取り込む（氏名の列を選んでください）" }).hasAttribute("disabled")).toBe(true);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /氏名の列/u }), "参加者");
    const button = screen.getByRole("button", { name: "この列で2人を取り込む" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("山田 太郎")).toBeTruthy();
    await userEvent.click(button);
    expect(onImport.mock.calls[0]?.[0].people.map((person) => person.fullName)).toEqual(["山田 太郎", "佐藤 花子"]);
  });

  it("読めない選択肢が残ると押せず、レベルを選ぶと押せる", async () => {
    const parsed = parseCsv(["氏名,レベル", "山田 太郎,A：大会に出ている", "佐藤 花子,2中級"].join("\n"));
    render(<ColumnCheckDialog parsed={parsed} sourceLabel="貼り付けた表" onClose={() => {}} onImport={() => true} />);
    expect(screen.getByRole("button", { name: "取り込む（レベルを選んでください）" }).hasAttribute("disabled")).toBe(true);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "A：大会に出ている のレベル" }), "上級");
    expect(screen.getByRole("button", { name: "この列で2人を取り込む" }).hasAttribute("disabled")).toBe(false);
  });
});
