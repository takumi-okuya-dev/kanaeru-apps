// 守りの規則と見た目の値の規則（eslint.config.js）が働くかの確かめ。
// わざと決まりを破る中身を、仮のファイルの道で lint にかけ、止まることと、正しい書き方は止まらないことを確かめる。
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/** リポジトリのルート。 */
const root = fileURLToPath(new URL("../..", import.meta.url));

/** 確かめる規則。 */
const RULES = new Set([
  "local/no-arbitrary-tailwind",
  "no-restricted-syntax",
  "no-restricted-imports",
  "no-restricted-properties",
  "no-eval",
  "no-new-func",
]);

/** 確かめる書き方。rule が null なら、どの規則でも止まらないこと。 */
const CASES: { label: string; file: string; code: string; rule: string | null }[] = [
  // 見た目の値（DESIGN.md Do's and Don'ts）
  {
    label: "画面の className に色の値を直接書く",
    file: "apps/web/src/features/alpha/Page.tsx",
    code: 'export const A = () => <div className="bg-[#2f5bb7] p-xs" />;',
    rule: "local/no-arbitrary-tailwind",
  },
  {
    label: "部品の cn に余白の値を直接書く（変わり目つき）",
    file: "packages/ui/src/components/x.tsx",
    code: 'import { cn } from "../lib/cn.ts";\nexport const x = cn("hover:p-[13px]");',
    rule: "local/no-arbitrary-tailwind",
  },
  {
    label: "任意の CSS の書き方（[color:red]）",
    file: "apps/web/src/features/alpha/Page.tsx",
    code: 'export const A = () => <div className={`[color:red] ${"x"}`} />;',
    rule: "local/no-arbitrary-tailwind",
  },
  {
    label: "tokens.css の名前と、変わり目の […]（aria-[current=page]: など）",
    file: "apps/web/src/features/alpha/Page.tsx",
    code: 'export const A = () => <a className="bg-primary p-xs aria-[current=page]:font-bold [&_svg]:shrink-0" />;',
    rule: null,
  },
  {
    label: "クラスでない文字の […] は見ない",
    file: "apps/web/src/features/alpha/Page.tsx",
    code: 'export const label = "メモ[1]";',
    rule: null,
  },
  // 技術の道具の包み（AD-18）
  {
    label: "技術の道具の包みから、約束の包み（業務）を読む",
    file: "packages/csv/src/x.ts",
    code: 'import { jstDate } from "@workspace/contracts/core";\nexport const x = jstDate;',
    rule: "no-restricted-imports",
  },
  {
    label: "技術の道具の包みから、アプリを読む",
    file: "packages/csv/src/x.ts",
    code: 'import { csvAttachment } from "../../../apps/api/src/kernel/http.ts";\nexport const x = csvAttachment;',
    rule: "no-restricted-imports",
  },
  {
    label: "新しい技術の道具の包みも同じく止まる（包みの名前を規則に足さなくてよい）",
    file: "packages/sometool/src/x.ts",
    code: 'import { jstDate } from "@workspace/contracts/core";\nexport const x = jstDate;',
    rule: "no-restricted-imports",
  },
  {
    label: "約束の包みは、約束の包みどうしを読める（技術の道具の規則をかけない）",
    file: "packages/contracts/src/alpha/x.ts",
    code: 'import { jstDate } from "@workspace/contracts/core";\nexport const x = jstDate;',
    rule: null,
  },
  {
    label: "技術の道具の包みの中の、同じ包みのファイルは読める",
    file: "packages/csv/src/x.ts",
    code: 'import { csvCell } from "./index.ts";\nexport const x = csvCell;',
    rule: null,
  },
  // 守りの規則
  {
    label: "HTML をそのまま差しこむ",
    file: "apps/web/src/features/alpha/Page.tsx",
    code: "export const A = (p: { h: string }) => <div dangerouslySetInnerHTML={{ __html: p.h }} />;",
    rule: "no-restricted-syntax",
  },
  {
    label: "画面で環境の値を読む",
    file: "apps/web/src/lib/x.ts",
    code: "export const key = process.env.SECRET;",
    rule: "no-restricted-syntax",
  },
  {
    label: "DB の命令を文字のつなぎで作る",
    file: "apps/api/src/modules/alpha/repository.ts",
    code: "export const f = (db: { query(s: string): void }, id: string) => db.query(`SELECT ${id}`);",
    rule: "no-restricted-syntax",
  },
  {
    label: "sql.raw",
    file: "apps/api/src/modules/alpha/repository.ts",
    code: 'import { sql } from "drizzle-orm";\nexport const q = (id: string) => sql.raw(id);',
    rule: "no-restricted-properties",
  },
  {
    label: "OS のコマンド",
    file: "apps/api/src/modules/alpha/run.ts",
    code: 'import { exec } from "node:child_process";\nexport { exec };',
    rule: "no-restricted-imports",
  },
  {
    label: "文字をコードとして動かす",
    file: "apps/api/src/modules/alpha/run.ts",
    code: 'export const f = () => eval("1");',
    rule: "no-eval",
  },
];

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    cwd: root,
    overrideConfig: [
      // 仮のファイルは tsconfig にないので、型の情報を作らない
      { languageOptions: { parserOptions: { projectService: false, project: null } } },
    ],
    ruleFilter: ({ ruleId }) => RULES.has(ruleId),
  });
});

describe("守りの規則と見た目の値の規則", () => {
  for (const { label, file, code, rule } of CASES) {
    it(`${label}：${rule ? "止まる" : "止まらない"}`, async () => {
      const [result] = await eslint.lintText(code, { filePath: join(root, file) });
      const messages = result?.messages ?? [];
      expect(
        messages.filter((message) => message.fatal),
        "lint にかけられなかった",
      ).toEqual([]);
      const rules = messages.map((message) => message.ruleId);
      if (rule) expect(rules, code).toContain(rule);
      else expect(rules, code).toEqual([]);
    });
  }
});
