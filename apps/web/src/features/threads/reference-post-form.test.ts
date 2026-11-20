// 参考の投稿の欄の確かめ（threads-012）：反応の数を数にする・形の違う数と URL と投稿日を欄の誤りにする・保存したものを欄に戻す。
import type { ReferencePost } from "@workspace/contracts/threads";
import { describe, expect, it } from "vitest";
import {
  EMPTY_REFERENCE_FORM,
  checkReferenceForm,
  freshnessOfForm,
  metricsLine,
  sameReferenceForm,
  threadsSearchUrl,
  toReferenceForm,
} from "./reference-post-form.ts";

const TODAY = "2026-11-20";

describe("参考の投稿の欄", () => {
  it("反応の数を数にし、空は null にする（3桁の区切りの , は外す）", () => {
    const check = checkReferenceForm(
      {
        ...EMPTY_REFERENCE_FORM,
        body: "本文",
        likes: "1,200",
        views: " 32000 ",
        author: "someone",
      },
      TODAY,
    );
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.input.metrics).toEqual({
      likes: 1200,
      replies: null,
      views: 32000,
      saves: null,
      reposts: null,
      followers: null,
    });
    expect(check.input.author).toBe("someone");
    expect(check.input.postedDate).toBeNull();
  });

  it("本文がない・数でない・URL の形が違う・日付がない・今日より後は、欄ごとの誤りにする", () => {
    const check = checkReferenceForm(
      {
        ...EMPTY_REFERENCE_FORM,
        likes: "たくさん",
        followers: "-3",
        postUrl: "threads.com/x",
        postedDateMode: "exact",
      },
      TODAY,
    );
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(Object.keys(check.errors).sort()).toEqual(
      ["body", "followers", "likes", "postUrl", "postedDate"].sort(),
    );
    const future = checkReferenceForm(
      { ...EMPTY_REFERENCE_FORM, body: "本文", postedDateMode: "exact", postedDate: "2026-12-01" },
      TODAY,
    );
    expect(future).toEqual({ ok: false, errors: { postedDate: "今日より後の日付は選べません。" } });
  });

  it("保存した参考の投稿を欄に戻すと、同じ値で送れる", () => {
    const post = {
      id: "0193a1b2-0000-7000-8000-000000000001",
      body: "本文",
      keyword: "転職",
      postUrl: "https://www.threads.com/@a/post/1",
      whyGood: "解説",
      platform: "instagram",
      postedDateMode: "exact",
      postedDate: "2026-11-01",
      metrics: { likes: 3, replies: null, views: 10, saves: null, reposts: null, followers: 99 },
      author: "a",
      memo: "メモ",
      freshness: "latest",
      shortId: "0193a1b2",
      version: 2,
      createdAt: "2026-11-02T00:00:00.000Z",
      updatedAt: "2026-11-02T00:00:00.000Z",
    } satisfies ReferencePost;
    const form = toReferenceForm(post);
    expect(form.likes).toBe("3");
    expect(form.replies).toBe("");
    const check = checkReferenceForm(form, TODAY);
    expect(check.ok && check.input.metrics.followers).toBe(99);
    expect(sameReferenceForm(form, toReferenceForm(post))).toBe(true);
    expect(sameReferenceForm(form, { ...form, memo: "変えた" })).toBe(false);
  });

  it("鮮度・閲覧数といいねの1行・Threads の検索の URL", () => {
    expect(freshnessOfForm({ ...EMPTY_REFERENCE_FORM, postedDateMode: "week" }, TODAY)).toBe(
      "latest",
    );
    expect(freshnessOfForm(EMPTY_REFERENCE_FORM, TODAY)).toBe("unknown");
    expect(
      metricsLine({
        likes: 820,
        replies: 1,
        views: 32000,
        saves: null,
        reposts: null,
        followers: null,
      }),
    ).toBe("閲覧 32,000・いいね 820");
    expect(
      metricsLine({
        likes: null,
        replies: null,
        views: null,
        saves: null,
        reposts: null,
        followers: null,
      }),
    ).toBe("");
    expect(threadsSearchUrl("20代 転職")).toBe(
      "https://www.threads.com/search?q=20%E4%BB%A3%20%E8%BB%A2%E8%81%B7",
    );
  });
});
