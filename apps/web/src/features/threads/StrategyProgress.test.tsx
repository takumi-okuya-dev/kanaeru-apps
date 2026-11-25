// 戦略の進みのカードと区分のタブ（threads-012・threads-017・threads-018）：数・「次におすすめ」で項目へ移る・最後に保存した日時・
// タブの区分ごとの十分の数と今の区分。
import { checkStrategy, emptyStrategyValues } from "@workspace/contracts/threads";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StrategyProgress, StrategySectionTabs } from "./StrategyProgress.tsx";

describe("StrategyProgress", () => {
  it("はじめは0件で、次におすすめは Q1。まだ保存していない", () => {
    render(
      <StrategyProgress
        check={checkStrategy(emptyStrategyValues())}
        updatedAt={null}
        onGoToField={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /^次におすすめ：Q1/ })).toBeTruthy();
    expect(screen.getByText("まだ保存していません")).toBeTruthy();
    expect(screen.getByText("十分 0/16項目・短め 0件・活動の目的 0/5問")).toBeTruthy();
  });

  it("「次におすすめ」を押すと、その項目へ移る", () => {
    const values = { ...emptyStrategyValues(), purposeOrigin: "x".repeat(80) };
    const onGoToField = vi.fn();
    render(
      <StrategyProgress
        check={checkStrategy(values)}
        updatedAt="2026-11-20T01:02:00Z"
        onGoToField={onGoToField}
      />,
    );
    expect(screen.getByText("最後に保存：2026-11-20 10:02")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^次におすすめ：Q2/ }));
    expect(onGoToField).toHaveBeenCalledWith("purposeSelf");
  });
});

describe("StrategySectionTabs", () => {
  it("完了の数と、区分ごとの十分の数を出し、今の区分に印を付け、押すと選ぶ", () => {
    const onSelect = vi.fn();
    render(
      <StrategySectionTabs
        check={checkStrategy(emptyStrategyValues())}
        current="sales"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText("完了 0/16")).toBeTruthy();
    expect(screen.getByRole("button", { name: "目的 0/5" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "下書き" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "営業導線 0/5" }).getAttribute("aria-current")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "目的 0/5" }));
    expect(onSelect).toHaveBeenCalledWith("purpose");
    expect(screen.getByRole("navigation", { name: "区分" })).toBeTruthy();
  });
});
