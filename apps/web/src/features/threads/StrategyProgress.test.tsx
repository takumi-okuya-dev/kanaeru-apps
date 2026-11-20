// 戦略の進みのカード（threads-012）：数・区分ごとの十分の数・「次におすすめ」で項目へ移る・最後に保存した日時。
import { checkStrategy, emptyStrategyValues } from "@workspace/contracts/threads";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StrategyProgress, strategyFieldElementId } from "./StrategyProgress.tsx";

describe("StrategyProgress", () => {
  it("はじめは0件で、次におすすめは Q1。区分のチップに十分の数を出す", () => {
    render(<StrategyProgress check={checkStrategy(emptyStrategyValues())} updatedAt={null} />);
    expect(screen.getByRole("button", { name: /^次におすすめ：Q1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "目的（0/5）" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "下書き" })).toBeTruthy();
    expect(screen.getByText("まだ保存していません")).toBeTruthy();
  });

  it("「次におすすめ」を押すと、その項目の欄にフォーカスが移る", () => {
    const values = { ...emptyStrategyValues(), purposeOrigin: "x".repeat(80) };
    render(
      <>
        <StrategyProgress check={checkStrategy(values)} updatedAt="2026-11-20T01:02:00Z" />
        <div id={strategyFieldElementId("purposeSelf")}>
          <textarea aria-label="Q2" />
        </div>
      </>,
    );
    expect(screen.getByText("最後に保存：2026-11-20 10:02")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^次におすすめ：Q2/ }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Q2" }));
  });
});
