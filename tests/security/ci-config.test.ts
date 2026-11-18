// CI の設定（.github/workflows/*.yml）が秘密の値を使わず、外の部品を固定することの確かめ。
// workflow の数は書かない（glob で読む）。YAML を読む依存は足さず、行を読む。
// 中で使う部品（.github/actions/*/action.yml）も、同じ決まり（secrets を使わない・uses を SHA で固定）で確かめる。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dir = join(root, ".github/workflows");
const workflows = readdirSync(dir)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, source: readFileSync(join(dir, name), "utf8") }));
const actionsDir = join(root, ".github/actions");
const actions = existsSync(actionsDir)
  ? readdirSync(actionsDir)
      .filter((name) => existsSync(join(actionsDir, name, "action.yml")))
      .map((name) => ({
        name: `actions/${name}/action.yml`,
        source: readFileSync(join(actionsDir, name, "action.yml"), "utf8"),
      }))
  : [];
/** gitleaks を入れる部品。 */
const SETUP_GITLEAKS = "./.github/actions/setup-gitleaks";

/**
 * 注釈の行を除いた中身。
 * @param source workflow の文字
 * @returns 注釈を除いた行
 */
function codeLines(source: string): string[] {
  return source.split("\n").filter((line) => !/^\s*#/.test(line));
}

/**
 * permissions: の下の行を読む（いちばん外と、仕事ごと）。
 * @param source workflow の文字
 * @returns permissions の塊ごとの中身
 */
function permissionBlocks(source: string): string[][] {
  const lines = codeLines(source);
  const blocks: string[][] = [];
  lines.forEach((line, index) => {
    const match = /^(\s*)permissions:\s*(.*)$/.exec(line);
    if (!match) return;
    const indent = match[1]?.length ?? 0;
    const inline = (match[2] ?? "").trim();
    if (inline) {
      blocks.push([inline]);
      return;
    }
    const body: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (next.trim() === "") continue;
      if (next.length - next.trimStart().length <= indent) break;
      body.push(next.trim());
    }
    blocks.push(body);
  });
  return blocks;
}

/**
 * 仕事（jobs の下）の if: >- の式を、空白をそろえて読む。
 * @param source workflow の文字
 * @returns 仕事の名前と式
 */
function jobConditions(source: string): { job: string; condition: string }[] {
  const lines = codeLines(source);
  const result: { job: string; condition: string }[] = [];
  let job = "";
  lines.forEach((line, index) => {
    const jobMatch = /^ {2}([\w-]+):\s*$/.exec(line);
    if (jobMatch) job = jobMatch[1] ?? "";
    if (!/^ {4}if:\s*>-\s*$/.test(line)) return;
    const body: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (!/^ {6}/.test(next)) break;
      body.push(next.trim());
    }
    result.push({ job, condition: body.join(" ") });
  });
  return result;
}

/**
 * いちばん外の concurrency の group（group: >- の塊）を、空白をそろえて読む。
 * @param source workflow の文字
 * @returns group の文字（なければ undefined）
 */
function concurrencyGroup(source: string): string | undefined {
  const lines = codeLines(source);
  const start = lines.findIndex((line) => /^ {2}group:\s*>-\s*$/.test(line));
  if (start < 0) return undefined;
  const body: string[] = [];
  for (const next of lines.slice(start + 1)) {
    if (!/^ {4}/.test(next)) break;
    body.push(next.trim());
  }
  return body.join(" ");
}

/**
 * 式の空白を除く（折り返しの違いを無視して比べるため）。
 * @param text 式
 * @returns 空白を除いた式
 */
function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * env の値を読む。
 * @param source workflow の文字
 * @param key 名前
 * @returns 値（なければ undefined）
 */
function envValue(source: string, key: string): string | undefined {
  return new RegExp(`^\\s*${key}:\\s*["']?([^"'\\s]+)`, "m").exec(source)?.[1];
}

describe("CI が秘密の値を使わず、外の部品を固定する", () => {
  it("workflow がある", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it("permissions は contents: read だけ（どの塊も）", () => {
    for (const { name, source } of workflows) {
      const blocks = permissionBlocks(source);
      expect(blocks.length, `${name} に permissions がありません`).toBeGreaterThan(0);
      for (const block of blocks) expect(block, name).toEqual(["contents: read"]);
    }
  });

  it("秘密の値（secrets.・GITHUB_TOKEN）を使わない", () => {
    for (const { name, source } of [...workflows, ...actions]) {
      const code = codeLines(source).join("\n");
      expect(code, name).not.toMatch(/secrets\./);
      expect(code, name).not.toMatch(/GITHUB_TOKEN/);
    }
  });

  it("uses: はすべて40桁の SHA で固定し、注釈に版の名前がある（リポジトリの中の部品 ./.github/actions/ は除く）", () => {
    for (const { name, source } of [...workflows, ...actions]) {
      for (const line of codeLines(source).filter((candidate) =>
        /^\s*-?\s*uses:/.test(candidate),
      )) {
        if (/uses:\s*\.\/\.github\/actions\/[\w-]+\s*$/.test(line)) continue;
        expect(line, name).toMatch(/uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s*v\d/);
      }
    }
  });

  it("gitleaks は1つの部品（setup-gitleaks）で入れ、版は scripts/security/secrets.ts と同じ・照合の値で確かめる", () => {
    const setup = actions.find(({ name }) => name === "actions/setup-gitleaks/action.yml");
    expect(setup, "setup-gitleaks の部品がありません").toBeDefined();
    const minimum = /MIN_GITLEAKS_VERSION = "([\d.]+)"/.exec(
      readFileSync(join(root, "scripts/security/secrets.ts"), "utf8"),
    )?.[1];
    expect(envValue(setup?.source ?? "", "GITLEAKS_VERSION")).toBe(minimum);
    expect(envValue(setup?.source ?? "", "GITLEAKS_SHA256")).toMatch(/^[0-9a-f]{64}$/);
    expect(setup?.source).toMatch(/sha256sum -c -/);

    const withGitleaks = workflows.filter(({ source }) =>
      codeLines(source).some((line) => /gitleaks\s+git\b/.test(line)),
    );
    expect(withGitleaks.length).toBeGreaterThan(0);
    for (const { name, source } of withGitleaks) {
      const code = codeLines(source).join("\n");
      expect(code, `${name} は setup-gitleaks を使ってください`).toContain(
        `uses: ${SETUP_GITLEAKS}`,
      );
      expect(code, `${name} で gitleaks を直に落とさないでください`).not.toMatch(
        /releases\/download|GITLEAKS_VERSION/,
      );
    }
  });

  it("ci.yml：流れない出来事が、流れている確かめを止めない（concurrency の group に、仕事の if と同じ式と run_id）", () => {
    const ci = workflows.find(({ name }) => name === "ci.yml");
    expect(ci).toBeDefined();
    const group = concurrencyGroup(ci?.source ?? "");
    expect(group, "concurrency の group: >- がありません").toBeDefined();
    expect(group).toContain("github.run_id");
    const conditions = jobConditions(ci?.source ?? "");
    expect(conditions.length).toBeGreaterThan(0);
    for (const { job, condition } of conditions) {
      expect(squash(group ?? ""), `${job} の if が concurrency の group の式と違います`).toContain(
        squash(`(${condition})&&'run'||github.run_id`),
      );
    }
  });

  it("ci.yml：依存の確かめ（pnpm security:audit）を、pnpm check と別の仕事で重ねて流さない", () => {
    const ci = workflows.find(({ name }) => name === "ci.yml");
    const scripts = (
      JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    expect(scripts.check).toContain("pnpm security:check");
    expect(scripts["security:check"]).toContain("pnpm security:audit");
    const code = codeLines(ci?.source ?? "").join("\n");
    expect(code).toMatch(/run:\s*pnpm check\b/);
    expect(code).not.toMatch(/security:audit|security:check/);
  });
});
