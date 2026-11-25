// 同意の画面の試験：要求の形が違えば開けないと出す／許す範囲を外すと「許可する」が止まる（FR-014）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthConsentPage } from "./OAuthConsentPage.tsx";

const SEARCH = {
  response_type: "code",
  client_id: "dcr_test",
  redirect_uri: "http://127.0.0.1:1455/callback",
  state: "state-value-1234",
  code_challenge: "a".repeat(43),
  code_challenge_method: "S256",
  resource: "http://localhost:3000/api/mcp",
};

/**
 * 仮の API（同意の画面に出すもの）。
 * @returns なし
 */
function stubApi(): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString(), "http://localhost:3000");
    if (url.pathname === "/api/oauth/authorize/consent") {
      return Promise.resolve(
        Response.json({
          clientName: "テストの CLI",
          scopes: [{ scope: "reception:read", label: "受付の記録を読む", description: "自分のチェックイン" }],
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 500 }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("同意の画面", () => {
  it("要求の形が違えば、開けないと出す（外へは送らない）", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OAuthConsentPage search={{ response_type: "token" }} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("この画面は開けません")).toBeTruthy();
  });

  it("クライアントの名前と範囲を出し、範囲を外すと「許可する」が止まる", async () => {
    stubApi();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <OAuthConsentPage search={SEARCH} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("テストの CLIにあなたの記録を読ませますか")).toBeTruthy();
    const box = screen.getByRole("checkbox", { name: /受付の記録を読む/ });
    expect((box as HTMLInputElement).checked).toBe(true);
    await userEvent.click(box);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "許可する" }).hasAttribute("disabled")).toBe(true);
    });
  });
});
