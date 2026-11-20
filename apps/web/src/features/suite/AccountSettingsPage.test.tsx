// 設定 › アカウントの退会の確かめ（suite-001・PRD 組織 FR-O54）：枠を開いたら確かめの中身を読み、
// 組織・引き継がれる記録・消える記録に分けて出し、「元に戻せません」を添える。API は fetch の差しかえで答える。
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { AccountSettingsPage } from "./AccountSettingsPage.tsx";

/**
 * 仮の API（今の利用者・見えるアプリ・退会の確かめの中身）。
 * @returns 送られた要求（動きと道）
 */
function stubApi(): string[] {
  const sent: string[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    sent.push(`${method} ${url.pathname}`);
    switch (`${method} ${url.pathname}`) {
      case "GET /api/v1/accounts/me":
        return Promise.resolve(
          Response.json({
            id: "0193a1b2-0000-7000-8000-000000000001",
            displayName: "鈴木",
            isOrganizer: false,
            registeredAt: "2026-11-19T10:00:00.000Z",
          }),
        );
      case "GET /api/v1/suite/apps":
        return Promise.resolve(Response.json({ apps: [], isOperator: false }));
      case "GET /api/v1/accounts/me/withdrawal":
        return Promise.resolve(
          Response.json({
            items: [
              {
                kind: "organization",
                source: "スイート",
                text: "組織「飲食チーム」の管理者を、田中さんに引き継ぎます。",
              },
              {
                kind: "handover",
                source: "見本",
                text: "記録「カフェB店」は、田中さんに引き継がれます。",
              },
              { kind: "delete", source: "見本", text: "記録1件（「個人の店」）を消します。" },
            ],
          }),
        );
      default:
        return Promise.resolve(
          Response.json({ error: { code: "NOT_FOUND", message: "ない道" } }, { status: 404 }),
        );
    }
  });
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("規約とポリシー", () => {
  it("利用規約とプライバシーポリシーへのリンクを出す（suite-002）", async () => {
    stubApi();
    renderWithRouter(<AccountSettingsPage />);
    const section = await screen.findByRole("region", { name: "規約とポリシー" });
    expect(within(section).getByRole("link", { name: "利用規約" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(within(section).getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});

describe("退会の確かめ", () => {
  it("枠を開いたら、組織・引き継がれる記録・消える記録に分けて出す", async () => {
    const sent = stubApi();
    renderWithRouter(<AccountSettingsPage />);
    await screen.findByRole("heading", { name: "退会する" });
    expect(sent).not.toContain("GET /api/v1/accounts/me/withdrawal");

    await userEvent.click(screen.getByRole("button", { name: "退会する" }));
    const dialog = await screen.findByRole("alertdialog");
    const organizations = await within(dialog).findByRole("region", { name: "組織" });
    expect(organizations).toHaveTextContent("田中さんに引き継ぎます");
    expect(within(dialog).getByRole("region", { name: "引き継がれる記録" })).toHaveTextContent(
      "見本：記録「カフェB店」は、田中さんに引き継がれます。",
    );
    expect(within(dialog).getByRole("region", { name: "消える記録" })).toHaveTextContent(
      "個人の店",
    );
    expect(within(dialog).getByText("元に戻せません。")).toBeInTheDocument();
  });
});
