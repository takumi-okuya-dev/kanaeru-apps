// 分けたプロンプトのコピー：主はまだコピーしていないもののうち最初の1つ。
import { describe, expect, it } from "vitest";
import { nextPartToCopy } from "./prompt-copy.ts";

describe("主にするコピーのボタン", () => {
  it("はじめは1つ目、1つ目をコピーしたら2つ目、全部コピーしたらなし", () => {
    expect(nextPartToCopy(2, new Set())).toBe(0);
    expect(nextPartToCopy(2, new Set([0]))).toBe(1);
    expect(nextPartToCopy(2, new Set([0, 1]))).toBeUndefined();
  });

  it("2つ目を先にコピーしたら、まだの1つ目を主にする", () => {
    expect(nextPartToCopy(2, new Set([1]))).toBe(0);
  });
});
