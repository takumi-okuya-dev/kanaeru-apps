// 今の利用者とログインの始め方：LINE にログイン済みなら1度だけ ID トークンでログインし、だめなら「LINEでログインし直す」。
// ほかの API の 401 で読み直す。LIFF ID のない画面では手元のログインへ案内する。API は fetch の差しかえで答える。
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "../../lib/api.ts";
import { createQueryClient } from "../../lib/query.ts";
import type * as LiffModule from "../../lib/liff.ts";
import type { LiffClient } from "../../lib/liff.ts";
import { SessionGate } from "./SessionGate.tsx";
import { onAccountChange } from "../../lib/account-events.ts";
import {
  RELOGIN_COOLDOWN_MS,
  resetAutoLoginForTest,
  setAuthenticated,
  setSignedOut,
} from "./session.ts";

const liffState = vi.hoisted(() => ({ client: undefined as LiffClient | undefined }));

vi.mock("../../lib/liff.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof LiffModule>();
  return { ...actual, getLiff: () => liffState.client ?? actual.createFakeLiff() };
});

const { createFakeLiff } = await vi.importActual<typeof LiffModule>("../../lib/liff.ts");

/** 今の利用者の答え。 */
const ME = {
  id: "0193a1b2-0000-7000-8000-000000000000",
  displayName: "佐藤",
  isOrganizer: false,
  registeredAt: "2026-11-19T10:00:00.000Z",
};

/**
 * エラーの本文の応答を作る。
 * @param status 状態の番号
 * @param code code
 * @returns 応答
 */
function errorResponse(status: number, code: string): Response {
  return Response.json({ error: { code, message: `${code} の文`, requestId: "r" } }, { status });
}

/** 送られた要求（道と本文）。 */
type Sent = { method: string; path: string; body: string | undefined };

/**
 * API の答えを決め、送られた要求を集める。
 * @param respond 道ごとの答え
 * @returns 送られた要求の一覧
 */
function stubApi(respond: (sent: Sent) => Response): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const item: Sent = {
      method: init?.method ?? "GET",
      path: url.pathname,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    sent.push(item);
    return Promise.resolve(respond(item));
  });
  return sent;
}

/**
 * SessionGate を道と TanStack Query の中で描く。
 * @param queryClient 使う QueryClient（既定は読み直さないもの）
 * @returns 使った QueryClient
 */
function renderGate(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
): QueryClient {
  const rootRoute = createRootRoute();
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <SessionGate>
        <p>ログインした中身</p>
      </SessionGate>
    ),
  });
  const other = createRoute({ getParentRoute: () => rootRoute, path: "$", component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([page, other]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return queryClient;
}

/**
 * 送られた要求のうち、道が同じものの数。
 * @param sent 送られた要求
 * @param path 道
 * @returns 数
 */
function countOf(sent: Sent[], path: string): number {
  return sent.filter((item) => item.path === path).length;
}

beforeEach(() => {
  resetAutoLoginForTest();
  liffState.client = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * 時計（Date だけ）を決まった時刻にする（タイマーは本物のまま）。
 * @param iso 時刻
 */
function setNow(iso: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

describe("SessionGate と useSession", () => {
  it("ログインしていれば、中身を出す", async () => {
    stubApi(() => Response.json(ME));
    renderGate();
    expect(await screen.findByText("ログインした中身")).toBeInTheDocument();
  });

  it("セッションがなく LINE にログイン済みなら、ID トークンだけを1度送ってログインする", async () => {
    liffState.client = createFakeLiff({ loggedIn: true, idToken: "id-token-1", inClient: true });
    let loggedIn = false;
    const sent = stubApi((item) => {
      if (item.path === "/api/v1/auth/line") {
        loggedIn = true;
        return Response.json(ME);
      }
      return loggedIn ? Response.json(ME) : errorResponse(401, "UNAUTHENTICATED");
    });
    renderGate();
    expect(await screen.findByText("ログインした中身")).toBeInTheDocument();
    const login = sent.filter((item) => item.path === "/api/v1/auth/line");
    expect(login).toEqual([
      { method: "POST", path: "/api/v1/auth/line", body: '{"idToken":"id-token-1"}' },
    ]);
  });

  it("ログインし直しが断られたら、「LINEでログインし直す」を見出しつきで出し、くり返さない", async () => {
    liffState.client = {
      ...createFakeLiff({ loggedIn: true, idToken: "expired", inClient: true }),
      mode: "line",
    };
    const sent = stubApi((item) =>
      item.path === "/api/v1/auth/line"
        ? errorResponse(401, "LINE_LOGIN_FAILED")
        : errorResponse(401, "UNAUTHENTICATED"),
    );
    const queryClient = renderGate();
    expect(
      await screen.findByRole("heading", { level: 1, name: "LINEでログインし直してください" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LINEでログインし直す" })).toBeInTheDocument();
    await queryClient.refetchQueries();
    expect(countOf(sent, "/api/v1/auth/line")).toBe(1);
  });

  it("外のブラウザで「LINEでログインし直す」を押すと、古い LINE のログインを捨ててからログインし直す", async () => {
    const relogin = vi.fn();
    const login = vi.fn();
    liffState.client = {
      ...createFakeLiff({ loggedIn: true, idToken: "expired", inClient: false }),
      mode: "line",
      login,
      relogin,
    };
    stubApi((item) =>
      item.path === "/api/v1/auth/line"
        ? errorResponse(401, "LINE_LOGIN_FAILED")
        : errorResponse(401, "UNAUTHENTICATED"),
    );
    renderGate();
    (await screen.findByRole("button", { name: "LINEでログインし直す" })).click();
    expect(relogin).toHaveBeenCalledTimes(1);
    expect(login).not.toHaveBeenCalled();
  });

  it("LIFF ID のない画面で未ログインなら、手元のログインへ案内する（LINE に送らない）", async () => {
    const sent = stubApi(() => errorResponse(401, "UNAUTHENTICATED"));
    renderGate();
    expect(
      await screen.findByRole("heading", { level: 1, name: "ログインしていません" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "手元のログインへ" })).toHaveAttribute(
      "href",
      "/dev/login?redirect=%2F",
    );
    expect(countOf(sent, "/api/v1/auth/line")).toBe(0);
  });

  it("夜間（日本時間 0時〜8時）の 503 DB_UNAVAILABLE は、見出しで止まっていることを出す", async () => {
    setNow("2026-11-19T17:30:00.000Z"); // 日本時間 2:30
    stubApi(() => errorResponse(503, "DB_UNAVAILABLE"));
    renderGate();
    expect(
      await screen.findByRole("heading", { level: 1, name: "夜間（0時〜8時）は止まっています" }),
    ).toBeInTheDocument();
  });

  it("昼の 503 DB_UNAVAILABLE は夜間と言わず、API の文と「もう一度」を出す", async () => {
    setNow("2026-11-19T03:00:00.000Z"); // 日本時間 12:00
    stubApi(() => errorResponse(503, "DB_UNAVAILABLE"));
    renderGate();
    expect(
      await screen.findByRole("heading", { level: 1, name: "読みこめませんでした" }),
    ).toBeInTheDocument();
    expect(screen.getByText("DB_UNAVAILABLE の文")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "もう一度" })).toBeInTheDocument();
    expect(screen.queryByText(/夜間/)).not.toBeInTheDocument();
  });

  it("LINE に届かない（502）ときも、画面の読み直しの決まりで ID トークンをくり返し送らない（1度だけ）", async () => {
    liffState.client = createFakeLiff({ loggedIn: true, idToken: "id-token-3", inClient: true });
    const sent = stubApi((item) =>
      item.path === "/api/v1/auth/line"
        ? errorResponse(502, "LINE_UNREACHABLE")
        : errorResponse(401, "UNAUTHENTICATED"),
    );
    renderGate(createQueryClient());
    expect(
      await screen.findByRole("heading", { level: 1, name: "読みこめませんでした" }),
    ).toBeInTheDocument();
    expect(countOf(sent, "/api/v1/auth/line")).toBe(1);
  });

  it("ほかの API が 401 を返したら、セッションを読み直し、LINE でログインし直してほかも読み直す", async () => {
    liffState.client = createFakeLiff({ loggedIn: true, idToken: "id-token-2", inClient: true });
    let sessionAlive = true;
    const sent = stubApi((item) => {
      if (item.path === "/api/v1/auth/line") {
        sessionAlive = true;
        return Response.json(ME);
      }
      return sessionAlive ? Response.json(ME) : errorResponse(401, "UNAUTHENTICATED");
    });
    const queryClient = renderGate();
    expect(await screen.findByText("ログインした中身")).toBeInTheDocument();
    const other = vi.fn(() => Promise.resolve({ ok: true }));
    queryClient.setQueryData(["event", "list"], { ok: true });
    queryClient.getQueryCache().build(queryClient, { queryKey: ["event", "list"], queryFn: other });

    // セッションが切れたあと、ほかの領域の窓口が 401 を返した
    sessionAlive = false;
    await request(() => Promise.resolve(errorResponse(401, "UNAUTHENTICATED"))).catch(
      () => undefined,
    );
    await waitFor(() => expect(countOf(sent, "/api/v1/auth/line")).toBe(1));
    await waitFor(() =>
      expect(queryClient.getQueryState(["event", "list"])?.isInvalidated).toBe(true),
    );
    expect(screen.getByText("ログインした中身")).toBeInTheDocument();
  });
  it("/me は通るのに、ほかの窓口が 401 を返しつづけても、読み直しを RELOGIN_COOLDOWN_MS に1度までにする", async () => {
    const sent = stubApi(() => Response.json(ME));
    const queryClient = renderGate();
    expect(await screen.findByText("ログインした中身")).toBeInTheDocument();
    const other = vi.fn(() =>
      request(() => Promise.resolve(errorResponse(401, "UNAUTHENTICATED"))),
    );
    const observer = new QueryObserver(queryClient, {
      queryKey: ["event", "list"],
      queryFn: other,
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    // 1度目の 401 で /me を読み直し、ほかを読み直す（2回目の 401）。そのあとは読み直さない
    await waitFor(() => expect(other).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(other).toHaveBeenCalledTimes(2);
    expect(countOf(sent, "/api/v1/accounts/me")).toBe(2);

    // 時間がたてば、また1度だけ読み直す
    setNow(new Date(Date.now() + RELOGIN_COOLDOWN_MS + 1000).toISOString());
    await observer.refetch();
    await waitFor(() => expect(other).toHaveBeenCalledTimes(4));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(other).toHaveBeenCalledTimes(4);
    unsubscribe();
  });
});

describe("今の利用者が替わったことを、領域に知らせる", () => {
  it("ログインした状態にすると利用者の ID、ログアウトした状態にすると null を知らせる", async () => {
    const received: (string | null)[] = [];
    const stop = onAccountChange((accountId) => {
      received.push(accountId);
    });
    const queryClient = new QueryClient();
    await setAuthenticated(queryClient, {
      id: "0193a1b2-0000-7000-8000-000000000001",
      displayName: "高橋",
    } as never);
    setSignedOut(queryClient);
    await waitFor(() => expect(received).toHaveLength(2));
    expect(received).toEqual(["0193a1b2-0000-7000-8000-000000000001", null]);
    stop();
  });
});
