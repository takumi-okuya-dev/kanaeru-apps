// 打診への答え・変更の帯のボタン：押したほうにだけ「動いている」の印をつけ、押していないほうは止める。
import type { EntryStanding, ScheduleChange } from "@workspace/contracts/booking";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeBanner } from "./SeatSummary.tsx";
import { RespondButtons } from "./waitlist-parts.tsx";

/** 打診中で、参加すると答えられる立ち位置。 */
const OFFERED: EntryStanding = {
  waitlistPosition: null,
  offerDeadline: "2026-11-22T00:00:00.000Z",
  offerExpired: false,
  canAccept: true,
};

/**
 * 答えを返さないままのボタンを描く（送っている途中を保つ）。
 * @param primary 画面に1つだけの申込みか
 * @returns 送った答えの受け手
 */
function renderPending(primary: boolean) {
  const respond = vi.fn(() => new Promise<never>(() => {}));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RespondButtons
        status="offered"
        standing={OFFERED}
        respond={respond}
        onDone={vi.fn()}
        primary={primary}
      />
    </QueryClientProvider>,
  );
  return respond;
}

describe("打診への答えのボタン", () => {
  it.each([true, false])(
    "「辞退する」を押したら、辞退するにだけ印をつけ、参加するは止める（primary=%s）",
    async (primary) => {
      const respond = renderPending(primary);
      await userEvent.click(screen.getByRole("button", { name: "辞退する" }));
      const decline = screen.getByRole("button", { name: "辞退する" });
      const accept = screen.getByRole("button", { name: "参加する" });
      await waitFor(() => expect(decline).toHaveAttribute("aria-busy", "true"));
      expect(accept).not.toHaveAttribute("aria-busy");
      expect(accept).toHaveAttribute("aria-disabled", "true");
      await userEvent.click(accept);
      expect(respond).toHaveBeenCalledTimes(1);
      expect(respond).toHaveBeenCalledWith("decline");
    },
  );
});

/** 日時が変わった帯の見本。 */
const CHANGE: ScheduleChange = {
  previousStartsAt: "2026-11-28T10:00:00.000Z",
  previousVenue: "中央市民体育館",
  startsAt: "2026-11-29T10:00:00.000Z",
  venue: "中央市民体育館",
  autoNoticeAt: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("変更の帯のボタン", () => {
  it("「知らせずに済ませる」を押したら、それにだけ印をつけ、「変更を知らせる」は止める", async () => {
    // 答えを返さないままにして、送っている途中を保つ
    vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ChangeBanner
          eventId="0193a1b2-0000-7000-8000-000000000001"
          change={CHANGE}
          organizer
          onResolved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "知らせずに済ませる" }));
    const quiet = screen.getByRole("button", { name: "知らせずに済ませる" });
    const notify = screen.getByRole("button", { name: "変更を知らせる" });
    await waitFor(() => expect(quiet).toHaveAttribute("aria-busy", "true"));
    expect(notify).not.toHaveAttribute("aria-busy");
    expect(notify).toHaveAttribute("aria-disabled", "true");
  });
});
