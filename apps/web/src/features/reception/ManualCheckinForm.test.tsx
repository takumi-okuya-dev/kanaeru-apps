// 手でのチェックインの欄：送っている途中は「やめる」を押しても閉じない（入ったのに知らせが出なくなるため）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualCheckinForm } from "./ManualCheckinForm.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("手でのチェックインの欄", () => {
  it("送っている途中は「やめる」を押しても閉じない", async () => {
    // 答えを返さないままにして、送っている途中を保つ
    vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));
    const onCancel = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ManualCheckinForm
          eventId="0193a1b2-0000-7000-8000-000000000001"
          discounts={[]}
          onDone={vi.fn()}
          onCancel={onCancel}
        />
      </QueryClientProvider>,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "名前" }), "佐藤 太郎");
    await userEvent.click(screen.getByRole("radio", { name: "Peatix" }));
    await userEvent.click(screen.getByRole("radio", { name: "SNS" }));
    await userEvent.click(screen.getByRole("radio", { name: "現金" }));
    await userEvent.click(screen.getByRole("button", { name: "チェックインする" }));

    const cancel = await screen.findByRole("button", { name: "やめる" });
    await screen.findByRole("button", { name: "チェックインしています…" });
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(cancel);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("送る前は「やめる」で閉じる", async () => {
    const onCancel = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ManualCheckinForm
          eventId="0193a1b2-0000-7000-8000-000000000001"
          discounts={[]}
          onDone={vi.fn()}
          onCancel={onCancel}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
