// 交流会を読めなかったとき：DB に届かない 503 は、夜間の停止の時間帯（日本時間 0時〜8時）だけ夜間の見出しにし、
// 昼は「読みこめませんでした」と API の文と「もう一度」を出す。
import { DB_UNAVAILABLE_MESSAGES } from "@workspace/contracts/core";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api.ts";
import { renderWithRouter } from "../../lib/testing.tsx";
import { EventLoadFailure } from "./EventAccessGate.tsx";

afterEach(() => {
  vi.useRealTimers();
});

/**
 * DB に届かない 503 を作る。
 * @param message API の文
 * @returns エラー
 */
function dbUnavailable(message: string): ApiError {
  return new ApiError(503, { code: "DB_UNAVAILABLE", message, requestId: "test" });
}

describe("交流会を読めなかったとき", () => {
  it("夜間の停止の時間帯の 503 は、夜間の見出しを出す", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T03:00:00+09:00"));
    renderWithRouter(
      <EventLoadFailure error={dbUnavailable(DB_UNAVAILABLE_MESSAGES.nightStop)} retry={vi.fn()} />,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "夜間（0時〜8時）は止まっています" }),
    ).toBeInTheDocument();
  });

  it("昼の 503 は、夜間と言わず、API の文と「もう一度」を出す", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T12:00:00+09:00"));
    renderWithRouter(
      <EventLoadFailure error={dbUnavailable(DB_UNAVAILABLE_MESSAGES.temporary)} retry={vi.fn()} />,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "読みこめませんでした" }),
    ).toBeInTheDocument();
    expect(screen.getByText(DB_UNAVAILABLE_MESSAGES.temporary)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "もう一度" })).toBeInTheDocument();
    expect(screen.queryByText(/夜間/)).not.toBeInTheDocument();
  });
});
