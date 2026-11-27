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
  owner: null,
  organization: null,
  isOwner: false,
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
  discountId: null,
  discountName: null,
  discountAmount: null,
  referrerName: null,
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
  it("取り消しの確かめに切り替えると「やめる」へ、戻ると「取り消す」へフォーカスが移る", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CheckinEditDialog event={EVENT} checkin={CHECKIN} onClose={vi.fn()} onDone={vi.fn()} />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "取り消す" }));
    await screen.findByRole("heading", { name: "このチェックインを取り消しますか" });
    await waitFor(() => expect(screen.getByRole("button", { name: "やめる" })).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "やめる" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "取り消す" })).toHaveFocus());
  });

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

describe("直す枠の割引と紹介者（reception-002）", () => {
  const referralId = "0193a1b2-0000-7000-8000-00000000000a";
  const withDiscount = {
    ...CHECKIN,
    amount: 4000,
    discountId: referralId,
    discountName: "紹介割",
    discountAmount: 1000,
  };
  const discounts = [{ id: referralId, name: "紹介割", amount: 1000, asksReferrer: true }];

  /**
   * 保存の答えを決めて枠を描き、保存を押して送った本文を返す。
   * @param event 交流会
   * @param checkin チェックイン
   * @param before 保存の前にすること
   * @returns 送った本文
   */
  async function saveWith(
    event: EventView,
    checkin: CheckinView,
    before: () => Promise<void> = () => Promise.resolve(),
  ): Promise<unknown> {
    let body: unknown;
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
      body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      return Promise.resolve(Response.json({ ...checkin, ...(body as object) }));
    });
    const onDone = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CheckinEditDialog event={event} checkin={checkin} onClose={vi.fn()} onDone={onDone} />
      </QueryClientProvider>,
    );
    await screen.findByRole("radio", { name: "紹介割（−1,000円）" });
    await before();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    return body;
  }

  it("受付係は紹介者の欄が空で、空のまま保存すると紹介者を送らない（前の名前を残す）", async () => {
    const body = await saveWith({ ...EVENT, discounts }, withDiscount, () => {
      const referrer = screen.getByRole("textbox", { name: /紹介してくれた人の名前/ });
      expect(referrer).toHaveValue("");
      expect(referrer).toHaveAccessibleDescription(/空のままなら変えません/);
      return Promise.resolve();
    });
    expect(body).toMatchObject({ discountId: referralId });
    expect(body).not.toHaveProperty("referrerName");
  });

  it("主催者は今の紹介者の名前を読めて、空にすると null を送る（消す）", async () => {
    const body = await saveWith(
      { ...EVENT, myRole: "organizer", discounts },
      { ...withDiscount, referrerName: "田中 花子" },
      async () => {
        const referrer = screen.getByRole("textbox", { name: /紹介してくれた人の名前/ });
        expect(referrer).toHaveValue("田中 花子");
        await userEvent.clear(referrer);
      },
    );
    expect(body).toMatchObject({ discountId: referralId, referrerName: null });
  });

  it("使うのをやめた割引のチェックインは、写した名前と額のチップで選ばれた状態になる", async () => {
    await saveWith({ ...EVENT, discounts: [] }, withDiscount, () => {
      expect(screen.getByRole("radio", { name: "紹介割（−1,000円）" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "割引なし" })).not.toBeChecked();
      return Promise.resolve();
    });
  });
});
