// pnpm db:check（scripts/db/check-migrations.ts）の確かめ。
// 一時のフォルダに仮の DB の変更の記録を作り、drizzle-kit は差しかえて流す（本物は呼ばない）。
// 本物の drizzle-kit を一時の設定で流す形（runDrizzleKit）は、quickstart の 3 で手で確かめる。
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkJournal, checkMigrations } from "../../scripts/db/check-migrations.ts";
import type { CommandResult, RunDrizzleKit } from "../../scripts/db/check-migrations.ts";

/** 作った一時のフォルダ（あとで消す）。 */
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 仮の記録の1行。 */
type Entry = { idx: number; when: number; tag: string };

/**
 * 仮の DB の変更のフォルダを作る。
 * @param entries 記録の行
 * @param sqlFiles 置く SQL のファイルの名前（省くと記録の tag の分だけ）
 * @returns フォルダ
 */
function makeDrizzleDir(entries: Entry[], sqlFiles?: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "kanaeru-db-test-"));
  created.push(dir);
  mkdirSync(join(dir, "meta"));
  const journal = {
    version: "7",
    dialect: "postgresql",
    entries: entries.map((e) => ({ ...e, version: "7", breakpoints: true })),
  };
  writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify(journal));
  for (const name of sqlFiles ?? entries.map((e) => `${e.tag}.sql`)) {
    writeFileSync(join(dir, name), "SELECT 1;\n");
  }
  return dir;
}

/** 正しい記録の行。 */
const GOOD: Entry[] = [
  { idx: 0, when: 100, tag: "0000_a" },
  { idx: 1, when: 200, tag: "0001_b" },
];

/**
 * 道具の結果を作る。
 * @param status 終わり方
 * @param stdout 標準の出力
 * @returns 結果
 */
function result(status: number | null, stdout = ""): CommandResult {
  return { status, stdout, stderr: "" };
}

describe("checkJournal", () => {
  it("正しい記録は通る", () => {
    expect(checkJournal(makeDrizzleDir(GOOD))).toEqual([]);
  });

  it("時刻（when）が前より古い・同じ変更を止める", () => {
    const problems = checkJournal(
      makeDrizzleDir([
        { idx: 0, when: 200, tag: "0000_a" },
        { idx: 1, when: 100, tag: "0001_b" },
        { idx: 2, when: 100, tag: "0002_c" },
      ]),
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("0001_b");
    expect(problems[1]).toContain("0002_c");
  });

  it("idx の飛びを止める", () => {
    const problems = checkJournal(
      makeDrizzleDir([
        { idx: 0, when: 100, tag: "0000_a" },
        { idx: 2, when: 200, tag: "0002_c" },
      ]),
    );
    expect(problems.join("\n")).toContain("idx が 2");
  });

  it("記録にある SQL がない・記録にない SQL があるときを止める", () => {
    const problems = checkJournal(makeDrizzleDir(GOOD, ["0000_a.sql", "0002_extra.sql"]));
    expect(problems.join("\n")).toContain("0001_b.sql がありません");
    expect(problems.join("\n")).toContain("0002_extra.sql が記録");
  });

  it.each([["{}"], ['{"version":"7"}'], ['{"entries":[{"idx":0,"when":1}]}'], ["null"]])(
    "記録の形が違う（%s）ときは、落ちずに理由を出す",
    (json) => {
      const dir = makeDrizzleDir(GOOD);
      writeFileSync(join(dir, "meta", "_journal.json"), json);
      expect(checkJournal(dir)).toEqual([expect.stringContaining("形が違います")]);
    },
  );

  it("記録がない・読めないときを止める", () => {
    const dir = makeDrizzleDir(GOOD);
    writeFileSync(join(dir, "meta", "_journal.json"), "{");
    expect(checkJournal(dir)[0]).toContain("読めません");
    rmSync(join(dir, "meta", "_journal.json"));
    expect(checkJournal(dir)[0]).toContain("ありません");
  });
});

describe("checkMigrations", () => {
  it("何も変わらなければ通り、check と generate を1度ずつ、本物でなく写しに対して流す", () => {
    const dir = makeDrizzleDir(GOOD);
    const calls: string[] = [];
    const run: RunDrizzleKit = (command, workDir) => {
      calls.push(command);
      expect(workDir).not.toBe(dir);
      expect(readdirSync(workDir).sort()).toEqual(readdirSync(dir).sort());
      return result(0);
    };
    expect(checkMigrations({ drizzleDir: dir, run })).toEqual({ ok: true, messages: [] });
    expect(calls).toEqual(["check", "generate"]);
  });

  it("generate がファイルを作ったら作り忘れとして落ち、本物のフォルダは変えない", () => {
    const dir = makeDrizzleDir(GOOD);
    const journalBefore = readFileSync(join(dir, "meta", "_journal.json"), "utf8");
    let workRoot = "";
    const run: RunDrizzleKit = (command, workDir) => {
      workRoot = join(workDir, "..");
      if (command === "generate") {
        writeFileSync(join(workDir, "0002_new.sql"), "ALTER TABLE x ADD y int;\n");
        writeFileSync(join(workDir, "meta", "_journal.json"), "{}");
      }
      return result(0);
    };
    const outcome = checkMigrations({ drizzleDir: dir, run });
    expect(outcome.ok).toBe(false);
    expect(outcome.messages[0]).toContain("作り忘れ");
    expect(outcome.messages[0]).toContain("0002_new.sql");
    expect(existsSync(join(dir, "0002_new.sql"))).toBe(false);
    expect(readFileSync(join(dir, "meta", "_journal.json"), "utf8")).toBe(journalBefore);
    expect(existsSync(workRoot)).toBe(false);
  });

  it("drizzle-kit check が落ちたら、理由と作り直しの手順を出す", () => {
    const run: RunDrizzleKit = (command) =>
      command === "check" ? result(1, "snapshots collide") : result(0);
    const outcome = checkMigrations({ drizzleDir: makeDrizzleDir(GOOD), run });
    expect(outcome.ok).toBe(false);
    expect(outcome.messages[0]).toContain("snapshots collide");
    expect(outcome.messages[0]).toContain("git checkout origin/develop -- apps/api/drizzle");
  });

  it("generate が時間切れなら、付け替えの答え方を出し、本物のフォルダは変えない", () => {
    const dir = makeDrizzleDir(GOOD);
    const run: RunDrizzleKit = (command, workDir) => {
      if (command === "generate") writeFileSync(join(workDir, "0002_half.sql"), "");
      return command === "generate" ? result(null) : result(0);
    };
    const outcome = checkMigrations({ drizzleDir: dir, run });
    expect(outcome.ok).toBe(false);
    expect(outcome.messages[0]).toContain("付け替え");
    expect(existsSync(join(dir, "0002_half.sql"))).toBe(false);
  });

  it("記録の誤りと、道具の結果をまとめて出す", () => {
    const dir = makeDrizzleDir([
      { idx: 0, when: 200, tag: "0000_a" },
      { idx: 1, when: 100, tag: "0001_b" },
    ]);
    const outcome = checkMigrations({ drizzleDir: dir, run: () => result(0) });
    expect(outcome.ok).toBe(false);
    expect(outcome.messages).toHaveLength(1);
  });
});
