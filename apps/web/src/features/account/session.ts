// 今の利用者（画面）とログインの始め方（構成の決めごと AD-4・AD-12。specs/account/001-line-login/research.md R9）。
// - useSession() が GET /api/v1/accounts/me を読む。401 で、LINE にログイン済みで ID トークンがあれば、
//   POST /api/v1/auth/line に getIDToken() の生の値を送ってから、ログインした状態にする。
//   自動で試すのは、ページを開いてから（または前に成功してから）1度だけ（LINE が断りつづけるときに、くり返さない）。
//   この問い合わせは読み直さない（retry: false。LINE に届かないときに ID トークンをくり返し送らない）。
// - ほかの API の 401（lib/api.ts の onUnauthenticated）を受けたら、セッションを読み直してログインし直し、
//   できたら、ほかの読みこみも読み直す。これは RELOGIN_COOLDOWN_MS に1度まで（/me は通るのに、ほかの窓口が
//   401 を返しつづけるときに、読み直し → 401 → 読み直し をくり返さない）。
// - LINE の始め方（liff.init()）は lib/liff.ts。ここは getLiff() を使うだけ。
import type { CurrentAccountView } from "@workspace/contracts/account";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, onUnauthenticated } from "../../lib/api.ts";
import { getLiff } from "../../lib/liff.ts";
import { fetchMe, loginWithLine } from "./api.ts";

/** 今の利用者の問い合わせの鍵（ログインしたあとに読み直させるときに使う）。 */
export const SESSION_QUERY_KEY = ["account", "session"] as const;

/** 問い合わせが持つ値。 */
export type SessionData =
  { status: "authenticated"; account: CurrentAccountView } | { status: "unauthenticated" };

/** useSession が返す状態。 */
export type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; account: CurrentAccountView }
  | { status: "unauthenticated" }
  | { status: "error"; error: unknown; retry: () => void };

/** 自動でログインし直すのを止めているか（1度試して断られた・ログアウトした）。 */
let autoLoginBlocked = false;

/**
 * 自動のログインを止める（ログアウトしたとき。LINE の中ですぐにログインし直さないように）。
 */
export function blockAutoLogin(): void {
  autoLoginBlocked = true;
}

/** テストだけで使う：自動のログインの印を戻す。 */
export function resetAutoLoginForTest(): void {
  autoLoginBlocked = false;
}

/**
 * 401 か。
 * @param error 投げられたもの
 * @returns 401 の ApiError なら true
 */
function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * 今の利用者を読む。未ログインで LINE にログイン済みなら、1度だけ ID トークンでログインする。
 * @returns ログインしているか・今の利用者
 * @throws {ApiError} 401 のほかのエラー（夜間の停止・LINE に届かないなど）
 * @throws {NetworkError} 通信が届かないとき
 */
export async function loadSession(): Promise<SessionData> {
  try {
    return { status: "authenticated", account: await fetchMe() };
  } catch (error) {
    if (!isUnauthenticated(error)) throw error;
  }
  const liff = getLiff();
  const idToken = liff.isLoggedIn() ? liff.getIDToken() : null;
  if (!idToken || autoLoginBlocked) return { status: "unauthenticated" };
  autoLoginBlocked = true;
  try {
    const account = await loginWithLine(idToken);
    autoLoginBlocked = false;
    return { status: "authenticated", account };
  } catch (error) {
    if (isUnauthenticated(error)) return { status: "unauthenticated" };
    // LINE に届かない・夜間の停止などは、また試せるようにして失敗の状態にする
    autoLoginBlocked = false;
    throw error;
  }
}

/** ほかの API の 401 で読み直すのは、この時間（ミリ秒）に1度まで。 */
export const RELOGIN_COOLDOWN_MS = 30_000;

/** QueryClient ごとの、ほかの API の 401 で最後に読み直した時刻。 */
const lastReloginAt = new WeakMap<QueryClient, number>();

/**
 * ログインしていない問い合わせ（account のほか）か。
 * @param query 問い合わせ
 * @param query.queryKey 問い合わせの鍵
 * @returns account の問い合わせでなければ true
 */
function isOtherQuery(query: { queryKey: readonly unknown[] }): boolean {
  return query.queryKey[0] !== "account";
}

/**
 * ほかの API が 401 を返したとき：ログイン済みと思っていたら、セッションを読み直し（ログインし直し）、
 * できたら、ほかの読みこみも読み直す。セッションを読んでいる途中・未ログインのとき・前に読み直してから
 * RELOGIN_COOLDOWN_MS たっていないときは何もしない（くり返さない）。
 * @param queryClient TanStack Query の入れ物
 */
async function handleUnauthenticated(queryClient: QueryClient): Promise<void> {
  const state = queryClient.getQueryState<SessionData>(SESSION_QUERY_KEY);
  if (state?.fetchStatus === "fetching" || state?.data?.status !== "authenticated") return;
  const now = Date.now();
  const last = lastReloginAt.get(queryClient);
  if (last !== undefined && now - last < RELOGIN_COOLDOWN_MS) return;
  lastReloginAt.set(queryClient, now);
  await queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY, exact: true });
  const after = queryClient.getQueryData<SessionData>(SESSION_QUERY_KEY);
  if (after?.status === "authenticated") {
    await queryClient.invalidateQueries({ predicate: isOtherQuery });
  }
}

/** QueryClient ごとの 401 の受け手（useSession をいくつ描いても1つ）。 */
const subscriptions = new Map<QueryClient, { count: number; unsubscribe: () => void }>();

/**
 * 401 の受け手を、描いている間だけ置く。
 * @param queryClient TanStack Query の入れ物
 */
function useUnauthenticatedHandler(queryClient: QueryClient): void {
  useEffect(() => {
    let entry = subscriptions.get(queryClient);
    if (!entry) {
      entry = {
        count: 0,
        unsubscribe: onUnauthenticated(() => void handleUnauthenticated(queryClient)),
      };
      subscriptions.set(queryClient, entry);
    }
    entry.count += 1;
    const current = entry;
    return () => {
      current.count -= 1;
      if (current.count === 0) {
        current.unsubscribe();
        subscriptions.delete(queryClient);
      }
    };
  }, [queryClient]);
}

/**
 * ログインした状態を問い合わせに入れ、ほかの読みこみを読み直させる（手元のログインのあとなど）。
 * @param queryClient TanStack Query の入れ物
 * @param account 今の利用者
 */
export async function setAuthenticated(
  queryClient: QueryClient,
  account: CurrentAccountView,
): Promise<void> {
  const data: SessionData = { status: "authenticated", account };
  queryClient.setQueryData(SESSION_QUERY_KEY, data);
  await queryClient.invalidateQueries({ predicate: isOtherQuery });
}

/**
 * ログアウトした状態を問い合わせに入れ、ほかの読みこみの値を消す（前の利用者のデータを残さない）。
 * LINE の中ですぐにログインし直さないよう、自動のログインも止める。
 * @param queryClient TanStack Query の入れ物
 */
export function setSignedOut(queryClient: QueryClient): void {
  blockAutoLogin();
  queryClient.removeQueries({ predicate: isOtherQuery });
  const data: SessionData = { status: "unauthenticated" };
  queryClient.setQueryData(SESSION_QUERY_KEY, data);
}

/**
 * 今の利用者（AD-12）。LINE の中でログイン済みなら、セッションがないときに自動でログインする。
 * @returns 読みこみ中・ログイン済みと今の利用者・未ログイン・失敗（retry でもう一度）
 */
export function useSession(): SessionState {
  const queryClient = useQueryClient();
  useUnauthenticatedHandler(queryClient);
  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: loadSession,
    staleTime: Number.POSITIVE_INFINITY,
    // 全体の読み直し（5xx を2回まで）を使わない。LINE に届かない（502）ときに ID トークンを送るのは1度だけ（R9）
    retry: false,
  });
  if (query.isPending) return { status: "loading" };
  if (query.isError) {
    return { status: "error", error: query.error, retry: () => void query.refetch() };
  }
  return query.data;
}
