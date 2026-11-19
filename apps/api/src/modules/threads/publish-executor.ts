// 公開まで進める（threads-002。めぐるの publish/publish-executor.ts を写した）。
// 二重の公開を防ぐため、公開を送る前にコンテナーの ID と publish_requested_at を保存する。
// publish_requested_at があり結果がわからない間は、新しいコンテナーを作らない（1つのコンテナーは1回しか公開できない）。
// 試みの更新は、すべて「処理中で、札が同じ」ことを条件にする。持ち時間が切れてほかの処理に取られた古い処理は、何も書かずに終える。
// ログは ID とエラーの種類だけ（本文・トークンを出さない）。
import {
  AUTOPOST_FIND_PUBLISHED_HOURS,
  AUTOPOST_RECHECK_MAX_MINUTES,
  AUTOPOST_RECHECK_MIN_MINUTES,
  AUTOPOST_RECONCILE_SKEW_SECONDS,
  AUTOPOST_RETRY_DELAYS_MINUTES,
  AUTOPOST_RETRY_MAX,
  addDays,
  jstDateOf,
  jstMidnight,
} from "@workspace/contracts/threads";
import type { PublishError } from "@workspace/contracts/threads";
import { and, eq, exists, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { recordActivity } from "./activity-log.ts";
import { loadCredentials, markNeedsReconnect } from "./connection.ts";
import type { ThreadsCredentials } from "./connection.ts";
import {
  threadsAccount,
  threadsPostDraft,
  threadsPostingSchedule,
  threadsPublishAttempt,
} from "./schema.ts";
import {
  ThreadsApiError,
  ThreadsAuthError,
  ThreadsRateLimitError,
  ThreadsTransientError,
} from "./threads-client.ts";
import type { ThreadsClient } from "./threads-client.ts";

/** 試みの行。 */
type AttemptRow = typeof threadsPublishAttempt.$inferSelect;
/** 案の行。 */
type DraftRow = typeof threadsPostDraft.$inferSelect;
/** 飛ばした理由（公開まで進める途中で）。 */
type SkipReason = "needs_reconnect" | "rate_limited" | "auto_post_off";

/** 公開まで進めた結果。 */
export type ExecuteOutcome =
  | { kind: "published"; slotAt: Date; draftId: string; needsPermalink: boolean }
  | { kind: "waiting" }
  | { kind: "retry" }
  | { kind: "carried_over" }
  | { kind: "failed" }
  | { kind: "skipped"; reason: SkipReason };

/** 持ち時間をほかの処理に取られた（つなぎ直しの片付けを含む）。この処理では、それ以上何も書かず、公開もしない。 */
class LeaseLostError extends Error {
  /** 作る */
  constructor() {
    super("publish attempt lease lost");
    this.name = "LeaseLostError";
  }
}

/** 定期の仕事が試みを進めるのに使う道具。 */
export type ExecutorDeps = Pick<DomainRouteDeps, "db" | "logger" | "secretBox">;

/**
 * 一時的な失敗の理由を分ける。
 * @param error 失敗
 * @returns 理由の code
 */
function transientError(error: unknown): PublishError {
  if (error instanceof ThreadsTransientError)
    return error.status === 0 ? "network" : "threads_server";
  return "unknown";
}

/**
 * Threads の日時（+0000 の形）を Date にする。
 * @param ts Threads の timestamp
 * @returns 日時
 */
function parseThreadsTime(ts: string): Date {
  return new Date(ts.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

/**
 * 試みを1つ、公開まで進める。呼ぶ側が試みの持ち時間（lease_until）と札（lease_token）を取ってあること。
 * @param deps 道具
 * @param threads Threads の API の呼び出し
 * @param attemptId 試みの ID
 * @param leaseToken 持ち時間を取ったときの札
 * @param now この回の基準の時刻
 * @param clock 実際の時刻（公開を送った・答えを受けた時刻の記録に使う。テストで差しかえる）
 * @returns 結果
 */
export async function executeAttempt(
  deps: ExecutorDeps,
  threads: ThreadsClient,
  attemptId: string,
  leaseToken: string,
  now: Date,
  clock: () => Date = () => new Date(),
): Promise<ExecuteOutcome> {
  try {
    return await executeOwned(deps, threads, attemptId, leaseToken, now, clock);
  } catch (error) {
    if (!(error instanceof LeaseLostError)) throw error;
    deps.logger.warn({ attemptId }, "自動投稿：持ち時間を取られたので、書かずに止めました");
    return { kind: "waiting" };
  }
}

/**
 * 試みを進める（持ち時間を取られたら LeaseLostError）。
 * @param deps 道具
 * @param threads Threads の API の呼び出し
 * @param attemptId 試みの ID
 * @param leaseToken 札
 * @param now 基準の時刻
 * @param clock 実際の時刻
 * @returns 結果
 */
async function executeOwned(
  deps: ExecutorDeps,
  threads: ThreadsClient,
  attemptId: string,
  leaseToken: string,
  now: Date,
  clock: () => Date,
): Promise<ExecuteOutcome> {
  const { db } = deps;
  const [row] = await db
    .select({ attempt: threadsPublishAttempt, draft: threadsPostDraft })
    .from(threadsPublishAttempt)
    .leftJoin(threadsPostDraft, eq(threadsPostDraft.id, threadsPublishAttempt.draftId))
    .where(eq(threadsPublishAttempt.id, attemptId))
    .limit(1);
  if (!row || row.attempt.state !== "in_progress" || row.attempt.leaseToken !== leaseToken) {
    return { kind: "waiting" };
  }
  const { attempt, draft } = row;
  if (!draft || draft.status !== "publishing") {
    // 投稿中の案は消せないので、ふつうは起きない
    deps.logger.error({ attemptId }, "自動投稿：投稿中の案のない試み");
    await db
      .update(threadsPublishAttempt)
      .set({ state: "failed", lastError: "unknown", leaseUntil: null, updatedAt: now })
      .where(
        and(
          eq(threadsPublishAttempt.id, attemptId),
          eq(threadsPublishAttempt.leaseToken, leaseToken),
        ),
      );
    return { kind: "failed" };
  }
  const ctx = new AttemptContext(deps, threads, attempt, draft, leaseToken, now, clock);
  const cred = await loadCredentials(db, deps.secretBox, attempt.threadsAccountId, deps.logger);
  if (cred && cred.connectionStatus !== "connected" && !attempt.publishRequestedAt) {
    // 接続し直しが要る：新しく公開しない。公開の結果がわからない途中だけは、確かめを続ける
    return ctx.backToApproved("needs_reconnect");
  }
  if (!cred?.token || cred.threadsUserId === null) {
    // 接続がない・鍵の設定の誤りで開けない。結果がわからない途中なら待ち、そうでなければ一時的な失敗として数える
    if (attempt.publishRequestedAt || attempt.containerId) return ctx.release();
    return ctx.transientFailure("unknown");
  }
  return ctx.run({ ...cred, token: cred.token });
}

/** 投稿に使える接続（つないでいて、トークンを開けた）。 */
type UsableCredentials = Extract<ThreadsCredentials, { threadsUserId: string }> & { token: string };

/** 1つの試みを進める間の状態と操作。 */
class AttemptContext {
  private readonly deps: ExecutorDeps;
  private readonly threads: ThreadsClient;
  private readonly attempt: AttemptRow;
  private readonly draft: DraftRow;
  private readonly leaseToken: string;
  private readonly now: Date;
  private readonly clock: () => Date;

  /**
   * 1つの試みの状態を持つ。
   * @param deps 道具
   * @param threads Threads の API の呼び出し
   * @param attempt 試みの行
   * @param draft 案の行
   * @param leaseToken 札
   * @param now 基準の時刻
   * @param clock 実際の時刻
   */
  constructor(
    deps: ExecutorDeps,
    threads: ThreadsClient,
    attempt: AttemptRow,
    draft: DraftRow,
    leaseToken: string,
    now: Date,
    clock: () => Date,
  ) {
    this.deps = deps;
    this.threads = threads;
    this.attempt = attempt;
    this.draft = draft;
    this.leaseToken = leaseToken;
    this.now = now;
    this.clock = clock;
  }

  /**
   * ログに出す ID。
   * @returns ID
   */
  private get ids() {
    return {
      attemptId: this.attempt.id,
      draftId: this.draft.id,
      threadsAccountId: this.attempt.threadsAccountId,
    };
  }

  /**
   * 試みの更新（処理中で、札が同じときだけ）。
   * @param q DB かトランザクション
   * @param values 更新する列
   * @returns 更新できた行の ID（持ち主でなければ空）
   */
  private attemptUpdate(q: Executor, values: Partial<typeof threadsPublishAttempt.$inferInsert>) {
    return q
      .update(threadsPublishAttempt)
      .set({ ...values, updatedAt: this.now })
      .where(
        and(
          eq(threadsPublishAttempt.id, this.attempt.id),
          eq(threadsPublishAttempt.state, "in_progress"),
          eq(threadsPublishAttempt.leaseToken, this.leaseToken),
        ),
      )
      .returning({ id: threadsPublishAttempt.id });
  }

  /**
   * 試みを更新する。持ち主でなくなっていれば LeaseLostError（公開を送る前の記録なら、公開を送らずに終える）。
   * @param values 更新する列
   */
  private async setAttempt(
    values: Partial<typeof threadsPublishAttempt.$inferInsert>,
  ): Promise<void> {
    if ((await this.attemptUpdate(this.deps.db, values)).length === 0) throw new LeaseLostError();
  }

  /**
   * 試みと案を1つのトランザクションで更新する。試みを先に更新して行に鍵をかけ、持ち主でなければ案も変えない。
   * @param attemptValues 試みの列
   * @param draftValues 案の列
   */
  private async commit(
    attemptValues: Partial<typeof threadsPublishAttempt.$inferInsert>,
    draftValues: Partial<typeof threadsPostDraft.$inferInsert>,
  ): Promise<void> {
    await this.deps.db.transaction(async (tx) => {
      const updated = await this.attemptUpdate(tx, attemptValues);
      if (updated.length === 0) throw new LeaseLostError();
      await tx
        .update(threadsPostDraft)
        .set({ ...draftValues, version: sql`${threadsPostDraft.version} + 1` })
        .where(
          and(
            eq(threadsPostDraft.id, this.draft.id),
            eq(threadsPostDraft.status, "publishing"),
            exists(
              tx
                .select({ id: threadsPublishAttempt.id })
                .from(threadsPublishAttempt)
                .where(
                  and(
                    eq(threadsPublishAttempt.id, this.attempt.id),
                    eq(threadsPublishAttempt.leaseToken, this.leaseToken),
                  ),
                ),
            ),
          ),
        );
    });
  }

  /**
   * 公開まで進める。
   * @param cred 接続
   * @returns 結果
   */
  async run(cred: UsableCredentials): Promise<ExecuteOutcome> {
    try {
      if (this.attempt.publishRequestedAt)
        return await this.confirm(cred, this.attempt.publishRequestedAt);
      let containerId = this.attempt.containerId;
      if (containerId) {
        // 前の回で作ったコンテナー。公開の前に状態を確かめる（やり直し・途中で止まったとき）
        let status;
        try {
          ({ status } = await this.threads.getContainerStatus(cred.token, containerId));
        } catch (error) {
          if (error instanceof ThreadsAuthError) {
            await markNeedsReconnect(this.deps.db, this.attempt.threadsAccountId, cred.generation);
          }
          this.deps.logger.warn(
            { ...this.ids, errorName: (error as Error).name },
            "自動投稿：コンテナーの状態を確かめられません",
          );
          return this.release();
        }
        if (status === "IN_PROGRESS") return this.release();
        if (status === "ERROR") return this.markFailed("container_error");
        // 公開の要求の記録が欠けていても、新しく公開しない。作った日時を基準に照らし合わせる
        if (status === "PUBLISHED") return await this.confirm(cred, this.attempt.createdAt);
        if (status === "EXPIRED") {
          await this.setAttempt({ containerId: null });
          return this.transientFailure("threads_server");
        }
      }
      if (!containerId) {
        ({ containerId } = await this.threads.createTextContainer(
          cred.token,
          cred.threadsUserId,
          this.draft.body,
        ));
        // 公開を送る前に、コンテナーの ID を保存する
        await this.setAttempt({ containerId });
      }
      // 照らし合わせでは、この時刻より前の投稿を候補にしないので、予定の時刻ではなく実際の時刻を残す
      await this.setAttempt({ publishRequestedAt: this.clock() });
      let mediaId: string;
      try {
        const sent = await this.publishFenced(cred, containerId);
        if (sent.kind === "stale") return { kind: "skipped", reason: "needs_reconnect" };
        ({ mediaId } = sent);
      } catch (error) {
        if (error instanceof LeaseLostError) throw error;
        if (
          error instanceof ThreadsAuthError ||
          (error instanceof ThreadsApiError && !(error instanceof ThreadsTransientError))
        ) {
          // 確かな答え（4xx など）なら公開されていない
          await this.setAttempt({ publishRequestedAt: null });
          throw error;
        }
        // 通信の失敗・5xx・DB の失敗：Threads 側で公開まで済んでいるかもしれない。次の回に結果を確かめる（やり直しの回数は数えない）
        this.deps.logger.warn(
          { ...this.ids, errorName: (error as Error).name },
          "自動投稿：公開の結果がわかりません",
        );
        return this.release();
      }
      return await this.succeed(cred, mediaId, this.clock());
    } catch (error) {
      return this.failure(error, cred);
    }
  }

  /**
   * 公開を送る。運用アカウントの行（共有の鍵）と試みの行（排他の鍵）をこの順にかけたトランザクションの中で送る。
   * つなぎ直し・ほかの処理の引き継ぎは送り終わるまで待つので、公開とつなぎ直しの順がどちらかに決まる。
   * @param cred 接続
   * @param containerId 公開するコンテナー
   * @returns 送った結果。接続し直しが要る・世代が読んだときと違うなら stale（送らずに、試みを飛ばして案を承認済みに戻す）
   */
  private publishFenced(
    cred: UsableCredentials,
    containerId: string,
  ): Promise<{ kind: "sent"; mediaId: string } | { kind: "stale" }> {
    return this.deps.db.transaction(async (tx) => {
      const [account] = await tx
        .select({
          status: threadsAccount.connectionStatus,
          generation: threadsAccount.connectionGeneration,
        })
        .from(threadsAccount)
        .where(eq(threadsAccount.id, this.attempt.threadsAccountId))
        .for("share");
      const [owned] = await tx
        .select({ id: threadsPublishAttempt.id })
        .from(threadsPublishAttempt)
        .where(
          and(
            eq(threadsPublishAttempt.id, this.attempt.id),
            eq(threadsPublishAttempt.state, "in_progress"),
            eq(threadsPublishAttempt.leaseToken, this.leaseToken),
          ),
        )
        .for("update");
      if (!owned) throw new LeaseLostError();
      if (account?.status !== "connected" || account.generation !== cred.generation) {
        await tx
          .update(threadsPublishAttempt)
          .set({
            state: "skipped",
            skipReason: "needs_reconnect",
            draftId: null,
            publishRequestedAt: null,
            leaseUntil: null,
            updatedAt: this.now,
          })
          .where(eq(threadsPublishAttempt.id, this.attempt.id));
        await tx
          .update(threadsPostDraft)
          .set({ ...this.backToApprovedDraft(), version: sql`${threadsPostDraft.version} + 1` })
          .where(
            and(eq(threadsPostDraft.id, this.draft.id), eq(threadsPostDraft.status, "publishing")),
          );
        return { kind: "stale" } as const;
      }
      const { mediaId } = await this.threads.publishContainer(
        cred.token,
        cred.threadsUserId,
        containerId,
      );
      return { kind: "sent", mediaId } as const;
    });
  }

  /**
   * 公開の結果がわからない試みを確かめる。
   * @param cred 接続
   * @param requestedAt 公開を送った日時
   * @returns 結果
   */
  private async confirm(cred: UsableCredentials, requestedAt: Date): Promise<ExecuteOutcome> {
    const containerId = this.attempt.containerId;
    if (!containerId) {
      await this.setAttempt({ publishRequestedAt: null });
      return this.transientFailure("unknown");
    }
    let status;
    try {
      ({ status } = await this.threads.getContainerStatus(cred.token, containerId));
    } catch (error) {
      // 確かめられない間は、案を投稿中のまま止める（二重の公開を防ぐ）
      if (error instanceof ThreadsAuthError) {
        await markNeedsReconnect(this.deps.db, this.attempt.threadsAccountId, cred.generation);
      }
      return this.release();
    }
    if (status === "IN_PROGRESS") return this.release();
    if (status === "ERROR") return this.markFailed("container_error");
    if (status === "FINISHED" || status === "EXPIRED") {
      // 公開されていない。FINISHED は同じコンテナーで、EXPIRED は作り直してやり直す
      await this.setAttempt({
        publishRequestedAt: null,
        ...(status === "EXPIRED" ? { containerId: null } : {}),
      });
      return this.transientFailure("threads_server");
    }
    // PUBLISHED：投稿の一覧から、公開を送ったあと（時計のずれの分だけ前まで）で本文が同じ、いちばん古い投稿を探す
    const earliest = requestedAt.getTime() - AUTOPOST_RECONCILE_SKEW_SECONDS * 1000;
    let found: { id: string; timestamp: string } | undefined;
    try {
      const recent = await this.threads.listRecentThreads(
        cred.token,
        cred.threadsUserId,
        new Date(requestedAt.getTime() - 5 * 60_000),
      );
      const text = this.draft.body.trim();
      found = recent
        .filter(
          (post) =>
            (post.text ?? "").trim() === text &&
            parseThreadsTime(post.timestamp).getTime() >= earliest,
        )
        .sort(
          (a, b) =>
            parseThreadsTime(a.timestamp).getTime() - parseThreadsTime(b.timestamp).getTime(),
        )[0];
    } catch (error) {
      if (error instanceof ThreadsAuthError) {
        await markNeedsReconnect(this.deps.db, this.attempt.threadsAccountId, cred.generation);
      }
      return this.release();
    }
    if (found) return this.succeed(cred, found.id, parseThreadsTime(found.timestamp));
    if (this.now.getTime() - requestedAt.getTime() >= AUTOPOST_FIND_PUBLISHED_HOURS * 3600_000) {
      // 公開はできているが、投稿が見つからない（とてもまれ）。ID なしで投稿済みにする
      this.deps.logger.error(this.ids, "自動投稿：公開できたが、投稿が見つかりません");
      return this.succeed(cred, null, requestedAt);
    }
    return this.release();
  }

  /**
   * 公開できたことを記録し、URL を取る。
   * @param cred 接続
   * @param mediaId 公開した投稿の ID（照らし合わせられないときは null）
   * @param publishedAt 投稿の日時
   * @returns 投稿済みの結果
   */
  private async succeed(
    cred: UsableCredentials,
    mediaId: string | null,
    publishedAt: Date,
  ): Promise<ExecuteOutcome> {
    await this.commit(
      { state: "succeeded", leaseUntil: null },
      {
        status: "published",
        publishedAt,
        threadsMediaId: mediaId,
        // 反応の分析のための、公開の時点の記録（試みは保存の期間を過ぎると消えるので写す）
        publishedSlotMinute: this.attempt.slotMinute,
        publishedCarryover: this.attempt.isCarryover,
        publishedPrioritized: this.draft.prioritizedAt !== null,
        prioritizedAt: null,
        carryoverAttemptId: null,
      },
    );
    await recordActivity(this.deps, this.attempt.threadsAccountId, {
      kind: "autopost",
      action: "auto_published",
      summary: this.draft.body,
    });
    const saved = mediaId
      ? await fillPermalink(this.deps, this.threads, cred.token, this.draft.id, mediaId)
      : false;
    return {
      kind: "published",
      slotAt: this.attempt.slotAt,
      draftId: this.draft.id,
      needsPermalink: mediaId !== null && !saved,
    };
  }

  /**
   * 持ち時間を返し、あとの回に続ける。lease_until を「次に確かめる日時」にする（古い試みほど間をあける）。
   * @returns 待つ結果
   */
  async release(): Promise<ExecuteOutcome> {
    const ageMinutes = (this.now.getTime() - this.attempt.createdAt.getTime()) / 60_000;
    const delay = Math.min(
      AUTOPOST_RECHECK_MAX_MINUTES,
      Math.max(AUTOPOST_RECHECK_MIN_MINUTES, ageMinutes / 4),
    );
    await this.setAttempt({ leaseUntil: new Date(this.now.getTime() + delay * 60_000) });
    return { kind: "waiting" };
  }

  /**
   * 失敗を種類ごとに進める。
   * @param error 失敗
   * @param cred 接続
   * @returns 結果
   */
  private async failure(error: unknown, cred: ThreadsCredentials): Promise<ExecuteOutcome> {
    if (error instanceof LeaseLostError) throw error;
    // 上限・一時的な失敗も ThreadsApiError の一種なので、先に見る
    if (error instanceof ThreadsRateLimitError) return this.rateLimited();
    if (error instanceof ThreadsAuthError) {
      await markNeedsReconnect(this.deps.db, this.attempt.threadsAccountId, cred.generation);
      return this.backToApproved("needs_reconnect");
    }
    if (error instanceof ThreadsTransientError) return this.transientFailure(transientError(error));
    if (error instanceof ThreadsApiError) {
      this.deps.logger.warn(
        { ...this.ids, status: error.status },
        "自動投稿：Threads が投稿を受け付けませんでした",
      );
      return this.markFailed("invalid_request");
    }
    this.deps.logger.error(
      { ...this.ids, errorName: (error as Error).name },
      "自動投稿：予期しないエラー",
    );
    return this.transientFailure("unknown");
  }

  /**
   * 一時的な失敗を、やり直し・持ち越し・失敗に進める（5・10・15分後に最大3回。だめなら次の時刻に1回だけ持ち越す）。
   * @param lastError 理由
   * @returns 結果
   */
  async transientFailure(lastError: PublishError): Promise<ExecuteOutcome> {
    const retries = this.attempt.retryCount;
    if (retries < AUTOPOST_RETRY_MAX) {
      const delay = AUTOPOST_RETRY_DELAYS_MINUTES[retries] ?? AUTOPOST_RETRY_DELAYS_MINUTES[2];
      await this.setAttempt({
        state: "retry_wait",
        retryCount: retries + 1,
        nextRetryAt: new Date(this.now.getTime() + delay * 60_000),
        lastError,
        leaseUntil: null,
      });
      return { kind: "retry" };
    }
    if (!this.attempt.isCarryover) {
      await this.commit(
        { state: "carried_over", lastError, leaseUntil: null },
        { status: "approved", carryoverAttemptId: this.attempt.id },
      );
      return { kind: "carried_over" };
    }
    return this.markFailed(lastError);
  }

  /**
   * 投稿に失敗にする。
   * @param lastError 理由
   * @returns 失敗の結果
   */
  private async markFailed(lastError: PublishError): Promise<ExecuteOutcome> {
    await this.commit(
      { state: "failed", lastError, leaseUntil: null },
      {
        status: "publish_failed",
        publishFailedAt: this.now,
        publishError: lastError,
        prioritizedAt: null,
        carryoverAttemptId: null,
      },
    );
    await recordActivity(this.deps, this.attempt.threadsAccountId, {
      kind: "autopost",
      action: "auto_publish_failed",
      summary: this.draft.body,
    });
    return { kind: "failed" };
  }

  /**
   * 認証の失敗・上限・オフでは、承認済みに戻す。
   * @param reason 飛ばした理由
   * @returns 飛ばした結果
   */
  async backToApproved(reason: SkipReason): Promise<ExecuteOutcome> {
    await this.commit(
      { state: "skipped", skipReason: reason, draftId: null, leaseUntil: null },
      this.backToApprovedDraft(),
    );
    return { kind: "skipped", reason };
  }

  /**
   * 承認済みに戻すときの案の列。持ち越しの試みなら、持ち越しの印をこの試みにして付け直す。
   * @returns 案の列
   */
  private backToApprovedDraft(): Partial<typeof threadsPostDraft.$inferInsert> {
    return {
      status: "approved",
      ...(this.attempt.isCarryover ? { carryoverAttemptId: this.attempt.id } : {}),
    };
  }

  /**
   * 上限では、上限の答えを受けた日の次の日の0時（日本時間）まで止める。
   * @returns 飛ばした結果
   */
  private async rateLimited(): Promise<ExecuteOutcome> {
    const pausedUntil = jstMidnight(addDays(jstDateOf(this.clock()), 1));
    await this.deps.db
      .update(threadsPostingSchedule)
      .set({ pausedUntil })
      .where(eq(threadsPostingSchedule.threadsAccountId, this.attempt.threadsAccountId));
    this.deps.logger.warn(
      { threadsAccountId: this.attempt.threadsAccountId },
      "自動投稿：Threads の上限に達しました",
    );
    return this.backToApproved("rate_limited");
  }
}

/**
 * 投稿の URL を取って保存する。失敗しても投稿済みは変えない（あとの回に取り直す）。
 * @param deps 道具
 * @param threads Threads の API の呼び出し
 * @param token トークン
 * @param draftId 案の ID
 * @param mediaId Threads の投稿の ID
 * @returns 取れたら true
 */
export async function fillPermalink(
  deps: Pick<ExecutorDeps, "db" | "logger">,
  threads: ThreadsClient,
  token: string,
  draftId: string,
  mediaId: string,
): Promise<boolean> {
  try {
    const media = await threads.getMedia(token, mediaId);
    if (!media.permalink) return false;
    await deps.db
      .update(threadsPostDraft)
      .set({ threadsPermalink: media.permalink })
      .where(eq(threadsPostDraft.id, draftId));
    return true;
  } catch (error) {
    deps.logger.warn(
      { draftId, errorName: (error as Error).name },
      "自動投稿：投稿の URL を取れませんでした",
    );
    return false;
  }
}
