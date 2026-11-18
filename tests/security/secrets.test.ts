// pnpm security:secrets（scripts/security/secrets.ts）の確かめ。
// gitleaks と git は差しかえて流す（本物の gitleaks は呼ばない）。見つけ物の見本に、鍵の形の文字は入れない。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_GITLEAKS_VERSION,
  checkSecretsTree,
  compareVersions,
  exitCodeOf,
  formatFinding,
  parseVersion,
  selectFiles,
  stageFiles,
} from "../../scripts/security/secrets.ts";
import type { CommandResult, RunCommand, ScanDir } from "../../scripts/security/secrets.ts";

/** 仮の値（伏せた値の代わり）。 */
const REDACTED = "REDACTED";

/**
 * 命令の結果を作る。
 * @param stdout 標準の出力
 * @param status 終わり方
 * @returns 結果
 */
function ok(stdout: string, status = 0): CommandResult {
  return { status, stdout, stderr: "" };
}

/**
 * gitleaks と git を差しかえる。
 * @param options 返す値
 * @param options.version gitleaks version の出力（undefined なら gitleaks がない）
 * @param options.files git ls-files のファイル
 * @param options.findings gitleaks の見つけ物
 * @returns 差しかえた関数と、呼ばれた命令
 */
function fakeRun(options: {
  version?: string;
  files: string[];
  findings: { RuleID: string; File: string; StartLine: number }[];
}): { run: RunCommand; calls: string[][]; cwds: (string | undefined)[] } {
  const calls: string[][] = [];
  const cwds: (string | undefined)[] = [];
  const run: RunCommand = (command, args, runOptions) => {
    calls.push([command, ...args]);
    cwds.push(runOptions?.cwd);
    if (command === "gitleaks" && args[0] === "version") {
      if (options.version === undefined) {
        return {
          status: null,
          stdout: "",
          stderr: "",
          error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
        };
      }
      return ok(options.version);
    }
    if (command === "git") return ok(options.files.map((file) => `${file}\0`).join(""));
    return ok(
      JSON.stringify(
        options.findings.map((finding) => ({ ...finding, Secret: REDACTED, Match: REDACTED })),
      ),
    );
  };
  return { run, calls, cwds };
}

/**
 * 一時の場所に写す関数を差しかえる（写さず、渡されたファイルと片付けたかを覚える）。
 * @returns 差しかえた関数と、覚えた中身
 */
function fakeStage(): {
  stage: (files: ReadonlySet<string>) => ScanDir;
  staged: string[][];
  cleaned: () => boolean;
} {
  const staged: string[][] = [];
  let cleaned = false;
  return {
    stage: (files) => {
      staged.push([...files]);
      return { path: "/tmp/fake-scan", cleanup: () => (cleaned = true) };
    },
    staged,
    cleaned: () => cleaned,
  };
}

describe("秘密の値の手順（secrets:tree）", () => {
  it("git ls-files の出力から、消したファイルを除いて選ぶ", () => {
    const files = selectFiles("a.ts\0deleted.ts\0dir/b.ts\0", (path) => path !== "deleted.ts");
    expect([...files]).toEqual(["a.ts", "dir/b.ts"]);
  });

  it("版を読み、比べる（最低の版より古いと止まる）", () => {
    expect(parseVersion("v8.30.1")).toBe("8.30.1");
    expect(parseVersion("8.30.1\n")).toBe("8.30.1");
    expect(compareVersions("8.29.9", MIN_GITLEAKS_VERSION)).toBeLessThan(0);
    expect(compareVersions(MIN_GITLEAKS_VERSION, MIN_GITLEAKS_VERSION)).toBe(0);
    expect(compareVersions("9.0.0", MIN_GITLEAKS_VERSION)).toBeGreaterThan(0);

    const { run } = fakeRun({ version: "8.18.0", files: [], findings: [] });
    const result = checkSecretsTree(run, () => true);
    expect(result.status).toBe("tool-old");
    expect(result.messages.join("\n")).toContain(MIN_GITLEAKS_VERSION);
    expect(exitCodeOf(result)).toBe(1);
  });

  it("gitleaks がないときは、入れ方（brew install gitleaks と最低の版）を出して 1", () => {
    const { run } = fakeRun({ files: [], findings: [] });
    const result = checkSecretsTree(run, () => true);
    expect(result.status).toBe("tool-missing");
    expect(result.messages.join("\n")).toContain("brew install gitleaks");
    expect(result.messages.join("\n")).toContain(MIN_GITLEAKS_VERSION);
    expect(exitCodeOf(result)).toBe(1);
  });

  it("コミットするファイルの見つけ物だけを出し（.gitignore の物は出さない）、--redact で流す", () => {
    const { run, calls } = fakeRun({
      version: `v${MIN_GITLEAKS_VERSION}`,
      files: ["apps/api/src/x.ts"],
      findings: [
        { RuleID: "generic-api-key", File: "apps/api/src/x.ts", StartLine: 12 },
        { RuleID: "generic-api-key", File: ".env", StartLine: 3 },
      ],
    });
    const result = checkSecretsTree(run, () => true, fakeStage().stage);
    expect(result.status).toBe("failed");
    expect(result.findings.map((finding) => finding.File)).toEqual(["apps/api/src/x.ts"]);
    expect(exitCodeOf(result)).toBe(1);
    const scan = calls.find((call) => call[0] === "gitleaks" && call[1] === "dir");
    expect(scan).toContain("--redact");
  });

  it("git ls-files のファイルだけを一時の場所に写し、そこで gitleaks を流して片付ける（組み立ての結果などを読まない）", () => {
    const { run, calls, cwds } = fakeRun({
      version: MIN_GITLEAKS_VERSION,
      files: ["a.ts", "dir/b.ts"],
      findings: [],
    });
    const { stage, staged, cleaned } = fakeStage();
    checkSecretsTree(run, () => true, stage);
    expect(staged).toEqual([["a.ts", "dir/b.ts"]]);
    const index = calls.findIndex((call) => call[0] === "gitleaks" && call[1] === "dir");
    expect(calls[index]?.[2]).toBe(".");
    expect(cwds[index]).toBe("/tmp/fake-scan");
    expect(cleaned()).toBe(true);
  });

  it("stageFiles は、渡したファイルだけを同じ道で写す（コミットしていない変更を含む今の中身）", () => {
    const root = mkdtempSync(join(tmpdir(), "secrets-root-"));
    try {
      for (const [file, body] of [
        ["a.ts", "a"],
        ["dir/b.ts", "b"],
        ["dist/out.js", "built"],
      ] as const) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), body);
      }
      const dir = stageFiles(new Set(["a.ts", "dir/b.ts"]), root);
      expect(readFileSync(join(dir.path, "dir/b.ts"), "utf8")).toBe("b");
      expect(existsSync(join(dir.path, "dist/out.js"))).toBe(false);
      dir.cleanup();
      expect(existsSync(dir.path)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("見つからなければ 0", () => {
    const { run } = fakeRun({ version: MIN_GITLEAKS_VERSION, files: ["a.ts"], findings: [] });
    const result = checkSecretsTree(run, () => true, fakeStage().stage);
    expect(result).toEqual({ status: "passed", findings: [], messages: [] });
    expect(exitCodeOf(result)).toBe(0);
  });

  it("見つけ物の文の形で、値を含まない", () => {
    const text = formatFinding({
      RuleID: "generic-api-key",
      File: "apps/api/src/x.ts",
      StartLine: 12,
    });
    expect(text.split("\n")[0]).toBe(
      "秘密の値に見える文字があります：apps/api/src/x.ts の 12 行目（規則：generic-api-key）",
    );
    expect(text).toContain("値は伏せています");
    expect(text).not.toContain(REDACTED);
  });
});
