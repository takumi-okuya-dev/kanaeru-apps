// pnpm security:audit：依存の既知の脆弱性を確かめる。
// pnpm audit --prod --json と --dev --json を読み、例外の一覧（security/audit-exceptions.json）を当てる。
// 本番に入る依存の high・critical（例外でない・期限切れ）で 1。moderate・low と開発の道具だけの依存は出すだけ。
// 確かめられないとき（通信ができない・pnpm audit の終わり方や応答の形が合わない）：CI があれば 1、
// なければ「確かめられませんでした」と出して 0（pnpm check を落とさないが、通ったとは言わない）。
// 開発の道具だけの依存（--dev）を確かめられなくても、本番の依存の止める指摘は捨てずに出して 1。
// 「今日」は日本の時刻（Asia/Tokyo）の日付で決める（例外の期限の日の 0 時〜24 時を日本の時刻で数える）。
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "./repo-root.ts";

/** 例外の一覧のファイル。 */
export const EXCEPTIONS_PATH = "security/audit-exceptions.json";

/** 例外の期限の上限（日）。 */
export const MAX_EXCEPTION_DAYS = 90;

/** 止める重さ。 */
const BLOCKING = new Set(["high", "critical"]);

/** 依存の例外。 */
export type AuditException = {
  /** 指摘の番号（GHSA） */
  id: string;
  /** 依存の名前 */
  package: string;
  /** 理由（空にしない） */
  reason: string;
  /** 足した日（YYYY-MM-DD） */
  addedOn: string;
  /** 期限（addedOn から90日以内） */
  expiresOn: string;
};

/** 1つの指摘。 */
export type Advisory = {
  /** 指摘の番号（GHSA） */
  id: string;
  /** 依存の名前 */
  package: string;
  /** 見つかった版 */
  versions: string[];
  /** 重さ（info・low・moderate・high・critical） */
  severity: string;
  /** 直る版（なければ空） */
  patched: string;
};

/** pnpm audit を流した結果。offline＝流せない・応答がない、bad-response＝終わり方か応答の形が合わない。 */
export type AuditRun =
  | { ok: true; advisories: Advisory[] }
  | { ok: false; reason: "offline" | "bad-response"; detail: string };

/** 確かめの結果。 */
export type AuditResult = {
  /** passed＝止める指摘なし・failed＝止める指摘か例外の一覧の誤り・unchecked＝確かめられない（通信ができない・応答が合わない） */
  status: "passed" | "failed" | "unchecked";
  /** 手順の終わり方 */
  exitCode: number;
  /** 出す文（日本語） */
  lines: string[];
  /** 止める指摘 */
  blocking: Advisory[];
};

/**
 * 日付（YYYY-MM-DD）を、その日の 0 時（UTC）のミリ秒にする。
 * @param date 日付
 * @returns ミリ秒（形が合わなければ NaN）
 */
function dayOf(date: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;
}

/** 1日のミリ秒。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 日本の時刻（Asia/Tokyo）での、その時の日付。
 * @param now 時刻
 * @returns 日付（YYYY-MM-DD）
 */
export function tokyoDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * 例外の一覧を確かめる。合わない一覧は誤りとして返す（止める）。
 * @param raw 読んだ JSON
 * @returns 例外と、誤りの文
 */
export function validateExceptions(raw: unknown): {
  exceptions: AuditException[];
  errors: string[];
} {
  if (!Array.isArray(raw)) {
    return { exceptions: [], errors: [`${EXCEPTIONS_PATH} は並び（[ ... ]）にしてください。`] };
  }
  const errors: string[] = [];
  const seen = new Set<string>();
  const exceptions = raw.map((entry) => entry as Partial<AuditException>);
  exceptions.forEach((entry, index) => {
    const where = `${EXCEPTIONS_PATH} の ${index + 1} 番目`;
    if (!entry.id || !/^GHSA-[\w-]+$/.test(entry.id))
      errors.push(`${where}：id を GHSA の番号にしてください。`);
    else if (seen.has(entry.id)) errors.push(`${where}：id ${entry.id} が重なっています。`);
    else seen.add(entry.id);
    if (!entry.package) errors.push(`${where}：package（依存の名前）を入れてください。`);
    if (!entry.reason?.trim()) errors.push(`${where}：reason（理由）を空にしないでください。`);
    const added = dayOf(entry.addedOn ?? "");
    const expires = dayOf(entry.expiresOn ?? "");
    if (Number.isNaN(added) || Number.isNaN(expires)) {
      errors.push(`${where}：addedOn と expiresOn を YYYY-MM-DD にしてください。`);
    } else if (expires < added || expires - added > MAX_EXCEPTION_DAYS * DAY_MS) {
      errors.push(
        `${where}：expiresOn は addedOn から ${MAX_EXCEPTION_DAYS} 日以内にしてください。`,
      );
    }
  });
  return { exceptions: errors.length === 0 ? (exceptions as AuditException[]) : [], errors };
}

/**
 * pnpm audit --json の出力（pnpm 12 の形）を読む。
 * @param json 出力
 * @returns 指摘
 * @throws {SyntaxError} JSON でないとき
 * @throws {Error} 形が合わないとき（error の欄がある・advisories か metadata.vulnerabilities がない）
 */
export function parseAuditJson(json: string): Advisory[] {
  const report = JSON.parse(json) as {
    error?: { code?: string };
    metadata?: { vulnerabilities?: unknown };
    advisories?: Record<
      string,
      {
        github_advisory_id?: string;
        id?: number;
        module_name?: string;
        severity?: string;
        patched_versions?: string;
        findings?: { version?: string }[];
      }
    >;
  };
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("応答が JSON の物でありません");
  }
  if (report.error !== undefined) {
    throw new Error(report.error.code ?? "応答に error の欄があります");
  }
  if (
    typeof report.advisories !== "object" ||
    report.advisories === null ||
    typeof report.metadata?.vulnerabilities !== "object"
  ) {
    throw new Error("応答に advisories か metadata.vulnerabilities がありません");
  }
  return Object.values(report.advisories).map((advisory) => ({
    id: advisory.github_advisory_id ?? String(advisory.id ?? ""),
    package: advisory.module_name ?? "",
    versions: [
      ...new Set((advisory.findings ?? []).map((finding) => finding.version ?? "")),
    ].filter(Boolean),
    severity: advisory.severity ?? "",
    patched:
      advisory.patched_versions && advisory.patched_versions !== "<0.0.0"
        ? advisory.patched_versions
        : "",
  }));
}

/**
 * 止める指摘の文。
 * @param advisory 指摘
 * @returns 文
 */
export function formatBlocking(advisory: Advisory): string {
  return [
    `本番に入る依存に、重い既知の脆弱性があります：${advisory.package}@${advisory.versions.join("・") || "?"}（${advisory.id}・${advisory.severity}）`,
    `  直る版：${advisory.patched || "まだない"}。例外にするときは ${EXCEPTIONS_PATH} に理由と期限を書いて足してください。`,
  ].join("\n");
}

/**
 * 確かめられなかったときの文。
 * @param what 確かめられなかった物（例：「開発の道具だけの依存を」。空なら依存の全体）
 * @param run 流せなかった結果
 * @param run.reason 理由
 * @param run.detail 細かい理由
 * @returns 文
 */
function uncheckedLine(what: string, run: { reason: string; detail: string }): string {
  const why = run.reason === "bad-response" ? "pnpm audit の応答が合いません" : "通信ができません";
  return `${what || "依存の脆弱性を"}確かめられませんでした（${why}）${run.detail ? `：${run.detail}` : ""}`;
}

/**
 * 結果を決める。
 * @param input 本番・開発の依存の結果・例外の一覧・今日・CI かどうか
 * @param input.prod 本番の依存（--prod）の結果
 * @param input.dev 開発の道具だけの依存（--dev）の結果
 * @param input.exceptions 例外の一覧（読んだ JSON）
 * @param input.today 今日（YYYY-MM-DD）
 * @param input.ci CI の中か
 * @returns 結果
 */
export function evaluateAudit(input: {
  prod: AuditRun;
  dev: AuditRun;
  exceptions: unknown;
  today: string;
  ci: boolean;
}): AuditResult {
  const { exceptions, errors } = validateExceptions(input.exceptions);
  if (errors.length > 0) {
    return {
      status: "failed",
      exitCode: 1,
      lines: ["依存の例外の一覧が決まりに合いません：", ...errors.map((error) => `  ${error}`)],
      blocking: [],
    };
  }
  // 本番の依存を確かめられなければ、何も言えない（止める指摘があるかも分からない）
  if (!input.prod.ok) {
    const line = uncheckedLine("", input.prod);
    return input.ci
      ? { status: "failed", exitCode: 1, lines: [line, "  CI では落とします。"], blocking: [] }
      : {
          status: "unchecked",
          exitCode: 0,
          lines: [line, "  通ったとは扱いません。通信のできる所で、もう一度流してください。"],
          blocking: [],
        };
  }
  // 開発の道具だけの依存を確かめられなくても、本番の依存の結果は捨てない（止める指摘は出して 1）
  const dev = input.dev;

  const today = dayOf(input.today);
  const active = exceptions.filter((entry) => dayOf(entry.expiresOn) >= today);
  const expired = exceptions.filter((entry) => dayOf(entry.expiresOn) < today);
  const activeIds = new Set(active.map((entry) => entry.id));
  const lines: string[] = [];

  const blocking = input.prod.advisories.filter(
    (advisory) => BLOCKING.has(advisory.severity) && !activeIds.has(advisory.id),
  );
  lines.push(...blocking.map(formatBlocking));
  for (const entry of expired) {
    lines.push(
      `期限を過ぎた例外は、無いものとして扱います：${entry.id}（${entry.package}・期限 ${entry.expiresOn}）`,
    );
  }
  for (const advisory of input.prod.advisories.filter((item) => activeIds.has(item.id))) {
    lines.push(
      `例外として許しています：${advisory.package}（${advisory.id}・${advisory.severity}）`,
    );
  }
  for (const advisory of input.prod.advisories.filter((item) => !BLOCKING.has(item.severity))) {
    lines.push(
      `本番の依存の指摘（止めない）：${advisory.package}@${advisory.versions.join("・")}（${advisory.id}・${advisory.severity}）`,
    );
  }
  for (const advisory of dev.ok ? dev.advisories : []) {
    lines.push(
      `開発の道具の指摘（止めない）：${advisory.package}@${advisory.versions.join("・")}（${advisory.id}・${advisory.severity}）`,
    );
  }
  if (dev.ok) {
    // 開発の道具の指摘が分からないときは、例外を「消してよい」とは言わない
    const reported = new Set([...input.prod.advisories, ...dev.advisories].map((item) => item.id));
    for (const entry of exceptions.filter((item) => !reported.has(item.id))) {
      lines.push(`もう指摘に出ない例外は、消してよい：${entry.id}（${entry.package}）`);
    }
  }
  if (blocking.length === 0) lines.push("本番に入る依存に、止める既知の脆弱性はありません。");
  if (blocking.length > 0) {
    if (!dev.ok) lines.push(uncheckedLine("開発の道具だけの依存を", dev));
    return { status: "failed", exitCode: 1, lines, blocking };
  }
  if (!dev.ok) {
    // 本番に止める指摘はないが、開発の道具だけの依存は確かめられていない：通ったとは言わない
    const line = uncheckedLine("開発の道具だけの依存を", dev);
    return input.ci
      ? {
          status: "failed",
          exitCode: 1,
          lines: [line, "  CI では落とします。", ...lines],
          blocking,
        }
      : {
          status: "unchecked",
          exitCode: 0,
          lines: [
            line,
            "  通ったとは扱いません。通信のできる所で、もう一度流してください。",
            ...lines,
          ],
          blocking,
        };
  }
  return { status: "passed", exitCode: 0, lines, blocking };
}

/**
 * pnpm audit の終わり方と出力を読む。pnpm audit は、指摘がないと 0、指摘があると 1 で終わる。
 * 次のときは確かめられないものとして扱う：JSON でない・形が合わない（error の欄・advisories がない）・
 * 終わり方が 0 と 1 のほか・1 なのに指摘がない（error の物を空の指摘と取り違えないため）。
 * @param status 終わり方（流せなかったときは null）
 * @param stdout 標準の出力
 * @param stderr 標準のエラーの出力
 * @returns 結果
 */
export function interpretAuditOutput(
  status: number | null,
  stdout: string,
  stderr: string,
): AuditRun {
  const code = /ERR_PNPM_[A-Z_]+/.exec(stderr)?.[0];
  if (stdout.trim() === "") {
    // pnpm 12 は、通信ができないと ERR_PNPM_AUDIT_BAD_RESPONSE を出し、標準の出力は空になる
    return { ok: false, reason: "offline", detail: code ?? "応答がありません" };
  }
  let advisories: Advisory[];
  try {
    advisories = parseAuditJson(stdout);
  } catch (error) {
    const message =
      error instanceof SyntaxError
        ? "応答が JSON でありません"
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, reason: "bad-response", detail: code ?? message };
  }
  if (status === 0 || (status === 1 && advisories.length > 0)) return { ok: true, advisories };
  return {
    ok: false,
    reason: "bad-response",
    detail: code ?? `終わり方が ${status ?? "なし"}（指摘 ${advisories.length} 件）`,
  };
}

/**
 * pnpm audit を流して読む。
 * @param scope --prod か --dev
 * @returns 結果
 */
export function runPnpmAudit(scope: "--prod" | "--dev"): Promise<AuditRun> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["audit", scope, "--json"], { cwd: REPO_ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error) => resolve({ ok: false, reason: "offline", detail: error.message }));
    child.on("close", (status) => resolve(interpretAuditOutput(status, stdout, stderr)));
  });
}

/**
 * 依存の確かめを流す（レポートからも呼ぶ）。
 * @param options 今日と CI かどうか（既定は今の時刻と環境の値 CI）
 * @param options.today 今日（YYYY-MM-DD）
 * @param options.ci CI の中か
 * @returns 結果
 */
export async function checkDependencies(
  options: { today?: string; ci?: boolean } = {},
): Promise<AuditResult> {
  const [prod, dev] = await Promise.all([runPnpmAudit("--prod"), runPnpmAudit("--dev")]);
  const exceptions = JSON.parse(readFileSync(join(REPO_ROOT, EXCEPTIONS_PATH), "utf8")) as unknown;
  return evaluateAudit({
    prod,
    dev,
    exceptions,
    today: options.today ?? tokyoDate(new Date()),
    ci: options.ci ?? Boolean(process.env.CI),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = await checkDependencies();
  const print = result.exitCode === 0 ? console.log : console.error;
  for (const line of result.lines) print(line);
  process.exitCode = result.exitCode;
}
