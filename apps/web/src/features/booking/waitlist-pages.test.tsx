// 定員とキャンセル待ちの画面（booking-004）：定員の節（保存・満員と止める媒体のリンク・超えた人数・変更の帯・中止の確かめ）・
// 申込みページ（残り・満員・当日の空き・中止・キャンセル待ちの完了の画面）・自分の申込み（打診中の参加と辞退・期限切れ）・
// 札のページ（返事）。API は fetch の差しかえで答える。名前はどれも架空のもの。
import type {
  ApplyPage as ApplyPageData,
  BookingSetting,
  EntryTokenView,
  MyEntryList,
} from "@workspace/contracts/booking";
import type { EventView } from "@workspace/contracts/event";
import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initLiff } from "../../lib/liff.ts";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ApplyPage } from "./ApplyPage.tsx";
import { CapacitySection } from "./CapacitySection.tsx";
import { EntryTokenPage } from "./EntryTokenPage.tsx";
import { MyBookingsPage } from "./MyBookingsPage.tsx";

const EVENT_ID = "0193a1b2-0000-7000-8000-0000000004e1";
const ENTRY_ID = "0193a1b2-0000-7000-8000-0000000004e2";
const TOKEN = "w".repeat(43);

/** 送られた要求。 */
type Sent = { method: string; path: string; body: unknown };

/** 打診も並びもないときの欄。 */
const NO_STANDING = {
  waitlistPosition: null,
  offerDeadline: null,
  offerExpired: false,
  canAccept: false,
};

/**
 * fetch を差しかえる。
 * @param routes 「動き 道」から答え
 * @param signedIn ログインしているか
 * @returns 送られた要求
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
            id: "0193a1b2-0000-7000-8000-0000000004bb",
            displayName: "森 はるか",
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

/** 設定の見本（自前・定員16・Peatix 4・満員・1人超え・日時の変更あり）。 */
const SETTING: BookingSetting = {
  mode: "self_page",
  entryCount: 17,
  accepting: true,
  visibility: "public",
  started: false,
  inOrganization: false,
  capacity: 16,
  quotas: [{ applicationSource: "peatix", seats: 4, manageUrl: "https://example.com/manage" }],
  seats: {
    capacity: 16,
    filled: 17,
    confirmed: 17,
    offered: 0,
    waitlisted: 2,
    selfRemaining: 0,
    over: 1,
    full: true,
    quotasReleased: true,
    sameDay: false,
    quotas: [
      {
        applicationSource: "peatix",
        seats: 4,
        filled: 4,
        remaining: 0,
        manageUrl: "https://example.com/manage",
      },
    ],
    stopSources: [{ applicationSource: "peatix", manageUrl: "https://example.com/manage" }],
  },
  cancelled: false,
  change: {
    previousStartsAt: "2026-11-28T10:00:00.000Z",
    previousVenue: "中央市民体育館",
    startsAt: "2026-11-29T10:00:00.000Z",
    venue: "中央市民体育館",
    autoNoticeAt: null,
  },
};

describe("定員とキャンセル待ちの節", () => {
  const event = { id: EVENT_ID, name: "土曜の練習", myRole: "organizer" } as EventView;
  const base = `/api/v1/booking/events/${EVENT_ID}`;

  it("満員・止める媒体のリンク・超えた人数・変更の帯を出し、定員を保存する", async () => {
    const sent = stubApi({
      [`PUT ${base}/capacity`]: () => Response.json({ ...SETTING, capacity: 20 }),
      [`POST ${base}/change-notice`]: () => Response.json({ ...SETTING, change: null }),
    });
    renderWithRouter(<CapacitySection event={event} setting={SETTING} />);
    expect(await screen.findByText("満員です")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Peatixの管理ページを開く" });
    expect(link).toHaveAttribute("href", "https://example.com/manage");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/定員を1人超えています/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "日時や場所が変わりました" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "変更を知らせる" }));
    expect(await screen.findByText("申し込んだ人に変更を知らせました。")).toBeInTheDocument();
    expect(sent.find((item) => item.path.endsWith("/change-notice"))?.body).toEqual({
      notify: true,
    });

    const capacity = screen.getByLabelText("定員");
    await userEvent.clear(capacity);
    await userEvent.type(capacity, "20");
    await userEvent.click(screen.getByRole("button", { name: "定員を保存する" }));
    expect(await screen.findByText("定員を保存しました。")).toBeInTheDocument();
    expect(sent.find((item) => item.path.endsWith("/capacity"))?.body).toEqual({
      capacity: 20,
      quotas: [{ applicationSource: "peatix", seats: 4, manageUrl: "https://example.com/manage" }],
    });
  });

  it("枠の合計が定員を超えると送らずに欄のそばの文を出す", async () => {
    const sent = stubApi({});
    renderWithRouter(<CapacitySection event={event} setting={SETTING} />);
    const capacity = await screen.findByLabelText("定員");
    await userEvent.clear(capacity);
    await userEvent.type(capacity, "3");
    await userEvent.click(screen.getByRole("button", { name: "定員を保存する" }));
    expect(
      await screen.findByText(/定員を超えています。定員までにしてください/),
    ).toBeInTheDocument();
    expect(sent.some((item) => item.path.endsWith("/capacity"))).toBe(false);
  });

  it("予約を中止するときは確かめの枠を出してから中止する", async () => {
    const sent = stubApi({
      [`POST ${base}/cancel-booking`]: () => Response.json({ ...SETTING, cancelled: true }),
    });
    renderWithRouter(<CapacitySection event={event} setting={{ ...SETTING, change: null }} />);
    await userEvent.click(await screen.findByRole("button", { name: "予約を中止する" }));
    expect(await screen.findByRole("heading", { name: "予約を中止しますか" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "中止する" }));
    await waitFor(() =>
      expect(sent.some((item) => item.path.endsWith("/cancel-booking"))).toBe(true),
    );
  });
});

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
    calendar: { googleUrl: "https://calendar.google.com/", icsPath: "/x.ics" },
    lineFriendUrl: null,
    seats: { capacity: 16, remaining: 3, waitlist: 0, sameDay: false },
    viewer: { signedIn: false },
    ...values,
  };
}

describe("申込みページの席の欄", () => {
  const pagePath = `GET /api/v1/booking/events/${EVENT_ID}/page`;

  it("残りの席を出す", async () => {
    stubApi({ [pagePath]: () => Response.json(pageOf()) });
    renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    expect(await screen.findByText("残り3席")).toBeInTheDocument();
  });

  it("満員ならキャンセル待ちの人数と「キャンセル待ちに申し込む」を出し、申し込むとキャンセル待ちの何番目かを出す", async () => {
    const full = pageOf({
      seats: { capacity: 16, remaining: 0, waitlist: 2, sameDay: false },
      viewer: {
        signedIn: true,
        defaultName: "森 はるか",
        myEntry: null,
        consented: false,
        lineLinked: false,
        hasContactEmail: false,
      },
    });
    stubApi(
      {
        [pagePath]: () => Response.json(full),
        [`POST /api/v1/booking/events/${EVENT_ID}/apply`]: () =>
          Response.json(
            {
              entry: {
                id: ENTRY_ID,
                name: "森 はるか",
                status: "waitlisted",
                appliedAt: "2026-11-20T00:00:00.000Z",
                cancellable: true,
                ...NO_STANDING,
                waitlistPosition: 3,
              },
              page: full,
            },
            { status: 201 },
          ),
        "GET /api/v1/booking/me/contact": () => Response.json({ email: null }),
      },
      true,
    );
    renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    expect(await screen.findByText("満員です（キャンセル待ち2人）。")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "キャンセル待ちに申し込む" }));
    expect(
      await screen.findByRole("heading", { name: "キャンセル待ちに入りました" }),
    ).toBeInTheDocument();
    expect(screen.getByText("キャンセル待ち（3番目）")).toBeInTheDocument();
  });

  it("当日の空きと中止を出す", async () => {
    stubApi({
      [pagePath]: () =>
        Response.json(
          pageOf({ seats: { capacity: 16, remaining: 1, waitlist: 2, sameDay: true } }),
        ),
    });
    const { unmount } = renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    expect(await screen.findByText("当日の空き：残り1席（先着）")).toBeInTheDocument();
    unmount();
    stubApi({ [pagePath]: () => Response.json(pageOf({ state: "cancelled" })) });
    renderWithRouter(<ApplyPage eventId={EVENT_ID} />);
    expect(await screen.findByText("この会は中止になりました")).toBeInTheDocument();
  });
});

describe("自分の申込みの打診", () => {
  /**
   * 自分の申込みの一覧。
   * @param values 差しかえる欄
   * @returns 一覧
   */
  function listOf(values: Partial<MyEntryList["entries"][number]> = {}): MyEntryList {
    return {
      entries: [
        {
          entryId: ENTRY_ID,
          status: "offered",
          cancellable: true,
          ...NO_STANDING,
          offerDeadline: "2026-11-22T00:00:00.000Z",
          canAccept: true,
          event: {
            id: EVENT_ID,
            name: "土曜の練習",
            startsAt: "2026-12-06T04:00:00.000Z",
            venue: "中央市民体育館",
          },
          hostName: "バドミントンの部",
          googleCalendarUrl: "https://calendar.google.com/",
          ...values,
        },
      ],
    };
  }

  it("打診中なら期限と「参加する」「辞退する」を出し、参加すると確定の文を出す", async () => {
    const sent = stubApi(
      {
        "GET /api/v1/booking/me/entries": () => Response.json(listOf()),
        [`POST /api/v1/booking/me/entries/${ENTRY_ID}/respond`]: () =>
          Response.json(listOf({ status: "confirmed", canAccept: false }).entries[0]),
        "GET /api/v1/booking/me/contact": () => Response.json({ email: null }),
        "GET /api/v1/booking/me/consents": () => Response.json({ consents: [] }),
      },
      true,
    );
    renderWithRouter(<MyBookingsPage tab="entries" />);
    expect(
      await screen.findByText(/11月22日.*までに、参加するかを答えてください/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "辞退する" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "参加する" }));
    expect(
      await screen.findByText("土曜の練習に参加することにしました（確定）。"),
    ).toBeInTheDocument();
    expect(sent.find((item) => item.path.endsWith("/respond"))?.body).toEqual({ answer: "accept" });
  });

  it("期限が過ぎた打診は、ボタンを出さずに期限切れと出す", async () => {
    stubApi(
      {
        "GET /api/v1/booking/me/entries": () =>
          Response.json(listOf({ offerExpired: true, canAccept: false })),
        "GET /api/v1/booking/me/contact": () => Response.json({ email: null }),
        "GET /api/v1/booking/me/consents": () => Response.json({ consents: [] }),
      },
      true,
    );
    renderWithRouter(<MyBookingsPage tab="entries" />);
    expect(await screen.findByText(/返事の期限が過ぎました/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "参加する" })).not.toBeInTheDocument();
  });
});

describe("札のページの打診", () => {
  it("返事の札で開くと打診中と「参加する」を出し、参加すると確定にする", async () => {
    const view = (status: "offered" | "confirmed"): EntryTokenView => ({
      state: "entry",
      event: {
        id: EVENT_ID,
        name: "土曜の練習",
        startsAt: "2026-12-06T04:00:00.000Z",
        venue: "中央市民体育館",
        fee: 500,
      },
      hostName: "バドミントンの部",
      name: "小林 はると",
      entry: {
        status,
        cancellable: true,
        ...NO_STANDING,
        offerDeadline: status === "offered" ? "2026-11-22T00:00:00.000Z" : null,
        canAccept: status === "offered",
      },
      confirmable: false,
      linkSpent: false,
      calendar: { googleUrl: "https://calendar.google.com/", icsPath: "/x.ics" },
    });
    stubApi({
      [`GET /api/v1/booking/entry-tokens/${TOKEN}`]: () => Response.json(view("offered")),
      [`POST /api/v1/booking/entry-tokens/${TOKEN}/respond`]: () =>
        Response.json(view("confirmed")),
    });
    renderWithRouter(<EntryTokenPage eventId={EVENT_ID} entryToken={TOKEN} />);
    expect(await screen.findByText("打診中")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "参加する" }));
    expect(await screen.findByText("確定")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "参加する" })).not.toBeInTheDocument();
  });

  it("返事の札で参加したら、使い終わったリンクとして申込みのメールへ案内し、読み直しても答えを出し続ける", async () => {
    const offered: EntryTokenView = {
      state: "entry",
      event: {
        id: EVENT_ID,
        name: "土曜の練習",
        startsAt: "2026-12-06T04:00:00.000Z",
        venue: "中央市民体育館",
        fee: 500,
      },
      hostName: "バドミントンの部",
      name: "小林 はると",
      entry: {
        status: "offered",
        cancellable: true,
        ...NO_STANDING,
        offerDeadline: "2026-11-22T00:00:00.000Z",
        canAccept: true,
      },
      confirmable: false,
      linkSpent: false,
      calendar: { googleUrl: "https://calendar.google.com/", icsPath: "/x.ics" },
    };
    let reads = 0;
    stubApi({
      [`GET /api/v1/booking/entry-tokens/${TOKEN}`]: () => {
        reads += 1;
        // 答えたあとは札が使えない
        return reads === 1
          ? Response.json(offered)
          : Response.json(
              { error: { code: "BOOKING_ENTRY_TOKEN_INVALID", message: "使えません。" } },
              { status: 404 },
            );
      },
      [`POST /api/v1/booking/entry-tokens/${TOKEN}/respond`]: () =>
        Response.json({
          ...offered,
          entry: { ...offered.entry, status: "confirmed", cancellable: false, canAccept: false },
          linkSpent: true,
        }),
    });
    renderWithRouter(<EntryTokenPage eventId={EVENT_ID} entryToken={TOKEN} />);
    await userEvent.click(await screen.findByRole("button", { name: "参加する" }));
    expect(await screen.findByText(/申し込んだときに届いたメールのリンクを開いてください/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "この申込みを取り消す" })).not.toBeInTheDocument();
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    expect(screen.getByText("確定")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "このリンクは使えません" })).not.toBeInTheDocument();
    focusManager.setFocused(undefined);
  });
});
