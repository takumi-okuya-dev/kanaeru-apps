// 一覧画面の行の印：@workspace/ui の札（Badge）で出し、印ごとの地（DESIGN.md の flag-same-name・flag-manual）が札の既定に勝つ。
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManualFlag, SameNameFlag } from "./flags.tsx";

describe("一覧画面の行の印", () => {
  it("同じ名前の印は、注意の黄色の地とことばの札", () => {
    render(<SameNameFlag />);
    const flag = screen.getByText("同じ名前があります");
    expect(flag).toHaveAttribute("data-slot", "badge");
    expect(flag).toHaveClass("bg-warning", "border-transparent", "text-text");
    expect(flag).not.toHaveClass("bg-surface", "border-border-input");
  });

  it("手でのチェックインの印は、くぼみの地に入れた人の名前を出し、長くても折り返す", () => {
    render(<ManualFlag enteredByName="受付係の山田" />);
    const flag = screen.getByText("手でのチェックイン（入れた人：受付係の山田）");
    expect(flag).toHaveAttribute("data-slot", "badge");
    expect(flag).toHaveClass("bg-surface-sunken", "border-border", "text-text-sub", "font-normal");
    expect(flag).toHaveClass("whitespace-normal");
    expect(flag).not.toHaveClass("whitespace-nowrap", "font-bold", "bg-surface");
  });

  it("入れた人がわからなければ「手でのチェックイン」だけ", () => {
    render(<ManualFlag enteredByName={null} />);
    expect(screen.getByText("手でのチェックイン")).toHaveAttribute("data-slot", "badge");
  });
});
