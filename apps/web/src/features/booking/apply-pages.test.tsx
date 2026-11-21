// 自前の申込みページの画面（booking-003）：申込みページ（ログインなし・閉じている・始まりのあと・部員だけ・ログインしたあとの名前と同意・
// 申し込んだあと・メールの切り替え）・札のページ（確定の前・確定・取り消し・期限切れ・使えない）・自分の申込み（一覧・取り消し・
// 部の予定・同意を外す）・申込みページの設定の節。API は fetch の差しかえで答える。名前・アドレスはどれも架空のもの。
import type {
  ApplyPage as ApplyPageData,
  BookingSetting,
  EntryTokenView,
  MyEntryList,
} from "@workspace/contracts/booking";
import type { EventView } from "@workspace/contracts/event";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initLiff } from "../../lib/liff.ts";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ApplyPage } from "./ApplyPage.tsx";
import { EntryTokenPage } from "./EntryTokenPage.tsx";
import { MyBookingsPage } from "./MyBookingsPage.tsx";
import { SelfPageSection } from "./SelfPageSection.tsx";

const EVENT_ID = "0193a1b2-0000-7000-8000-0000000000e1";
const ENTRY_ID = "0193a1b2-0000-7000-8000-0000000000e2";
const ME = "0193a1b2-0000-7000-8000-0000000000bb";
const TOKEN = "t".repeat(43);

/** 打診も並びもないときの欄（booking-004）。 */
const NO_STANDING = {
  waitlistPosition: null,
  offerDeadline: null,
  offerExpired: false,
  canAccept: false,
};

/** 送られた要求。 */
type Sent = { method: string; path: string; body: unknown };

/**
 * 試しの申込みページ。
 * @param values 差しかえる欄
 * @returns 申込みページ
 */
function pageOf(values: Partial<ApplyPageData> = {}): ApplyPageData {
  return {
    event: {
      id: EVENT_ID,
      name: "土曜の練習",
      startsAt: "2026-12-06T04:00:00.000Z",
      venue: "中央市民体育館",
      fee: 500,
    },
    hostName: "バドミントンの部",
    state: "open",
    visibility: "public",
    calendar: {
      googleUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
      icsPath: `/api/v1/booking/events/${EVENT_ID}/calendar`,
    },
    lineFriendUrl: null,
    seats: null,
    viewer: { signedIn: false },
    ...values,
  };
}

/** ログインした人の欄。 */
const SIGNED_IN = {
  signedIn: true as const,
  defaultName: "中村 さき",
  myEntry: null,
  consented: false,
  lineLinked: false,
  hasContactEmail: false,
};

/**
 * 仮の API。
 * @param routes 道ごとの答え（"GET /api/…" → 答え）
 * @param signedIn ログインしているか
 * @returns 送られた要求の一覧
 */
function stubApi(routes: Record<string, () => Response>, signedIn = false): Sent[] {
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
      return signedIn
        ? Response.json({
            id: ME,
            displayName: "中村 さき",
            isOrganizer: false,
            registeredAt: "2026-11-19T10:00:00.000Z",
          })
        : Response.json(
            { error: { code: "UNAUTHENTICATED", message: "ログインしてください" } },
            { status: 401 },
          );
    }
    const handler = routes[key];
    return handler
      ? handler()
      : Response.json({ error: { code: "NOT_FOUND", message: "ない道" } }, { status: 404 });
  });
  return sent;
}

beforeAll(async () => {
  await initLiff();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("申込みページ", () => {
  const pagePath = `GET /api/v1/booking/events/${EVENT_ID}/page`;

  it("ログインなしで、日時・会場・参加費・主催と「LINE でログインして申し込む」「LINE を使わずに申し込む」を出す", async () => {
    stubApi({ [pagePath]: () => Response.json(pageOf()) });
    renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "土曜の練習" }),
    ).toBeInTheDocument();
    expect(screen.getByText("中央市民体育館")).toBeInTheDocument();
    expect(screen.getByText("500円（当日、受付で）")).toBeInTheDocument();
    expect(screen.getByText("バドミントンの部")).toBeInTheDocument();
    expect(screen.getByText("受付中")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LINE でログインして申し込む" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LINE を使わずに申し込む" })).toBeInTheDocument();
  });

  it("閉じている・始まりを過ぎたら、申し込む入口を出さない", async () => {
    stubApi({ [pagePath]: () => Response.json(pageOf({ state: "closed" })) });
    renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    expect(await screen.findByText(/いまは申込みを受け付けていません/)).toBeInTheDocument();
    expect(screen.queryByText("LINE でログインして申し込む")).not.toBeInTheDocument();
  });

  it("ない・部員だけの会は理由を出す（部員だけはログインの入口）", async () => {
    stubApi({
      [pagePath]: () =>
        Response.json(
          { error: { code: "BOOKING_PAGE_MEMBERS_ONLY", message: "部員だけの会です。" } },
          { status: 403 },
        ),
    });
    renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    expect(
      await screen.findByRole("heading", { name: "この会は見られません" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "部員の方は LINE でログイン" })).toBeInTheDocument();
  });

  it("ログインしたら名前（初めの値）と案内のチェック（外れている）で申し込み、完了の画面に変える", async () => {
    const applied = pageOf({
      viewer: {
        ...SIGNED_IN,
        myEntry: {
          id: ENTRY_ID,
          name: "中村 さき",
          status: "confirmed",
          appliedAt: "2026-11-20T00:00:00.000Z",
          cancellable: true,
          ...NO_STANDING,
        },
      },
      lineFriendUrl: "https://line.me/R/ti/p/%40abc",
    });
    const sent = stubApi(
      {
        [pagePath]: () => Response.json(pageOf({ viewer: SIGNED_IN })),
        [`POST /api/v1/booking/events/${EVENT_ID}/apply`]: () =>
          Response.json(
            { entry: applied.viewer.signedIn ? applied.viewer.myEntry : null, page: applied },
            { status: 201 },
          ),
        "GET /api/v1/booking/me/contact": () => Response.json({ email: null }),
      },
      true,
    );
    renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    expect(await screen.findByLabelText(/お名前/)).toHaveValue("中村 さき");
    const consent = screen.getByRole("checkbox", {
      name: /バドミントンの部から、次の会の案内を受け取る/,
    });
    expect(consent).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "申し込む" }));
    expect(await screen.findByRole("heading", { name: "申し込みました" })).toBeInTheDocument();
    expect(sent.find((request) => request.method === "POST")?.body).toEqual({
      name: "中村 さき",
      consent: false,
    });
    expect(screen.getByText("確定")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google カレンダー" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByRole("link", { name: "ほかのカレンダー（.ics）" })).toHaveAttribute(
      "href",
      `/api/v1/booking/events/${EVENT_ID}/calendar`,
    );
    expect(screen.getByRole("link", { name: "公式 LINE を友だちに追加する" })).toBeInTheDocument();
    expect(await screen.findByLabelText(/メールアドレス/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "自分の申込みを見る" })).toBeInTheDocument();
  });

  it("名前が空なら欄のそばに誤りを出し、送らない。案内に同意していればチェックの代わりに文", async () => {
    const sent = stubApi(
      { [pagePath]: () => Response.json(pageOf({ viewer: { ...SIGNED_IN, consented: true } })) },
      true,
    );
    renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    const name = await screen.findByLabelText(/お名前/);
    expect(screen.getByText(/次の会の案内を受け取っています/)).toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole("button", { name: "申し込む" }));
    expect(await screen.findByText("名前を入れてください。")).toBeInTheDocument();
    expect(sent.filter((request) => request.method === "POST")).toEqual([]);
  });

  it("LINE を使わずに申し込む：名前とメールアドレスで確認のメールを送り、送ったあとの文を出す", async () => {
    const sent = stubApi({
      [pagePath]: () => Response.json(pageOf()),
      [`POST /api/v1/booking/events/${EVENT_ID}/email-requests`]: () =>
        Response.json({ accepted: true }, { status: 202 }),
    });
    renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    await userEvent.click(await screen.findByRole("button", { name: "LINE を使わずに申し込む" }));
    await userEvent.click(screen.getByRole("button", { name: "確認のメールを送る" }));
    expect(await screen.findByText("名前を入れてください。")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/お名前/), "小林 はると");
    await userEvent.type(screen.getByLabelText(/メールアドレス/), "guest@example.com");
    await userEvent.click(screen.getByRole("button", { name: "確認のメールを送る" }));
    expect(await screen.findByText(/確認のメールを送りました/)).toBeInTheDocument();
    expect(sent.find((request) => request.method === "POST")?.body).toEqual({
      name: "小林 はると",
      email: "guest@example.com",
    });
  });
});

describe("札のページ", () => {
  const tokenPath = `GET /api/v1/booking/entry-tokens/${TOKEN}`;

  /**
   * 試しの札のページ。
   * @param values 差しかえる欄
   * @returns 札のページ
   */
  function viewOf(values: Partial<EntryTokenView> = {}): EntryTokenView {
    const page = pageOf();
    return {
      state: "pending",
      event: page.event,
      hostName: page.hostName,
      name: "小林 はると",
      entry: null,
      confirmable: true,
      calendar: page.calendar,
      ...values,
    };
  }

  it("確定の前は「申込みを確定する」。押すと申し込みました・取り消すを出し、取り消せる", async () => {
    stubApi({
      [tokenPath]: () => Response.json(viewOf()),
      [`POST /api/v1/booking/entry-tokens/${TOKEN}/confirm`]: () =>
        Response.json(
          viewOf({
            state: "entry",
            entry: { status: "confirmed", cancellable: true, ...NO_STANDING },
          }),
        ),
      [`POST /api/v1/booking/entry-tokens/${TOKEN}/cancel`]: () =>
        Response.json(
          viewOf({
            state: "entry",
            entry: { status: "cancelled", cancellable: false, ...NO_STANDING },
          }),
        ),
    });
    renderWithRouter(<EntryTokenPage eventId={EVENT_ID} entryToken={TOKEN} />);
    expect(await screen.findByRole("heading", { name: "申込みを確定する" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "申込みを確定する" }));
    expect(await screen.findByRole("heading", { name: "申し込みました" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "この申込みを取り消す" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す" }));
    expect(await screen.findByText(/この申込みは取り消しています/)).toBeInTheDocument();
  });

  it("期限切れは申込みページへの入口、知らない札は使えないと出す", async () => {
    stubApi({
      [tokenPath]: () =>
        Response.json(
          { error: { code: "BOOKING_ENTRY_TOKEN_EXPIRED", message: "期限が切れました。" } },
          { status: 410 },
        ),
    });
    renderWithRouter(<EntryTokenPage eventId={EVENT_ID} entryToken={TOKEN} />);
    expect(
      await screen.findByRole("heading", { name: "このリンクは期限が切れました" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "申込みページを開く" })).toBeInTheDocument();
  });

  it("確認の前に部員だけに変わった会は、見られない理由だけを出す（会の中身を出さない）", async () => {
    stubApi({
      [tokenPath]: () =>
        Response.json(
          { error: { code: "BOOKING_PAGE_MEMBERS_ONLY", message: "部員だけの会です。" } },
          { status: 403 },
        ),
    });
    renderWithRouter(<EntryTokenPage eventId={EVENT_ID} entryToken={TOKEN} />);
    expect(await screen.findByRole("heading", { name: "この会は見られません" })).toBeInTheDocument();
    expect(screen.getByText("部員だけの会です。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "申込みを確定する" })).not.toBeInTheDocument();
  });
});

describe("自分の申込み", () => {
  const entries: MyEntryList = {
    entries: [
      {
        entryId: ENTRY_ID,
        status: "confirmed",
        cancellable: true,
        ...NO_STANDING,
        event: {
          id: EVENT_ID,
          name: "土曜の練習",
          startsAt: "2026-12-06T04:00:00.000Z",
          venue: "中央市民体育館",
        },
        hostName: "バドミントンの部",
        googleCalendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
      },
    ],
  };

  it("今後の申込みを出し、取り消しは確かめてから送る。案内を受け取る主催を外せる", async () => {
    const sent = stubApi(
      {
        "GET /api/v1/booking/me/entries": () => Response.json(entries),
        [`POST /api/v1/booking/me/entries/${ENTRY_ID}/cancel`]: () =>
          Response.json({ ...entries.entries[0], status: "cancelled", cancellable: false }),
        "GET /api/v1/booking/me/contact": () => Response.json({ email: null }),
        "GET /api/v1/booking/me/consents": () =>
          Response.json({
            consents: [
              { id: ENTRY_ID, holderName: "バドミントンの部", holderKind: "organization" },
            ],
          }),
        [`DELETE /api/v1/booking/me/consents/${ENTRY_ID}`]: () =>
          new Response(null, { status: 204 }),
      },
      true,
    );
    renderWithRouter(<MyBookingsPage tab="entries" />);
    expect(await screen.findByRole("link", { name: "土曜の練習" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "自分の申込み" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await userEvent.click(screen.getByRole("button", { name: "取り消す" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す" }));
    expect(await screen.findByText("土曜の練習の申込みを取り消しました。")).toBeInTheDocument();
    expect(sent.some((request) => request.path.endsWith("/cancel"))).toBe(true);
    await userEvent.click(await screen.findByRole("button", { name: "外す" }));
    expect(sent.some((request) => request.method === "DELETE")).toBe(true);
  });

  it("部の予定のタブは、自分の組織の会を状態つきで出す", async () => {
    stubApi(
      {
        "GET /api/v1/booking/me/schedule": () =>
          Response.json({
            events: [
              {
                event: entries.entries[0]?.event,
                hostName: "バドミントンの部",
                state: "open",
                visibility: "members",
                myStatus: null,
              },
            ],
          }),
        "GET /api/v1/booking/me/contact": () => Response.json({ email: null }),
        "GET /api/v1/booking/me/consents": () => Response.json({ consents: [] }),
      },
      true,
    );
    renderWithRouter(<MyBookingsPage tab="schedule" />);
    expect(await screen.findByRole("link", { name: "土曜の練習" })).toBeInTheDocument();
    expect(screen.getByText("部員だけ")).toBeInTheDocument();
    expect(screen.getByText("受付中")).toBeInTheDocument();
  });
});

describe("申込みページの設定の節", () => {
  const event = { id: EVENT_ID, name: "土曜の練習", myRole: "organizer" } as EventView;
  const setting: BookingSetting = {
    mode: "self_page",
    entryCount: 0,
    accepting: false,
    visibility: "public",
    started: false,
    inOrganization: false,
    capacity: null,
    quotas: [],
    seats: null,
    cancelled: false,
    change: null,
  };

  it("閉じているときは「受付を開く」。組織に入れていなければ部員だけを選べない。URL を出す", async () => {
    const sent = stubApi({
      [`PUT /api/v1/booking/events/${EVENT_ID}/self-page`]: () =>
        Response.json({ ...setting, accepting: true }),
    });
    renderWithRouter(<SelfPageSection event={event} setting={setting} />);
    expect(await screen.findByText(/受付を閉じています/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "部員だけ" })).toBeDisabled();
    expect(screen.getByText(`http://localhost:3000/e/${EVENT_ID}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "受付を開く" }));
    expect(await screen.findByText("受付を開きました。")).toBeInTheDocument();
    expect(sent.find((request) => request.method === "PUT")?.body).toEqual({
      accepting: true,
      visibility: "public",
    });
  });

  it("始まりを過ぎたら、自動で閉じたと出して開くボタンを出さない", async () => {
    stubApi({});
    renderWithRouter(<SelfPageSection event={event} setting={{ ...setting, started: true }} />);
    expect(
      await screen.findByText(/始まりを過ぎたので、受付は自動で閉じました/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "受付を開く" })).not.toBeInTheDocument();
  });
});
