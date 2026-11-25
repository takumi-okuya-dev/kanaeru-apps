// @vitest-environment jsdom
// 選択肢のチップ：ラジオのまとまりとして読み上げ、押すと1つだけ選び、矢印で移る。誤りは設問に結ぶ。axe の違反がない。
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../testing/axe.ts";
import { ChoiceChips, focusChoiceGroup } from "./choice-chips.tsx";

/** 支払い方法の選択肢。 */
const OPTIONS = [
  { value: "paypay", label: "PayPay" },
  { value: "cash", label: "現金" },
  { value: "free", label: "無料（招待など）" },
] as const;

/**
 * 選んだ値を持つ入れ物。
 * @param props 誤りの文（error）
 * @param props.error 誤りの文
 * @returns 要素
 */
function Harness({ error }: { error?: string }) {
  const [value, setValue] = useState<(typeof OPTIONS)[number]["value"] | null>(null);
  return (
    <form>
      <ChoiceChips
        label="支払い方法"
        options={OPTIONS}
        value={value}
        onValueChange={setValue}
        error={error}
      />
      <output>{value ?? "なし"}</output>
    </form>
  );
}

describe("選択肢のチップ", () => {
  it("設問の名前のラジオのまとまりで、最初はどれも選ばれていない", async () => {
    const { container } = render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "支払い方法" });
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual([
      "PayPay",
      "現金",
      "無料（招待など）",
    ]);
    for (const radio of radios) expect(radio).toHaveAttribute("aria-checked", "false");
    expect(group).not.toHaveAttribute("aria-invalid");
    await expectNoAxeViolations(container);
  });

  it("押すと1つだけ選び、別のチップを押すと移る。選んだチップにはチェックの印", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "現金" }));
    expect(screen.getByRole("radio", { name: "現金" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "現金" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("radio", { name: "PayPay" }).querySelector("svg")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "PayPay" }));
    expect(screen.getByRole("radio", { name: "PayPay" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "現金" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("status")).toHaveTextContent("paypay");
  });

  it("矢印で移って選ぶ", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "PayPay" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "現金" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "現金" })).toHaveAttribute("aria-checked", "true");
  });

  it("誤りは設問の下に出し、まとまりに結ぶ。誤りの設問へフォーカスを移せる", async () => {
    const { container } = render(<Harness error="支払い方法を選んでください。" />);
    const group = screen.getByRole("radiogroup", { name: "支払い方法" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription("支払い方法を選んでください。");
    focusChoiceGroup(group);
    expect(screen.getByRole("radio", { name: "PayPay" })).toHaveFocus();
    await expectNoAxeViolations(container);
  });
});
