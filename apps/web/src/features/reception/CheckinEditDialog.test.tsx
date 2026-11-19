// 直す・取り消すの枠：ほかの端末で先に取り消されていた（404 CHECKIN_NOT_FOUND）ときは、取り消せたものとして枠を閉じる。
// ほかのエラーは枠の中に出したまま。
import type { EventView } from "@workspace/contracts/event";
import type { CheckinView } from "@workspace/contracts/reception";
import { RECEPTION_ERRORS } from "@workspace/contracts/reception";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckinEditDialog } from "./CheckinEditDialog.tsx";

/** 交流会の見本（受付係として開いた）。 */
const EVENT: EventView = {
  id: "0193a1b2-0000-7000-8000-000000000001",
  name: "11月の交流会",
  startsAt: "2026-11-25T10:00:00.000Z",
  venue: "渋谷の会場",
  fee: 1000,
  googleFormUrl: null,
  lineGroupUrl: null,
  surveyOpen: false,
  createdAt: "2026-11-19T10:00:00.000Z",
  updatedAt: "2026-11-19T10:00:00.000Z",
  myRole: "staff",
  discounts: [],
};

/** 手でのチェックインの見本。 */
const CHECKIN: CheckinView = {
  id: "0193a1b2-0000-7000-8000-000000000002",
  name: "佐藤 太郎",
  applicationSource: "connpass",
  referral: "friend",
  paymentMethod: "cash",
  amount: 1000,
  checkedInAt: "2026-11-25T10:03:00.000Z",
  method: "manual",
  accountId: null,
  enteredByName: "受付係の山田",
  sameName: false,
};

/**
 * 取り消しの答えを決めて枠を描き、取り消すまで押す。
 * @param response 取り消しの答え
 * @returns 済んだとき・閉じるときの受け手
 */
async function removeWith(response: Response) {
  vi.stubGlobal("fetch", () => Promise.resolve(response));
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CheckinEditDialog event={EVENT} checkin={CHECKIN} onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "取り消す" }));
  await screen.findByRole("heading", { name: "このチェックインを取り消しますか" });
  await userEvent.click(screen.getByRole("button", { name: "取り消す" }));
  return { onDone, onClose };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("直す・取り消すの枠", () => {
  it("ほかの端末で先に取り消されていたら（404 CHECKIN_NOT_FOUND）、取り消せたものとして済ませる", async () => {
    const { CHECKIN_NOT_FOUND } = RECEPTION_ERRORS;
    const { onDone } = await removeWith(
      Response.json(
        {
          error: {
            code: CHECKIN_NOT_FOUND.code,
            message: CHECKIN_NOT_FOUND.message,
            requestId: "r",
          },
        },
        { status: 404 },
      ),
    );
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith("佐藤 太郎さんのチェックインを取り消しました。"),
    );
    expect(screen.queryByText(/取り消せませんでした/)).toBeNull();
  });

  it("ほかのエラー（交流会がないなど）は、枠の中に出して済ませない", async () => {
    const { onDone } = await removeWith(
      Response.json(
        { error: { code: "NOT_FOUND", message: "見つかりません。", requestId: "r" } },
        { status: 404 },
      ),
    );
    expect(await screen.findByText("取り消せませんでした。見つかりません。")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});
