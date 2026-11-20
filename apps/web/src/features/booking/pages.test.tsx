// 予約の画面：使い方の節（受付だけに戻す確かめ）・名簿（人数・絞り込み・同じ名前・手で足した・受付係にはボタンを出さない）・
// 名簿に入れる（貼る → 確かめ → N人を取り込む）・名簿に当てる（候補を当てる・名簿にいないカード）。API は fetch の差しかえで答える。
// 名前はどれも架空のもの。
import type { MatchBoard, Roster } from "@workspace/contracts/booking";
import type { EventView } from "@workspace/contracts/event";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ImportPage } from "./ImportPage.tsx";
import { MatchPage } from "./MatchPage.tsx";
import { ModeSection } from "./ModeSection.tsx";
import { RosterPage } from "./RosterPage.tsx";

/** 試しの交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000001";

/** 試しのチェックインの ID。 */
const CHECKIN_ID = "0193a1b2-0000-7000-8000-000000000002";

/**
 * 試しの交流会。
 * @param myRole 今の利用者の役目
 * @returns 交流会
 */
function eventView(myRole: "organizer" | "staff"): EventView {
  return {
    id: EVENT_ID,
    name: "12月の勉強会",
    startsAt: "2026-12-06T04:00:00.000Z",
    venue: "渋谷の会場",
    fee: 1000,
    googleFormUrl: null,
    lineGroupUrl: null,
    surveyOpen: false,
    discounts: [],
    createdAt: "2026-11-19T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
    myRole,
    owner: null,
    organization: null,
    isOwner: myRole === "organizer",
  };
}

/**
 * 名簿の行を作る。
 * @param id 行の ID の最後
 * @param name 名前
 * @param values ほかの欄
 * @returns 行
 */
function entry(id: string, name: string, values: Partial<Roster["entries"][number]> = {}) {
  return {
    id: `0193a1b2-0000-7000-8000-0000000001${id}`,
    name,
    applicationSource: "peatix" as const,
    entryKind: "import" as const,
    status: "confirmed" as const,
    appliedAt: "2026-11-20T01:00:00.000Z",
    enteredByName: null,
    memo: null,
    sameName: false,
    attendance: "pending" as const,
    match: null,
    waitlistPosition: null,
    offer: null,
    ...values,
  };
}

/** 設定の答えのほかの欄（定員なし。booking-003・004）。 */
const SETTING_REST = {
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

/** 試しの名簿。 */
const ROSTER: Roster = {
  entries: [
    entry("01", "佐藤 けん", { sameName: true }),
    entry("02", "佐藤けん", {
      sameName: true,
      entryKind: "manual",
      enteredByName: "高橋",
      applicationSource: "other",
    }),
    entry("03", "山本 りな", { status: "cancelled" }),
    entry("04", "中村 さき", { attendance: "no_show" }),
  ],
  counts: {
    confirmed: 3,
    cancelled: 1,
    waitlisted: 0,
    offered: 0,
    came: 0,
    noShow: 1,
    walkIn: 0,
    bySource: [
      { applicationSource: "connpass", count: 0 },
      { applicationSource: "peatix", count: 2 },
      { applicationSource: "direct", count: 0 },
      { applicationSource: "other", count: 1 },
    ],
  },
  eventEnded: true,
};

/** 試しの受付係の画面。 */
const BOARD: MatchBoard = {
  checkins: [
    {
      checkinId: CHECKIN_ID,
      name: "さとう けん",
      method: "line",
      checkedInAt: "2026-12-06T04:02:00.000Z",
      state: "candidate",
      entry: { id: ROSTER.entries[0]?.id ?? "", name: "佐藤 けん", applicationSource: "peatix" },
    },
    {
      checkinId: "0193a1b2-0000-7000-8000-000000000003",
      name: "Haru",
      method: "line",
      checkedInAt: "2026-12-06T04:05:00.000Z",
      state: "unmatched",
      entry: null,
    },
  ],
  choices: [{ id: ROSTER.entries[3]?.id ?? "", name: "中村 さき", applicationSource: "peatix" }],
  counts: { came: 0, confirmed: 3, walkIn: 0, pending: 2 },
};

/** 送られた要求。 */
type Sent = { method: string; path: string; body?: unknown };

/**
 * 仮の API。
 * @param options 役目と使い方
 * @param options.role 今の利用者の役目
 * @param options.mode 使い方
 * @returns 送られた要求の一覧
 */
function stubApi(
  options: { role?: "organizer" | "staff"; mode?: "reception" | "roster" } = {},
): Sent[] {
  const sent: Sent[] = [];
  let mode = options.mode ?? "roster";
  const base = `/api/v1/booking/events/${EVENT_ID}`;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    sent.push({ method, path: url.pathname, body });
    switch (`${method} ${url.pathname}`) {
      case "GET /api/v1/accounts/me":
        return Promise.resolve(
          Response.json({
            id: "0193a1b2-0000-7000-8000-000000000000",
            displayName: "主催者",
            isOrganizer: false,
            registeredAt: "2026-11-19T10:00:00.000Z",
          }),
        );
      case `GET /api/v1/events/${EVENT_ID}`:
        return Promise.resolve(Response.json(eventView(options.role ?? "organizer")));
      case `GET ${base}/setting`:
        return Promise.resolve(Response.json({ ...SETTING_REST, mode, entryCount: 4 }));
      case `PUT ${base}/setting`:
        mode = (body as { mode: "reception" | "roster" }).mode;
        return Promise.resolve(Response.json({ ...SETTING_REST, mode, entryCount: 4 }));
      case `GET ${base}/entries`:
        return Promise.resolve(Response.json(ROSTER));
      case `GET ${base}/matches`:
        return Promise.resolve(Response.json(BOARD));
      case `POST ${base}/checkins/${CHECKIN_ID}/match`:
        return Promise.resolve(
          Response.json({
            ...BOARD,
            checkins: [{ ...BOARD.checkins[0], state: "matched_manual" }, BOARD.checkins[1]],
            counts: { ...BOARD.counts, came: 1, pending: 1 },
          }),
        );
      case `GET ${base}/import-mappings`:
        return Promise.resolve(Response.json({ mappings: [] }));
      case `POST ${base}/entries/import/preview`:
        return Promise.resolve(
          Response.json({
            rows: [
              { line: 1, name: "伊藤 みく", outcome: "insert", sameName: false },
              { line: 2, name: "", outcome: "empty", sameName: false },
              { line: 3, name: "佐藤 けん", outcome: "insert", sameName: true },
            ],
            counts: { insert: 2, existing: 0, empty: 1 },
          }),
        );
      case `POST ${base}/entries/import`:
        return Promise.resolve(Response.json({ counts: { insert: 2, existing: 0, empty: 1 } }));
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

describe("使い方の節", () => {
  it("名簿に行がある交流会を受付だけに戻すときは、確かめの枠を出してから保存する", async () => {
    const sent = stubApi();
    const user = userEvent.setup();
    renderWithRouter(<ModeSection event={eventView("organizer")} />);
    const roster = await screen.findByRole("radio", { name: /名簿を使う/ });
    await waitFor(() => expect(roster).toBeChecked());
    await user.click(screen.getByRole("radio", { name: /受付だけ/ }));
    await user.click(screen.getByRole("button", { name: "使い方を変える" }));
    const dialog = await screen.findByRole("alertdialog", { name: "受付だけに戻しますか" });
    expect(dialog).toHaveTextContent("名簿の4人分は消さずに隠します");
    expect(sent.some((item) => item.method === "PUT")).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "受付だけに戻す" }));
    await screen.findByText("受付だけにしました。");
    expect(sent.find((item) => item.method === "PUT")?.body).toEqual({ mode: "reception" });
  });
});

describe("名簿", () => {
  it("人数・同じ名前・手で足した人を出し、来なかったで絞れる。主催者には取り込み・書き出し・取り消しが出る", async () => {
    stubApi();
    const user = userEvent.setup();
    renderWithRouter(<RosterPage eventId={EVENT_ID} />);
    const table = await screen.findByRole("table", { name: "名簿" });
    expect(within(table).getAllByText("同じ名前があります")).toHaveLength(2);
    expect(within(table).getByText("手で足した：高橋")).toBeInTheDocument();
    const counts = screen.getByRole("group", { name: "人数" });
    expect(counts).toHaveTextContent("来なかった1");
    expect(counts).toHaveTextContent("Peatix 2・その他 1");
    expect(screen.getByRole("link", { name: "貼る・CSV で入れる" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "書き出す" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "佐藤 けんを取り消す" }).length).toBeGreaterThan(
      0,
    );

    await user.click(screen.getByRole("radio", { name: "来なかった" }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText("中村 さき")).toBeInTheDocument();
  });

  it("受付係には、1人足すと名簿に当てるだけを出す", async () => {
    stubApi({ role: "staff" });
    renderWithRouter(<RosterPage eventId={EVENT_ID} />);
    await screen.findByRole("table", { name: "名簿" });
    expect(screen.getByRole("button", { name: "1人足す" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "貼る・CSV で入れる" })).toBeNull();
    expect(screen.queryByRole("button", { name: "書き出す" })).toBeNull();
    expect(screen.queryByRole("button", { name: /取り消す/ })).toBeNull();
  });

  it("名簿を使っていない交流会では、準備の画面への案内を出す", async () => {
    stubApi({ mode: "reception" });
    renderWithRouter(<RosterPage eventId={EVENT_ID} />);
    expect(await screen.findByText(/この交流会は名簿を使っていません/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "準備の画面を開く" })).toBeInTheDocument();
  });
});

describe("名簿に入れる", () => {
  it("貼った名前と媒体で確かめ、入る人数のボタンで取り込む", async () => {
    const sent = stubApi();
    const user = userEvent.setup();
    renderWithRouter(<ImportPage eventId={EVENT_ID} />);
    await user.type(
      await screen.findByRole("textbox", { name: /名前（1行に1人）/ }),
      "伊藤 みく{enter}{enter}佐藤 けん",
    );
    await user.click(screen.getByRole("button", { name: "取り込む前に確かめる" }));
    expect(await screen.findByText("媒体を選んでください。")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Peatix" }));
    await user.click(screen.getByRole("button", { name: "取り込む前に確かめる" }));
    const preview = await screen.findByRole("table", { name: "取り込む前の確かめ" });
    expect(within(preview).getByText("名前が空")).toBeInTheDocument();
    expect(within(preview).getByText("同じ名前があります")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2人を取り込む" }));
    await waitFor(() =>
      expect(sent.find((item) => item.path.endsWith("/entries/import"))?.body).toEqual({
        applicationSource: "peatix",
        rows: [
          { line: 1, name: "伊藤 みく" },
          { line: 2, name: "" },
          { line: 3, name: "佐藤 けん" },
        ],
      }),
    );
  });
});

describe("名簿に当てる", () => {
  it("候補のカードで当てると、さっきのチェックインに移る。名簿にいないカードには選ぶ・飛び入りが出る", async () => {
    const sent = stubApi({ role: "staff" });
    const user = userEvent.setup();
    renderWithRouter(<MatchPage eventId={EVENT_ID} />);
    const card = await screen.findByRole("article", { name: "さとう けんのチェックイン" });
    expect(card).toHaveTextContent("名簿の候補：佐藤 けん");
    const other = screen.getByRole("article", { name: "Haruのチェックイン" });
    expect(within(other).getByRole("button", { name: "名簿から選ぶ" })).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: "飛び入りにする" })).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "当てる" }));
    expect(
      await screen.findByText("さとう けんさんを名簿の佐藤 けんさんに当てました。"),
    ).toBeInTheDocument();
    expect(sent.find((item) => item.path.endsWith("/match"))?.body).toEqual({
      entryId: ROSTER.entries[0]?.id,
    });
    const done = screen.getByRole("list", { name: "さっきのチェックイン" });
    expect(done).toHaveTextContent("名簿に当たった（手）");
  });
});
