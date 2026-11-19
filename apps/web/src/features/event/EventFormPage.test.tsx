// 交流会の作成の画面：誤りは欄のそばに出し、日本時間の日付と時刻を時差つきの日時にして送る。主催者でなければ使えない。
// API は fetch の差しかえで答える。
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { EventNewPage, validateEventForm } from "./EventFormPage.tsx";

/** 送られた要求。 */
type Sent = { method: string; path: string; body: unknown };

/**
 * 仮の API（今の利用者と、交流会を作る窓口）。
 * @param organizer 主催者としてログインしているか
 * @returns 送られた要求の一覧
 */
function stubApi(organizer: boolean): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    sent.push({ method: init?.method ?? "GET", path: url.pathname, body });
    if (url.pathname === "/api/v1/accounts/me") {
      return Promise.resolve(
        Response.json({
          id: "0193a1b2-0000-7000-8000-000000000000",
          displayName: "主催者",
          isOrganizer: organizer,
          registeredAt: "2026-11-19T10:00:00.000Z",
        }),
      );
    }
    return Promise.resolve(
      Response.json(
        { id: "0193a1b2-0000-7000-8000-000000000001", ...(body as object), myRole: "organizer" },
        { status: 201 },
      ),
    );
  });
  return sent;
}

/**
 * 描いた input の要素から、React が持つ onChange を取り出す（テストだけ。描き直しを挟まずに続けて呼ぶため）。
 * @param element input の要素
 * @returns その描きの onChange
 * @throws {Error} React の props が見つからないとき
 */
function reactOnChange(element: HTMLElement): (value: string) => void {
  const key = Object.keys(element).find((name) => name.startsWith("__reactProps$"));
  const props = key
    ? (element as unknown as Record<string, { onChange?: (change: unknown) => void }>)[key]
    : undefined;
  const onChange = props?.onChange;
  if (!onChange) throw new Error("React の onChange が見つかりません。");
  // 部品（Base UI）は currentTarget と nativeEvent も読む
  return (value) =>
    onChange({ target: { value }, currentTarget: { value }, nativeEvent: new Event("change") });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 正しい欄の値。 */
const VALUES = {
  name: "11月の交流会",
  date: "2026-11-25",
  time: "19:00",
  venue: "渋谷の会場",
  fee: "1,000",
  googleFormUrl: "",
  lineGroupUrl: "",
};

describe("交流会の入力の確かめ", () => {
  it("日本時間の日付と時刻を時差つきの日時にし、空の URL は null にする", () => {
    expect(validateEventForm(VALUES)).toEqual({
      ok: true,
      input: {
        name: "11月の交流会",
        startsAt: "2026-11-25T19:00:00+09:00",
        venue: "渋谷の会場",
        fee: 1000,
        googleFormUrl: null,
        lineGroupUrl: null,
      },
    });
  });

  it("空の欄と誤りを、欄の名前ごとにまとめる（日時の誤りは日付の欄に出す）", () => {
    const result = validateEventForm({ ...VALUES, name: "", date: "", time: "", fee: "千円" });
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "交流会の名前を入れてください。",
        date: "日付を入れてください。",
        time: "時刻を入れてください。",
        fee: "参加費を数字で入れてください。",
      },
    });
  });
});

describe("交流会の作成の画面", () => {
  it("主催者は、欄を埋めて「作る」で送る。誤りは欄のそばに出る", async () => {
    const sent = stubApi(true);
    renderWithRouter(<EventNewPage />);
    await screen.findByRole("heading", { level: 1, name: "交流会を追加" });

    await userEvent.click(screen.getByRole("button", { name: "作る" }));
    const name = screen.getByRole("textbox", { name: /交流会の名前/ });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(/交流会の名前を入れてください。/);
    await waitFor(() => expect(name).toHaveFocus());
    expect(sent.filter((item) => item.method === "POST")).toEqual([]);

    await userEvent.type(name, VALUES.name);
    await userEvent.type(screen.getByLabelText(/日付/), VALUES.date);
    await userEvent.type(screen.getByLabelText(/時刻/), VALUES.time);
    await userEvent.type(screen.getByRole("textbox", { name: /会場/ }), VALUES.venue);
    await userEvent.type(screen.getByRole("textbox", { name: /参加費/ }), "0");
    await userEvent.click(screen.getByRole("button", { name: "作る" }));

    await waitFor(() =>
      expect(sent.filter((item) => item.method === "POST")).toEqual([
        {
          method: "POST",
          path: "/api/v1/events",
          body: {
            name: "11月の交流会",
            startsAt: "2026-11-25T19:00:00+09:00",
            venue: "渋谷の会場",
            fee: 0,
            googleFormUrl: null,
            lineGroupUrl: null,
          },
        },
      ]),
    );
  });

  it("描き直す前に2つの欄が続けて変わっても（自動の入力など）、どちらの値も残る", async () => {
    stubApi(true);
    renderWithRouter(<EventNewPage />);
    await screen.findByRole("heading", { level: 1, name: "交流会を追加" });
    const name = screen.getByRole("textbox", { name: /交流会の名前/ });
    const venue = screen.getByRole("textbox", { name: /会場/ });

    // 同じ描きの onChange を2つ、間に描き直しを挟まずに呼ぶ（描いたときの値から作ると、前の変更が消える）
    const onChangeName = reactOnChange(name);
    const onChangeVenue = reactOnChange(venue);
    act(() => {
      onChangeName(VALUES.name);
      onChangeVenue(VALUES.venue);
    });

    expect(name).toHaveValue(VALUES.name);
    expect(venue).toHaveValue(VALUES.venue);
  });

  it("主催者でなければ、使えない旨を出す", async () => {
    stubApi(false);
    renderWithRouter(<EventNewPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "この画面は主催者だけが使えます" }),
    ).toBeInTheDocument();
  });
});
