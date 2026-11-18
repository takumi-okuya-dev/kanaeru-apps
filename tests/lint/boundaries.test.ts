// 境界の規則（eslint.config.js の boundaries/dependencies）が働くかの確かめ。
// わざと境界を破る中身を、仮のファイルの道で lint にかけ、すべて止まることと、正しい書き方は止まらないことを確かめる。
// 読む先のファイルが要るので、一時のフォルダに同じ形の仮の木を作り、そこを境界の規則の根（boundaries/root-path）にする。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** リポジトリのルートの ESLint の設定。 */
const configFile = fileURLToPath(new URL("../../eslint.config.js", import.meta.url));

/** 仮の木のファイル（読む先として要るもの）。領域の名前は仮（alpha・beta）。 */
const TREE: Record<string, string> = {
  "apps/api/src/kernel/config.ts": "export const config = 1;\n",
  "apps/api/src/platform/gamma/index.ts": "export const gamma = 1;\n",
  "apps/api/src/platform/gamma/internal.ts": "export const gammaInternal = 1;\n",
  "apps/api/src/platform/delta/index.ts": "export const delta = 1;\n",
  "apps/api/src/modules/alpha/index.ts": "export const alpha = 1;\n",
  "apps/api/src/modules/beta/index.ts": "export const beta = 1;\n",
  "apps/api/src/modules/beta/internal.ts": "export const betaInternal = 1;\n",
  "apps/api/src/app.ts": "export const app = 1;\n",
  "apps/api/src/client.ts": "export type AppType = { app: 1 };\nexport const client = 1;\n",
  "apps/web/src/shell/Shell.tsx": "export const Shell = 1;\n",
  "apps/web/src/lib/api.ts": "export const api = 1;\n",
  "apps/web/src/features/alpha/index.ts": "export const alphaFeature = 1;\n",
  "apps/web/src/features/alpha/Page.tsx": "export const AlphaPage = 1;\n",
  "apps/web/src/features/beta/index.ts":
    "export const betaFeature = 1;\nexport type BetaProps = { id: string };\n",
  "apps/web/src/features/beta/Page.tsx": "export const BetaPage = 1;\n",
  "packages/contracts/src/alpha/index.ts": "export const alphaSchema = 1;\n",
  "packages/contracts/src/beta/index.ts": "export const betaSchema = 1;\n",
  "packages/contracts/src/beta/internal.ts": "export const betaInternalSchema = 1;\n",
};

/** 確かめる書き方。blocked が true なら、境界の規則で止まること。 */
const CASES: { label: string; file: string; code: string; blocked: boolean }[] = [
  // API：領域 → ほかの領域
  {
    label: "領域 → ほかの領域の中",
    file: "apps/api/src/modules/alpha/service.ts",
    code: 'export { betaInternal } from "../beta/internal.ts";',
    blocked: true,
  },
  {
    label: "領域 → ほかの領域の index.ts・共通の index.ts・土台",
    file: "apps/api/src/modules/alpha/service.ts",
    code: 'export { beta } from "../beta/index.ts";\nexport { gamma } from "../../platform/gamma/index.ts";\nexport { config } from "../../kernel/config.ts";',
    blocked: false,
  },
  {
    label: "領域 → 共通の中",
    file: "apps/api/src/modules/alpha/service.ts",
    code: 'export { gammaInternal } from "../../platform/gamma/internal.ts";',
    blocked: true,
  },
  {
    label: "領域 → 組み立て",
    file: "apps/api/src/modules/alpha/service.ts",
    code: 'export { app } from "../../app.ts";',
    blocked: true,
  },
  // API：共通 → 領域・共通どうし
  {
    label: "共通 → 領域",
    file: "apps/api/src/platform/gamma/service.ts",
    code: 'export { alpha } from "../../modules/alpha/index.ts";',
    blocked: true,
  },
  {
    label: "共通 → ほかの共通の中",
    file: "apps/api/src/platform/delta/service.ts",
    code: 'export { gammaInternal } from "../gamma/internal.ts";',
    blocked: true,
  },
  {
    label: "共通 → ほかの共通の index.ts・土台",
    file: "apps/api/src/platform/delta/service.ts",
    code: 'export { gamma } from "../gamma/index.ts";\nexport { config } from "../../kernel/config.ts";',
    blocked: false,
  },
  // API：土台 → 共通
  {
    label: "土台 → 共通",
    file: "apps/api/src/kernel/db.ts",
    code: 'export { gamma } from "../platform/gamma/index.ts";',
    blocked: true,
  },
  // API：組み立て
  {
    label: "組み立て → 領域の中",
    file: "apps/api/src/modules.list.ts",
    code: 'export { betaInternal } from "./modules/beta/internal.ts";',
    blocked: true,
  },
  {
    label: "組み立て → 領域の index.ts・共通の index.ts・土台",
    file: "apps/api/src/modules.list.ts",
    code: 'export * as alpha from "./modules/alpha/index.ts";\nexport { gamma } from "./platform/gamma/index.ts";\nexport { config } from "./kernel/config.ts";',
    blocked: false,
  },
  // 画面
  {
    label: "外枠 → 領域の中",
    file: "apps/web/src/shell/Sidebar.tsx",
    code: 'export { AlphaPage } from "../features/alpha/Page.tsx";',
    blocked: true,
  },
  {
    label: "外枠 → 領域の index.ts",
    file: "apps/web/src/shell/Sidebar.tsx",
    code: 'export { alphaFeature } from "../features/alpha/index.ts";',
    blocked: true,
  },
  {
    label: "画面の領域 → ほかの領域の中",
    file: "apps/web/src/features/alpha/List.tsx",
    code: 'export { BetaPage } from "../beta/Page.tsx";',
    blocked: true,
  },
  {
    label: "画面の領域 → ほかの領域の index.ts・lib",
    file: "apps/web/src/features/alpha/List.tsx",
    code: 'export { betaFeature } from "../beta/index.ts";\nexport { api } from "../../lib/api.ts";',
    blocked: false,
  },
  {
    label: "画面の領域 → 外枠",
    file: "apps/web/src/features/alpha/List.tsx",
    code: 'export { Shell } from "../../shell/Shell.tsx";',
    blocked: true,
  },
  {
    label: "画面の共通 → 外枠",
    file: "apps/web/src/lib/page.tsx",
    code: 'export { Shell } from "../shell/Shell.tsx";',
    blocked: true,
  },
  {
    label: "画面の共通 → 領域",
    file: "apps/web/src/lib/page.tsx",
    code: 'export { alphaFeature } from "../features/alpha/index.ts";',
    blocked: true,
  },
  {
    label: "画面の組み立て → 領域の index.ts・外枠・lib",
    file: "apps/web/src/features.list.ts",
    code: 'export * as alpha from "./features/alpha/index.ts";\nexport { Shell } from "./shell/Shell.tsx";\nexport { api } from "./lib/api.ts";',
    blocked: false,
  },
  {
    label: "画面の組み立て → 領域の中",
    file: "apps/web/src/features.list.ts",
    code: 'export { AlphaPage } from "./features/alpha/Page.tsx";',
    blocked: true,
  },
  // 画面 → API
  {
    label: "画面 → apps/api/src/app.ts",
    file: "apps/web/src/lib/client.ts",
    code: 'export { app } from "../../../api/src/app.ts";',
    blocked: true,
  },
  {
    label: "画面 → apps/api/src/client.ts を値で",
    file: "apps/web/src/lib/client.ts",
    code: 'export { client } from "../../../api/src/client.ts";',
    blocked: true,
  },
  {
    label: "画面 → API の領域",
    file: "apps/web/src/features/alpha/api.ts",
    code: 'export { alpha } from "../../../../api/src/modules/alpha/index.ts";',
    blocked: true,
  },
  {
    label: "画面 → apps/api/src/client.ts を import type で",
    file: "apps/web/src/features/alpha/api.ts",
    code: 'import type { AppType } from "../../../../api/src/client.ts";\nexport type Api = AppType;',
    blocked: false,
  },
  // 約束
  {
    label: "約束の領域 → ほかの領域の中",
    file: "packages/contracts/src/alpha/note.ts",
    code: 'export { betaInternalSchema } from "../beta/internal.ts";',
    blocked: true,
  },
  {
    label: "約束の領域 → ほかの領域の index.ts",
    file: "packages/contracts/src/alpha/note.ts",
    code: 'export { betaSchema } from "../beta/index.ts";',
    blocked: false,
  },
  {
    label: "約束 → API",
    file: "packages/contracts/src/alpha/note.ts",
    code: 'export { config } from "../../../../apps/api/src/kernel/config.ts";',
    blocked: true,
  },
];

let root: string;
let eslint: ESLint;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "boundaries-"));
  for (const [path, content] of Object.entries(TREE)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: configFile,
    overrideConfig: [
      // 仮のファイルは tsconfig にないので、型の情報を作らない（境界の規則だけを流すので要らない）
      { languageOptions: { parserOptions: { projectService: false, project: null } } },
      { settings: { "boundaries/root-path": root } },
    ],
    ruleFilter: ({ ruleId }) => ruleId === "boundaries/dependencies",
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * 中身を、仮のファイルの道で lint にかけ、境界の規則の知らせだけを返す。
 * @param file 仮のファイルの道（仮の木の根から）
 * @param code 中身
 * @returns 境界の規則の知らせ
 */
async function boundaryMessages(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, file) });
  const messages = result?.messages ?? [];
  const fatal = messages.filter((message) => message.fatal);
  expect(fatal, "lint にかけられなかった").toEqual([]);
  return messages
    .filter((message) => message.ruleId === "boundaries/dependencies")
    .map((message) => message.message);
}

describe("モジュールの境界の規則", () => {
  for (const { label, file, code, blocked } of CASES) {
    it(`${label}：${blocked ? "止まる" : "止まらない"}`, async () => {
      const messages = await boundaryMessages(file, code);
      if (blocked) expect(messages.length, code).toBeGreaterThan(0);
      else expect(messages, code).toEqual([]);
    });
  }
});
