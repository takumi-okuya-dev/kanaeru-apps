// @vitest-environment jsdom
// メニューと下から出す枠：ボタンで開き、項目に名前があり、Esc で閉じてボタンへフォーカスを戻す。axe の違反がない。
// 選択肢のチップの名前を隠しても、まとまりの名前として読み上げる。
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../testing/axe.ts";
import { Button } from "./button.tsx";
import { ChoiceChips } from "./choice-chips.tsx";
import { Menu, MenuContent, MenuGroup, MenuLinkItem, MenuSeparator, MenuTrigger } from "./menu.tsx";
import { Sheet } from "./sheet.tsx";

describe("メニュー", () => {
  it("ボタンで開き、見出しのまとまりと行き先の項目を出し、Esc で閉じてボタンへ戻る", async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger render={<Button />}>アプリを切り替える</MenuTrigger>
        <MenuContent>
          <MenuGroup label="使えるアプリ">
            <MenuLinkItem href="#a" data-current="">
              受付
            </MenuLinkItem>
            <MenuLinkItem href="#b">見本</MenuLinkItem>
          </MenuGroup>
          <MenuSeparator />
          <MenuLinkItem href="#all">すべてのアプリ</MenuLinkItem>
        </MenuContent>
      </Menu>,
    );
    const trigger = screen.getByRole("button", { name: "アプリを切り替える" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(screen.getByRole("group", { name: "使えるアプリ" })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "受付",
      "見本",
      "すべてのアプリ",
    ]);
    await expectNoAxeViolations(menu);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

/**
 * 下から出す枠を開くボタンつきで描く。
 * @returns 要素
 */
function SheetHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>開く</Button>
      <Sheet open={open} onOpenChange={setOpen} title="アプリを切り替える">
        <a href="#a">受付</a>
      </Sheet>
    </>
  );
}

describe("下から出す枠", () => {
  it("題の名前のダイアログで、閉じるのボタンで閉じて、開いたボタンへ戻る", async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole("button", { name: "開く" }));
    const dialog = await screen.findByRole("dialog", { name: "アプリを切り替える" });
    await expectNoAxeViolations(dialog);
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "開く" })).toHaveFocus());
  });
});

describe("選択肢のチップ（名前を隠す）", () => {
  it("名前は見えないが、まとまりの名前として読み上げる", () => {
    render(
      <ChoiceChips
        label="受付の公開の状態"
        labelHidden
        options={[
          { value: "off", label: "切" },
          { value: "public", label: "公開" },
        ]}
        value="public"
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "受付の公開の状態" })).toBeInTheDocument();
    expect(screen.getByText("受付の公開の状態")).toHaveClass("sr-only");
  });
});
