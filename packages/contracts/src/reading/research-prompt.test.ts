// 調べる文と調べる先の URL：材料が入る・? を外す・3つの先・長いときは null。
import { describe, expect, it } from "vitest";
import { RESEARCH_TARGET_KEYS, buildResearchPrompt, researchUrl } from "./index.ts";

const INPUT = {
  title: "見本のネットワーク入門",
  chapter: "2章 見本の通信",
  text: "網の仕組みは見本の部品に任されている。",
  comment: "? 見本の部品の違いが分からない",
  want: "仕組みを説明できるようになる",
};

describe("調べる文", () => {
  it("書名・分かりたいこと・章・本の文・メモが入り、メモの頭の ? は外す", () => {
    const prompt = buildResearchPrompt(INPUT);
    for (const part of [
      "見本のネットワーク入門",
      "仕組みを説明",
      "2章 見本の通信",
      "網の仕組み",
      "私のメモ：見本の部品",
    ]) {
      expect(prompt).toContain(part);
    }
    expect(prompt).not.toContain("? 見本");
  });

  it("3つの先の URL に、調べる文が入る", () => {
    const prompt = buildResearchPrompt(INPUT);
    expect(RESEARCH_TARGET_KEYS).toEqual(["chatgpt", "claude", "google"]);
    expect(researchUrl("chatgpt", prompt)).toMatch(/^https:\/\/chatgpt\.com\/\?q=/u);
    expect(researchUrl("claude", prompt)).toMatch(/^https:\/\/claude\.ai\/new\?q=/u);
    const google = new URL(researchUrl("google", prompt) as string);
    expect(google.searchParams.get("q")).toBe(prompt);
  });

  it("長すぎるときは null（コピーに切りかえる）", () => {
    expect(researchUrl("chatgpt", "あ".repeat(1_000))).toBeNull();
  });
});
