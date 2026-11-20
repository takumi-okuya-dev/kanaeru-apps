// Threads への接続（threads-002。めぐるの connection/token-connect・connection-service・threads-credentials・token-recheck・
// token-refresh・threads-check-service を写した）。
// - トークンを貼ってつなぐ：形 → /me（プロフィール）→ debug_token（期限・権限。48時間より短ければ断る）→ 投稿と反応の権限の確かめ。
//   失敗は「確かめの失敗」として数え、10分の間に5回失敗したら10分待たせる（数える前に予約の行を作り、並べて送っても超えない）
// - トークンは秘密の箱（AES-256-GCM。ひもづけは運用アカウントの ID・鍵の版つき）で包んで持つ。平文はこのファイルの変数の中だけ
// - 書きこみは、読んだときの接続の世代（connection_generation）を条件にし、その間の接続し直しを上書きしない
// トークン・Threads の答えの本文をログやエラーに出さない（ログは ID とエラーの種類だけ）。
import {
  TOKEN_ASSUMED_LIFETIME_DAYS,
  TOKEN_CHECK_FAILURE_LIMIT,
  TOKEN_CHECK_LOCK_MINUTES,
  TOKEN_CHECK_WINDOW_MINUTES,
  TOKEN_MIN_LIFETIME_HOURS,
  TOKEN_RECHECK_BATCH,
  TOKEN_RECHECK_DELAY_MINUTES,
  TOKEN_RECHECK_RETRY_MINUTES,
  THREADS_ERRORS,
  cleanToken,
  isTokenShaped,
  normalizeUsername,
} from "@workspace/contracts/threads";
import type { Connection, ThreadsCheck, TokenWarning } from "@workspace/contracts/threads";
import type { SecretBox } from "@workspace/secret-box";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { lockKey } from "./locks.ts";
import {
  threadsAccount,
  threadsConnection,
  threadsPostDraft,
  threadsPostingSchedule,
  threadsPublishAttempt,
  threadsTokenCheckFailure,
} from "./schema.ts";
import {
  THREADS_SCOPES,
  ThreadsApiError,
  ThreadsAuthError,
  ThreadsPermissionError,
  ThreadsRateLimitError,
  ThreadsTransientError,
  createThreadsClient,
} from "./threads-client.ts";
import type { ThreadsClient, ThreadsProfile, TokenDebugInfo } from "./threads-client.ts";
import { refreshUsernameOnlyMatch } from "./username-match.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** 運用アカウントの行。 */
type AccountRow = typeof threadsAccount.$inferSelect;

/**
 * 土台の道具から Threads の API の呼び出しを作る。
 * @param deps 土台が渡す道具
 * @returns Threads の API の呼び出し
 */
export function threadsClientOf(deps: Pick<DomainRouteDeps, "config" | "fetch">): ThreadsClient {
  return createThreadsClient(deps.config.threadsApiBaseUrl, deps.fetch);
}

/** Threads への呼び出しに要る、運用アカウントの接続。 */
export type ThreadsCredentials = {
  threadsAccountId: string;
  generation: number;
  /** 開けたトークン。接続がない・開けないときは null */
  token: string | null;
} & (
  | { connectionStatus: "connected" | "needs_reconnect"; threadsUserId: string }
  | { connectionStatus: "not_connected"; threadsUserId: null }
);

/**
 * 運用アカウントの接続を読み、トークンを開ける。鍵の設定の誤りなどで開けないときは token を null にする。
 * @param db DB
 * @param box 秘密の箱（なければトークンは null）
 * @param threadsAccountId 運用アカウントの ID
 * @param logger ログ（開けなかったときに ID だけを書く）
 * @returns 接続。運用アカウントがなければ null
 */
export async function loadCredentials(
  db: Executor,
  box: SecretBox | undefined,
  threadsAccountId: string,
  logger?: DomainRouteDeps["logger"],
): Promise<ThreadsCredentials | null> {
  const [row] = await db
    .select({ account: threadsAccount, conn: threadsConnection })
    .from(threadsAccount)
    .leftJoin(threadsConnection, eq(threadsConnection.threadsAccountId, threadsAccount.id))
    .where(eq(threadsAccount.id, threadsAccountId))
    .limit(1);
  if (!row) return null;
  const generation = row.account.connectionGeneration;
  if (row.account.connectionStatus === "not_connected" || row.account.threadsUserId === null) {
    return {
      threadsAccountId,
      generation,
      token: null,
      connectionStatus: "not_connected",
      threadsUserId: null,
    };
  }
  let token: string | null = null;
  if (row.conn && box) {
    try {
      token = await box.open(
        {
          ciphertext: row.conn.accessTokenCiphertext,
          iv: row.conn.accessTokenIv,
          keyVersion: row.conn.keyVersion,
        },
        threadsAccountId,
      );
    } catch (error) {
      logger?.error(
        { threadsAccountId, errorName: (error as Error).name },
        "Threads のトークンを開けませんでした",
      );
    }
  }
  return {
    threadsAccountId,
    generation,
    token,
    connectionStatus: row.account.connectionStatus,
    threadsUserId: row.account.threadsUserId,
  };
}

/**
 * 接続し直しが要る状態にする（読んだときの世代と同じときだけ。その間のつなぎ直しを上書きしない）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param generation 読んだときの世代
 * @param hint 理由の補い
 */
export async function markNeedsReconnect(
  db: Executor,
  threadsAccountId: string,
  generation: number,
  hint: "short_lived_token" | null = null,
): Promise<void> {
  await db
    .update(threadsAccount)
    .set({ connectionStatus: "needs_reconnect", ...(hint ? { reconnectHint: hint } : {}) })
    .where(
      and(
        eq(threadsAccount.id, threadsAccountId),
        eq(threadsAccount.connectionGeneration, generation),
        ne(threadsAccount.connectionStatus, "not_connected"),
      ),
    );
}

/**
 * 運用アカウントの行を、返す形の接続にする。
 * @param account 運用アカウントの行
 * @param expiresAt トークンの期限（未接続は null）
 * @returns 接続
 */
export function toConnection(account: AccountRow, expiresAt: Date | null): Connection {
  return {
    status: account.connectionStatus,
    username: account.username,
    displayName: account.displayName,
    expiresAt:
      account.connectionStatus === "not_connected" || !expiresAt ? null : expiresAt.toISOString(),
    reconnectHint: account.reconnectHint === "short_lived_token" ? "short_lived_token" : null,
    insightsDenied: account.insightsDeniedAt !== null,
    repliesDenied: account.repliesDeniedAt !== null,
  };
}

/**
 * 運用アカウントの接続を読む（返す形）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 接続。運用アカウントがなければ null
 */
export async function readConnection(
  db: Executor,
  threadsAccountId: string,
): Promise<Connection | null> {
  const [row] = await db
    .select({ account: threadsAccount, expiresAt: threadsConnection.expiresAt })
    .from(threadsAccount)
    .leftJoin(threadsConnection, eq(threadsConnection.threadsAccountId, threadsAccount.id))
    .where(eq(threadsAccount.id, threadsAccountId))
    .limit(1);
  return row ? toConnection(row.account, row.expiresAt) : null;
}

// ---- トークンを貼ってつなぐ ----

/** 確かめの失敗の理由（threads_token_check_failure.reason）。 */
type FailureReason = "invalid_format" | "invalid" | "short_lived" | "account_mismatch";

/** 数える失敗として要求を終えるためのエラー。 */
class CountedFailure extends Error {
  /** 失敗の理由 */
  readonly reason: FailureReason;
  /** 利用者に返すエラー */
  readonly error: AppError;

  /**
   * 数える失敗を作る。
   * @param reason 失敗の理由
   * @param error 利用者に返すエラー
   */
  constructor(reason: FailureReason, error: AppError) {
    super(error.code);
    this.reason = reason;
    this.error = error;
  }
}

/**
 * 待たせている間かを確かめる。直近の5回の失敗が10分の間に収まり、5回目から10分たっていなければ待ち。
 * 待ちの間の要求は失敗に数えないので、待ちは延び続けない。
 * @param db DB
 * @param ownerId 確かめる人（kanaeru のアカウントの ID）
 * @param now 今
 * @throws {AppError} 待たせている間（THREADS_TOKEN_CHECK_LOCKED）
 */
async function assertNotLocked(db: Executor, ownerId: string, now: Date): Promise<void> {
  const recent = await db
    .select({ failedAt: threadsTokenCheckFailure.failedAt })
    .from(threadsTokenCheckFailure)
    .where(eq(threadsTokenCheckFailure.accountId, ownerId))
    .orderBy(desc(threadsTokenCheckFailure.failedAt))
    .limit(TOKEN_CHECK_FAILURE_LIMIT);
  const newest = recent[0];
  const oldest = recent.at(-1);
  if (recent.length < TOKEN_CHECK_FAILURE_LIMIT || !newest || !oldest) return;
  if (
    newest.failedAt.getTime() - oldest.failedAt.getTime() >
    TOKEN_CHECK_WINDOW_MINUTES * MINUTE_MS
  )
    return;
  if (newest.failedAt.getTime() + TOKEN_CHECK_LOCK_MINUTES * MINUTE_MS <= now.getTime()) return;
  throw new AppError(THREADS_ERRORS.THREADS_TOKEN_CHECK_LOCKED);
}

/**
 * 待ちの判定と、この確かめの予約（pending の行）を、確かめる人ごとの鍵の中で行う。
 * 同じ人が並べて送っても、確かめの途中も数えるので、5回を超えて Threads に問い合わせない。
 * @param db DB
 * @param ownerId 確かめる人
 * @param now 今
 * @returns 予約の行の ID
 * @throws {AppError} 待たせている間（THREADS_TOKEN_CHECK_LOCKED）
 */
async function reserveCheck(db: Db, ownerId: string, now: Date): Promise<string> {
  return db.transaction(async (tx) => {
    await lockKey(tx, `threads_token_check:${ownerId}`);
    await assertNotLocked(tx, ownerId, now);
    const [row] = await tx
      .insert(threadsTokenCheckFailure)
      .values({ accountId: ownerId, failedAt: now, reason: "pending" })
      .returning({ id: threadsTokenCheckFailure.id });
    if (!row) throw new Error("確かめの予約を作れませんでした。");
    return row.id;
  });
}

/**
 * 一時的な失敗か（上限・通信の失敗・5xx）。
 * @param error 投げられたもの
 * @returns 一時的なら true
 */
function isTemporary(error: unknown): boolean {
  return error instanceof ThreadsTransientError || error instanceof ThreadsRateLimitError;
}

/** トークンを調べた結果。 */
type Inspection = {
  profile: ThreadsProfile;
  debug: TokenDebugInfo | null;
  warnings: TokenWarning[];
};

/**
 * トークンで Threads に問い合わせる：プロフィール → debug_token → 投稿の上限 → フォロワーの数。
 * @param threads Threads の API の呼び出し
 * @param token トークン
 * @returns プロフィール・調べた結果・権限の案内。無効なら null
 * @throws {AppError} 一時的な失敗（THREADS_UNAVAILABLE）
 */
async function inspectToken(threads: ThreadsClient, token: string): Promise<Inspection | null> {
  let profile: ThreadsProfile;
  try {
    profile = await threads.getProfile(token);
  } catch (error) {
    if (isTemporary(error)) throw new AppError(THREADS_ERRORS.THREADS_UNAVAILABLE);
    if (error instanceof ThreadsApiError || error instanceof ThreadsAuthError) return null;
    throw error;
  }
  let debug: TokenDebugInfo | null = null;
  try {
    debug = await threads.debugToken(token);
  } catch (error) {
    if (error instanceof ThreadsAuthError) return null;
    if (isTemporary(error)) throw new AppError(THREADS_ERRORS.THREADS_UNAVAILABLE);
    // 調べられない（権限・未対応など）ときは60日とみなし、2時間後に確かめ直す
    if (!(error instanceof ThreadsApiError)) throw error;
  }
  const warnings: TokenWarning[] = [];
  const probes = [
    ["no_publish_permission", () => threads.getPublishingLimit(token, profile.id)],
    ["no_insights_permission", () => threads.getFollowersCount(token, profile.id)],
  ] as const;
  for (const [warning, probe] of probes) {
    try {
      await probe();
    } catch (error) {
      if (error instanceof ThreadsAuthError) return null;
      if (error instanceof ThreadsPermissionError) warnings.push(warning);
      else if (!(error instanceof ThreadsApiError)) throw error;
      // 一時的な失敗などで確かめられない権限は、案内しない（次の確かめで分かる）
    }
  }
  // 返信の権限は、読むだけの呼び出しでは確かめられないので、権限の一覧で見る（一覧が読めなければ案内しない）
  if (debug && debug.scopes.length > 0 && !debug.scopes.includes("threads_manage_replies")) {
    warnings.push("no_replies_permission");
  }
  return { profile, debug, warnings };
}

/** つないだ結果。 */
export type ConnectOutcome = {
  kind: "connect" | "reconnect";
  account: AccountRow;
  expiresAt: Date;
  warnings: TokenWarning[];
};

/** 接続を確定する前の確かめ（接続のトランザクションの中で、Threads のユーザーの鍵を取ったあとに呼ぶ。断るときは AppError を投げる）。 */
export type ConnectGuard = (tx: Executor, threadsUserId: string) => Promise<void>;

/**
 * トークンを貼って、未接続の運用アカウントにはじめてつなぐ・接続し直す（どちらかは今の状態で決める）。
 * @param deps 土台が渡す道具
 * @param ownerId 持ち主（kanaeru のアカウントの ID）
 * @param account 運用アカウント（持ち主を確かめたもの）
 * @param rawToken 貼った文（前後の空白・引用符は取り除く）
 * @param now 今
 * @param guard 接続を確定する前の確かめ（OAuth の接続だけ。threads-012）
 * @returns つないだ結果
 * @throws {AppError} 鍵の設定がない・待たせている間・トークンが合わない・別のアカウント・ほかの運用アカウントがつないでいる・Threads が答えない
 */
export async function connectWithToken(
  deps: DomainRouteDeps,
  ownerId: string,
  account: AccountRow,
  rawToken: string,
  now: Date = new Date(),
  guard?: ConnectGuard,
): Promise<ConnectOutcome> {
  const box = deps.secretBox;
  if (!box) throw new AppError(THREADS_ERRORS.THREADS_CONNECTION_UNAVAILABLE);
  const reservation = await reserveCheck(deps.db, ownerId, now);
  let failure: FailureReason | null = null;
  try {
    return await checkAndConnect(deps, box, account, rawToken, now, guard);
  } catch (error) {
    if (error instanceof CountedFailure) {
      failure = error.reason;
      throw error.error;
    }
    throw error;
  } finally {
    // 失敗なら理由を書き、それ以外（成功・数えない失敗）は予約を消す。後片付けの失敗で、本来の結果を上書きしない
    try {
      if (failure) {
        await deps.db
          .update(threadsTokenCheckFailure)
          .set({ reason: failure })
          .where(eq(threadsTokenCheckFailure.id, reservation));
      } else {
        await deps.db
          .delete(threadsTokenCheckFailure)
          .where(eq(threadsTokenCheckFailure.id, reservation));
      }
    } catch (error) {
      deps.logger.error(
        { errorName: (error as Error).name },
        "トークンの確かめの予約を片付けられませんでした",
      );
    }
  }
}

/**
 * トークンを確かめて、接続を決める（予約の中で行う）。
 * @param deps 土台が渡す道具
 * @param box 秘密の箱
 * @param account 運用アカウント
 * @param rawToken 貼った文
 * @param now 今
 * @param guard 接続を確定する前の確かめ
 * @returns つないだ結果
 * @throws {CountedFailure} 数える失敗
 * @throws {AppError} 数えない失敗
 */
async function checkAndConnect(
  deps: DomainRouteDeps,
  box: SecretBox,
  account: AccountRow,
  rawToken: string,
  now: Date,
  guard?: ConnectGuard,
): Promise<ConnectOutcome> {
  const invalid = () => new AppError(THREADS_ERRORS.THREADS_TOKEN_INVALID);
  const token = cleanToken(rawToken);
  if (!isTokenShaped(token)) throw new CountedFailure("invalid_format", invalid());
  const found = await inspectToken(threadsClientOf(deps), token);
  if (!found) throw new CountedFailure("invalid", invalid());
  const { profile, debug, warnings } = found;
  // 期限が短いトークンは短期トークンとみなす
  if (
    debug?.expiresAt &&
    debug.expiresAt.getTime() - now.getTime() < TOKEN_MIN_LIFETIME_HOURS * 60 * MINUTE_MS
  ) {
    throw new CountedFailure("short_lived", new AppError(THREADS_ERRORS.THREADS_TOKEN_SHORT_LIVED));
  }
  const expiresAt =
    debug?.expiresAt ?? new Date(now.getTime() + TOKEN_ASSUMED_LIFETIME_DAYS * DAY_MS);
  const recheckAt = debug
    ? null
    : new Date(now.getTime() + TOKEN_RECHECK_DELAY_MINUTES * MINUTE_MS);
  const sealed = await box.seal(token, account.id);
  const scopes = debug && debug.scopes.length > 0 ? debug.scopes : [...THREADS_SCOPES];
  const username = normalizeUsername(profile.username);
  // ユーザー名だけが同じ別の運用アカウントは、持っているトークンで今の名前を読み直してから比べる（threads-012。username-match.ts）
  await refreshUsernameOnlyMatch(deps, threadsClientOf(deps), profile);

  return deps.db.transaction(async (tx) => {
    // 鍵の順は「Threads のユーザー → ユーザー名」。同じ Threads のアカウントを2つの運用アカウントに同時につながない
    await lockKey(tx, `threads_user:${profile.id}`);
    await lockKey(tx, `threads_username:${username}`);
    // OAuth の接続だけ：認可のあとの連携の解除・データの削除の要求を、鍵を取ったあとに確かめる（threads-012）
    if (guard) await guard(tx, profile.id);
    const [target] = await tx
      .select()
      .from(threadsAccount)
      .where(eq(threadsAccount.id, account.id))
      .for("update");
    if (!target) throw new AppError("NOT_FOUND");
    const kind = target.connectionStatus === "not_connected" ? "connect" : "reconnect";
    if (
      kind === "reconnect" &&
      target.threadsUserId !== profile.id &&
      normalizeUsername(target.username ?? "") !== username
    ) {
      throw new CountedFailure(
        "account_mismatch",
        new AppError(THREADS_ERRORS.THREADS_RECONNECT_MISMATCH),
      );
    }
    // 同じ Threads のアカウント（ユーザー ID か、ユーザー名。ユーザー ID は Meta のアプリごとに違いうる）をつないだ別の運用アカウント
    const [other] = await tx
      .select({ id: threadsAccount.id, ownerId: threadsAccount.accountId })
      .from(threadsAccount)
      .where(
        and(
          ne(threadsAccount.id, target.id),
          or(
            eq(threadsAccount.threadsUserId, profile.id),
            sql`lower(${threadsAccount.username}) = ${username}`,
          ),
        ),
      )
      .limit(1);
    // 自分の別の運用アカウントなら、そう伝える（画面が一覧へ案内する）。ほかの人のものは、だれのものかを明かさない（threads-012）
    if (other)
      throw new AppError(
        other.ownerId === target.accountId
          ? THREADS_ERRORS.THREADS_ACCOUNT_REGISTERED
          : THREADS_ERRORS.THREADS_ACCOUNT_TAKEN,
      );

    const values = {
      accessTokenCiphertext: sealed.ciphertext,
      accessTokenIv: sealed.iv,
      keyVersion: sealed.keyVersion,
      scopes,
      expiresAt,
      issuedAt: debug?.issuedAt ?? now,
      authorizedAt: now,
      recheckAt,
    };
    await tx
      .insert(threadsConnection)
      .values({ threadsAccountId: target.id, ...values })
      .onConflictDoUpdate({ target: threadsConnection.threadsAccountId, set: values });
    const [updated] = await tx
      .update(threadsAccount)
      .set({
        threadsUserId: profile.id,
        username: profile.username,
        displayName: profile.name,
        profilePictureUrl: profile.profilePictureUrl,
        connectionStatus: "connected",
        reconnectHint: null,
        connectionGeneration: sql`${threadsAccount.connectionGeneration} + 1`,
        // つなぎ直しで権限が戻りうるので消す。権限がないと分かっていれば今にする
        insightsDeniedAt: warnings.includes("no_insights_permission") ? now : null,
        repliesDeniedAt: warnings.includes("no_replies_permission") ? now : null,
      })
      .where(eq(threadsAccount.id, target.id))
      .returning();
    if (!updated) throw new AppError("NOT_FOUND");
    // つなぎ直す前の予定は投稿しない（設定の版は変えない）
    await tx
      .update(threadsPostingSchedule)
      .set({ effectiveFrom: now })
      .where(eq(threadsPostingSchedule.threadsAccountId, target.id));
    await skipUnsentAttempts(tx, target.id, now);
    return { kind, account: updated, expiresAt, warnings };
  });
}

/**
 * つなぎ直す・切る前に取り、まだ公開を送っていない試みを進めない：飛ばして（接続し直し）、案を承認済みに戻す。
 * 札を消すので、動いている古い処理は以後の更新も公開もできない。公開の結果がわからない試みは、確かめを続ける。
 * @param tx トランザクション
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 */
export async function skipUnsentAttempts(
  tx: Executor,
  threadsAccountId: string,
  now: Date,
): Promise<void> {
  const stale = await tx
    .select({
      id: threadsPublishAttempt.id,
      draftId: threadsPublishAttempt.draftId,
      isCarryover: threadsPublishAttempt.isCarryover,
    })
    .from(threadsPublishAttempt)
    .where(
      and(
        eq(threadsPublishAttempt.threadsAccountId, threadsAccountId),
        inArray(threadsPublishAttempt.state, ["in_progress", "retry_wait"]),
        isNull(threadsPublishAttempt.publishRequestedAt),
      ),
    )
    .for("update");
  if (stale.length === 0) return;
  await tx
    .update(threadsPublishAttempt)
    .set({
      state: "skipped",
      skipReason: "needs_reconnect",
      draftId: null,
      leaseUntil: null,
      leaseToken: null,
      updatedAt: now,
    })
    .where(
      inArray(
        threadsPublishAttempt.id,
        stale.map((attempt) => attempt.id),
      ),
    );
  for (const attempt of stale) {
    if (!attempt.draftId) continue;
    await tx
      .update(threadsPostDraft)
      .set({
        status: "approved",
        // 持ち越しの試みなら、持ち越しの印を付け直す（次の時刻の優先と「持ち越しは1回だけ」を保つ）
        ...(attempt.isCarryover ? { carryoverAttemptId: attempt.id } : {}),
        version: sql`${threadsPostDraft.version} + 1`,
      })
      .where(
        and(eq(threadsPostDraft.id, attempt.draftId), eq(threadsPostDraft.status, "publishing")),
      );
  }
}

/**
 * 接続を切る（トークンを消し、未接続に戻し、自動投稿をオフにする）。投稿の途中なら断る。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @returns 切ったあとの運用アカウント
 * @throws {AppError} 投稿の途中（THREADS_PUBLISHING）・ない（NOT_FOUND）
 */
export async function disconnect(
  db: Db,
  threadsAccountId: string,
  now: Date = new Date(),
): Promise<AccountRow> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(threadsAccount)
      .where(eq(threadsAccount.id, threadsAccountId))
      .for("update");
    if (!target) throw new AppError("NOT_FOUND");
    const [publishing] = await tx
      .select({ id: threadsPublishAttempt.id })
      .from(threadsPublishAttempt)
      .where(
        and(
          eq(threadsPublishAttempt.threadsAccountId, threadsAccountId),
          inArray(threadsPublishAttempt.state, ["in_progress", "retry_wait"]),
          or(
            isNotNull(threadsPublishAttempt.publishRequestedAt),
            isNotNull(threadsPublishAttempt.containerId),
          ),
        ),
      )
      .limit(1);
    if (publishing) throw new AppError(THREADS_ERRORS.THREADS_PUBLISHING);
    await skipUnsentAttempts(tx, threadsAccountId, now);
    await tx
      .delete(threadsConnection)
      .where(eq(threadsConnection.threadsAccountId, threadsAccountId));
    await tx
      .update(threadsPostingSchedule)
      .set({
        enabled: false,
        effectiveFrom: now,
        version: sql`${threadsPostingSchedule.version} + 1`,
      })
      .where(eq(threadsPostingSchedule.threadsAccountId, threadsAccountId));
    const [updated] = await tx
      .update(threadsAccount)
      .set({
        connectionStatus: "not_connected",
        threadsUserId: null,
        username: null,
        displayName: null,
        profilePictureUrl: null,
        reconnectHint: null,
        insightsDeniedAt: null,
        repliesDeniedAt: null,
        connectionGeneration: sql`${threadsAccount.connectionGeneration} + 1`,
      })
      .where(eq(threadsAccount.id, threadsAccountId))
      .returning();
    if (!updated) throw new AppError("NOT_FOUND");
    return updated;
  });
}

/**
 * 持っているトークンでプロフィールを取り直し、接続を確かめる。認証のエラーなら接続し直しが要る状態にする。
 * それ以外の失敗では状態を変えない（Threads が答えないときは THREADS_UNAVAILABLE）。
 * @param deps 土台が渡す道具
 * @param threadsAccountId 運用アカウントの ID
 * @throws {AppError} Threads が一時的に答えない（THREADS_UNAVAILABLE）
 */
export async function verifyConnection(
  deps: DomainRouteDeps,
  threadsAccountId: string,
): Promise<void> {
  const cred = await loadCredentials(deps.db, deps.secretBox, threadsAccountId, deps.logger);
  if (!cred || cred.connectionStatus === "not_connected") return;
  if (!cred.token) throw new AppError(THREADS_ERRORS.THREADS_CONNECTION_UNAVAILABLE);
  const sameGeneration = and(
    eq(threadsAccount.id, threadsAccountId),
    eq(threadsAccount.connectionGeneration, cred.generation),
  );
  try {
    const profile = await threadsClientOf(deps).getProfile(cred.token);
    await deps.db
      .update(threadsAccount)
      .set({
        username: profile.username,
        displayName: profile.name,
        profilePictureUrl: profile.profilePictureUrl,
        connectionStatus: "connected",
        reconnectHint: null,
      })
      .where(sameGeneration);
  } catch (error) {
    if (error instanceof ThreadsAuthError) {
      await markNeedsReconnect(deps.db, threadsAccountId, cred.generation);
      return;
    }
    if (error instanceof ThreadsApiError) throw new AppError(THREADS_ERRORS.THREADS_UNAVAILABLE);
    throw error;
  }
}

/**
 * 運用アカウントが Threads に投稿できる状態かを確かめる（テストの投稿はしない。投稿の上限の窓口は投稿の権限がないと呼べない）。
 * @param deps 土台が渡す道具
 * @param threadsAccountId 運用アカウントの ID
 * @returns 確かめの結果
 */
export async function checkPublish(
  deps: DomainRouteDeps,
  threadsAccountId: string,
): Promise<ThreadsCheck> {
  const none = { quotaUsage: null, quotaTotal: null };
  const cred = await loadCredentials(deps.db, deps.secretBox, threadsAccountId, deps.logger);
  if (!cred || cred.connectionStatus === "not_connected")
    return { status: "not_connected", ...none };
  if (cred.connectionStatus === "needs_reconnect") return { status: "needs_reconnect", ...none };
  if (!cred.token) return { status: "unknown", ...none };
  try {
    const { quotaUsage, quotaTotal } = await threadsClientOf(deps).getPublishingLimit(
      cred.token,
      cred.threadsUserId,
    );
    return { status: "ok", quotaUsage, quotaTotal };
  } catch (error) {
    if (isTemporary(error)) return { status: "unknown", ...none };
    if (error instanceof ThreadsAuthError) {
      await markNeedsReconnect(deps.db, threadsAccountId, cred.generation);
      return { status: "needs_reconnect", ...none };
    }
    if (error instanceof ThreadsApiError) return { status: "no_publish_permission", ...none };
    throw error;
  }
}

// ---- 定期の仕事の中の確かめ直しと延長 ----

/**
 * 期限を確かめられなかったトークンを、2時間後に確かめ直す（1回に最大20件）。
 * @param deps 土台が渡す道具
 * @param threads Threads の API の呼び出し
 * @param now 今
 * @returns 確かめた数
 */
export async function runTokenRecheck(
  deps: DomainRouteDeps,
  threads: ThreadsClient,
  now: Date,
): Promise<number> {
  const due = await deps.db
    .select({ threadsAccountId: threadsConnection.threadsAccountId })
    .from(threadsConnection)
    .where(and(isNotNull(threadsConnection.recheckAt), lte(threadsConnection.recheckAt, now)))
    .orderBy(asc(threadsConnection.recheckAt))
    .limit(TOKEN_RECHECK_BATCH);
  let checked = 0;
  for (const { threadsAccountId } of due) {
    try {
      await recheckOne(deps, threads, threadsAccountId, now);
      checked += 1;
    } catch (error) {
      deps.logger.error(
        { threadsAccountId, errorName: (error as Error).name },
        "トークンの確かめ直しに失敗しました",
      );
    }
  }
  return checked;
}

/**
 * 1件の接続を確かめ直す。
 * @param deps 土台が渡す道具
 * @param threads Threads の API の呼び出し
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 */
async function recheckOne(
  deps: DomainRouteDeps,
  threads: ThreadsClient,
  threadsAccountId: string,
  now: Date,
): Promise<void> {
  const { db } = deps;
  const cred = await loadCredentials(db, deps.secretBox, threadsAccountId, deps.logger);
  if (!cred) return;
  const where = and(
    eq(threadsConnection.threadsAccountId, threadsAccountId),
    sql`(SELECT ${threadsAccount.connectionGeneration} FROM ${threadsAccount} WHERE ${threadsAccount.id} = ${threadsAccountId}) = ${cred.generation}`,
  );
  const retry = () =>
    db
      .update(threadsConnection)
      .set({ recheckAt: new Date(now.getTime() + TOKEN_RECHECK_RETRY_MINUTES * MINUTE_MS) })
      .where(where);
  if (!cred.token) {
    await retry();
    return;
  }
  try {
    await threads.getProfile(cred.token);
  } catch (error) {
    if (error instanceof ThreadsAuthError) {
      // 使えない：短期トークンだったかもしれないと添えて、接続し直しが要る状態にする
      await markNeedsReconnect(db, threadsAccountId, cred.generation, "short_lived_token");
      await db.update(threadsConnection).set({ recheckAt: null }).where(where);
      return;
    }
    if (error instanceof ThreadsApiError) {
      await retry();
      return;
    }
    throw error;
  }
  const info = await threads.debugToken(cred.token).catch(() => null);
  if (info && info.scopes.length > 0) {
    await db
      .update(threadsAccount)
      .set({ repliesDeniedAt: info.scopes.includes("threads_manage_replies") ? null : now })
      .where(eq(threadsAccount.id, threadsAccountId));
  }
  await db
    .update(threadsConnection)
    .set({ recheckAt: null, ...(info?.expiresAt ? { expiresAt: info.expiresAt } : {}) })
    .where(where);
}

/** 1回の定期の仕事で延ばすトークンの数。 */
const REFRESH_BATCH = 10;

/**
 * トークンを延ばす：期限を過ぎた接続は接続し直しが要る状態にし、期限まで7日を切って発行から24時間たったものを延ばす。
 * 接続し直しが要る接続も、トークンが残っていれば延ばしてみて、延ばせたら接続済みに戻す（めぐるの token-refresh.ts。threads-012）。
 * 延ばすと発行の日時が今になるので、同じものを続けて選ばない。1件の失敗で全体を止めない。
 * @param deps 土台が渡す道具
 * @param threads Threads の API の呼び出し
 * @param now 今
 * @returns 延ばした数
 */
export async function refreshExpiringTokens(
  deps: DomainRouteDeps,
  threads: ThreadsClient,
  now: Date,
): Promise<number> {
  const { db } = deps;
  const expired = await db
    .select({ id: threadsAccount.id, generation: threadsAccount.connectionGeneration })
    .from(threadsConnection)
    .innerJoin(threadsAccount, eq(threadsAccount.id, threadsConnection.threadsAccountId))
    .where(
      and(lt(threadsConnection.expiresAt, now), eq(threadsAccount.connectionStatus, "connected")),
    );
  for (const row of expired) await markNeedsReconnect(db, row.id, row.generation);
  const box = deps.secretBox;
  if (!box) return 0;
  const candidates = await db
    .select({ id: threadsAccount.id })
    .from(threadsConnection)
    .innerJoin(threadsAccount, eq(threadsAccount.id, threadsConnection.threadsAccountId))
    .where(
      and(
        // 接続し直しが要るものは、1日に1回だけ試す（試したら運用アカウントの更新の日時が今になる）
        or(
          eq(threadsAccount.connectionStatus, "connected"),
          and(
            eq(threadsAccount.connectionStatus, "needs_reconnect"),
            lt(threadsAccount.updatedAt, new Date(now.getTime() - DAY_MS)),
          ),
        ),
        lt(threadsConnection.expiresAt, new Date(now.getTime() + 7 * DAY_MS)),
        gt(threadsConnection.expiresAt, now),
        lt(threadsConnection.issuedAt, new Date(now.getTime() - DAY_MS)),
      ),
    )
    .orderBy(asc(threadsConnection.expiresAt))
    .limit(REFRESH_BATCH);
  let refreshed = 0;
  for (const { id } of candidates) {
    try {
      if (await refreshOne(deps, box, threads, id, now)) refreshed += 1;
    } catch (error) {
      deps.logger.error(
        { threadsAccountId: id, errorName: (error as Error).name },
        "トークンを延ばせませんでした",
      );
    }
  }
  return refreshed;
}

/**
 * 1件のトークンを延ばす（プロフィールも取り直し、IV は新しく作る）。読んだときの世代が変わっていれば結果を捨てる。
 * 延ばせたら接続済みにする（接続し直しが要る状態からも戻す）。
 * @param deps 土台が渡す道具
 * @param box 秘密の箱
 * @param threads Threads の API の呼び出し
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @returns 延ばしたら true
 */
async function refreshOne(
  deps: DomainRouteDeps,
  box: SecretBox,
  threads: ThreadsClient,
  threadsAccountId: string,
  now: Date,
): Promise<boolean> {
  const cred = await loadCredentials(deps.db, box, threadsAccountId, deps.logger);
  if (!cred?.token || cred.connectionStatus === "not_connected") return false;
  let next: { accessToken: string; expiresAt: Date };
  let profile: ThreadsProfile;
  try {
    next = await threads.refresh(cred.token);
    profile = await threads.getProfile(next.accessToken);
  } catch (error) {
    if (cred.connectionStatus === "needs_reconnect") {
      // 延ばせなかった：試した日時を残し、次は1日あとに試す
      await deps.db
        .update(threadsAccount)
        .set({ updatedAt: now })
        .where(
          and(
            eq(threadsAccount.id, threadsAccountId),
            eq(threadsAccount.connectionGeneration, cred.generation),
          ),
        );
      if (error instanceof ThreadsAuthError || error instanceof ThreadsApiError) return false;
      throw error;
    }
    if (error instanceof ThreadsAuthError) {
      await markNeedsReconnect(deps.db, threadsAccountId, cred.generation);
      return false;
    }
    if (error instanceof ThreadsApiError) return false;
    throw error;
  }
  const sealed = await box.seal(next.accessToken, threadsAccountId);
  return deps.db.transaction(async (tx) => {
    const bumped = await tx
      .update(threadsAccount)
      .set({
        connectionGeneration: cred.generation + 1,
        username: profile.username,
        displayName: profile.name,
        connectionStatus: "connected",
        reconnectHint: null,
      })
      .where(
        and(
          eq(threadsAccount.id, threadsAccountId),
          eq(threadsAccount.connectionGeneration, cred.generation),
        ),
      )
      .returning({ id: threadsAccount.id });
    if (bumped.length === 0) return false;
    await tx
      .update(threadsConnection)
      .set({
        accessTokenCiphertext: sealed.ciphertext,
        accessTokenIv: sealed.iv,
        keyVersion: sealed.keyVersion,
        expiresAt: next.expiresAt,
        issuedAt: now,
      })
      .where(eq(threadsConnection.threadsAccountId, threadsAccountId));
    return true;
  });
}

/**
 * 1日より前の確かめの失敗の記録を消す。
 * @param db DB
 * @param now 今
 */
export async function purgeTokenCheckFailures(db: Executor, now: Date): Promise<void> {
  await db
    .delete(threadsTokenCheckFailure)
    .where(lt(threadsTokenCheckFailure.failedAt, new Date(now.getTime() - DAY_MS)));
}
