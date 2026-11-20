// 組織の招待（suite-001）：組織の名前・管理者・人数と、入る前に知っておくことを出し、「入る」で入る。
// 使えないリンクは理由と「管理者に新しいリンクを頼んでください」、すでに入っている人には組織の画面への入口。
// API は fetch の差しかえで答える。
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { JoinPage } from "./JoinPage.tsx";

/** 試しの札。 */
const TOKEN = "j".repeat(43);

/** 試しの組織の ID。 */
const ORG_ID = "0193a1b2-0000-7000-8000-0000000000a1";

/**
 * 仮の API（今の利用者・見えるアプリ・招待）。
 * @param preview 招待の中身（null なら使えないリンク）
 * @returns 送られた要求（動きと道）
 */
function stubApi(preview: Record<string, unknown> | null): string[] {
  const sent: string[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    sent.push(`${method} ${url.pathname}`);
    const invitePath = `/api/v1/suite/organization-invites/${TOKEN}`;
    switch (`${method} ${url.pathname}`) {
      case "GET /api/v1/accounts/me":
        return Promise.resolve(
          Response.json({
            id: "0193a1b2-0000-7000-8000-000000000003",
            displayName: "山口",
            isOrganizer: false,
            registeredAt: "2026-11-19T10:00:00.000Z",
          }),
        );
      case "GET /api/v1/suite/apps":
        return Promise.resolve(Response.json({ apps: [], isOperator: false }));
      case `GET ${invitePath}`:
        return Promise.resolve(
          preview
            ? Response.json(preview)
            : Response.json(
                {
                  error: {
                    code: "ORGANIZATION_INVITE_INVALID",
                    message:
                      "この招待のリンクは使えません。作り直されたか、組織が消えた可能性があります。",
                  },
                },
                { status: 404 },
              ),
        );
      case `POST ${invitePath}`:
        return Promise.resolve(Response.json({ organizationId: ORG_ID, alreadyMember: false }));
      default:
        return Promise.resolve(
          Response.json({ error: { code: "NOT_FOUND", message: "ない道" } }, { status: 404 }),
        );
    }
  });
  return sent;
}

/** 試しの招待の中身。 */
const PREVIEW = {
  organizationId: ORG_ID,
  name: "飲食チーム",
  adminName: "田中",
  memberCount: 3,
  alreadyMember: false,
  full: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("組織の招待", () => {
  it("組織の名前・管理者・人数と、入る前に知っておくことを出し、「入る」で入る", async () => {
    const sent = stubApi(PREVIEW);
    renderWithRouter(<JoinPage token={TOKEN} />);
    expect(await screen.findByText("メンバーとして入ります。")).toBeInTheDocument();
    expect(screen.getByText("田中")).toBeInTheDocument();
    expect(screen.getByText("3人")).toBeInTheDocument();
    expect(screen.getByText("組織の人どうしで、表示名と役割が見えます。")).toBeInTheDocument();
    expect(screen.getByText(/組織の管理者に引き継がれます/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "入る" }));
    await vi.waitFor(() =>
      expect(sent).toContain(`POST /api/v1/suite/organization-invites/${TOKEN}`),
    );
  });

  it("使えないリンクには、理由と「管理者に新しいリンクを頼んでください」を出す", async () => {
    stubApi(null);
    renderWithRouter(<JoinPage token={TOKEN} />);
    expect(
      await screen.findByRole("heading", { name: "この招待のリンクは使えません" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/管理者に新しいリンクを頼んでください。/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "入る" })).not.toBeInTheDocument();
  });

  it("すでに入っている人には、組織の画面への入口を出す", async () => {
    stubApi({ ...PREVIEW, alreadyMember: true });
    renderWithRouter(<JoinPage token={TOKEN} />);
    expect(await screen.findByRole("heading", { name: "すでに入っています" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "組織の画面へ" })).toHaveAttribute(
      "href",
      `/settings/organizations/${ORG_ID}`,
    );
  });

  it("人数の上限の組織には入れない", async () => {
    stubApi({ ...PREVIEW, full: true });
    renderWithRouter(<JoinPage token={TOKEN} />);
    expect(await screen.findByText(/人数の上限に達しています/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "入る" })).not.toBeInTheDocument();
  });
});
