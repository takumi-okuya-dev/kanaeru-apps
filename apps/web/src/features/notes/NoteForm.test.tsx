// メモの入力のフォーム：誤りを欄のそばに出して最初の誤りの欄にフォーカスを移し、API の欄ごとの理由も欄に出し、
// 結果をボタンの近くに出す（EXPERIENCE.md 3）。
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api.ts";
import { renderWithRouter } from "../../lib/testing.tsx";
import { NoteForm } from "./NoteForm.tsx";

describe("メモの入力のフォーム", () => {
  it("題がないまま送ると、題の欄のそばに誤りを出し、題の欄にフォーカスを移す（送らない）", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithRouter(
      <NoteForm submitLabel="追加" pendingLabel="追加しています…" onSubmit={onSubmit} />,
    );
    await user.click(await screen.findByRole("button", { name: "追加" }));
    const title = screen.getByRole("textbox", { name: /題/ });
    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(/題を入れてください。/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("入れ直した欄を離れたときに確かめ、直したら誤りを消す", async () => {
    const user = userEvent.setup();
    renderWithRouter(<NoteForm submitLabel="追加" pendingLabel="…" onSubmit={vi.fn()} />);
    const title = await screen.findByRole("textbox", { name: /題/ });
    await user.type(title, " ");
    await user.tab();
    expect(title).toHaveAttribute("aria-invalid", "true");
    await user.type(title, "買い物");
    expect(title).not.toHaveAttribute("aria-invalid");
  });

  it("送れたら、ボタンの近くに結果の文を出す", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithRouter(
      <NoteForm
        initial={{ title: "買い物", body: "" }}
        submitLabel="保存"
        pendingLabel="保存しています…"
        successMessage="保存しました。"
        onSubmit={onSubmit}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "保存" }));
    expect(await screen.findByRole("status")).toHaveTextContent("保存しました。");
    expect(onSubmit).toHaveBeenCalledWith({ title: "買い物", body: "" });
  });

  it("API が欄ごとの理由を返したら、その欄のそばと、ボタンの近くに出す（入れた値は消さない）", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: "NOTE_TITLE_TAKEN",
        message: "同じ題のメモがあります。ほかの題にしてください。",
        requestId: "req-1",
        fields: [{ path: "title", message: "同じ題のメモがあります。ほかの題にしてください。" }],
      }),
    );
    renderWithRouter(<NoteForm submitLabel="追加" pendingLabel="…" onSubmit={onSubmit} />);
    const title = await screen.findByRole("textbox", { name: /題/ });
    await user.type(title, "買い物");
    await user.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveAccessibleDescription(/同じ題のメモがあります。/);
    expect(title).toHaveValue("買い物");
    expect(screen.getByRole("alert")).toHaveTextContent("同じ題のメモがあります。");
  });
});
