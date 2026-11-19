// チェックインの画面（P1）：名前の初期値・選ばずに押したときの誤り・済んだカード・チェックイン済み・アンケートと案内のリンク・
// 交流会がないとき。API は fetch の差しかえで答える。
import type { EventSummary } from "@workspace/contracts/event";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectNoAxeViolations } from "@workspace/ui/testing/axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { CheckinPage } from "./CheckinPage.tsx";

/** 交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000001";

/** 要約の見本。 */
const SUMMARY: EventSummary = {
  id: EVENT_ID,
  name: "11月の交流会",
  startsAt: "2026-11-25T10:00:00.000Z",
  venue: "渋谷の会場",
  fee: 1000,
  surveyOpen: false,
  googleFormUrl: null,
  lineGroupUrl: null,
  openChatUrl: null,
  discounts: [],
};

/** チェックインの見本。 */
const CHECKIN = {
  id: "0193a1b2-0000-7000-8000-000000000002",
  name: "佐藤 太郎",
  applicationSource: "connpass",
  referral: "friend",
  paymentMethod: "paypay",
  amount: 1000,
  checkedInAt: "2026-11-25T10:03:00.000Z",
};

/** 送られた要求。 */
type Sent = { method: string; path: string; body: unknown };

/**
 * 仮の API（今の利用者・要約・自分のチェックイン）。
 * @param options 要約（summary）・すでのチェックイン（checkin）・要約の状態の番号（summaryStatus）・読み直しの失敗（failRefetch）
 * @param options.summary 要約に重ねる値
 * @param options.checkin すでにあるチェックイン（なければ null）
 * @param options.summaryStatus 要約の状態の番号
 * @param options.rejectNameOnPost チェックインの送信を、名前の欄の誤り（400）で返すか
 * @param options.failRefetch 要約と自分のチェックインの2回目からの読みこみを失敗（500）にするか
 * @returns 送られた要求の一覧
 */
function stubApi(
  options: {
    summary?: Partial<EventSummary>;
    checkin?: typeof CHECKIN | null;
    summaryStatus?: number;
    failRefetch?: boolean;
    rejectNameOnPost?: boolean;
  } = {},
): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    sent.push({ method, path: url.pathname, body });
    if (url.pathname === "/api/v1/accounts/me") {
      return Promise.resolve(
        Response.json({
          id: "0193a1b2-0000-7000-8000-000000000009",
          displayName: "LINE の名前",
          isOrganizer: false,
          registeredAt: "2026-11-19T10:00:00.000Z",
        }),
      );
    }
    const sameCalls = sent.filter((item) => item.method === method && item.path === url.pathname);
    if (options.failRefetch && method === "GET" && sameCalls.length > 1) {
      return Promise.resolve(
        Response.json(
          { error: { code: "INTERNAL", message: "うまくいきませんでした。", requestId: "r" } },
          { status: 500 },
        ),
      );
    }
    if (url.pathname.endsWith("/summary")) {
      if (options.summaryStatus === 404) {
        return Promise.resolve(
          Response.json(
            { error: { code: "NOT_FOUND", message: "見つかりません。", requestId: "r" } },
            { status: 404 },
          ),
        );
      }
      return Promise.resolve(Response.json({ ...SUMMARY, ...options.summary }));
    }
    if (url.pathname.endsWith("/checkins/me") && method === "GET") {
      return Promise.resolve(
        Response.json({
          checkin: options.checkin ?? null,
          prefill: { name: "佐藤 太郎", referral: null },
        }),
      );
    }
    if (options.rejectNameOnPost) {
      return Promise.resolve(
        Response.json(
          {
            error: {
              code: "INVALID_INPUT",
              message: "入力に誤りがあります。",
              requestId: "r",
              fields: [{ path: "name", message: "名前は50文字までにしてください。" }],
            },
          },
          { status: 400 },
        ),
      );
    }
    return Promise.resolve(
      Response.json(
        { checkin: { ...CHECKIN, ...(body as object) }, alreadyCheckedIn: false },
        { status: 201 },
      ),
    );
  });
  return sent;
}

/** 端末がいったん切れて、つながり直したことにする（TanStack Query が古い問い合わせを読み直す）。 */
async function reconnect(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    await Promise.resolve();
  });
}

/** 読みこみの答えを受けきるまで、少し待つ。 */
async function settle(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("チェックインの画面", () => {
  it("名前の初期値があり、選ばずに押すと設問のそばに誤りが出て、最初の設問へ動く", async () => {
    const sent = stubApi();
    const { container } = renderWithRouter(<CheckinPage eventId={EVENT_ID} />);
    await screen.findByRole("heading", { level: 1, name: "11月の交流会" });
    expect(screen.getByRole("textbox", { name: "名前" })).toHaveValue("佐藤 太郎");
    expect(screen.getByText("渋谷の会場")).toBeInTheDocument();
    expect(screen.getByText("1,000円")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByRole("button", { name: "チェックインする" }));
    const source = screen.getByRole("radiogroup", { name: "申し込みの媒体" });
    expect(source).toHaveAttribute("aria-invalid", "true");
    expect(source).toHaveAccessibleDescription("申し込みの媒体を選んでください。");
    expect(screen.getByText("支払い方法を選んでください。")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("radio", { name: "connpass" })).toHaveFocus());
    expect(sent.filter((item) => item.method === "POST")).toEqual([]);
  });

  it("選んで押すと送り、「チェックインしました」のカードに変わって見出しにフォーカスが移る", async () => {
    const sent = stubApi();
    renderWithRouter(<CheckinPage eventId={EVENT_ID} />);
    await screen.findByRole("heading", { level: 1, name: "11月の交流会" });
    await userEvent.click(screen.getByRole("radio", { name: "Peatix" }));
    await userEvent.click(screen.getByRole("radio", { name: "SNS" }));
    await userEvent.click(screen.getByRole("radio", { name: "現金" }));
    await userEvent.click(screen.getByRole("button", { name: "チェックインする" }));

    const heading = await screen.findByRole("heading", { level: 2, name: "チェックインしました" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("受付で紙の名札に名前を書いて、お入りください。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "チェックインする" })).toBeNull();
    expect(screen.queryByRole("link", { name: "アンケートに答える" })).toBeNull();
    expect(sent.filter((item) => item.method === "POST")).toEqual([
      {
        method: "POST",
        path: `/api/v1/events/${EVENT_ID}/checkins/me`,
        body: {
          name: "佐藤 太郎",
          applicationSource: "peatix",
          referral: "sns",
          paymentMethod: "cash",
          discountId: null,
        },
      },
    ]);
    // 割引のない交流会には割引の設問を出さない
    expect(screen.queryByRole("radiogroup", { name: "割引" })).toBeNull();
  });

  it("割引があれば「割引なし」が選ばれたチップを出し、紹介者を聞く割引を選んだときだけ紹介者の欄を出して送る", async () => {
    const referralId = "0193a1b2-0000-7000-8000-00000000000a";
    const sent = stubApi({
      summary: {
        fee: 5000,
        discounts: [
          { id: referralId, name: "紹介割", amount: 1000, asksReferrer: true },
          {
            id: "0193a1b2-0000-7000-8000-00000000000b",
            name: "学割",
            amount: 500,
            asksReferrer: false,
          },
        ],
      },
    });
    const { container } = renderWithRouter(<CheckinPage eventId={EVENT_ID} />);
    await screen.findByRole("heading", { level: 1, name: "11月の交流会" });
    expect(screen.getByRole("radio", { name: "割引なし" })).toBeChecked();
    expect(screen.queryByRole("textbox", { name: /紹介してくれた人の名前/ })).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "学割（−500円）" }));
    expect(screen.queryByRole("textbox", { name: /紹介してくれた人の名前/ })).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "紹介割（−1,000円）" }));
    const referrer = screen.getByRole("textbox", { name: /紹介してくれた人の名前/ });
    await userEvent.type(referrer, "田中 花子");
    expect(screen.getByText(/紹介してくれた人の名前は主催者だけが読みます/)).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByRole("radio", { name: "Peatix" }));
    await userEvent.click(screen.getByRole("radio", { name: "SNS" }));
    await userEvent.click(screen.getByRole("radio", { name: "現金" }));
    await userEvent.click(screen.getByRole("button", { name: "チェックインする" }));
    await screen.findByRole("heading", { level: 2, name: "チェックインしました" });
    expect(sent.find((item) => item.method === "POST")?.body).toMatchObject({
      discountId: referralId,
      referrerName: "田中 花子",
    });
  });

  it("チェックイン済みなら欄を出さず、アンケートが開いていれば「アンケートに答える」と案内を出す", async () => {
    stubApi({
      checkin: CHECKIN,
      summary: {
        surveyOpen: true,
        lineGroupUrl: "https://line.me/R/ti/g/example",
        openChatUrl: "https://line.me/ti/g2/example",
      },
    });
    const { container } = renderWithRouter(<CheckinPage eventId={EVENT_ID} />);
    await screen.findByRole("heading", { level: 2, name: "チェックイン済み" });
    expect(screen.queryByRole("textbox", { name: "名前" })).toBeNull();
    expect(screen.getByRole("link", { name: "アンケートに答える" })).toHaveAttribute(
      "href",
      `/e/${EVENT_ID}/survey`,
    );
    expect(screen.getByRole("link", { name: "交流会のLINEグループに参加する" })).toHaveAttribute(
      "href",
      "https://line.me/R/ti/g/example",
    );
    expect(
      screen.getByRole("link", { name: "コミュニティのオープンチャットに参加する" }),
    ).toHaveAttribute("href", "https://line.me/ti/g2/example");
    await expectNoAxeViolations(container);
  });

  it("アンケートが閉じていれば、LINE グループも出さない（オープンチャットは出す）", async () => {
    stubApi({
      checkin: CHECKIN,
      summary: {
        lineGroupUrl: "https://line.me/R/ti/g/example",
        openChatUrl: "https://line.me/ti/g2/example",
      },
    });
    renderWithRouter(<CheckinPage eventId={EVENT_ID} />);
    await screen.findByRole("heading", { level: 2, name: "チェックイン済み" });
    expect(screen.queryByRole("link", { name: "交流会のLINEグループに参加する" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "コミュニティのオープンチャットに参加する" }),
    ).toBeInTheDocument();
  });

  it("API が欄の誤りを返したら、その欄のそばに出してフォーカスを移し、ボタンの近くには出さない", async () => {
    stubApi({ rejectNameOnPost: true });
    renderWithRouter(<CheckinPage eventId={EVENT_ID} />);
    const name = await screen.findByRole("textbox", { name: "名前" });
    await userEvent.click(screen.getByRole("radio", { name: "Peatix" }));
    await userEvent.click(screen.getByRole("radio", { name: "SNS" }));
    await userEvent.click(screen.getByRole("radio", { name: "現金" }));
    await userEvent.click(screen.getByRole("button", { name: "チェックインする" }));

    await waitFor(() =>
      expect(name).toHaveAccessibleDescription("名前は50文字までにしてください。"),
    );
    await waitFor(() => expect(name).toHaveFocus());
    expect(screen.queryByText(/チェックインできませんでした/)).toBeNull();
  });

  it("読めたあとの読み直しが失敗しても、入れかけの欄と済んだカードを消さない", async () => {
    const sent = stubApi({ failRefetch: true });
    renderWithRouter(<CheckinPage eventId={EVENT_ID} />);
    const name = await screen.findByRole("textbox", { name: "名前" });
    await userEvent.clear(name);
    await userEvent.type(name, "入れかけの名前");
    await userEvent.click(screen.getByRole("radio", { name: "Peatix" }));

    // つなぎ直すと、古くなった問い合わせを読み直す（ここでは要約と自分のチェックインの読み直しが失敗する）
    await reconnect();
    await waitFor(() =>
      expect(sent.filter((item) => item.path.endsWith("/summary"))).toHaveLength(2),
    );
    await settle();
    expect(screen.queryByRole("heading", { name: "読みこめませんでした" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "名前" })).toHaveValue("入れかけの名前");
    expect(screen.getByRole("radio", { name: "Peatix" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "SNS" }));
    await userEvent.click(screen.getByRole("radio", { name: "現金" }));
    await userEvent.click(screen.getByRole("button", { name: "チェックインする" }));
    await screen.findByRole("heading", { level: 2, name: "チェックインしました" });
    await reconnect();
    await waitFor(() =>
      expect(sent.filter((item) => item.path.endsWith("/summary"))).toHaveLength(3),
    );
    await settle();
    expect(
      screen.getByRole("heading", { level: 2, name: "チェックインしました" }),
    ).toBeInTheDocument();
  });

  it("交流会がなければ「この交流会は見つかりません」", async () => {
    stubApi({ summaryStatus: 404 });
    renderWithRouter(<CheckinPage eventId={EVENT_ID} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "この交流会は見つかりません" }),
    ).toBeInTheDocument();
    expect(screen.getByText("受付の人に声をかけてください。")).toBeInTheDocument();
  });
});
