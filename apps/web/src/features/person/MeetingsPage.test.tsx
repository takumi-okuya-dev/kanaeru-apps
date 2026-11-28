// 会った場の一覧の画面の「PaletKit の交流会」の欄（specs/person/002-event-meetings/contracts/person.md の画面）：
// 選べる交流会が名前と日付で並ぶ・作った会に「作った」の札・「開く」で交流会から作って会った場の画面へ移る・送っている間は
// 二度押せない・受付アプリが見えないと欄を出さない・候補がないときの文・開けなかったときの文。API は fetch の差しかえで答える。
// 交流会の名前は、どれも架空のもの。
import type { EventCandidateList } from "@workspace/contracts/person";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { MeetingsPage } from "./MeetingsPage.tsx";
import { MEETING, MEETING_ID, errorResponse, stubPersonApi } from "./test-api.ts";
import type { Handler } from "./test-api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 見本の交流会（まだ会った場を作っていない）。 */
const NEW_EVENT_ID = "0193a1b2-0000-7000-8000-000000000301";

/** 見本の交流会（もう会った場を作った）。 */
const MADE_EVENT_ID = "0193a1b2-0000-7000-8000-000000000302";

/** 選べる交流会の見本。 */
const CANDIDATES: EventCandidateList = {
  available: true,
  items: [
    { eventId: NEW_EVENT_ID, name: "11月の交流会", metOn: "2026-11-27", meetingId: null },
    { eventId: MADE_EVENT_ID, name: "10月の交流会", metOn: "2026-10-30", meetingId: MEETING_ID },
  ],
};

/**
 * 会った場の一覧と、選べる交流会に答える。
 * @param candidates 選べる交流会の答え
 * @param fromEvent 交流会から作る送りに答える関数（なければ 201 で見本の会った場）
 * @returns 送られた要求
 */
function stubMeetings(candidates: EventCandidateList = CANDIDATES, fromEvent?: Handler) {
  return stubPersonApi((request) => {
    if (request.method === "GET" && request.path === "/api/v1/person/meetings") {
      return Response.json({ items: [] });
    }
    if (request.method === "GET" && request.path === "/api/v1/person/event-candidates") {
      return Response.json(candidates);
    }
    if (request.method === "POST" && request.path === "/api/v1/person/meetings/from-event") {
      return fromEvent
        ? fromEvent(request)
        : Response.json({ ...MEETING, name: "11月の交流会" }, { status: 201 });
    }
    return undefined;
  });
}

describe("会った場の一覧の画面の「PaletKit の交流会」", () => {
  it("選べる交流会が名前と日付で並び、作った会にだけ「作った」の札が付く。欄は「会った場を作る」の上", async () => {
    stubMeetings();
    renderWithRouter(<MeetingsPage />);
    const list = await screen.findByRole("list", { name: "選べる交流会" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("11月の交流会")).toBeVisible();
    expect(within(items[0]!).getByText("2026-11-27")).toBeVisible();
    expect(within(items[0]!).queryByText("作った")).toBeNull();
    expect(within(items[1]!).getByText("作った")).toBeVisible();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("PaletKit の交流会")).toBeLessThan(headings.indexOf("会った場を作る"));
  });

  it("「開く」を押すと交流会から会った場を作り、会った場の画面へ移る", async () => {
    const sent = stubMeetings();
    renderWithRouter(<MeetingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "開く：11月の交流会" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { level: 1, name: "会った場" })).toBeNull(),
    );
    expect(sent.filter((request) => request.path === "/api/v1/person/meetings/from-event")).toEqual(
      [
        {
          method: "POST",
          path: "/api/v1/person/meetings/from-event",
          body: { eventId: NEW_EVENT_ID },
        },
      ],
    );
  });

  it("送っている間は、どの「開く」も二度押せない", async () => {
    let release: (() => void) | undefined;
    const sent = stubMeetings(CANDIDATES, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return Response.json(MEETING, { status: 200 });
    });
    renderWithRouter(<MeetingsPage />);
    const first = await screen.findByRole("button", { name: "開く：10月の交流会" });
    await userEvent.click(first);
    const busy = await screen.findByRole("button", { name: "開いています：10月の交流会" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    const other = screen.getByRole("button", { name: "開く：11月の交流会" });
    expect(other).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(busy);
    await userEvent.click(other);
    expect(
      sent.filter((request) => request.path === "/api/v1/person/meetings/from-event"),
    ).toHaveLength(1);
    release?.();
    await waitFor(() =>
      expect(screen.queryByRole("heading", { level: 1, name: "会った場" })).toBeNull(),
    );
  });

  it("開けなかったら、その文を出して、また押せる", async () => {
    stubMeetings(CANDIDATES, () =>
      errorResponse(404, "PERSON_NOT_FOUND", "人・会った場が見つかりません。"),
    );
    renderWithRouter(<MeetingsPage />);
    const button = await screen.findByRole("button", { name: "開く：11月の交流会" });
    await userEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(/開けませんでした/);
    expect(screen.getByRole("button", { name: "開く：11月の交流会" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("受付アプリが見えない（available が false）なら、欄を出さない", async () => {
    const sent = stubMeetings({ available: false, items: [] });
    renderWithRouter(<MeetingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "会った場を作る" })).toBeVisible();
    await screen.findByText("まだ会った場はありません。");
    await waitFor(() =>
      expect(sent.some((request) => request.path === "/api/v1/person/event-candidates")).toBe(true),
    );
    // 答えを描き終えるまで待つ
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole("heading", { name: "PaletKit の交流会" })).toBeNull();
  });

  it("選べる交流会がなければ、その文を出す", async () => {
    stubMeetings({ available: true, items: [] });
    renderWithRouter(<MeetingsPage />);
    expect(await screen.findByText("選べる交流会はまだありません。")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "PaletKit の交流会" })).toBeVisible();
  });
});
