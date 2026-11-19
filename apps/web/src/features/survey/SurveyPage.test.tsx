// アンケートの画面（P2）：目的の案内と設問・空で送る・お礼と2つのボタン・回答済みは「送り直す」・閉じている・
// チェックインしていない・送ったときに閉じていた。API は fetch の差しかえで答える。
import type { EventSummary } from "@workspace/contracts/event";
import type { SurveyAnswer } from "@workspace/contracts/survey";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectNoAxeViolations } from "@workspace/ui/testing/axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { SurveyPage } from "./SurveyPage.tsx";

/** 交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000001";

/** 要約の見本（アンケートが開いている）。 */
const SUMMARY: EventSummary = {
  id: EVENT_ID,
  name: "11月の交流会",
  startsAt: "2026-11-25T10:00:00.000Z",
  venue: "渋谷の会場",
  fee: 1000,
  surveyOpen: true,
  googleFormUrl: "https://forms.gle/example",
  lineGroupUrl: "https://line.me/R/ti/g/example",
  openChatUrl: null,
};

/** 回答の見本。 */
const ANSWER: SurveyAnswer = {
  concern: "部下にAIをどう使わせればいいか分からない",
  monthlyPrice: "jpy1000",
  tester: "yes",
  jobRole: "manager",
  jobType: null,
  answeredAt: "2026-11-25T12:00:00.000Z",
};

/** 送られた要求。 */
type Sent = { method: string; path: string; body: unknown };

/**
 * 仮の API（今の利用者・要約・自分の回答・送る）。
 * @param options 要約に重ねる値（summary）・チェックイン済みか（checkedIn）・前の回答（answer）・送ったときの誤り（putError）
 * @param options.summary 要約に重ねる値
 * @param options.checkedIn チェックイン済みか
 * @param options.answer 前の回答（なければ null）
 * @param options.putError 送ったときに返す誤りの code
 * @returns 送られた要求の一覧
 */
function stubApi(
  options: {
    summary?: Partial<EventSummary>;
    checkedIn?: boolean;
    answer?: SurveyAnswer | null;
    putError?: string;
  } = {},
): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    sent.push({ method, path: url.pathname, body });
    if (url.pathname === "/api/v1/accounts/me") {
      return Promise.resolve(
        Response.json({
          id: "0193a1b2-0000-7000-8000-000000000009",
          displayName: "佐藤",
          isOrganizer: false,
          registeredAt: "2026-11-19T10:00:00.000Z",
        }),
      );
    }
    if (url.pathname.endsWith("/summary")) {
      return Promise.resolve(Response.json({ ...SUMMARY, ...options.summary }));
    }
    if (url.pathname.endsWith("/survey-answers/me") && method === "GET") {
      return Promise.resolve(
        Response.json({ checkedIn: options.checkedIn ?? true, answer: options.answer ?? null }),
      );
    }
    if (options.putError) {
      return Promise.resolve(
        Response.json(
          {
            error: {
              code: options.putError,
              message:
                "アンケートは閉じています。主催者がアンケートを開いている間だけ答えられます。",
              requestId: "r",
            },
          },
          { status: 409 },
        ),
      );
    }
    return Promise.resolve(
      Response.json({ ...ANSWER, ...(body as object), answeredAt: "2026-11-25T12:05:00.000Z" }),
    );
  });
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("アンケートの画面", () => {
  it("目的の案内と設問が出て、任意の設問は「答えない」。何も選ばずに送るとお礼と2つのボタン", async () => {
    const sent = stubApi();
    const { container } = renderWithRouter(<SurveyPage eventId={EVENT_ID} />);
    await screen.findByRole("heading", { level: 1, name: "仕事の困りごとを聞かせてください" });
    expect(
      screen.getByText(
        "この交流会では、参加者の仕事の困りごとを集めて、AI活用勉強会のテーマや小さなアプリにしています。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "書いてもらった内容は、主催者だけが読みます。勉強会やアプリにするときに、お名前を出すことはありません。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "実現したら月いくらなら使うか" }),
    ).toHaveAccessibleDescription("答えるだけで、実際には払いません");
    // 選択肢の設問は、どれも「答えない」が最初に選ばれている（必須にしない。A7）
    for (const name of ["実現したら月いくらなら使うか", "テスターになる", "仕事の立場", "職種"]) {
      const group = screen.getByRole("radiogroup", { name });
      expect(group.querySelector('[aria-checked="true"]')).toHaveTextContent("答えない");
    }
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByRole("button", { name: "送る" }));
    const thanks = await screen.findByRole("heading", {
      level: 2,
      name: "あなたの困りごとが、解決する企画やアプリにつながります",
    });
    await waitFor(() => expect(thanks).toHaveFocus());
    expect(screen.getByRole("link", { name: "続けて交流会のアンケートへ" })).toHaveAttribute(
      "href",
      "https://forms.gle/example",
    );
    expect(screen.getByRole("link", { name: "交流会のLINEグループに参加する" })).toHaveAttribute(
      "href",
      "https://line.me/R/ti/g/example",
    );
    expect(sent.find((request) => request.method === "PUT")?.body).toEqual({
      concern: null,
      monthlyPrice: null,
      tester: null,
      jobRole: null,
      jobType: null,
    });
    await expectNoAxeViolations(container);
  });

  it("選んだ答えを送り、URL がなければボタンは出ない", async () => {
    const sent = stubApi({ summary: { googleFormUrl: null, lineGroupUrl: null } });
    renderWithRouter(<SurveyPage eventId={EVENT_ID} />);
    await userEvent.type(await screen.findByRole("textbox", { name: "困りごと" }), "議事録が大変");
    await userEvent.click(screen.getByRole("radio", { name: "3,000円以上" }));
    await userEvent.click(screen.getByRole("radio", { name: "はい" }));
    await userEvent.click(screen.getByRole("radio", { name: "企画・PM" }));
    await userEvent.click(screen.getByRole("button", { name: "送る" }));
    await screen.findByRole("heading", { level: 2 });
    expect(sent.find((request) => request.method === "PUT")?.body).toEqual({
      concern: "議事録が大変",
      monthlyPrice: "jpy3000plus",
      tester: "yes",
      jobRole: null,
      jobType: "planning",
    });
    expect(screen.queryByRole("link", { name: "続けて交流会のアンケートへ" })).toBeNull();
    expect(screen.queryByRole("link", { name: "交流会のLINEグループに参加する" })).toBeNull();
  });

  it("選んだ月いくら・テスターも「答えない」に戻せ、送ると null になる", async () => {
    const sent = stubApi();
    renderWithRouter(<SurveyPage eventId={EVENT_ID} />);
    const price = await screen.findByRole("radiogroup", { name: "実現したら月いくらなら使うか" });
    const tester = screen.getByRole("radiogroup", { name: "テスターになる" });
    await userEvent.click(within(price).getByRole("radio", { name: "500円" }));
    await userEvent.click(within(tester).getByRole("radio", { name: "はい" }));
    await userEvent.click(within(price).getByRole("radio", { name: "答えない" }));
    await userEvent.click(within(tester).getByRole("radio", { name: "答えない" }));
    await userEvent.click(screen.getByRole("button", { name: "送る" }));
    await screen.findByRole("heading", { level: 2 });
    expect(sent.find((request) => request.method === "PUT")?.body).toMatchObject({
      monthlyPrice: null,
      tester: null,
    });
  });

  it("回答済みなら前の答えが入っていて「送り直す」", async () => {
    stubApi({ answer: ANSWER });
    renderWithRouter(<SurveyPage eventId={EVENT_ID} />);
    expect(await screen.findByRole("textbox", { name: "困りごと" })).toHaveValue(ANSWER.concern);
    expect(screen.getByRole("radio", { name: "1,000円" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "管理職" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/回答済みです/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送り直す" })).toBeInTheDocument();
  });

  it("閉じていれば「アンケートは閉じています」で、設問を出さない", async () => {
    stubApi({ summary: { surveyOpen: false } });
    renderWithRouter(<SurveyPage eventId={EVENT_ID} />);
    await screen.findByRole("heading", { level: 1, name: "アンケートは閉じています" });
    expect(screen.queryByRole("button", { name: "送る" })).toBeNull();
  });

  it("チェックインしていなければ「先にチェックインしてください」と「チェックインの画面へ」", async () => {
    stubApi({ checkedIn: false });
    const { container } = renderWithRouter(<SurveyPage eventId={EVENT_ID} />);
    await screen.findByRole("heading", { level: 1, name: "先にチェックインしてください" });
    expect(screen.getByRole("link", { name: "チェックインの画面へ" })).toHaveAttribute(
      "href",
      `/e/${EVENT_ID}/checkin`,
    );
    await expectNoAxeViolations(container);
  });

  it("送ったときに閉じていたら、「送る」の近くに出し、入れた値は残す", async () => {
    stubApi({ putError: "SURVEY_CLOSED" });
    renderWithRouter(<SurveyPage eventId={EVENT_ID} />);
    const concern = await screen.findByRole("textbox", { name: "困りごと" });
    await userEvent.type(concern, "残したい");
    await userEvent.click(screen.getByRole("button", { name: "送る" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("アンケートは閉じています");
    expect(concern).toHaveValue("残したい");
  });
});
