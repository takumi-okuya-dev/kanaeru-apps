// 手元のログインの画面：誤りは欄のそばに出し、試験用のログインで入り、今の利用者を出す。ログアウトで戻る。
// LINE の画面では使えない旨だけを出す。API は fetch の差しかえで答える。
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as LiffModule from "../../lib/liff.ts";
import type { LiffClient } from "../../lib/liff.ts";
import { renderWithRouter } from "../../lib/testing.tsx";
import { DevLoginPage, SAMPLE_LINE_USER_ID } from "./DevLoginPage.tsx";
import { resetAutoLoginForTest } from "./session.ts";

const liffState = vi.hoisted(() => ({ client: undefined as LiffClient | undefined }));

vi.mock("../../lib/liff.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof LiffModule>();
  return { ...actual, getLiff: () => liffState.client ?? actual.createFakeLiff() };
});

const { createFakeLiff } = await vi.importActual<typeof LiffModule>("../../lib/liff.ts");

/** 送られた要求。 */
type Sent = { method: string; path: string; body: string | undefined };

/**
 * 仮の API（試験用のログインでログインした状態になり、ログアウトで戻る）。
 * @returns 送られた要求の一覧
 */
function stubApi(): Sent[] {
  const sent: Sent[] = [];
  let displayName: string | undefined;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const body = typeof init?.body === "string" ? init.body : undefined;
    sent.push({ method: init?.method ?? "GET", path: url.pathname, body });
    const me = () =>
      Response.json({
        id: "0193a1b2-0000-7000-8000-000000000000",
        displayName,
        isOrganizer: false,
        registeredAt: "2026-11-19T10:00:00.000Z",
      });
    if (url.pathname === "/api/v1/auth/test-login") {
      displayName = (JSON.parse(body ?? "{}") as { displayName: string }).displayName;
      return Promise.resolve(me());
    }
    if (url.pathname === "/api/v1/auth/logout") {
      displayName = undefined;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(
      displayName === undefined
        ? Response.json(
            {
              error: { code: "UNAUTHENTICATED", message: "ログインしていません。", requestId: "r" },
            },
            { status: 401 },
          )
        : me(),
    );
  });
  return sent;
}

beforeEach(() => {
  resetAutoLoginForTest();
  liffState.client = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("手元のログインの画面", () => {
  it("表示名がないまま送ると、欄のそばに誤りを出してフォーカスを移す（送らない）", async () => {
    const user = userEvent.setup();
    const sent = stubApi();
    renderWithRouter(<DevLoginPage />);
    await user.click(await screen.findByRole("button", { name: "ログイン" }));
    const name = screen.getByRole("textbox", { name: /表示名/ });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAccessibleDescription(/表示名を入れてください。/);
    expect(sent.filter((item) => item.path === "/api/v1/auth/test-login")).toHaveLength(0);
  });

  it("試験用のログインで入り、今の利用者を出す。ログアウトで入力に戻る", async () => {
    const user = userEvent.setup();
    const sent = stubApi();
    renderWithRouter(<DevLoginPage />);
    expect(await screen.findByRole("textbox", { name: /LINE のユーザー ID/ })).toHaveValue(
      SAMPLE_LINE_USER_ID,
    );
    await user.type(screen.getByRole("textbox", { name: /表示名/ }), "試験の佐藤");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    expect(
      await screen.findByRole("heading", { name: "ログインしています：試験の佐藤" }),
    ).toBeInTheDocument();
    expect(sent.find((item) => item.path === "/api/v1/auth/test-login")?.body).toBe(
      JSON.stringify({ lineUserId: SAMPLE_LINE_USER_ID, displayName: "試験の佐藤" }),
    );
    await user.click(screen.getByRole("button", { name: "ログアウト" }));
    expect(await screen.findByRole("button", { name: "ログイン" })).toBeInTheDocument();
  });

  it("LINE の画面では、使えない旨だけを出す", async () => {
    liffState.client = { ...createFakeLiff(), mode: "line" };
    stubApi();
    renderWithRouter(<DevLoginPage />);
    expect(
      await screen.findByText("この画面は、LINE につながない手元とテストだけで使えます。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ログイン" })).not.toBeInTheDocument();
  });
});
