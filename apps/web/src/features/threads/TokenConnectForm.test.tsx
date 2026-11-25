// トークンを貼ってつなぐ欄（threads-012）：注意の文のあとに、利用規約とプライバシーポリシーへのリンクを新しいタブで出す（suite-002）。
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { TokenConnectForm } from "./TokenConnectForm.tsx";

describe("トークンを貼ってつなぐ欄", () => {
  it("利用規約とプライバシーポリシーへのリンクを、新しいタブで出す", async () => {
    renderWithRouter(
      <TokenConnectForm
        accountId="0193a1b2-0000-7000-8000-000000000001"
        connected={false}
        username={null}
        onConnected={() => Promise.resolve()}
      />,
    );
    const terms = await screen.findByRole("link", { name: "利用規約" });
    expect(terms).toHaveAttribute("href", "/terms");
    expect(terms).toHaveAttribute("target", "_blank");
    const privacy = screen.getByRole("link", { name: "プライバシーポリシー" });
    expect(privacy).toHaveAttribute("href", "/privacy");
    expect(privacy).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/どちらも新しいタブで開きます/)).toBeInTheDocument();
  });
});
