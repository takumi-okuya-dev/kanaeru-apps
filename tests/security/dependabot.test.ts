// 依存を新しくする PR の設定（.github/dependabot.yml）があることの確かめ。
// npm と github-actions の2つがあり、どちらも develop に向くことだけを見る（間隔などの中身は見ない）。
// YAML を読む依存は足さず、行を読む。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const file = join(root, ".github/dependabot.yml");

/**
 * updates の項目ごとに、package-ecosystem と target-branch を読む。
 * @param source dependabot.yml の文字
 * @returns 項目ごとの値
 */
function updates(source: string): { ecosystem: string; targetBranch?: string }[] {
  const entries: { ecosystem: string; targetBranch?: string }[] = [];
  for (const line of source.split("\n")) {
    const ecosystem = /^\s*-\s*package-ecosystem:\s*["']?([\w-]+)/.exec(line)?.[1];
    if (ecosystem) {
      entries.push({ ecosystem });
      continue;
    }
    const branch = /^\s+target-branch:\s*["']?([\w/-]+)/.exec(line)?.[1];
    const current = entries.at(-1);
    if (branch && current) current.targetBranch = branch;
  }
  return entries;
}

describe("依存を新しくする PR の設定がある", () => {
  it("まとめる組に「*」（すべて）を使わない", () => {
    const source = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");
    expect(source).not.toMatch(/patterns:\s*\[?\s*["']\*["']/);
    expect(source).not.toMatch(/^\s*-\s*["']\*["']\s*$/m);
  });

  it("npm と github-actions の2つがあり、どちらも target-branch が develop", () => {
    expect(existsSync(file), ".github/dependabot.yml がありません").toBe(true);
    const entries = updates(readFileSync(file, "utf8"));
    for (const ecosystem of ["npm", "github-actions"]) {
      const entry = entries.find((candidate) => candidate.ecosystem === ecosystem);
      expect(entry, `${ecosystem} の設定がありません`).toBeDefined();
      expect(entry?.targetBranch, `${ecosystem} の target-branch`).toBe("develop");
    }
  });
});
