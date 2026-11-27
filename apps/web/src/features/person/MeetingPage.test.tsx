// 会った場の画面：新しい人を保存すると、会った場を選んだまま次の人を足す欄になる・前に足した人を選んで付けられる・
// 付いている人が並ぶ・自分だけが見られることと、知られたくないことを書かない注意が出る。API は fetch の差しかえで答える。
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
 * 会った場と人の一覧に答える（足す・付けると、会った場の人が増える）。
 * @returns 送られた要求
 */
function stubMeeting() {
  const attached: NoteSummary[] = [];
  return stubPersonApi((request) => {
    if (request.method === "GET" && request.path === `/api/v1/person/meetings/${MEETING_ID}`) {
      return Response.json({ ...MEETING, notes: attached, noteCount: attached.length });
    }
    if (request.method === "GET" && request.path === "/api/v1/person/notes") {
      return Response.json({ items: [SATO, ...attached], truncated: false });
    }
    if (request.method === "POST" && request.path === "/api/v1/person/notes") {
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

  it("前に足した人を選んで付けられる", async () => {
    const sent = stubMeeting();
    renderWithRouter(<MeetingPage meetingId={MEETING_ID} />);
    await screen.findByRole("option", { name: "佐藤 次郎（背が高い）" });
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "前に足した人" }),
      SATO.id,
    );
    await userEvent.click(screen.getByRole("button", { name: "付ける" }));
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
});
