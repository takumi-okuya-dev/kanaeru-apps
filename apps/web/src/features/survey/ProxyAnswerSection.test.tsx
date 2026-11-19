// A3 の直す枠の節「アンケートの回答」：P2 と同じ欄（選択肢の設問は「答えない」から）・保存・保存できなかったあとに
// 手元の誤りで止まったら古い文を消す。API は fetch の差しかえで答える。
import type { EventView } from "@workspace/contracts/event";
import type { CheckinView } from "@workspace/contracts/reception";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ProxyAnswerSection } from "./ProxyAnswerSection.tsx";

/** 交流会。 */
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
  myRole: "organizer",
  discounts: [],
};

/** 手でのチェックイン。 */
const CHECKIN: CheckinView = {
  id: "0193a1b2-0000-7000-8000-000000000006",
  name: "手の人",
  applicationSource: "direct",
  referral: "friend",
  paymentMethod: "cash",
  amount: 1000,
  checkedInAt: "2026-11-25T10:05:00.000Z",
  method: "manual",
  accountId: null,
  enteredByName: "主催者",
  sameName: false,
};

/** 送られた要求。 */
type Sent = { method: string; body: unknown };

/**
 * 仮の API（回答を読む・保存する）。
 * @param putStatus 保存したときの状態の番号（200 のほかは誤り）
 * @returns 送られた要求の一覧
 */
function stubApi(putStatus = 200): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    sent.push({ method, body });
    if (method === "GET") return Promise.resolve(Response.json({ answer: null }));
    if (putStatus !== 200) {
      return Promise.resolve(
        Response.json(
          { error: { code: "INTERNAL", message: "うまくいきませんでした。", requestId: "r" } },
          { status: putStatus },
        ),
      );
    }
    return Promise.resolve(
      Response.json({ ...(body as object), answeredAt: "2026-11-25T12:05:00.000Z" }),
    );
  });
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("アンケートの回答の節（主催者の代わりの入力）", () => {
  it("選択肢の設問はどれも「答えない」から始まり、選んだ月いくらも答えないに戻して保存できる", async () => {
    const sent = stubApi();
    renderWithRouter(<ProxyAnswerSection event={EVENT} checkin={CHECKIN} />);
    await userEvent.click(await screen.findByRole("button", { name: "アンケートの回答を入れる" }));
    for (const name of ["実現したら月いくらなら使うか", "テスターになる", "仕事の立場", "職種"]) {
      const group = screen.getByRole("radiogroup", { name });
      expect(group.querySelector('[aria-checked="true"]')).toHaveTextContent("答えない");
    }
    const price = screen.getByRole("radiogroup", { name: "実現したら月いくらなら使うか" });
    await userEvent.click(within(price).getByRole("radio", { name: "0円" }));
    await userEvent.click(within(price).getByRole("radio", { name: "答えない" }));
    await userEvent.click(screen.getByRole("radio", { name: "いいえ" }));
    await userEvent.click(screen.getByRole("button", { name: "回答を保存" }));
    expect(await screen.findByText("アンケートの回答を保存しました。")).toBeInTheDocument();
    expect(sent.find((request) => request.method === "PUT")?.body).toEqual({
      concern: null,
      monthlyPrice: null,
      tester: "no",
      jobRole: null,
      jobType: null,
    });
  });

  it("保存できなかったあと、手元の誤りで止まった保存では、古い「保存できませんでした」を消す", async () => {
    stubApi(500);
    renderWithRouter(<ProxyAnswerSection event={EVENT} checkin={CHECKIN} />);
    await userEvent.click(await screen.findByRole("button", { name: "アンケートの回答を入れる" }));
    await userEvent.click(screen.getByRole("button", { name: "回答を保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存できませんでした");

    await userEvent.click(screen.getByRole("textbox", { name: "困りごと" }));
    await userEvent.paste("あ".repeat(2001));
    await userEvent.click(screen.getByRole("button", { name: "回答を保存" }));
    expect(await screen.findByText("困りごとは2,000文字までにしてください。")).toBeInTheDocument();
    expect(screen.queryByText(/保存できませんでした/)).toBeNull();
  });
});
