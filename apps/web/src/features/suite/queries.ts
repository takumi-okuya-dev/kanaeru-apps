// スイートの問い合わせ（見えるアプリ・台帳）。見えるアプリは外枠（アプリの切り替え・ナビ）と、すべてのアプリ・設定の画面が読む。
// - 鍵に「今わかっている利用者」を入れる（LINE の中で自動でログインしたあと、運営者だけのアプリを読み直すため）。
//   セッションの問い合わせは新しく始めない（account の useKnownAccount）。
// - 台帳を変えたら、suite の問い合わせをすべて読み直す（切り替えとナビにすぐ効く）。
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { VisibleAppList } from "@workspace/contracts/suite";
import { SESSION_QUERY_KEY, useKnownAccount } from "../account/index.ts";
import { fetchAppSettings, fetchVisibleApps } from "./api.ts";

/** 見えるアプリを持たせる長さ（ミリ秒）。台帳を変えたときは、その場で読み直す。 */
const VISIBLE_APPS_STALE_MS = 60_000;

/** 問い合わせの鍵。 */
export const SUITE_QUERY_KEYS = {
  /** suite の問い合わせのすべて */
  all: ["suite"] as const,
  /**
   * 見えるアプリ。
   * @param viewer 今わかっている利用者の ID（未ログインは "anonymous"）
   * @returns 鍵
   */
  visibleApps: (viewer: string) => ["suite", "apps", viewer] as const,
  /** 台帳 */
  settings: ["suite", "app-settings"] as const,
};

/** 見えるアプリの状態。 */
export type VisibleAppsState = {
  /** 読みこみの状態 */
  status: "pending" | "error" | "success";
  /** 見えるアプリ（読みこむ前・失敗は空） */
  apps: VisibleAppList["apps"];
  /** 見る人が運営者か */
  isOperator: boolean;
  /** この画面でログインしているとわかっているか（わからない間は、見えないアプリでも画面を出し、画面にログインさせる） */
  signedIn: boolean;
};

/**
 * 見えるアプリの問い合わせの設定。
 * @param viewer 今わかっている利用者の ID（未ログインは "anonymous"）
 * @returns 問い合わせの設定
 */
function visibleAppsQuery(viewer: string) {
  return {
    queryKey: SUITE_QUERY_KEYS.visibleApps(viewer),
    queryFn: fetchVisibleApps,
    staleTime: VISIBLE_APPS_STALE_MS,
  };
}

/**
 * 見る人に見えるアプリ（AD-16。ログインの前は公開のアプリだけ）。
 * @returns 読みこみの状態・見えるアプリ・運営者か
 */
export function useVisibleApps(): VisibleAppsState {
  const account = useKnownAccount();
  const query = useQuery(visibleAppsQuery(account?.id ?? "anonymous"));
  return {
    status: query.status,
    apps: query.data?.apps ?? [],
    isOperator: query.data?.isOperator ?? false,
    signedIn: account !== null,
  };
}

/**
 * 見えるアプリを読む（はじめの画面〈/〉が、移る先を決めるときに使う。読めなければ undefined）。
 * @param queryClient TanStack Query の入れ物
 * @returns 見えるアプリの一覧（読めなければ undefined）
 */
export async function loadVisibleApps(
  queryClient: QueryClient,
): Promise<VisibleAppList | undefined> {
  const session = queryClient.getQueryData<{ status: string; account?: { id: string } }>(
    SESSION_QUERY_KEY,
  );
  try {
    return await queryClient.ensureQueryData(visibleAppsQuery(session?.account?.id ?? "anonymous"));
  } catch {
    return undefined;
  }
}

/**
 * アプリの台帳（運営者だけ）。
 * @param enabled 読むか（運営者のときだけ true）
 * @returns 問い合わせ
 */
export function useAppSettings(enabled: boolean) {
  return useQuery({ queryKey: SUITE_QUERY_KEYS.settings, queryFn: fetchAppSettings, enabled });
}
