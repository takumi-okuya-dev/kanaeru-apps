// 設定の画面の約束（threads-012）：運用アカウントを消すときの名前の比べ方・投稿の権限の確かめの文・規約への備えの出し方。
import { describe, expect, it } from "vitest";
import {
  POLICY_CAUTIONS,
  POLICY_PROMPT_RULES,
  THREADS_CHECK_MESSAGES,
  THREADS_ERRORS,
  ThreadsAccountDeleteInput,
  confirmNameMatches,
  threadsCheckOkMessage,
} from "./index.ts";

describe("運用アカウントを消すときの名前", () => {
  it("前後の空白を除いて、同じ名前のときだけ合う", () => {
    expect(confirmNameMatches("運用", "運用")).toBe(true);
    expect(confirmNameMatches("  運用 ", "運用")).toBe(true);
    expect(confirmNameMatches("運用2", "運用")).toBe(false);
    expect(confirmNameMatches("", "運用")).toBe(false);
  });

  it("空の名前は入力の誤り", () => {
    expect(ThreadsAccountDeleteInput.safeParse({ confirmName: "" }).success).toBe(false);
    expect(ThreadsAccountDeleteInput.safeParse({}).success).toBe(false);
    expect(ThreadsAccountDeleteInput.safeParse({ confirmName: "運用" }).success).toBe(true);
  });

  it("合わないときのエラーは 400", () => {
    expect(THREADS_ERRORS.THREADS_ACCOUNT_NAME_MISMATCH.status).toBe(400);
  });
});

describe("投稿の権限の確かめの文", () => {
  it("投稿できる状態なら、直近24時間の投稿の数と上限を出す", () => {
    expect(threadsCheckOkMessage(3, 250)).toBe("投稿できる状態です（直近24時間の投稿 3/250件）。");
    expect(threadsCheckOkMessage(null, null)).toBe("投稿できる状態です。");
  });

  it("投稿できない理由ごとに文がある", () => {
    for (const status of [
      "needs_reconnect",
      "not_connected",
      "no_publish_permission",
      "unknown",
    ] as const)
      expect(THREADS_CHECK_MESSAGES[status].length).toBeGreaterThan(0);
  });
});

describe("規約への備え", () => {
  it("プロンプトのルールと「規約に注意」の分類を、入口から読める", () => {
    expect(POLICY_PROMPT_RULES.length).toBeGreaterThan(0);
    expect(POLICY_CAUTIONS.every((caution) => caution.policyUrl.startsWith("https://"))).toBe(true);
  });
});
