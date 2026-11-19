// 外枠のアプリの切り替え（core-005。構成の決めごと AD-15・AD-16）の形と、この端末で最後に使ったアプリの覚え方。
// 見えるアプリは suite の領域が読み、組み立て（router.tsx）が外枠に渡す。外枠はアプリの名前や数を書かない。
// 保存（localStorage）は、プライベートの窓・消した設定・止めた設定で、空のことも投げることもある。読み書きはどれも try/catch で包む。
import type { AppIcon } from "@workspace/contracts/core";

/** 外枠に出すアプリ（見る人に見えるもの）。 */
export type ShellApp = {
  /** アプリの key */
  key: string;
  /** 名前 */
  name: string;
  /** 短い説明（切り替えのメニュー） */
  summary: string;
  /** アイコン */
  icon: AppIcon;
  /** 開いたときの道（そのアプリの最初のナビの項目。なければ道の頭） */
  startPath: string;
  /** 運営者だけに見えているか（運営者に「運営者だけ」の札を出す） */
  operatorOnly: boolean;
};

/** 今いる所（アプリの中・すべてのアプリ・設定。どれでもなければ null）。 */
export type ShellPlace =
  { kind: "app"; key: string } | { kind: "apps" } | { kind: "settings" } | null;

/** 外枠が組み立てから受け取る、アプリの切り替えの状態。 */
export type ShellAppsView = {
  /** 見る人に見えるアプリ（登録の順。2つ以上のときだけ切り替えを出す） */
  apps: readonly ShellApp[];
  /** 今いる所 */
  place: ShellPlace;
  /** 今の道のアプリが、見る人に見えないか（見えなければ外枠が「ページが見つかりません」を出す） */
  hidden: boolean;
  /** すべてのアプリの道（なければ null） */
  appsPath: string | null;
  /** 設定の道（なければ null。あれば外枠が「設定」の入口を出す） */
  settingsPath: string | null;
};

/** 最後に使ったアプリを覚える鍵。 */
export const LAST_APP_STORAGE_KEY = "app-shell.last-app";

/**
 * この端末で最後に使ったアプリの key（覚えていなければ・読めなければ null）。
 * @returns アプリの key
 */
export function readLastApp(): string | null {
  try {
    return window.localStorage.getItem(LAST_APP_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * この端末で最後に使ったアプリを覚える（書けなければ何もしない）。
 * @param key アプリの key
 */
export function writeLastApp(key: string): void {
  try {
    if (window.localStorage.getItem(LAST_APP_STORAGE_KEY) !== key) {
      window.localStorage.setItem(LAST_APP_STORAGE_KEY, key);
    }
  } catch {
    // 覚えられなくても、はじめの画面が一覧の最初のアプリになるだけ
  }
}

/**
 * はじめの画面（/）で開くアプリ（最後に使ったアプリが並びにあればそれ、なければ並びの最初）。
 * @param apps 開けるアプリ（登録の順）
 * @param lastKey 最後に使ったアプリの key
 * @returns アプリ（並びが空なら undefined）
 */
export function pickStartApp<T extends { key: string }>(
  apps: readonly T[],
  lastKey: string | null,
): T | undefined {
  return apps.find((app) => app.key === lastKey) ?? apps[0];
}

/** 組み立てが渡した、アプリごとの開いたときの道（アプリの key → 道）。 */
let startPaths: ReadonlyMap<string, string> = new Map();

/**
 * 組み立てが、アプリごとの開いたときの道（そのアプリの領域の最初のナビの項目）を渡す（起動のときに1度）。
 * @param paths アプリの key → 道
 */
export function provideStartPaths(paths: ReadonlyMap<string, string>): void {
  startPaths = paths;
}

/**
 * アプリを開いたときの道（組み立てが渡した道。なければアプリの道の頭）。
 * @param app アプリ（key と道の頭）
 * @param app.key アプリの key
 * @param app.basePath アプリの道の頭
 * @returns 道
 */
export function startPathOf(app: { key: string; basePath: string }): string {
  return startPaths.get(app.key) ?? app.basePath;
}
