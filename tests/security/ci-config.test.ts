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
/** 本番とステージングへのデプロイ（GCP の短い間だけの資格を取るため、仕事の塊だけ id-token: write を許す）。 */
const DEPLOY_WORKFLOW = "deploy.yml";
/** 1つの環境へのデプロイ（deploy.yml が呼ぶ。core-019）。 */
const DEPLOY_ENVIRONMENT_WORKFLOW = "deploy-environment.yml";
/** id-token: write を仕事の塊に許す workflow。 */
const DEPLOY_WORKFLOWS = new Set([DEPLOY_WORKFLOW, DEPLOY_ENVIRONMENT_WORKFLOW]);

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

  it("permissions は contents: read だけ（どの塊も）。id-token: write は deploy.yml・deploy-environment.yml の仕事の塊だけ", () => {
    for (const { name, source } of workflows) {
      const blocks = permissionBlocks(source);
      expect(blocks.length, `${name} に permissions がありません`).toBeGreaterThan(0);
      expect(blocks[0], `${name} のいちばん外の permissions`).toEqual(["contents: read"]);
      for (const block of blocks.slice(1)) {
        const allowed = DEPLOY_WORKFLOWS.has(name)
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

  it("uses: はすべて40桁の SHA で固定し、注釈に版の名前がある（リポジトリの中の部品 ./.github/actions/ と workflow ./.github/workflows/ は除く）", () => {
    for (const { name, source } of [...workflows, ...actions]) {
      for (const line of codeLines(source).filter((candidate) =>
        /^\s*-?\s*uses:/.test(candidate),
      )) {
        if (/uses:\s*\.\/\.github\/actions\/[\w-]+\s*$/.test(line)) continue;
        if (/uses:\s*\.\/\.github\/workflows\/[\w-]+\.yml\s*$/.test(line)) continue;
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

describe("deploy.yml・deploy-environment.yml：本番とステージングへのデプロイの守り（core-002・core-018・core-019。docs/rules/development-flow.md 5）", () => {
  const deploy = workflows.find(({ name }) => name === DEPLOY_WORKFLOW);
  const environment = workflows.find(({ name }) => name === DEPLOY_ENVIRONMENT_WORKFLOW);
  const code = codeLines(deploy?.source ?? "").join("\n");
  const environmentCode = codeLines(environment?.source ?? "").join("\n");
  /** 順番を見るため、呼ぶ側（時間帯の確かめ）→ 呼ばれる側（db:migrate → 新しい版）の順につないだもの。 */
  const all = `${code}\n${environmentCode}`;

  it("deploy.yml と deploy-environment.yml がある", () => {
    expect(deploy, `${DEPLOY_WORKFLOW} がありません`).toBeDefined();
    expect(environment, `${DEPLOY_ENVIRONMENT_WORKFLOW} がありません`).toBeDefined();
  });

  it("push で流れるのは main と develop だけで、paths で出すものが変わるファイルに絞る", () => {
    expect(code).toMatch(/push:\s*\n\s+branches:\s*\[main, develop\]\s*\n\s+paths:/);
    expect(code).toMatch(
      /if:\s*github\.ref == 'refs\/heads\/main' \|\| github\.ref == 'refs\/heads\/develop'/,
    );
    expect(code).toMatch(/- "\.github\/workflows\/deploy-environment\.yml"/);
  });

  it("いつもステージングに先に出し、本番は main のときだけ・ステージングが成功したあと（GitHub の環境 production の承認のあと）", () => {
    expect(squash(code)).toContain(
      squash("uses: ./.github/workflows/deploy-environment.yml with: environment: staging"),
    );
    expect(squash(code)).toContain(
      squash(
        "production: needs: [staging, wake-db] if: >- !cancelled() && github.ref == 'refs/heads/main' && needs.staging.result == 'success'",
      ),
    );
    expect(squash(code)).toContain(
      squash("uses: ./.github/workflows/deploy-environment.yml with: environment: production"),
    );
    expect(environmentCode).toMatch(/environment:\s*\$\{\{ inputs\.environment \}\}/);
    expect(environmentCode).toMatch(/workflow_call:/);
  });

  it("環境の変数（デプロイの身分・サービス・job・イメージの置き場所）がなければ止め、イメージは環境ごとの置き場所に押し込み digest で出す", () => {
    expect(environmentCode).toMatch(
      /for name in [^\n]*\bGCP_DEPLOYER_SA\b[^\n]*\bSERVICE\b[^\n]*\bMIGRATE_JOB\b[^\n]*\bIMAGE_REPOSITORY\b[^\n]*\bAPP_NAME\b/,
    );
    expect(environmentCode).toMatch(
      /IMAGE:\s*\$\{\{ vars\.IMAGE_REPOSITORY \}\}:\$\{\{ github\.sha \}\}/,
    );
    expect(environmentCode).toMatch(
      /gcloud run jobs update "\$MIGRATE_JOB" --image="\$IMAGE_DIGEST"/,
    );
    expect(environmentCode).toMatch(
      /gcloud run services update "\$SERVICE" --image="\$IMAGE_DIGEST"/,
    );
    expect(all).not.toMatch(/vars\.APP_NAME \|\|/);
  });

  it("デプロイはブランチごと・環境ごとに1つずつで、流れているものを取り消さない（DB の変更の途中で止めない）", () => {
    expect(code).toMatch(
      /concurrency:\s*\n\s+group:\s*deploy-\$\{\{ github\.ref_name \}\}\s*\n\s+cancel-in-progress:\s*false/,
    );
    expect(environmentCode).toMatch(
      /concurrency:\s*\n\s+group:\s*deploy-environment-\$\{\{ inputs\.environment \}\}\s*\n\s+cancel-in-progress:\s*false/,
    );
  });

  it("GCP へは WIF で入り、鍵（credentials_json）を使わない", () => {
    expect(environmentCode).toMatch(/uses:\s*google-github-actions\/auth@/);
    expect(environmentCode).toMatch(/workload_identity_provider:/);
    expect(all).not.toMatch(/credentials_json/);
  });

  it("日本時間の時間帯を確かめてから、db:migrate → 新しい版の順に出す", () => {
    const hour = all.indexOf("TZ=Asia/Tokyo");
    const migrate = all.indexOf("gcloud run jobs execute");
    const release = all.indexOf("gcloud run services update");
    expect(hour, "時間帯の確かめがありません").toBeGreaterThanOrEqual(0);
    expect(migrate, "db:migrate の job を動かしていません").toBeGreaterThan(hour);
    expect(environmentCode).toMatch(/gcloud run jobs execute[^\n]*--wait/);
    expect(release, "新しい版を db:migrate のあとに出していません").toBeGreaterThan(migrate);
    expect(squash(code)).toContain(squash("staging: needs: [prepare, wake-db]"));
  });

  it("承認のあと（本番の仕事の中）でも、コンテナを作る前と DB の変更の直前に時間を確かめる（承認が遅れて DB が止まる時刻に重ならないように）", () => {
    const guards = [...environmentCode.matchAll(/name: 時間の確かめ/g)].map(({ index }) => index);
    expect(guards, "時間の確かめが2つありません").toHaveLength(2);
    const [beforeBuild = -1, beforeMigrate = -1] = guards;
    expect(beforeBuild).toBeLessThan(environmentCode.indexOf("docker build"));
    expect(beforeMigrate).toBeGreaterThan(environmentCode.indexOf("docker build"));
    expect(beforeMigrate).toBeLessThan(environmentCode.indexOf("gcloud run jobs execute"));
    expect(environmentCode).toMatch(/LAST_MINUTE: "1395"/);
    expect(environmentCode).toMatch(/LAST_MINUTE: "1420"/);
    expect(environmentCode).toMatch(/STOP_AT: \$\{\{ inputs\.stop_at \}\}/);
  });

  it("始まってよいのは日本時間の8時15分〜23時だけ（8時に起こした DB の起動と、0時の停止までの余裕）", () => {
    expect(code).toMatch(/"\$minutes" -lt \$\(\(8 \* 60 \+ 15\)\)/);
    expect(code).toMatch(/"\$minutes" -ge \$\(\(23 \* 60\)\)/);
    expect(environmentCode).toMatch(/timeout-minutes:\s*30\b/);
  });

  it("夜に DB を起こして出すのは main だけ・0時〜7時45分だけで、起こしたときは取り消しても必ず止め直す（7時45分を過ぎていたら止めない）", () => {
    expect(code).toMatch(/"\$minutes" -ge \$\(\(7 \* 60 \+ 45\)\)/);
    expect(code).toMatch(/if \[ "\$REF" != "refs\/heads\/main" \]; then/);
    expect(code).toMatch(/--activation-policy=ALWAYS/);
    expect(squash(code)).toContain(
      squash(
        "stop-db: needs: [prepare, wake-db] if: always() && needs.wake-db.outputs.was_stopped == 'true'",
      ),
    );
    const stopJob = code.slice(code.indexOf("stop-db:"));
    expect(stopJob, "DB を止め直していません").toMatch(/--activation-policy=NEVER/);
    expect(squash(stopJob)).toContain(squash("name: 止め直す時刻まで待つ if: ${{ !cancelled() }}"));
    expect(squash(stopJob)).toContain(
      squash("name: DB を止め直す（7時45分より前だけ） if: always()"),
    );
    expect(code).toMatch(/if \[ "\$keep" -gt 90 \]; then keep=90; fi/);
  });

  it("DB を起こす・止めるのは main だけの専用の身分（GCP_DB_WAKER_SA）で、デプロイの身分では触らない", () => {
    const wakeJobs = code.slice(code.indexOf("wake-db:"), code.indexOf("staging:"));
    const stopJob = code.slice(code.indexOf("stop-db:"));
    for (const job of [wakeJobs, stopJob]) {
      expect(job).toMatch(/service_account: \$\{\{ vars\.GCP_DB_WAKER_SA \}\}/);
      expect(job).not.toMatch(/GCP_DEPLOYER_SA/);
      expect(job).not.toMatch(/environment:/);
    }
    expect(environmentCode).not.toMatch(/activation-policy/);
  });

  it("LIFF_ID が空ならコンテナを作る前に止め（仮の LIFF の画面を出さない）、APP_NAME を組み立てに渡す", () => {
    const check = environmentCode.indexOf("for name in");
    const build = environmentCode.indexOf("docker build");
    expect(check, "変数を確かめていません").toBeGreaterThanOrEqual(0);
    expect(environmentCode.slice(check, environmentCode.indexOf("\n", check))).toMatch(
      /\bLIFF_ID\b/,
    );
    expect(build).toBeGreaterThan(check);
    expect(environmentCode).toMatch(/docker build[^\n]*--build-arg VITE_LIFF_ID="\$LIFF_ID"/);
    expect(environmentCode).toMatch(/docker build[^\n]*--build-arg APP_NAME="\$APP_NAME"/);
  });
});
