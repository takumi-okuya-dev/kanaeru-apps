// アプリの Meta のアプリでの接続（OAuth）と、Meta の連携の解除・データの削除（threads-010。めぐるの connection/threads-oauth.ts・
// threads-connect-routes.ts・revocation.ts・data-deletion.ts を写した）。設定の機能の印 threads.oauth と Meta のアプリの設定があるときだけ動く。
// - state は32バイトの乱数。DB には SHA-256 だけを持ち、10分で切れ、1回だけ使える。完了はログインした同じ人のときだけ（state を作った人が
//   第三者に踏ませる向きを防ぐ。めぐるのセキュリティの点検）
// - トークンの交換のあとは、トークンを貼るときと同じ確かめと保存（connection.ts の connectWithToken）を通る
// - データの削除は、送り直しを signed_request 全体の SHA-256 でまとめ、その Threads のユーザーにつないだ運用アカウントを消す
// トークン・code・state の値はログに出さない。
import { THREADS_ERRORS } from "@workspace/contracts/threads";
import { and, eq, inArray, lt, ne } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import type { MetaApp } from "../../kernel/meta-app.ts";
import { connectWithToken, loadCredentials } from "./connection.ts";
import type { ConnectOutcome } from "./connection.ts";
import { lockKey } from "./locks.ts";
import { findOwnedAccount } from "./repository.ts";
import {
  threadsAccount,
  threadsConnection,
  threadsDeletionRequest,
  threadsOauthState,
} from "./schema.ts";
import { ThreadsApiError, ThreadsAuthError, ThreadsTransientError } from "./threads-client.ts";
import type { ThreadsClient } from "./threads-client.ts";

/** OAuth の接続を開ける機能の印（設定 DOMAIN_FEATURES。既定は切）。 */
export const THREADS_OAUTH_FEATURE = "threads.oauth";

/** state の持ち時間。 */
const STATE_TTL_MS = 10 * 60_000;

/** データの削除をやり直すまでの間。 */
const DELETION_RETRY_MS = 15 * 60_000;

/** 認可の画面の源（本物の Threads）。 */
const THREADS_AUTHORIZE_ORIGIN = "https://threads.net";

/** 本物の Graph API の源。 */
const THREADS_GRAPH_ORIGIN = "https://graph.threads.net";

/** 求める権限。 */
const OAUTH_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_insights",
  "threads_manage_replies",
] as const;

/**
 * 値の SHA-256（16進）。
 * @param value 値
 * @returns ハッシュ
 */
function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * OAuth の接続が使えるか（機能の印・Meta のアプリ・秘密の箱）。
 * @param deps 土台が渡す道具
 * @returns 使えれば Meta のアプリの道具、だめなら null
 */
export function oauthApp(deps: DomainRouteDeps): MetaApp | null {
  if (!deps.features.enabled(THREADS_OAUTH_FEATURE) || !deps.metaApp || !deps.secretBox)
    return null;
  return deps.metaApp;
}

/**
 * Meta に登録するリダイレクトの URL（画面の源の下の API の道。本番は API と画面が同じ源）。
 * @param deps 土台が渡す道具
 * @returns URL
 */
export function redirectUriOf(deps: DomainRouteDeps): string {
  return `${deps.config.webUrl}/api/v1/threads/oauth/callback`;
}

/**
 * 認可の画面の源（本物の Graph API なら threads.net。手元と E2E の偽の Threads は同じ源）。
 * @param deps 土台が渡す道具
 * @returns 源
 */
function authorizeOriginOf(deps: DomainRouteDeps): string {
  return deps.config.threadsApiBaseUrl === THREADS_GRAPH_ORIGIN
    ? THREADS_AUTHORIZE_ORIGIN
    : deps.config.threadsApiBaseUrl;
}

/**
 * OAuth の接続を始め、認可の URL を返す。
 * @param deps 土台が渡す道具
 * @param app Meta のアプリの道具
 * @param ownerId 持ち主（kanaeru のアカウントの ID）
 * @param threadsAccountId 運用アカウントの ID（持ち主を確かめたもの）
 * @param now 今
 * @returns 認可の URL（state を含む）
 */
export async function startOauth(
  deps: DomainRouteDeps,
  app: MetaApp,
  ownerId: string,
  threadsAccountId: string,
  now: Date,
): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  await deps.db.insert(threadsOauthState).values({
    stateHash: sha256Hex(state),
    accountId: ownerId,
    threadsAccountId,
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    createdAt: now,
  });
  const url = new URL(`${authorizeOriginOf(deps)}/oauth/authorize`);
  url.searchParams.set("client_id", app.appId);
  url.searchParams.set("redirect_uri", redirectUriOf(deps));
  url.searchParams.set("scope", OAUTH_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Graph API の応答を読む（失敗は種類で分ける。本文・URL はエラーの文に入れない）。
 * @param res 応答
 * @param what 呼び出しの名前
 * @returns 本文
 * @throws {ThreadsAuthError | ThreadsApiError} 失敗したとき
 */
async function readGraph<T>(res: Response, what: string): Promise<T> {
  const body: unknown = await res.json().catch(() => undefined);
  if (res.ok) return body as T;
  if (res.status === 401) throw new ThreadsAuthError(`${what}: unauthorized`);
  if (res.status >= 500) throw new ThreadsTransientError(`${what}: ${res.status}`, res.status);
  throw new ThreadsApiError(`${what}: ${res.status}`, res.status);
}

/**
 * code を長期のトークンに替える（code → 短期のトークン → 長期のトークン）。
 * @param deps 土台が渡す道具
 * @param app Meta のアプリの道具
 * @param code 認可の code
 * @returns 長期のトークン
 */
async function exchangeForLongLived(
  deps: DomainRouteDeps,
  app: MetaApp,
  code: string,
): Promise<string> {
  const base = deps.config.threadsApiBaseUrl;
  let shortRes: Response;
  try {
    shortRes = await deps.fetch(`${base}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: app.withClientCredentials({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUriOf(deps),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ThreadsTransientError("exchangeCode: network error", 0);
  }
  const short = await readGraph<{ access_token: string }>(shortRes, "exchangeCode");
  const params = app.withClientCredentials({
    grant_type: "th_exchange_token",
    access_token: short.access_token,
  });
  params.delete("client_id");
  let longRes: Response;
  try {
    longRes = await deps.fetch(`${base}/access_token?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ThreadsTransientError("exchangeLongLived: network error", 0);
  }
  return (await readGraph<{ access_token: string }>(longRes, "exchangeLongLived")).access_token;
}

/** 完了の結果（画面が移る先。道と問い合わせ）。 */
export type OauthCompletion = { redirectTo: string; outcome: ConnectOutcome | null };

/**
 * OAuth の接続を完了する（ログインした人が、Threads から戻ったあとに送る）。
 * state が無い・切れた・ほかの人のものは、区別せずに 400（state があるかを確かめる手がかりにしない）。
 * @param deps 土台が渡す道具
 * @param app Meta のアプリの道具
 * @param ownerId ログインしている人（kanaeru のアカウントの ID）
 * @param input state と code（許可しなかったときは error）
 * @param now 今
 * @returns 画面が移る先と、つないだ結果
 * @throws {AppError} state が合わないとき（INVALID_INPUT）
 */
export async function completeOauth(
  deps: DomainRouteDeps,
  app: MetaApp,
  ownerId: string,
  input: { state: string; code?: string | undefined; error?: string | undefined },
  now: Date,
): Promise<OauthCompletion> {
  const [row] = await deps.db
    .delete(threadsOauthState)
    .where(eq(threadsOauthState.stateHash, sha256Hex(input.state)))
    .returning();
  const invalid = () =>
    new AppError("INVALID_INPUT", {
      fields: [
        {
          path: "state",
          message: "接続の手続きが切れました。設定の画面から、もう一度つないでください。",
        },
      ],
    });
  if (!row || row.expiresAt.getTime() < now.getTime()) throw invalid();
  if (row.accountId !== ownerId) {
    deps.logger.warn({}, "OAuth の完了：ほかの人の state");
    throw invalid();
  }
  const account = await findOwnedAccount(deps.db, ownerId, row.threadsAccountId);
  if (!account) return { redirectTo: "/threads?oauth=not_found", outcome: null };
  const settings = `/threads/accounts/${account.id}/settings`;
  if (input.error || !input.code)
    return { redirectTo: `${settings}?oauth=cancelled`, outcome: null };
  let token: string;
  try {
    token = await exchangeForLongLived(deps, app, input.code);
  } catch (error) {
    deps.logger.warn(
      { errorName: (error as Error).name },
      "OAuth の完了：トークンを替えられません",
    );
    return { redirectTo: `${settings}?oauth=failed`, outcome: null };
  }
  try {
    const outcome = await connectWithToken(deps, ownerId, account, token, now);
    return { redirectTo: `${settings}?oauth=${outcome.kind}`, outcome };
  } catch (error) {
    if (error instanceof AppError) {
      return { redirectTo: `${settings}?oauth=${encodeURIComponent(error.code)}`, outcome: null };
    }
    throw error;
  }
}

/**
 * Meta の連携の解除の知らせを扱う。ユーザーが最後に認可した時刻より前の知らせは当てない。
 * 時刻のない知らせは、持っているトークンでプロフィールを読み、認証のエラーのときだけ解除する。
 * @param deps 土台が渡す道具
 * @param threads Threads の API の呼び出し
 * @param payload 確かめた中身
 * @param payload.userId Threads のユーザーの ID
 * @param payload.issuedAt 知らせを出した時刻
 * @returns 接続を解いたか
 */
export async function handleUninstall(
  deps: DomainRouteDeps,
  threads: ThreadsClient,
  payload: { userId: string; issuedAt: Date | undefined },
): Promise<boolean> {
  const [row] = await deps.db
    .select({ id: threadsAccount.id, authorizedAt: threadsConnection.authorizedAt })
    .from(threadsAccount)
    .innerJoin(threadsConnection, eq(threadsConnection.threadsAccountId, threadsAccount.id))
    .where(eq(threadsAccount.threadsUserId, payload.userId))
    .limit(1);
  if (!row) return false;
  if (payload.issuedAt) {
    // そのあとに認可し直した接続へ、古い知らせを当てない
    if (payload.issuedAt.getTime() < row.authorizedAt.getTime()) return false;
  } else {
    const cred = await loadCredentials(deps.db, deps.secretBox, row.id, deps.logger);
    if (!cred?.token) return false;
    try {
      await threads.getProfile(cred.token);
      return false;
    } catch (error) {
      if (!(error instanceof ThreadsAuthError)) return false;
    }
  }
  return revokeConnection(deps.db, row.id);
}

/**
 * 接続を「接続し直しが要る」にし、トークンを消す（世代を上げ、進んでいる処理の書きこみを止める）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 解いたか
 */
async function revokeConnection(db: Db, threadsAccountId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ generation: threadsAccount.connectionGeneration })
      .from(threadsAccount)
      .where(
        and(
          eq(threadsAccount.id, threadsAccountId),
          ne(threadsAccount.connectionStatus, "not_connected"),
        ),
      )
      .for("update");
    if (!current) return false;
    await tx
      .update(threadsAccount)
      .set({ connectionStatus: "needs_reconnect", connectionGeneration: current.generation + 1 })
      .where(eq(threadsAccount.id, threadsAccountId));
    await tx
      .delete(threadsConnection)
      .where(eq(threadsConnection.threadsAccountId, threadsAccountId));
    return true;
  });
}

/**
 * Meta のデータの削除の要求を受け付け、1回目を試す。送り直しは前の確認のコードを返す。
 * @param deps 土台が渡す道具
 * @param signedRequest 確かめた signed_request（全体のハッシュで送り直しをまとめる）
 * @param userId Threads のユーザーの ID
 * @param now 受け付けた時刻
 * @returns 確認のコード
 */
export async function receiveDeletion(
  deps: DomainRouteDeps,
  signedRequest: string,
  userId: string,
  now: Date,
): Promise<string> {
  const fingerprint = sha256Hex(signedRequest);
  const code = randomBytes(16).toString("hex");
  const [inserted] = await deps.db
    .insert(threadsDeletionRequest)
    .values({
      confirmationCode: code,
      requestFingerprint: fingerprint,
      threadsUserId: userId,
      receivedAt: now,
      lastAttemptedAt: now,
    })
    .onConflictDoNothing({ target: threadsDeletionRequest.requestFingerprint })
    .returning({ code: threadsDeletionRequest.confirmationCode });
  if (!inserted) {
    const [existing] = await deps.db
      .select({ code: threadsDeletionRequest.confirmationCode })
      .from(threadsDeletionRequest)
      .where(eq(threadsDeletionRequest.requestFingerprint, fingerprint))
      .limit(1);
    return existing?.code ?? code;
  }
  // 受付はもう記録した。ここで失敗しても定期の仕事がやり直す
  try {
    await attemptDeletion(deps, inserted.code, now);
  } catch (error) {
    deps.logger.error({ errorName: (error as Error).name }, "データの削除の1回目に失敗しました");
  }
  return inserted.code;
}

/**
 * データの削除を1回試す（鍵 → 読み直し → 運用アカウントを消す → 終わりを記録。失敗は failed にする）。
 * @param deps 土台が渡す道具
 * @param code 確認のコード
 * @param now 今
 * @returns 結果
 */
export async function attemptDeletion(
  deps: DomainRouteDeps,
  code: string,
  now: Date,
): Promise<"completed" | "skipped" | "failed"> {
  try {
    return await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(threadsDeletionRequest)
        .where(eq(threadsDeletionRequest.confirmationCode, code))
        .for("update");
      if (!row || row.status === "completed" || !row.threadsUserId) return "skipped" as const;
      await lockKey(tx, `threads-user:${row.threadsUserId}`);
      // その Threads のユーザーにつないだ運用アカウントを消す（下の表は一緒に消える）
      await tx.delete(threadsAccount).where(eq(threadsAccount.threadsUserId, row.threadsUserId));
      await tx
        .update(threadsDeletionRequest)
        .set({
          status: "completed",
          completedAt: now,
          threadsUserId: null,
          attempts: row.attempts + 1,
          lastAttemptedAt: now,
        })
        .where(eq(threadsDeletionRequest.confirmationCode, code));
      return "completed" as const;
    });
  } catch (error) {
    deps.logger.error({ errorName: (error as Error).name }, "データの削除に失敗しました");
    const [row] = await deps.db
      .select({ attempts: threadsDeletionRequest.attempts })
      .from(threadsDeletionRequest)
      .where(eq(threadsDeletionRequest.confirmationCode, code));
    await deps.db
      .update(threadsDeletionRequest)
      .set({ status: "failed", lastAttemptedAt: now, attempts: (row?.attempts ?? 0) + 1 })
      .where(
        and(
          eq(threadsDeletionRequest.confirmationCode, code),
          ne(threadsDeletionRequest.status, "completed"),
        ),
      );
    return "failed";
  }
}

/**
 * 定期の仕事：止まったデータの削除をやり直し、切れた state を消す。
 * @param deps 土台が渡す道具
 * @param now 今
 * @returns やり直した数
 */
export async function runOauthMaintenance(deps: DomainRouteDeps, now: Date): Promise<number> {
  const due = await deps.db
    .select({ code: threadsDeletionRequest.confirmationCode })
    .from(threadsDeletionRequest)
    .where(
      and(
        inArray(threadsDeletionRequest.status, ["pending", "failed"]),
        lt(threadsDeletionRequest.lastAttemptedAt, new Date(now.getTime() - DELETION_RETRY_MS)),
      ),
    );
  for (const { code } of due) await attemptDeletion(deps, code, now);
  await deps.db.delete(threadsOauthState).where(lt(threadsOauthState.expiresAt, now));
  return due.length;
}

/**
 * データの削除の状況（識別子は返さない）。
 * @param db DB
 * @param code 確認のコード
 * @returns 状況（なければ null）
 */
export async function deletionStatus(db: Db, code: string) {
  if (!/^[0-9a-f]{32}$/.test(code)) return null;
  const [row] = await db
    .select()
    .from(threadsDeletionRequest)
    .where(eq(threadsDeletionRequest.confirmationCode, code))
    .limit(1);
  if (!row) return null;
  return {
    status: row.status,
    receivedAt: row.receivedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** 準備ができていないとき（Meta のアプリ・鍵の設定がない）のエラー。 */
export const OAUTH_UNAVAILABLE = THREADS_ERRORS.THREADS_CONNECTION_UNAVAILABLE;
