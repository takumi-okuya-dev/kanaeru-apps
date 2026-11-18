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
/** 本番へのデプロイ（GCP の短い間だけの資格を取るため、仕事の塊だけ id-token: write を許す）。 */
const DEPLOY_WORKFLOW = "deploy.yml";

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

  it("permissions は contents: read だけ（どの塊も）。id-token: write は deploy.yml の仕事の塊だけ", () => {
    for (const { name, source } of workflows) {
      const blocks = permissionBlocks(source);
      expect(blocks.length, `${name} に permissions がありません`).toBeGreaterThan(0);
      expect(blocks[0], `${name} のいちばん外の permissions`).toEqual(["contents: read"]);
      for (const block of blocks.slice(1)) {
        const allowed =
          name === DEPLOY_WORKFLOW
            ? [["contents: read"], ["contents: read", "id-token: write"]]
            : [["contents: read"]];
        expect(allowed, `${name} の permissions：${block.join("・")}`).toContainEqual(block);
      }
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

describe("deploy.yml：本番へのデプロイの守り（core-002。docs/rules/development-flow.md 5）", () => {
  const deploy = workflows.find(({ name }) => name === DEPLOY_WORKFLOW);
  const code = codeLines(deploy?.source ?? "").join("\n");

  it("deploy.yml がある", () => {
    expect(deploy, `${DEPLOY_WORKFLOW} がありません`).toBeDefined();
  });

  it("push で流れるのは main だけで、paths で出すものが変わるファイルに絞る", () => {
    expect(code).toMatch(/push:\s*\n\s+branches:\s*\[main\]\s*\n\s+paths:/);
    expect(code).toMatch(/if:\s*github\.ref == 'refs\/heads\/main'/);
  });

  it("デプロイは1つずつで、流れているものを取り消さない（DB の変更の途中で止めない）", () => {
    expect(code).toMatch(
      /concurrency:\s*\n\s+group:\s*deploy-production\s*\n\s+cancel-in-progress:\s*false/,
    );
  });

  it("GCP へは WIF で入り、鍵（credentials_json）を使わない", () => {
    expect(code).toMatch(/uses:\s*google-github-actions\/auth@/);
    expect(code).toMatch(/workload_identity_provider:/);
    expect(code).not.toMatch(/credentials_json/);
  });

  it("日本時間の時間帯を確かめてから、db:migrate → 新しい版の順に出す", () => {
    const hour = code.indexOf("TZ=Asia/Tokyo");
    const migrate = code.indexOf("gcloud run jobs execute");
    const release = code.indexOf("gcloud run services update");
    expect(hour, "時間帯の確かめがありません").toBeGreaterThanOrEqual(0);
    expect(migrate, "db:migrate の job を動かしていません").toBeGreaterThan(hour);
    expect(code).toMatch(/gcloud run jobs execute[^\n]*--wait/);
    expect(release, "新しい版を db:migrate のあとに出していません").toBeGreaterThan(migrate);
  });
});
