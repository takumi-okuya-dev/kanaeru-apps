// 組織の画面（suite-001）：管理者には人の操作・招待・引き継ぎ・消すを出し、メンバーには出さない。
// 管理者が抜けるときは、引き継ぐ人を選ぶまで「引き継いで抜ける」を押せない。ほかに誰もいなければ、組織を消すよう案内する。
// API は fetch の差しかえで答える。
import type { OrganizationDetail } from "@workspace/contracts/suite";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { OrganizationPage } from "./OrganizationPage.tsx";

/** 試しの組織の ID。 */
const ORG_ID = "0193a1b2-0000-7000-8000-0000000000a1";

/** 試しの人の ID。 */
const ME = "0193a1b2-0000-7000-8000-000000000001";
const OTHER = "0193a1b2-0000-7000-8000-000000000002";

/** 送られた要求。 */
type Sent = { method: string; path: string; body: unknown };

/**
 * 試しの組織。
 * @param myRole 自分の役割
 * @param alone 自分だけか
 * @returns 組織
 */
function organizationOf(myRole: "admin" | "member", alone = false): OrganizationDetail {
  const me = {
    accountId: ME,
    displayName: "田中",
    role: myRole,
    joinedAt: "2026-11-20T01:00:00.000Z",
    isMe: true,
    isNew: false,
  };
  const other = {
    accountId: OTHER,
    displayName: "鈴木",
    role: myRole === "admin" ? ("member" as const) : ("admin" as const),
    joinedAt: "2026-11-20T02:00:00.000Z",
    isMe: false,
    isNew: myRole === "admin",
  };
  return {
    id: ORG_ID,
    name: "飲食チーム",
    myRole,
    members: alone ? [me] : myRole === "admin" ? [me, other] : [other, me],
    memberLimit: 50,
    editorLimit: 10,
    createdAt: "2026-11-20T00:00:00.000Z",
  };
}

/**
 * 仮の API（今の利用者・見えるアプリ・組織・招待）。
 * @param organization 組織
 * @returns 送られた要求の一覧
 */
function stubApi(organization: OrganizationDetail): Sent[] {
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
    const base = `/api/v1/suite/organizations/${ORG_ID}`;
    switch (`${method} ${url.pathname}`) {
      case "GET /api/v1/accounts/me":
        return Response.json({
          id: ME,
          displayName: "田中",
          isOrganizer: false,
          registeredAt: "2026-11-19T10:00:00.000Z",
        });
      case "GET /api/v1/suite/apps":
        return Response.json({ apps: [], isOperator: false });
      case `GET ${base}`:
        return Response.json(organization);
      case `GET ${base}/invite`:
        return Response.json({ token: "t".repeat(43), createdAt: "2026-11-20T00:00:00.000Z" });
      case `PUT ${base}/members/${OTHER}`:
      case `POST ${base}/leave`:
        return new Response(null, { status: 204 });
      default:
        return Response.json({ error: { code: "NOT_FOUND", message: "ない道" } }, { status: 404 });
    }
  });
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("組織の画面", () => {
  it("管理者には、あなた・新しい人の印と、役割の切り替え・招待のリンクと QR を出す", async () => {
    const sent = stubApi(organizationOf("admin"));
    renderWithRouter(<OrganizationPage organizationId={ORG_ID} />);

    const other = await screen.findByRole("listitem", { name: "鈴木" });
    expect(within(other).getByText("新しい人")).toBeInTheDocument();
    expect(
      within(screen.getByRole("listitem", { name: "田中" })).getByText("あなた"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("organization-invite-link")).toHaveTextContent(
      `/join/${"t".repeat(43)}`,
    );
    expect(screen.getByRole("img", { name: /招待のQR/ })).toHaveAttribute(
      "data-qr-value",
      expect.stringContaining(`/join/${"t".repeat(43)}`),
    );

    await userEvent.click(within(other).getByRole("button", { name: "編集者にする" }));
    expect(await within(other).findByText("鈴木さんを編集者にしました。")).toBeInTheDocument();
    expect(sent.find((item) => item.method === "PUT")?.body).toEqual({ role: "editor" });
  });

  it("管理者が抜けるときは、引き継ぐ人を選ぶまで押せず、選ぶと引き継ぐ人を送る", async () => {
    const sent = stubApi(organizationOf("admin"));
    renderWithRouter(<OrganizationPage organizationId={ORG_ID} />);

    const leave = await screen.findByRole("button", { name: "引き継いで抜ける" });
    expect(leave).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(leave);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("引き継ぐ人"), OTHER);
    expect(leave).not.toHaveAttribute("aria-disabled");
    await userEvent.click(leave);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("鈴木さんに管理者を引き継いでから");
    await userEvent.click(within(dialog).getByRole("button", { name: "引き継いで抜ける" }));
    await vi.waitFor(() =>
      expect(sent.find((item) => item.method === "POST")?.body).toEqual({
        successorAccountId: OTHER,
      }),
    );
  });

  it("ほかに誰もいない管理者には、抜ける代わりに組織を消すよう案内する", async () => {
    stubApi(organizationOf("admin", true));
    renderWithRouter(<OrganizationPage organizationId={ORG_ID} />);
    expect(
      await screen.findByText(/ほかに誰もいないので、管理者を引き継げません/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "引き継いで抜ける" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "組織を消す" })).toBeInTheDocument();
  });

  it("メンバーには、人の操作・招待・引き継ぎ・名前・消すを出さず、抜けるだけを出す", async () => {
    stubApi(organizationOf("member"));
    renderWithRouter(<OrganizationPage organizationId={ORG_ID} />);
    expect(await screen.findByRole("listitem", { name: "鈴木" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /編集者にする|外す/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "招待のリンク" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "組織を消す" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "組織を抜ける" })).toBeInTheDocument();
  });
});
