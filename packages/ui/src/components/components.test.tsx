// @vitest-environment jsdom
// 部品の単体のテスト：名前・説明・誤りが欄に結ばれ、確かめの枠が消す前に止まり、axe の違反がないこと。
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../testing/axe.ts";
import { Button } from "./button.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { Disclosure } from "./disclosure.tsx";
import { Field } from "./field.tsx";
import { Input } from "./input.tsx";
import { ResponseMessage } from "./response-message.tsx";
import { Textarea } from "./textarea.tsx";

describe("入力の欄のまとまり", () => {
  it("名前・説明・誤りが欄に結ばれ、誤りがあれば aria-invalid がつく", async () => {
    const { container } = render(
      <form>
        <Field label="題" description="100文字まで" error="題を入れてください。" required>
          <Input name="title" />
        </Field>
        <Field label="本文">
          <Textarea name="body" />
        </Field>
      </form>,
    );
    const title = screen.getByRole("textbox", { name: /題/ });
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAttribute("aria-required", "true");
    expect(title).toHaveAccessibleDescription("100文字まで 題を入れてください。");
    const body = screen.getByRole("textbox", { name: "本文" });
    expect(body).not.toHaveAttribute("aria-invalid");
    await expectNoAxeViolations(container);
  });
});

describe("送った結果の文", () => {
  it("できたは status、誤りは alert で読み上げる", () => {
    render(
      <>
        <ResponseMessage tone="success">保存しました。</ResponseMessage>
        <ResponseMessage tone="danger">保存できませんでした。</ResponseMessage>
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("保存しました。");
    expect(screen.getByRole("alert")).toHaveTextContent("保存できませんでした。");
  });
});

/**
 * 確かめの枠を開くボタンつきで描く。
 * @param props 確かめを押したとき（onConfirm）・処理中か（pending）
 * @returns 要素
 */
function ConfirmHarness({
  onConfirm,
  pending = false,
}: {
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>削除</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="メモを削除しますか"
        confirmLabel="削除"
        pending={pending}
        onConfirm={onConfirm}
      >
        削除したメモは元に戻せません。
      </ConfirmDialog>
    </>
  );
}

describe("確かめの枠", () => {
  it("開くとキャンセルにフォーカスがあり、キャンセルで閉じる（確かめは呼ばない）", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("alertdialog", { name: "メモを削除しますか" });
    expect(dialog).toHaveAccessibleDescription("削除したメモは元に戻せません。");
    await waitFor(() => expect(screen.getByRole("button", { name: "キャンセル" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
    // 閉じたら、開いたボタンへフォーカスを戻す
    await waitFor(() => expect(screen.getByRole("button", { name: "削除" })).toHaveFocus());
  });

  it("確かめのボタンで onConfirm を呼び、処理中は押しても呼ばない", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(<ConfirmHarness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("alertdialog");
    /**
     * 枠の中の「削除」を押す。
     * @returns 押し終わり
     */
    const clickConfirm = () => user.click(within(dialog).getByRole("button", { name: "削除" }));
    await clickConfirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    rerender(<ConfirmHarness onConfirm={onConfirm} pending />);
    await clickConfirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "削除" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});

describe("「詳しく」の開け閉め", () => {
  it("初めは閉じていて、見出しを押すと中身が見え、もう一度押すと隠れる", async () => {
    const { container } = render(
      <Disclosure summary="詳しい手順">
        <p>手順の中身</p>
      </Disclosure>,
    );
    const summary = screen.getByText("詳しい手順");
    expect(screen.getByText("手順の中身")).not.toBeVisible();
    await userEvent.click(summary);
    expect(screen.getByText("手順の中身")).toBeVisible();
    await userEvent.click(summary);
    expect(screen.getByText("手順の中身")).not.toBeVisible();
    await expectNoAxeViolations(container);
  });

  it("区分の見出しの形（heading）も、開け閉めできる", async () => {
    render(
      <Disclosure summary="活動の目的（0/5）" variant="heading" id="purpose">
        <p>欄</p>
      </Disclosure>,
    );
    expect(screen.getByText("欄")).not.toBeVisible();
    await userEvent.click(screen.getByText("活動の目的（0/5）"));
    expect(screen.getByText("欄")).toBeVisible();
    expect(document.getElementById("purpose")).toHaveAttribute("open");
  });

  it("入れ子にしても、外側を開いたときに内側の印は回さない（閉じたまま）", () => {
    render(
      <Disclosure summary="外" defaultOpen>
        <Disclosure summary="内">
          <p>内の中身</p>
        </Disclosure>
      </Disclosure>,
    );
    expect(screen.getByText("内の中身")).not.toBeVisible();
    const inner = screen.getByText("内").closest("details");
    expect(inner).not.toHaveAttribute("open");
  });

  it("初めから開いておける", () => {
    render(
      <Disclosure summary="プロンプト" defaultOpen>
        <p>プロンプトの中身</p>
      </Disclosure>,
    );
    expect(screen.getByText("プロンプトの中身")).toBeVisible();
  });
});
