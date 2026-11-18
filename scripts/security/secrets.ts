// pnpm security:secrets：作業の木のファイル（コミットしない物を除く）の秘密の値を、gitleaks で確かめる。
// gitleaks dir は1つの道しか受け取らず、.gitignore を読まないので、`git ls-files --cached --others --exclude-standard`
// のファイル（消したもの・シンボリックリンクを除く。コミットしていない変更を含む今の中身）を一時の場所に写し、そこだけを確かめる
// （組み立ての結果・テストの報告・.env などコミットしない物を読まない）。
// 見つけた値は gitleaks の --redact で伏せ、文にも入れない。
import { spawnSync } from "node:child_process";
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "./repo-root.ts";

/** gitleaks の最低の版（CI の GITLEAKS_VERSION と同じ）。 */
export const MIN_GITLEAKS_VERSION = "8.30.1";

/** gitleaks の見つけ物（JSON の報告の使う所だけ）。 */
export type GitleaksFinding = {
  /** 規則の名前 */
  RuleID: string;
  /** ファイル（ルートからの道） */
  File: string;
  /** 行 */
  StartLine: number;
  /** 指紋（.gitleaksignore に書く形） */
  Fingerprint?: string;
};

/** 外の命令を流した結果。 */
export type CommandResult = {
  /** 終わり方（流せなかったときは null） */
  status: number | null;
  /** 標準の出力 */
  stdout: string;
  /** 標準のエラーの出力 */
  stderr: string;
  /** 流せなかったとき（命令がないなど）の理由 */
  error?: NodeJS.ErrnoException;
};

/** 外の命令を流す関数（テストで差しかえる）。cwd を渡さなければ、リポジトリのルートで流す。 */
export type RunCommand = (
  command: string,
  args: readonly string[],
  options?: { cwd?: string },
) => CommandResult;

/** 確かめの結果。 */
export type SecretsResult = {
  /** passed＝見つからない・failed＝見つけた・tool-missing＝gitleaks がない・tool-old＝版が古い */
  status: "passed" | "failed" | "tool-missing" | "tool-old";
  /** 見つけ物（コミットするファイルの分だけ） */
  findings: GitleaksFinding[];
  /** 出す文（日本語。値は入れない） */
  messages: string[];
};

/**
 * 外の命令を流す（既定はリポジトリのルートで）。
 * @param command 命令
 * @param args 引数
 * @param options 流す場所
 * @returns 結果
 */
export const runCommand: RunCommand = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error ? { error: result.error } : {}),
  };
};

/**
 * 版の文字（v8.30.1・8.30.1 など）から、数の並びを読む。
 * @param text gitleaks version の出力
 * @returns 版（読めなければ undefined）
 */
export function parseVersion(text: string): string | undefined {
  return /(\d+)\.(\d+)\.(\d+)/.exec(text)?.[0];
}

/**
 * 2つの版を比べる。
 * @param a 版
 * @param b 版
 * @returns a が古ければ負、同じなら 0、新しければ正
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * gitleaks がないときの文。
 * @returns 文
 */
export function installMessage(): string {
  return [
    "gitleaks が入っていません。秘密の値を確かめられないので止めます。",
    `  mac：brew install gitleaks（版は ${MIN_GITLEAKS_VERSION} 以上）。ほかは https://github.com/gitleaks/gitleaks/releases から入れてください。`,
  ].join("\n");
}

/**
 * 見つけ物の文。値は入れない。
 * @param finding 見つけ物
 * @returns 文
 */
export function formatFinding(finding: GitleaksFinding): string {
  return [
    `秘密の値に見える文字があります：${finding.File} の ${finding.StartLine} 行目（規則：${finding.RuleID}）`,
    "  値は伏せています。本物の鍵なら、まず鍵を止めて作り直してください。",
    "  見間違いなら、.gitleaks.toml か .gitleaksignore に理由を書いて足してください。",
  ].join("\n");
}

/**
 * ふつうのファイルとしてあるか（消したファイル・シンボリックリンク・フォルダは false）。
 * @param path ルートからの道
 * @returns ふつうのファイルなら true
 */
function isRegularFile(path: string): boolean {
  const full = join(REPO_ROOT, path);
  return existsSync(full) && lstatSync(full).isFile();
}

/**
 * `git ls-files --cached --others --exclude-standard -z` の出力から、確かめるファイルを選ぶ（消したファイル・シンボリックリンクは除く）。
 * @param output git の出力（NUL 区切り）
 * @param exists ふつうのファイルとしてあるか（テストで差しかえる）
 * @returns ルートからのファイルの道
 */
export function selectFiles(
  output: string,
  exists: (path: string) => boolean = isRegularFile,
): Set<string> {
  return new Set(
    output
      .split("\0")
      .map((path) => path.trim())
      .filter((path) => path.length > 0 && exists(path)),
  );
}

/** 確かめるファイルを並べた一時の場所。 */
export type ScanDir = {
  /** 一時の場所の道 */
  path: string;
  /** 片付ける */
  cleanup: () => void;
};

/**
 * 確かめるファイルだけを、一時の場所に同じ道で写す（APFS などでは中身を複製せずに写す）。
 * @param files ルートからのファイルの道
 * @param root 写す元（リポジトリのルート）
 * @returns 一時の場所
 */
export function stageFiles(files: ReadonlySet<string>, root: string = REPO_ROOT): ScanDir {
  const path = mkdtempSync(join(tmpdir(), "security-secrets-"));
  for (const file of files) {
    const target = join(path, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, file), target, constants.COPYFILE_FICLONE);
  }
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

/**
 * 作業の木の秘密の値を確かめる。
 * @param run 外の命令を流す関数
 * @param exists ふつうのファイルとしてあるか
 * @param stage 確かめるファイルを一時の場所に写す関数（テストで差しかえる）
 * @returns 結果
 */
export function checkSecretsTree(
  run: RunCommand = runCommand,
  exists?: (path: string) => boolean,
  stage: (files: ReadonlySet<string>) => ScanDir = stageFiles,
): SecretsResult {
  const version = run("gitleaks", ["version"]);
  if (version.error || version.status !== 0) {
    return { status: "tool-missing", findings: [], messages: [installMessage()] };
  }
  const current = parseVersion(version.stdout);
  if (!current || compareVersions(current, MIN_GITLEAKS_VERSION) < 0) {
    return {
      status: "tool-old",
      findings: [],
      messages: [
        `gitleaks の版が古いため止めます（今：${current ?? "不明"}・要る版：${MIN_GITLEAKS_VERSION} 以上）。brew upgrade gitleaks で新しくしてください。`,
      ],
    };
  }

  const listed = run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  if (listed.status !== 0) {
    throw new Error(`git ls-files を流せませんでした：${listed.stderr.trim()}`);
  }
  const files = selectFiles(listed.stdout, exists);

  const dir = stage(files);
  let scan: CommandResult;
  try {
    scan = run(
      "gitleaks",
      [
        "dir",
        ".",
        "--redact",
        "--no-banner",
        "--log-level",
        "error",
        "--config",
        join(REPO_ROOT, ".gitleaks.toml"),
        "--gitleaks-ignore-path",
        REPO_ROOT,
        "--exit-code",
        "0",
        "--report-format",
        "json",
        "--report-path",
        "-",
      ],
      { cwd: dir.path },
    );
  } finally {
    dir.cleanup();
  }
  if (scan.status !== 0) {
    throw new Error(`gitleaks を流せませんでした：${scan.stderr.trim().split("\n")[0] ?? ""}`);
  }
  const all = JSON.parse(scan.stdout.trim() || "[]") as GitleaksFinding[];
  const findings = all.filter((finding) => files.has(finding.File.replace(/^\.\//, "")));
  return findings.length === 0
    ? { status: "passed", findings, messages: [] }
    : { status: "failed", findings, messages: findings.map(formatFinding) };
}

/**
 * 結果から、手順の終わり方を決める。
 * @param result 結果
 * @returns 終わり方（見つけた・道具がない・古い → 1）
 */
export function exitCodeOf(result: SecretsResult): number {
  return result.status === "passed" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = checkSecretsTree();
  for (const message of result.messages) console.error(message);
  if (result.status === "passed") console.log("作業の木に、秘密の値は見つかりませんでした。");
  process.exitCode = exitCodeOf(result);
}
