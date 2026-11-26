// 同意の画面の試験：要求が読めない・使えない要求・戻り先へ返す失敗・範囲を外す・戻り先のホストの表示（FR-014）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuthorizeQuery } from "@workspace/contracts/account";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthConsentPage } from "./OAuthConsentPage.tsx";

const REQUEST: AuthorizeQuery = {
  response_type: "code",
  client_id: "dcr_test",
  redirect_uri: "http://127.0.0.1:1455/callback",
  state: "state-value-1234",
  code_challenge: "a".repeat(43),
  code_challenge_method: "S256",
  resource: "http://localhost:3000/api/mcp",
};

/**
 * 仮の API（同意の表示の窓口だけ）。
 * @param response 同意の表示の窓口が返す応答
 */
function stubConsentView(response: Response): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString(), "http://localhost:3000");
    if (url.pathname === "/api/oauth/authorize/consent") return Promise.resolve(response);
    return Promise.resolve(new Response(null, { status: 500 }));
  });
}

/**
 * 同意の画面を描く（問い合わせは試さないので、やり直しなし）。
 * @param request 認可の要求
 */
function renderPage(request: AuthorizeQuery | undefined): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OAuthConsentPage request={request} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("同意の画面", () => {
  it("要求が読めなければ、開けないと出す（外へは送らない）", () => {
    renderPage(undefined);
    expect(screen.getByText("この画面は開けません")).toBeTruthy();
  });

  it("名前・戻り先のホスト・範囲を出し、DCR は確かめていないと出す。範囲を外すと「許可する」が止まる", async () => {
    stubConsentView(
      Response.json({
        clientName: "テストの CLI",
        clientKind: "dcr",
        redirectHost: "127.0.0.1:1455",
        scopes: [{ scope: "reception:read", label: "受付の記録を読む", description: "自分のチェックイン" }],
      }),
    );
    renderPage(REQUEST);
    expect(await screen.findByText("テストの CLIにあなたの記録を読ませますか")).toBeTruthy();
    expect(screen.getByText("127.0.0.1:1455")).toBeTruthy();
    expect(screen.getByText(/確かめられていません/)).toBeTruthy();
    const box = screen.getByRole("checkbox", { name: /受付の記録を読む/ });
    expect((box as HTMLInputElement).checked).toBe(true);
    await userEvent.click(box);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "許可する" }).hasAttribute("disabled")).toBe(true);
    });
  });

  it("戻り先を信じられない要求は、理由を出し「もう一度」を出さない", async () => {
    stubConsentView(Response.json({ error: "invalid_client", error_description: "クライアントを確かめられない" }, { status: 400 }));
    renderPage(REQUEST);
    expect(await screen.findByText("この要求は使えません")).toBeTruthy();
    expect(screen.getByText(/クライアントを確かめられない/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "もう一度" })).toBeNull();
  });

  it("戻り先へ返すべき失敗は、窓口が返す戻り先へ進む", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    stubConsentView(Response.json({ redirectTo: "http://127.0.0.1:1455/callback?error=invalid_scope" }));
    renderPage(REQUEST);
    expect(await screen.findByText("アプリに戻っています…")).toBeTruthy();
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("http://127.0.0.1:1455/callback?error=invalid_scope");
    });
  });
});
