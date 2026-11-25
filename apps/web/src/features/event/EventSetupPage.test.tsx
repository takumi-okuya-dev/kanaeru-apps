// 準備の画面：招待のリンクを作り直す確かめの枠は、前の失敗の誤りを残さずに開く。
// 受付係を外すと、招待のリンクも作り直すことを確かめの枠と知らせで伝え、リンクを読み直す（research R3）。
// 持ち主と組織（event-002）：持ち主は組織を選んで保存でき、持ち主でない主催者には今の組織とその旨だけが出る。
// API は fetch の差しかえで答える。
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { EventSetupPage } from "./EventSetupPage.tsx";

/** 試しの交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000001";

/** 試しの受付係の account の ID。 */
const STAFF_ID = "0193a1b2-0000-7000-8000-000000000002";

/** 仮の API の答え方（道ごとに変えられるもの）。 */
type StubOptions = {
  /** 招待のリンクを作る・作り直すが失敗する回数 */
  failCreateInvite?: number;
  /** 今の利用者が持ち主か（既定は持ち主） */
  isOwner?: boolean;
};

/** 試しの組織の ID。 */
const ORGANIZATION_ID = "0193a1b2-0000-7000-8000-000000000003";

/** 送られた要求。 */
type Sent = { method: string; path: string; body?: unknown };

/**
 * 仮の API（今の利用者・交流会・招待のリンク・受付係）。
 * @param options 答え方
 * @returns 送られた要求の一覧
 */
function stubApi(options: StubOptions = {}): Sent[] {
  const sent: Sent[] = [];
  let failures = options.failCreateInvite ?? 0;
  let token = "a".repeat(43);
  let staff = [{ accountId: STAFF_ID, displayName: "受付の山田", addedAt: "2026-11-19T10:00:00Z" }];
  const isOwner = options.isOwner ?? true;
  let organization: { id: string; name: string } | null = isOwner
    ? null
    : { id: ORGANIZATION_ID, name: "バドミントンの部" };
  const organizationState = () =>
    Response.json({
      owner: { accountId: "0193a1b2-0000-7000-8000-000000000009", displayName: "高橋" },
      organization,
      isOwner,
      options: isOwner ? [{ id: ORGANIZATION_ID, name: "バドミントンの部" }] : [],
    });
  const eventPath = `/api/v1/events/${EVENT_ID}`;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    sent.push({ method, path: url.pathname, body });
    const invite = () =>
      Response.json({
        invite: { token, createdAt: "2026-11-19T10:00:00Z", expiresAt: "2026-11-25T15:00:00Z" },
      });
    switch (`${method} ${url.pathname}`) {
      case "GET /api/v1/accounts/me":
        return Promise.resolve(
          Response.json({
            id: "0193a1b2-0000-7000-8000-000000000000",
            displayName: "主催者",
            isOrganizer: true,
            registeredAt: "2026-11-19T10:00:00.000Z",
          }),
        );
      case `GET ${eventPath}`:
        return Promise.resolve(
          Response.json({
            id: EVENT_ID,
            name: "11月の交流会",
            startsAt: "2026-11-25T10:00:00.000Z",
            venue: "渋谷の会場",
            fee: 1000,
            googleFormUrl: null,
            lineGroupUrl: null,
            surveyOpen: false,
            createdAt: "2026-11-19T10:00:00.000Z",
            updatedAt: "2026-11-19T10:00:00.000Z",
            myRole: "organizer",
            owner: null,
            organization,
            isOwner,
          }),
        );
      case `GET ${eventPath}/organization`:
        return Promise.resolve(organizationState());
      case `PUT ${eventPath}/organization`: {
        const { organizationId } = body as { organizationId: string | null };
        organization = organizationId ? { id: organizationId, name: "バドミントンの部" } : null;
        return Promise.resolve(organizationState());
      }
      case `GET ${eventPath}/staff-invite`:
        return Promise.resolve(invite());
      case `POST ${eventPath}/staff-invite`:
        if (failures > 0) {
          failures -= 1;
          return Promise.resolve(
            Response.json(
              { error: { code: "INTERNAL", message: "試しの失敗です。" } },
              { status: 500 },
            ),
          );
        }
        token = "b".repeat(43);
        return Promise.resolve(
          Response.json({
            token,
            createdAt: "2026-11-19T11:00:00Z",
            expiresAt: "2026-11-25T15:00:00Z",
          }),
        );
      case `GET ${eventPath}/staff`:
        return Promise.resolve(Response.json({ staff }));
      case `DELETE ${eventPath}/staff/${STAFF_ID}`:
        // API は外すのと同じ取引で、招待の印も替える
        staff = [];
        token = "c".repeat(43);
        return Promise.resolve(new Response(null, { status: 204 }));
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

describe("準備の画面", () => {
  it("作り直しに失敗したあと、もう一度「作り直す」を押すと、前の誤りを出さずに確かめの枠を開く", async () => {
    stubApi({ failCreateInvite: 1 });
    renderWithRouter(<EventSetupPage eventId={EVENT_ID} />);
    await screen.findByText(/a{43}/);

    await userEvent.click(screen.getByRole("button", { name: "作り直す" }));
    let dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "作り直す" }));
    expect(await within(dialog).findByText("試しの失敗です。")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "作り直す" }));
    dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).queryByText("試しの失敗です。")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "作り直す" }));
    expect(await screen.findByText(/b{43}/)).toBeInTheDocument();
  });

  it("受付係を外す前と外したあとに、招待のリンクも作り直すことを伝え、新しいリンクを出す", async () => {
    const sent = stubApi();
    renderWithRouter(<EventSetupPage eventId={EVENT_ID} />);
    await screen.findByText(/a{43}/);

    await userEvent.click(await screen.findByRole("button", { name: "受付の山田を外す" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("招待のリンクも作り直します");
    await userEvent.click(within(dialog).getByRole("button", { name: "外す" }));

    expect(
      await screen.findByText(
        "受付の山田さんを外しました。招待のリンクも作り直したので、前のリンクは使えません。ほかの人を招くときは、新しいリンクを送ってください。",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(/c{43}/)).toBeInTheDocument();
    expect(screen.queryByText(/a{43}/)).not.toBeInTheDocument();
    expect(sent.filter((item) => item.method === "DELETE")).toHaveLength(1);
  });

  it("持ち主は組織を選んで保存でき、「入れない（個人）」で外せる", async () => {
    const sent = stubApi();
    renderWithRouter(<EventSetupPage eventId={EVENT_ID} />);
    expect(
      await screen.findByRole("heading", { level: 2, name: "持ち主と組織" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("高橋（あなた）")).toBeInTheDocument();
    const chips = screen.getByRole("radiogroup", { name: "入れる組織" });
    expect(within(chips).getByRole("radio", { name: "入れない（個人）" })).toBeChecked();

    await userEvent.click(within(chips).getByRole("radio", { name: "バドミントンの部" }));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText("組織「バドミントンの部」に入れました。")).toBeInTheDocument();
    expect(sent.filter((item) => item.method === "PUT").map((item) => item.body)).toEqual([
      { organizationId: ORGANIZATION_ID },
    ]);

    await userEvent.click(
      within(screen.getByRole("radiogroup", { name: "入れる組織" })).getByRole("radio", {
        name: "入れない（個人）",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(
      await screen.findByText("組織から外しました。この交流会は、あなたの個人のものです。"),
    ).toBeInTheDocument();
  });

  it("持ち主でない主催者には、今の組織と「持ち主だけ」の旨だけを出す", async () => {
    stubApi({ isOwner: false });
    renderWithRouter(<EventSetupPage eventId={EVENT_ID} />);
    expect(await screen.findByText("組織に入れる・外すのは、持ち主だけです。")).toBeInTheDocument();
    expect(screen.getByText("バドミントンの部")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "入れる組織" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
  });
});
