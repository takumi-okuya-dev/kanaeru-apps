import { describe, expect, it } from "vitest";
import { normalizeNgWord } from "./ng-words.ts";
import {
  REJECT_REASONS,
  REVIEW_SKIP_REASONS,
  checkPublishable,
  mergeChecks,
  rejectReasonLabel,
  reviewSkipMessage,
  reviewSummary,
} from "./review.ts";

const ng = (...words: string[]) =>
  words.map((word) => ({ word, normalized: normalizeNgWord(word) }));

describe("配信できるかの判定（specs/004-review-approval research.md R14）", () => {
  it("NGワードを含むと承認できない", () => {
    const r = checkPublishable("絶対に伸びる", ng("絶対"));
    expect(r.ngWords.map((h) => h.word)).toEqual(["絶対"]);
    expect(r.approvable).toBe(false);
  });

  it("Threadsの上限を超えると承認できない", () => {
    expect(checkPublishable("あ".repeat(501), []).overThreadsLimit).toBe(true);
    expect(checkPublishable("あ".repeat(501), []).approvable).toBe(false);
    const links = Array.from({ length: 6 }, (_, i) => `https://e${i}.example`).join(" ");
    expect(checkPublishable(links, []).approvable).toBe(false);
  });

  it("どちらもなければ承認できる", () => {
    const r = checkPublishable("今日の気づき", ng("絶対"));
    expect(r).toMatchObject({ ngWords: [], overThreadsLimit: false, approvable: true });
  });
});

describe("却下理由の候補（research.md R10）", () => {
  it("6つのコードと表示名", () => {
    expect(REJECT_REASONS).toEqual([
      { code: "similar", label: "似た投稿がある" },
      { code: "tone", label: "トーンが違う" },
      { code: "thin", label: "内容が薄い" },
      { code: "inaccurate", label: "事実と違う" },
      { code: "too_promotional", label: "宣伝っぽすぎる" },
      { code: "policy", label: "規約に触れそう" },
    ]);
    expect(rejectReasonLabel("tone")).toBe("トーンが違う");
  });
});

describe("まとめての承認・却下の結果（threads-011）", () => {
  it("本文と返信の文の判定は、どちらかに当たれば当たり", () => {
    const body = checkPublishable("ふつうの本文", ng("拡散"));
    const reply = checkPublishable("ぜひ拡散して", ng("拡散"));
    expect(mergeChecks(body, null)).toBe(body);
    const merged = mergeChecks(body, reply);
    expect(merged.approvable).toBe(false);
    expect(merged.ngWords.map((hit) => hit.word)).toEqual(["拡散"]);
  });

  it("飛ばした理由ごとの件数を添える", () => {
    expect(reviewSummary("3件を承認しました", "承認", [])).toBe("3件を承認しました。");
    expect(
      reviewSummary("1件を承認しました", "承認", [
        { reason: "NG_WORD" },
        { reason: "LIMIT" },
        { reason: "NG_WORD" },
      ]),
    ).toBe("1件を承認しました。3件は承認できませんでした（NGワード 2件・件数の上限 1件）。");
  });

  it("1件の理由の文は、戻すときの上限だけ承認待ちの上限を言う", () => {
    const limits = { approved: 500, needsReview: 500 };
    expect(reviewSkipMessage("LIMIT", "reopen", limits)).toContain("承認待ちの案が上限（500件）");
    expect(reviewSkipMessage("LIMIT", "approve", limits)).toContain("承認済みの案が上限（500件）");
    for (const reason of REVIEW_SKIP_REASONS) {
      expect(reviewSkipMessage(reason, "approve", limits)).not.toBe("");
    }
  });
});
