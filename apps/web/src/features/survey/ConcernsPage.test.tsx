// 困りごとの画面：行（名前・困りごと・選択肢の言葉）・絞りこみと並べ方の問い合わせ・空の状態。API は fetch の差しかえで答える。
import type { SurveyAnswerRow } from "@workspace/contracts/survey";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectNoAxeViolations } from "@workspace/ui/testing/axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { ConcernsPage, toListQuery } from "./ConcernsPage.tsx";

/** 交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000001";

/** 回答の行の見本。 */
const ROW: SurveyAnswerRow = {
  id: "0193a1b2-0000-7000-8000-000000000005",
  checkinId: "0193a1b2-0000-7000-8000-000000000006",
  name: "佐藤 太郎",
  method: "line",
  concern: "部下にAIをどう使わせればいいか分からない",
  monthlyPrice: "jpy1000",
  tester: "yes",
  jobRole: "manager",
  jobType: null,
  answeredAt: "2026-11-25T12:00:00.000Z",
  createdAt: "2026-11-25T12:00:00.000Z",
};

/**
 * 仮の API（今の利用者・交流会・困りごとの一覧）。
 * @param rows 一覧の行
 * @param failWhen この問い合わせの文字の一覧を読んだら、held を待ってから 500 を返す（任意）
 * @param held failWhen の答えを待たせる約束（任意。なければすぐ返す）
 * @returns 一覧を読んだ問い合わせの文字の並び
 */
function stubApi(rows: SurveyAnswerRow[], failWhen?: string, held?: Promise<void>): string[] {
  const searches: string[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/api/v1/accounts/me") {
      return Promise.resolve(
        Response.json({
          id: "0193a1b2-0000-7000-8000-000000000009",
          displayName: "主催者",
          isOrganizer: true,
          registeredAt: "2026-11-19T10:00:00.000Z",
        }),
      );
    }
    if (url.pathname === `/api/v1/events/${EVENT_ID}`) {
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
        }),
      );
    }
    searches.push(url.search);
    if (url.search === failWhen) {
      return (held ?? Promise.resolve()).then(() =>
        Response.json(
          { error: { code: "INTERNAL", message: "うまくいきませんでした。", requestId: "r" } },
          { status: 500 },
        ),
      );
    }
    return Promise.resolve(Response.json({ answers: rows }));
  });
  return searches;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("困りごとの画面", () => {
  it("名前・困りごと・選択肢の言葉を出し、絞りこみと並べ方で問い合わせを変える", async () => {
    const searches = stubApi([ROW]);
    const { container } = renderWithRouter(<ConcernsPage eventId={EVENT_ID} />);
    await screen.findByRole("heading", { level: 1, name: "困りごと" });
    const table = await screen.findByRole("table", { name: "困りごと" });
    const cells = within(table)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["佐藤 太郎", ROW.concern, "1,000円", "はい", "管理職", ""]);
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByRole("radio", { name: "テスターに「はい」だけ" }));
    await userEvent.click(screen.getByRole("radio", { name: "月いくらの高い順" }));
    await waitFor(() => expect(searches).toContain("?tester=yes&sort=price"));
    expect(searches[0]).toBe("?sort=newest");
  });

  it("絞りこみを変えたら、読めるまで前の絞りこみの行を出さず、初めの読みこみが失敗したら誤りを出す", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubApi([{ ...ROW, tester: "no" }], "?tester=yes&sort=newest", held);
    renderWithRouter(<ConcernsPage eventId={EVENT_ID} />);
    await screen.findByRole("table", { name: "困りごと" });
    expect(screen.getByText("1件の回答があります。")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "テスターに「はい」だけ" }));
    // 読みこみ中（読み直しの間も含む）に、「いいえ」の行を「はい」だけの結果として出さない
    expect(await screen.findByText("読みこんでいます…")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "困りごと" })).toBeNull();
    expect(screen.queryByText("1件の回答があります。")).toBeNull();

    release();
    expect(await screen.findByRole("alert")).toHaveTextContent("うまくいきませんでした。");
    expect(screen.queryByRole("table", { name: "困りごと" })).toBeNull();
    expect(screen.queryByText("1件の回答があります。")).toBeNull();
    expect(screen.queryByText(ROW.name)).toBeNull();
  });

  it("回答がなく閉じていれば「まだ困りごとはありません」と準備の画面への入口", async () => {
    stubApi([]);
    renderWithRouter(<ConcernsPage eventId={EVENT_ID} />);
    await screen.findByText("まだ困りごとはありません。");
    expect(screen.getByRole("link", { name: "準備の画面でアンケートを開く" })).toBeInTheDocument();
  });

  it("問い合わせは値のない欄を入れない", () => {
    expect(toListQuery("all", "newest")).toEqual({ sort: "newest" });
    expect(toListQuery("tester", "price")).toEqual({ tester: "yes", sort: "price" });
  });
});
