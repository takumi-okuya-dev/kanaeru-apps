// 会った場の画面：新しい人を保存すると、会った場を選んだまま次の人を足す欄になる・前に足した人を名前で探して付けられる・
// 付いている人が並ぶ・自分だけが見られることと、知られたくないことを書かない注意が出る・保存に失敗して中身を変えたら
// 新しい送りの ID を使う。API は fetch の差しかえで答える。
import type { NoteSummary } from "@workspace/contracts/person";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { MeetingPage } from "./MeetingPage.tsx";
import { MEETING, MEETING_ID, NOTE, SUMMARY, stubPersonApi } from "./test-api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 前に足した人（まだこの会った場に付いていない）。 */
const SATO: NoteSummary = {
  ...SUMMARY,
  id: "0193a1b2-0000-7000-8000-000000000103",
  fullName: "佐藤 次郎",
  appearance: "背が高い",
};

/**
 * 会った場と人の一覧と検索に答える（足す・付けると、会った場の人が増える）。
 * @param options 最初の人を足す送りを通信の誤りにするか
 * @param options.failFirstPost 最初の人を足す送りを通信の誤りにするか
 * @returns 送られた要求
 */
function stubMeeting(options: { failFirstPost?: boolean } = {}) {
  const attached: NoteSummary[] = [];
  let posts = 0;
  return stubPersonApi((request) => {
    if (request.method === "POST" && request.path === "/api/v1/person/notes/search") {
      return Response.json({
        items: [SATO, ...attached].map((note) => ({ note, matches: [] })),
        truncated: false,
      });
    }
    if (request.method === "GET" && request.path === `/api/v1/person/meetings/${MEETING_ID}`) {
      return Response.json({ ...MEETING, notes: attached, noteCount: attached.length });
    }
    if (request.method === "GET" && request.path === "/api/v1/person/notes") {
      return Response.json({ items: [SATO, ...attached], truncated: false });
    }
    if (request.method === "POST" && request.path === "/api/v1/person/notes") {
      posts += 1;
      if (options.failFirstPost && posts === 1) throw new TypeError("通信が切れた");
      const body = request.body as { fullName: string };
      const created = {
        ...SUMMARY,
        id: "0193a1b2-0000-7000-8000-000000000104",
        fullName: body.fullName,
      };
      attached.unshift(created);
      return Response.json({ ...NOTE, ...created, meetings: [] }, { status: 201 });
    }
    if (request.method === "PUT" && request.path.endsWith(`/meetings/${MEETING_ID}`)) {
      attached.unshift(SATO);
      return Response.json({ ...NOTE, ...SATO });
    }
    return undefined;
  });
}

describe("会った場の画面", () => {
  it("自分だけが見られることと、続けて足す欄に知られたくないことを書かない注意が出る", async () => {
    stubMeeting();
    renderWithRouter(<MeetingPage meetingId={MEETING_ID} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "11月の AI 勉強会" }),
    ).toBeVisible();
    expect(screen.getByText(/このメモを見られるのはあなただけです。/)).toBeVisible();
    const form = screen.getByRole("form", { name: "ここで会った人を足す" });
    expect(
      within(form).getByText("病気・信条など、相手が知られたくないことは書かないでください。"),
    ).toBeVisible();
  });

  it("新しい人を保存すると、会った場を選んだまま次の人を足す欄になり、付いている人に並ぶ", async () => {
    const sent = stubMeeting();
    renderWithRouter(<MeetingPage meetingId={MEETING_ID} />);
    const form = await screen.findByRole("form", { name: "ここで会った人を足す" });
    await userEvent.type(within(form).getByRole("textbox", { name: /フルネーム/ }), "鈴木 花子");
    await userEvent.click(within(form).getByRole("button", { name: "保存して次の人へ" }));
    await waitFor(() =>
      expect(within(form).getByRole("textbox", { name: /フルネーム/ })).toHaveValue(""),
    );
    expect(await within(form).findByText(/鈴木 花子さんを足しました/)).toBeVisible();
    const list = screen.getByRole("list", { name: "ここで会った人" });
    expect(await within(list).findByText("鈴木 花子")).toBeVisible();
    const post = sent.find((request) => request.method === "POST");
    expect(post?.body).toMatchObject({ fullName: "鈴木 花子", meetingId: MEETING_ID });
  });

  it("前に足した人を名前で探して付けられる（一覧の500人に限らない）", async () => {
    const sent = stubMeeting();
    renderWithRouter(<MeetingPage meetingId={MEETING_ID} />);
    const search = await screen.findByRole("search", { name: "前に足した人を探す" });
    await userEvent.type(within(search).getByRole("searchbox", { name: "名前で探す" }), "佐藤");
    await userEvent.click(within(search).getByRole("button", { name: "探す" }));
    expect(sent.find((request) => request.path.endsWith("/search"))?.body).toEqual({
      query: "佐藤",
    });
    await userEvent.click(await screen.findByRole("button", { name: "付ける：佐藤 次郎" }));
    const list = screen.getByRole("list", { name: "ここで会った人" });
    expect(await within(list).findByText("佐藤 次郎")).toBeVisible();
    expect(
      sent.some(
        (request) =>
          request.method === "PUT" &&
          request.path === `/api/v1/person/notes/${SATO.id}/meetings/${MEETING_ID}`,
      ),
    ).toBe(true);
  });

  it("保存に失敗したあと中身を変えて保存すると、新しい送りの ID を使う", async () => {
    const sent = stubMeeting({ failFirstPost: true });
    renderWithRouter(<MeetingPage meetingId={MEETING_ID} />);
    const form = await screen.findByRole("form", { name: "ここで会った人を足す" });
    const name = within(form).getByRole("textbox", { name: /フルネーム/ });
    await userEvent.type(name, "鈴木 花子");
    await userEvent.click(within(form).getByRole("button", { name: "保存して次の人へ" }));
    expect(await within(form).findByText(/保存できませんでした/)).toBeVisible();
    await userEvent.clear(name);
    await userEvent.type(name, "鈴木 花");
    await userEvent.click(within(form).getByRole("button", { name: "保存して次の人へ" }));
    // 保存できたら欄を作り直すので、読み直して確かめる
    await waitFor(() =>
      expect(within(form).getByRole("textbox", { name: /フルネーム/ })).toHaveValue(""),
    );
    const ids = sent
      .filter((request) => request.method === "POST" && request.path === "/api/v1/person/notes")
      .map((request) => (request.body as { clientRequestId: string }).clientRequestId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });
});
