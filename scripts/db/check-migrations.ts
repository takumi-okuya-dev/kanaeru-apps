// pnpm db:check：DB の変更（apps/api/drizzle）の確かめ（構成の決めごと AD-17。core-004 R5）。
// 1. 記録（meta/_journal.json）：形・idx が 0 から1つずつ増える・when が前より大きい・tag の SQL がある・記録にない SQL がない。
//    drizzle-orm 0.45 の当てる処理は when が古い変更を黙って飛ばし、drizzle-kit check はそれを止めないため、ここで止める。
// 2. drizzle-kit check：壊れた snapshot と、同じ親を指す2つの snapshot（並行のブランチの重なり）を止める。
// 3. 作り忘れ：drizzle-kit generate を流し、何かが作られれば作り忘れ。
// 2・3 は、drizzle のフォルダの一時の写しに対して流す（out だけを写しに向けた一時の設定を使う）。
// 本物のフォルダには一度も書かないので、途中で止めても（Ctrl-C）作業の木を汚さず、コミットしていない DB の変更も消さない。
// DB には接続しない（DATABASE_URL がどこにもなければ仮の値を渡す）。
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { REPO_ROOT } from "../security/repo-root.ts";

/** API のフォルダ（drizzle.config.ts がある所）。 */
export const API_DIR = join(REPO_ROOT, "apps/api");

/** DB の変更のフォルダ。 */
export const DRIZZLE_DIR = join(API_DIR, "drizzle");

/** 道具を待つ時間の上限（名前の付け替えを対話で聞かれて止まらないように）。 */
const COMMAND_TIMEOUT_MS = 60_000;

/** 道具の結果。 */
export type CommandResult = {
  /** 終わり方（時間切れ・起動できないときは null） */
  status: number | null;
  /** 標準の出力 */
  stdout: string;
  /** 標準のエラーの出力 */
  stderr: string;
};

/** drizzle-kit の命令を、DB の変更のフォルダの写し（workDir）に対して流す関数（テストで差しかえる）。 */
export type RunDrizzleKit = (command: "check" | "generate", workDir: string) => CommandResult;

/** 確かめの結果。 */
export type MigrationCheckResult = {
  /** 通ったか */
  ok: boolean;
  /** 落ちた理由と直し方（日本語） */
  messages: string[];
};

/** 記録の1行（使う所だけ）。 */
type JournalEntry = { idx: number; when: number; tag: string };

/** 作り直すときの手順（AD-17）。 */
const REGENERATE_HINT =
  "develop の側を取って作り直してください：git checkout origin/develop -- apps/api/drizzle → pnpm db:generate → 手元の DB を作り直す（番号・記録・snapshot は手で直さない）。";

/**
 * 記録の1行の形か。
 * @param value 読んだ値
 * @returns idx・when が数、tag が文字なら true
 */
function isJournalEntry(value: unknown): value is JournalEntry {
  const entry = value as Partial<JournalEntry> | null;
  return (
    typeof entry?.idx === "number" &&
    typeof entry.when === "number" &&
    typeof entry.tag === "string" &&
    entry.tag !== ""
  );
}

/**
 * 記録（meta/_journal.json）を確かめる。
 * @param drizzleDir DB の変更のフォルダ
 * @returns 落ちた理由（なければ空）
 */
export function checkJournal(drizzleDir: string): string[] {
  const journalPath = join(drizzleDir, "meta", "_journal.json");
  if (!existsSync(journalPath)) return [`DB の変更の記録がありません：${journalPath}`];
  let entries: unknown;
  try {
    entries = (JSON.parse(readFileSync(journalPath, "utf8")) as { entries?: unknown } | null)
      ?.entries;
  } catch {
    return [`DB の変更の記録（meta/_journal.json）が読めません。${REGENERATE_HINT}`];
  }
  if (!Array.isArray(entries) || !entries.every(isJournalEntry)) {
    return [
      `DB の変更の記録（meta/_journal.json）の形が違います（entries の各行に idx・when・tag が要る）。${REGENERATE_HINT}`,
    ];
  }
  const problems: string[] = [];
  entries.forEach((entry, index) => {
    if (entry.idx !== index) {
      problems.push(
        `記録の ${index + 1} 行目（${entry.tag}）の idx が ${entry.idx} です（${index} のはず）。${REGENERATE_HINT}`,
      );
    }
    const previous = entries[index - 1];
    if (previous && !(entry.when > previous.when)) {
      problems.push(
        `DB の変更 ${entry.tag} の時刻（when）が、前の ${previous.tag} より古いか同じです。このままだと当てるときに黙って飛ばされます。${REGENERATE_HINT}`,
      );
    }
    if (!existsSync(join(drizzleDir, `${entry.tag}.sql`))) {
      problems.push(`記録にある DB の変更 ${entry.tag}.sql がありません。${REGENERATE_HINT}`);
    }
  });
  const tags = new Set(entries.map((entry) => entry.tag));
  for (const file of readdirSync(drizzleDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (!tags.has(file.slice(0, -".sql".length))) {
      problems.push(
        `DB の変更 ${file} が記録（meta/_journal.json）にありません。手で足したファイルなら消し、pnpm db:generate で作り直してください。`,
      );
    }
  }
  return problems;
}

/**
 * フォルダの中のファイルと中身を読む（比べるため）。
 * @param dir フォルダ
 * @returns フォルダからの道 → 中身
 */
export function readTree(dir: string): Map<string, string> {
  const tree = new Map<string, string>();
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else tree.set(relative(dir, path), readFileSync(path, "utf8"));
    }
  };
  walk(dir);
  return tree;
}

/**
 * 2つの中身の違うファイルを並べる。
 * @param before 前
 * @param after 後
 * @returns 足された・消された・変わったファイル（道の順）
 */
export function changedFiles(before: Map<string, string>, after: Map<string, string>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}

/**
 * 道具の失敗を文にする。
 * @param label 何をしていたか
 * @param result 道具の結果
 * @returns 文
 */
function commandFailure(label: string, result: CommandResult): string {
  const output = `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-5).join("\n");
  if (result.status === null) {
    return `${label}が終わりませんでした（${COMMAND_TIMEOUT_MS / 1000}秒）。表や列の名前の付け替えは、手元で pnpm db:generate を流して答えてください。\n${output}`;
  }
  return `${label}が落ちました（終わり方 ${result.status}）。\n${output}`;
}

/**
 * DB の変更を確かめる（記録・drizzle-kit check・作り忘れ）。本物のフォルダには書かない。
 * @param options 確かめる所と、drizzle-kit を流す関数
 * @param options.drizzleDir DB の変更のフォルダ
 * @param options.run drizzle-kit を流す関数（写しに対して）
 * @returns 結果
 */
export function checkMigrations(options: {
  drizzleDir: string;
  run: RunDrizzleKit;
}): MigrationCheckResult {
  const { drizzleDir, run } = options;
  const messages = checkJournal(drizzleDir);

  const workRoot = mkdtempSync(join(tmpdir(), "kanaeru-db-check-"));
  try {
    const workDir = join(workRoot, "drizzle");
    cpSync(drizzleDir, workDir, { recursive: true });

    const check = run("check", workDir);
    if (check.status !== 0) {
      messages.push(`${commandFailure("drizzle-kit check", check)}\n${REGENERATE_HINT}`);
    }

    const before = readTree(workDir);
    const generate = run("generate", workDir);
    const changed = changedFiles(before, readTree(workDir));
    if (generate.status !== 0) {
      messages.push(
        commandFailure("DB の変更の作り忘れの確かめ（drizzle-kit generate）", generate),
      );
    } else if (changed.length > 0) {
      messages.push(
        `DB の変更を作り忘れています。表の定義（schema.ts）に合わせて pnpm db:generate を流し、できた SQL を読んでからコミットしてください。作られるはずのファイル：${changed.join("・")}`,
      );
    }
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
  return { ok: messages.length === 0, messages };
}

/**
 * DATABASE_URL が、drizzle.config.ts の読む所（環境の値か、ルートの .env）にあるか。
 * @returns あれば true
 */
function hasDatabaseUrl(): boolean {
  if (process.env.DATABASE_URL) return true;
  const envFile = join(REPO_ROOT, ".env");
  return existsSync(envFile) && Boolean(parseEnv(readFileSync(envFile, "utf8")).DATABASE_URL);
}

/**
 * 本物の drizzle-kit を API のフォルダで流す。out だけを写しに向けた一時の設定を、写しの隣に置いて使う
 * （標準入力は閉じ、時間の上限を置く）。
 * @param command drizzle-kit の命令
 * @param workDir DB の変更のフォルダの写し
 * @returns 結果
 */
export function runDrizzleKit(command: "check" | "generate", workDir: string): CommandResult {
  const configPath = join(workDir, "..", "drizzle.config.ts");
  // drizzle-kit check は out を「./」に続けて読むので、API のフォルダからの相対の道で書く
  const out = relative(API_DIR, workDir);
  writeFileSync(
    configPath,
    `import base from ${JSON.stringify(join(API_DIR, "drizzle.config.ts"))};\nexport default { ...base, out: ${JSON.stringify(out)} };\n`,
  );
  const env = { ...process.env };
  // drizzle.config.ts は DATABASE_URL を要る。check と generate は接続しないので、どこにもなければ仮の値を渡す
  if (!hasDatabaseUrl()) env.DATABASE_URL = "postgres://check@localhost:1/check";
  const result = spawnSync("pnpm", ["exec", "drizzle-kit", command, "--config", configPath], {
    cwd: API_DIR,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: COMMAND_TIMEOUT_MS,
  });
  return {
    status: result.error || result.signal ? null : result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = checkMigrations({ drizzleDir: DRIZZLE_DIR, run: runDrizzleKit });
  for (const message of result.messages) console.error(message);
  if (result.ok) console.log("DB の変更の記録・整合・作り忘れに、問題はありません。");
  process.exitCode = result.ok ? 0 : 1;
}
