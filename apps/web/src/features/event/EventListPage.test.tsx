// 交流会の一覧（event-002）：行ごとに持ち主と組織（なければ「個人」）を出し、組織の交流会があればチップで組織ごと・個人に絞れる。
// 「交流会を追加」は運営者でなくても出る。API は fetch の差しかえで答える。
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { EventListPage } from "./EventListPage.tsx";

/** 試しの組織。 */
const ORGANIZATION = { id: "0193a1b2-0000-7000-8000-000000000010", name: "バドミントンの部" };

/**
 * 一覧の行を作る。
 * @param id 交流会の ID の末尾
 * @param name 名前
 * @param extra 違う欄
 * @returns 交流会
 */
function eventOf(id: string, name: string, extra: Record<string, unknown>) {
  return {
    id: `0193a1b2-0000-7000-8000-00000000000${id}`,
    name,
    startsAt: "2026-11-25T10:00:00.000Z",
    venue: "渋谷の会場",
    fee: 1000,
    googleFormUrl: null,
    lineGroupUrl: null,
    surveyOpen: false,
    discounts: [],
    createdAt: "2026-11-19T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
    myRole: "organizer",
    owner: { accountId: "0193a1b2-0000-7000-8000-000000000020", displayName: "あなたの名前" },
    organization: null,
    isOwner: true,
    ...extra,
  };
}

/**
 * 仮の API（今の利用者〈運営者でない〉と、交流会の一覧）。
 * @param events 一覧の行
 */
function stubApi(events: unknown[]): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/api/v1/accounts/me") {
      return Promise.resolve(
        Response.json({
          id: "0193a1b2-0000-7000-8000-000000000020",
          displayName: "あなたの名前",
          isOrganizer: false,
          registeredAt: "2026-11-19T10:00:00.000Z",
        }),
      );
    }
    return Promise.resolve(Response.json({ events }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("交流会の一覧", () => {
  it("行ごとに持ち主と組織を出し、チップで組織ごと・個人に絞れる", async () => {
    stubApi([
      eventOf("1", "自分の会", {}),
      eventOf("2", "部の会", {
        isOwner: false,
        owner: { accountId: "0193a1b2-0000-7000-8000-000000000021", displayName: "高橋" },
        organization: ORGANIZATION,
      }),
    ]);
    renderWithRouter(<EventListPage />);
    expect(await screen.findByRole("link", { name: "交流会を追加" })).toBeInTheDocument();
    const own = await screen.findByRole("listitem", { name: "自分の会" });
    expect(own).toHaveTextContent("持ち主あなた");
    expect(own).toHaveTextContent("組織個人");
    const placed = screen.getByRole("listitem", { name: "部の会" });
    expect(placed).toHaveTextContent("持ち主高橋");
    expect(placed).toHaveTextContent("組織バドミントンの部");

    const chips = screen.getByRole("radiogroup", { name: "組織で絞る" });
    await userEvent.click(within(chips).getByRole("radio", { name: "バドミントンの部" }));
    expect(screen.queryByRole("listitem", { name: "自分の会" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "部の会" })).toBeInTheDocument();

    await userEvent.click(within(chips).getByRole("radio", { name: "個人" }));
    expect(screen.getByRole("listitem", { name: "自分の会" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "部の会" })).not.toBeInTheDocument();
  });

  it("組織の交流会がなければチップを出さない。運営者でなくても「交流会を追加」が出る", async () => {
    stubApi([]);
    renderWithRouter(<EventListPage />);
    expect(
      await screen.findByText("交流会はまだありません。「交流会を追加」から作ってください。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "交流会を追加" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "組織で絞る" })).not.toBeInTheDocument();
  });
});
