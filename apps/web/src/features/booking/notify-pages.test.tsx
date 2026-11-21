// 予約の知らせの画面（booking-002）：設定の画面（末尾・Webhook の URL・入れ直す・送り方の帯・確かめの結果・メールの節・
// 管理者でないときの文・個人の画面の組織の一覧）と、紐づけの画面（使える・使った・期限切れ・知らない・紐づける）。
// API は fetch の差しかえで答える。名前・アドレスはどれも架空のもの。
import type { LineLinkPreview, NotifySettings } from "@workspace/contracts/booking";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { feature } from "./index.ts";
import { LineLinkPage } from "./LineLinkPage.tsx";
import { NotifySettingsPage } from "./NotifySettingsPage.tsx";

const ORG_ID = "0193a1b2-0000-7000-8000-0000000000aa";
const ME = "0193a1b2-0000-7000-8000-0000000000bb";
const CHANNEL_ID = "0193a1b2-0000-7000-8000-0000000000cc";
const TOKEN = "t".repeat(43);

/** 送られた要求。 */
type Sent = { method: string; path: string; body: unknown };

/**
 * 試しの設定。
 * @param values 差しかえる欄
 * @returns 設定
 */
function settingsOf(values: Partial<NotifySettings> = {}): NotifySettings {
  return {
    holder: { kind: "organization", id: ORG_ID, name: "飲食チーム" },
    deliveryMode: "allowlist",
    line: {
      channelId: CHANNEL_ID,
      lineChannelId: "1234567890",
      channelSecretTail: "cdef",
      accessTokenTail: "wxyz",
      basicId: "@abc1234",
      webhookUrl: `https://example.com/api/v1/booking/webhooks/line/${CHANNEL_ID}`,
      linkedCount: 3,
      sentThisMonth: 12,
      updatedAt: "2026-11-20T00:00:00.000Z",
    },
    greetingPreview: "友だち追加ありがとうございます。",
    mail: { senderName: "飲食チーム（kanaeru）", replyToEmail: "reply@example.com" },
    myLink: { linked: true },
    ...values,
  };
}

/**
 * 仮の API。
 * @param routes 道ごとの答え（"GET /api/…" → 答え）
 * @returns 送られた要求の一覧
 */
function stubApi(routes: Record<string, () => Response>): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const raw =
      input instanceof Request
        ? await input.clone().text()
        : typeof init?.body === "string"
          ? init.body
          : "";
    sent.push({ method, path: url.pathname, body: raw ? JSON.parse(raw) : undefined });
    const key = `${method} ${url.pathname}`;
    if (key === "GET /api/v1/accounts/me") {
      return Response.json({
        id: ME,
        displayName: "田中",
        isOrganizer: false,
        registeredAt: "2026-11-19T10:00:00.000Z",
      });
    }
    if (key === "GET /api/v1/suite/apps") return Response.json({ apps: [], isOperator: false });
    const handler = routes[key];
    return handler
      ? handler()
      : Response.json({ error: { code: "NOT_FOUND", message: "ない道" } }, { status: 404 });
  });
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("予約の知らせの設定の画面", () => {
  const base = `/api/v1/booking/notify-settings/organizations/${ORG_ID}`;

  it("末尾だけ・Webhook の URL・人数・今月の数・送り方の帯・あいさつの見本・送り主の名前を出す", async () => {
    stubApi({ [`GET ${base}`]: () => Response.json(settingsOf()) });
    renderWithRouter(<NotifySettingsPage organizationId={ORG_ID} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "予約の知らせ（飲食チーム）" }),
    ).toBeInTheDocument();
    expect(screen.getByText("末尾 cdef")).toBeInTheDocument();
    expect(screen.getByText("末尾 wxyz")).toBeInTheDocument();
    expect(screen.getByText("3人")).toBeInTheDocument();
    expect(screen.getByText("12通")).toBeInTheDocument();
    expect(screen.getByText(/webhooks\/line\//)).toBeInTheDocument();
    expect(screen.getByText(/いまは確かめの間です/)).toBeInTheDocument();
    expect(screen.getByText("友だち追加ありがとうございます。")).toBeInTheDocument();
    expect(screen.getByText("飲食チーム（kanaeru）")).toBeInTheDocument();
    expect(screen.getByLabelText(/返信先のメールアドレス/)).toHaveValue("reply@example.com");
  });

  it("入れ直す：空の欄は送らず、入れたものだけを送る", async () => {
    const sent = stubApi({
      [`GET ${base}`]: () => Response.json(settingsOf()),
      [`PUT ${base}/line`]: () =>
        Response.json(settingsOf({ line: { ...settingsOf().line!, accessTokenTail: "9876" } })),
    });
    renderWithRouter(<NotifySettingsPage organizationId={ORG_ID} />);
    await userEvent.click(await screen.findByRole("button", { name: "入れ直す" }));
    await userEvent.type(
      screen.getByLabelText(/チャネルアクセストークン/),
      `${"rotated".repeat(5)}9876`,
    );
    await userEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(await screen.findByText("末尾 9876")).toBeInTheDocument();
    expect(sent.find((request) => request.method === "PUT")?.body).toEqual({
      accessToken: `${"rotated".repeat(5)}9876`,
    });
  });

  it("確かめのメッセージ：許可リストにないときは、文と本人の ID をボタンのそばに出す", async () => {
    stubApi({
      [`GET ${base}`]: () => Response.json(settingsOf()),
      [`POST ${base}/test`]: () =>
        Response.json({
          result: "not_allowed",
          lineUserId: `U${"a".repeat(32)}`,
          message: "許可リストにないため、送りませんでした。",
        }),
    });
    renderWithRouter(<NotifySettingsPage organizationId={ORG_ID} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "自分に確かめのメッセージを送る" }),
    );
    expect(await screen.findByText(/許可リストにないため/)).toBeInTheDocument();
    expect(screen.getByText(`U${"a".repeat(32)}`)).toBeInTheDocument();
  });

  it("設定がなければ、3つの欄の入るフォーム。返信先の形が違えば欄のそばに出す", async () => {
    const sent = stubApi({
      [`GET ${base}`]: () =>
        Response.json(
          settingsOf({
            line: null,
            mail: { senderName: "飲食チーム（kanaeru）", replyToEmail: null },
          }),
        ),
    });
    renderWithRouter(<NotifySettingsPage organizationId={ORG_ID} />);
    expect(await screen.findByLabelText(/^チャネル ID/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(
      await screen.findByText("チャネル ID を入れてください。", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    // 画面は次の描画（requestAnimationFrame）で最初の間違いの欄へ移る。移り終えてから返信先に入れる
    // （待たないと、重いときに入れている途中で移り、文字がチャネル ID の欄に入る）
    await waitFor(() => expect(screen.getByLabelText(/^チャネル ID/)).toHaveFocus());
    await userEvent.type(screen.getByLabelText(/返信先のメールアドレス/), "reply");
    await userEvent.click(screen.getByRole("button", { name: "返信先を保存する" }));
    expect(
      await screen.findByText(/メールアドレスの形で入れてください/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(sent.filter((request) => request.method !== "GET")).toEqual([]);
  }, 15_000);

  it("管理者でなければ「組織の管理者だけが変えられます」", async () => {
    stubApi({
      [`GET ${base}`]: () =>
        Response.json(
          { error: { code: "BOOKING_NOTIFY_FORBIDDEN", message: "管理者だけ" } },
          { status: 403 },
        ),
    });
    renderWithRouter(<NotifySettingsPage organizationId={ORG_ID} />);
    expect(await screen.findByText(/組織の管理者だけが変えられます/)).toBeInTheDocument();
  });

  it("個人の画面には、自分が管理者の組織への入口を出す", async () => {
    stubApi({
      "GET /api/v1/booking/notify-settings/personal": () =>
        Response.json(
          settingsOf({
            holder: { kind: "personal", id: ME, name: "田中" },
            line: null,
            adminOrganizations: [{ id: ORG_ID, name: "飲食チーム" }],
          }),
        ),
    });
    renderWithRouter(<NotifySettingsPage />);
    expect(await screen.findByRole("link", { name: "飲食チームの設定を開く" })).toHaveAttribute(
      "href",
      `/settings/reception/notify/organizations/${ORG_ID}`,
    );
  });
});

describe("紐づけの画面", () => {
  const path = `/api/v1/booking/line-links/${TOKEN}`;

  /**
   * 札の中身を返す仮の API。
   * @param preview 中身
   * @returns 送られた要求
   */
  const withPreview = (preview: Partial<LineLinkPreview>) =>
    stubApi({
      [`GET ${path}`]: () =>
        Response.json({
          holderName: "飲食チーム",
          state: "valid",
          linkedToMe: false,
          expiresAt: "2026-11-27T00:00:00.000Z",
          lineDisplayName: null,
          ...preview,
        }),
      [`POST ${path}`]: () => Response.json({ holderName: "飲食チーム" }),
    });

  it("持ち主の名前を確かめて「紐づける」と、紐づけましたを出す", async () => {
    const sent = withPreview({});
    renderWithRouter(<LineLinkPage linkToken={TOKEN} />);
    expect(await screen.findByText(/飲食チームの LINE 公式アカウントと/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "紐づける" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "紐づけました" }),
    ).toBeInTheDocument();
    expect(sent.some((request) => request.method === "POST" && request.path === path)).toBe(true);
  });

  it("その札の LINE の表示名と、自分に届いたリンクでなければ押さないことを出す（表示名がなければ出さない）", async () => {
    withPreview({ lineDisplayName: "はなこ" });
    const { unmount } = renderWithRouter(<LineLinkPage linkToken={TOKEN} />);
    expect(await screen.findByText("紐づける LINE：はなこさん")).toBeInTheDocument();
    expect(
      screen.getByText(/自分の LINE に届いたリンクでなければ、押さないでください/),
    ).toBeInTheDocument();
    unmount();
    withPreview({});
    renderWithRouter(<LineLinkPage linkToken={TOKEN} />);
    expect(await screen.findByText(/自分の LINE に届いたリンクでなければ/)).toBeInTheDocument();
    expect(screen.queryByText(/紐づける LINE：/)).not.toBeInTheDocument();
  });

  it("使った札は、本人なら「もう紐づいています」、ほかの人なら使い終わり", async () => {
    withPreview({ state: "used", linkedToMe: true });
    const { unmount } = renderWithRouter(<LineLinkPage linkToken={TOKEN} />);
    expect(await screen.findByRole("heading", { name: "もう紐づいています" })).toBeInTheDocument();
    unmount();
    withPreview({ state: "used", linkedToMe: false });
    renderWithRouter(<LineLinkPage linkToken={TOKEN} />);
    expect(
      await screen.findByRole("heading", { name: "このリンクは使い終わっています" }),
    ).toBeInTheDocument();
  });

  it("期限切れ・知らない札は、理由と新しいリンクのもらい方を出す", async () => {
    withPreview({ state: "expired" });
    const { unmount } = renderWithRouter(<LineLinkPage linkToken={TOKEN} />);
    expect(
      await screen.findByRole("heading", { name: "このリンクは期限が切れました" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/もう一度友だち追加すると/)).toBeInTheDocument();
    unmount();
    stubApi({});
    renderWithRouter(<LineLinkPage linkToken={TOKEN} />);
    expect(
      await screen.findByRole("heading", { name: "このリンクは使えません" }),
    ).toBeInTheDocument();
  });
});

describe("予約の領域が出すもの", () => {
  it("設定の画面に「予約の知らせ」、組織の画面に設定への入口を出す", () => {
    expect(feature.settings).toContainEqual(
      expect.objectContaining({
        label: "予約の知らせ",
        to: "/settings/reception/notify",
        group: "app",
      }),
    );
    expect(feature.organization.links(ORG_ID)).toEqual([
      expect.objectContaining({ to: `/settings/reception/notify/organizations/${ORG_ID}` }),
    ]);
  });
});
