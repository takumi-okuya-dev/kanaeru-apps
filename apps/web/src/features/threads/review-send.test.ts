// 承認・却下の結果の文（threads-011）：全部できた・一部・1件だけできなかった・送れなかった分。
import type { PostDraft, ReviewResult } from "@workspace/contracts/threads";
import { describe, expect, it } from "vitest";
import { reviewMessage } from "./review-send.ts";

/**
 * 試しの案を作る（文に使う欄だけ）。
 * @param id 案の ID
 * @returns 案
 */
function draft(id: string): PostDraft {
  return { id, version: 1, status: "needs_review", body: id } as PostDraft;
}

const COUNTS: ReviewResult["counts"] = {
  needsReview: 0,
  approved: 0,
  rejected: 0,
  published: 0,
  publishFailed: 0,
};

describe("承認・却下の結果の文", () => {
  it("全部できたら success", () => {
    const drafts = [draft("a"), draft("b")];
    expect(reviewMessage("approve", drafts, { drafts, skipped: [], counts: COUNTS })).toEqual({
      tone: "success",
      message: "2件を承認しました。",
    });
  });

  it("一部できなかったら info で、理由ごとの件数を添える", () => {
    const drafts = [draft("a"), draft("b"), draft("c")];
    const result = reviewMessage("approve", drafts, {
      drafts: [draft("a")],
      skipped: [
        { id: "b", reason: "NG_WORD" },
        { id: "c", reason: "POLICY_CONFIRM_REQUIRED" },
      ],
      counts: COUNTS,
    });
    expect(result).toEqual({
      tone: "info",
      message:
        "1件を承認しました。2件は承認できませんでした（NGワード 1件・規約の確かめがない 1件）。",
    });
  });

  it("1件だけで飛ばされたら、その理由の文を danger で出す", () => {
    const drafts = [draft("a")];
    const result = reviewMessage("reopen", drafts, {
      drafts: [],
      skipped: [{ id: "a", reason: "LIMIT" }],
      counts: COUNTS,
    });
    expect(result.tone).toBe("danger");
    expect(result.message).toContain("承認待ちの案が上限");
  });

  it("送れなかった分があれば、読みこみ直すよう添える", () => {
    const drafts = [draft("a"), draft("b")];
    const result = reviewMessage("reject", drafts, {
      drafts: [draft("a")],
      skipped: [],
      counts: COUNTS,
    });
    expect(result.tone).toBe("info");
    expect(result.message).toBe(
      "1件を却下しました。1件は送れませんでした。読みこみ直して確かめてください。",
    );
  });
});
