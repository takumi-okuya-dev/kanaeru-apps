// アプリの一覧の読み方と、登録の決まり（構成の決めごと AD-15）。一覧は apps.list.ts（1行に1つ。merge=union）。
// 組み立て（API の app.ts）・suite の台帳・画面の外枠が、ここから同じ一覧を読む。アプリの名前や数をほかに書かない。
// zod を読まない。
import type { AppDefinition } from "./app-definition.ts";
import * as listed from "./apps.list.ts";

/** スイートの共通の領域（どのアプリにも属さない。AD-1・AD-15）。 */
export const COMMON_DOMAINS: readonly string[] = ["account", "suite"];

/**
 * アプリの key に使えない言葉（道の頭・窓口の頭と取り合うもの。AD-15）。
 * settings は設定の画面（/settings）の道の頭。
 */
export const RESERVED_APP_KEYS: readonly string[] = [
  "api",
  "admin",
  "e",
  "invite",
  "dev",
  "assets",
  "apps",
  "oauth",
  "mcp",
  "well-known",
  "settings",
];

/** アプリの key の形（英小文字で始まる英小文字・数字。40文字まで）。 */
export const APP_KEY_FORMAT = /^[a-z][a-z0-9]{0,39}$/;

/** 登録されたアプリ（apps.list.ts の順）。 */
const APPS: readonly AppDefinition[] = Object.values<unknown>(listed).filter(
  (value): value is AppDefinition =>
    typeof value === "object" && value !== null && "key" in value && "domains" in value,
);

/**
 * 登録されたアプリの一覧（apps.list.ts の順）。
 * @returns アプリの定義の並び
 */
export function listApps(): readonly AppDefinition[] {
  return APPS;
}

/**
 * 領域が属するアプリ（共通の領域・どこにも属さない領域は undefined）。
 * @param domain 領域の名前
 * @param apps アプリの並び（既定は登録されたもの）
 * @returns アプリの定義
 */
export function appOfDomain(
  domain: string,
  apps: readonly AppDefinition[] = APPS,
): AppDefinition | undefined {
  return apps.find((app) => app.domains.includes(domain));
}

/**
 * アプリの一覧が決まりに合うかを調べる（テストと組み立てが使う）。
 * - key の形・一意・予約語でない
 * - 領域は、ちょうど1つのアプリに属し、共通の領域を含まない
 * - 道の頭は / で始まり、重ならない
 * - 使ってよいほかのアプリは、登録されたアプリで、自分でない
 * @param apps アプリの並び
 * @returns 合わない所の文（合えば空）
 */
export function appRegistryProblems(apps: readonly AppDefinition[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const domainOwners = new Map<string, string>();
  const basePaths = new Set<string>();
  for (const app of apps) {
    if (!APP_KEY_FORMAT.test(app.key)) problems.push(`key の形が合いません：${app.key}`);
    if (RESERVED_APP_KEYS.includes(app.key)) problems.push(`key が予約語です：${app.key}`);
    if (keys.has(app.key)) problems.push(`key が重なっています：${app.key}`);
    keys.add(app.key);
    if (app.domains.length === 0) problems.push(`領域がありません：${app.key}`);
    for (const domain of app.domains) {
      if (COMMON_DOMAINS.includes(domain)) {
        problems.push(`共通の領域はアプリに入れられません：${app.key} の ${domain}`);
      }
      const owner = domainOwners.get(domain);
      if (owner !== undefined) {
        problems.push(`領域 ${domain} が2つのアプリに属しています：${owner}・${app.key}`);
      }
      domainOwners.set(domain, app.key);
    }
    if (!app.basePath.startsWith("/")) problems.push(`道の頭は / で始めます：${app.key}`);
    if (basePaths.has(app.basePath)) problems.push(`道の頭が重なっています：${app.basePath}`);
    basePaths.add(app.basePath);
  }
  for (const app of apps) {
    for (const used of app.uses) {
      if (used === app.key || !keys.has(used)) {
        problems.push(`使ってよいアプリが登録されていません：${app.key} の ${used}`);
      }
    }
  }
  return problems;
}

/**
 * 領域の名前の並びが、どれも「ちょうど1つのアプリか、共通の領域」に属するかを調べる。
 * @param domainNames 登録された領域の名前（modules.list.ts・features.list.ts の名前）
 * @param apps アプリの並び（既定は登録されたもの）
 * @returns どこにも属さない領域の名前（合えば空）
 */
export function unassignedDomains(
  domainNames: Iterable<string>,
  apps: readonly AppDefinition[] = APPS,
): string[] {
  return [...domainNames].filter(
    (domain) => !COMMON_DOMAINS.includes(domain) && appOfDomain(domain, apps) === undefined,
  );
}
