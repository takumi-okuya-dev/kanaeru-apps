// 投稿の案の操作の結合のテスト（threads-011。めぐるの投稿ストックとそろえたところ。本物の PostgreSQL）：
// 承認・却下の送り直し（requestId）・規約に注意の確かめ・承認済みと承認待ちの上限・投稿に失敗の入れ直し・
// 消せる状態とまとめて消す・ためたのを取り消す・NG ワードをまとめて足す・承認待ちの並び・投稿済みの50件ずつ。
// 約束の zod の形は、@hono/zod-openapi を読んだあとに作られたものだけが .openapi() を持つので、先に読む。
import "@hono/zod-openapi";
import type {
  ActivityEntry,
  DeletedCount,
  DraftBatchResult,
  DraftList,
  NgWordsResult,
  PostDraft,
  ReviewResult,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import {
  APPROVED_LIMIT,
  NEEDS_REVIEW_LIMIT,
  NG_WORD_LIMIT,
  PUBLISHED_PAGE_SIZE,
  checkPublishable,
} from "@workspace/contracts/threads";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { createDomainFeatures } from "../../kernel/features.ts";

const database = useTestDatabase();

/** 道の頭。 */
const BASE = "/api/v1/threads/accounts";

/** 規約に注意の表現を含む本文（収益の断定）。 */
const CAUTION_BODY = "この方法なら必ず儲かる、月100万円も夢じゃない";

describe("投稿の案の操作（threads-011）", () => {
  let app: TestApp;
  let cookie: string;
  let accountId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    app = buildApp(database, testConfig(), { features: createDomainFeatures([]) });
    cookie = (await loginAs(app)).cookie;
    accountId = (
      (await (await call(app, cookie, BASE, "POST", { name: "運用" })).json()) as ThreadsAccount
    ).id;
  });

  /**
   * 運用アカウントの窓口を呼ぶ。
   * @param path 運用アカウントのあとの道
   * @param method 動き
   * @param payload 本文
   * @returns 応答
   */
  function api(path: string, method = "GET", payload?: unknown): Promise<Response> {
    return call(app, cookie, `${BASE}/${accountId}${path}`, method, payload);
  }

  /**
   * 案をためる。
   * @param bodies 本文
   * @returns ためた結果
   */
  async function paste(bodies: string[]): Promise<DraftBatchResult> {
    const response = await api("/draft-batches", "POST", {
      clientRequestId: randomUUID(),
      text: bodies.join("\n@@@\n"),
    });
    expect(response.status).toBe(201);
    return (await response.json()) as DraftBatchResult;
  }

  /**
   * 承認・却下・戻す。
   * @param body 入力
   * @returns 結果
   */
  async function review(body: unknown): Promise<ReviewResult> {
    const response = await api("/drafts/review", "POST", body);
    expect(response.status).toBe(200);
    return (await response.json()) as ReviewResult;
  }

  /**
   * 案を承認・却下などの入力の項目にする。
   * @param drafts 案
   * @returns 項目
   */
  function items(drafts: readonly PostDraft[]) {
    return drafts.map((draft) => ({ id: draft.id, version: draft.version }));
  }

  /**
   * 状態ごとの一覧。
   * @param status 状態
   * @param before 投稿済みの続き
   * @returns 一覧
   */
  async function list(status: string, before?: string): Promise<DraftList> {
    const query = before ? `&before=${encodeURIComponent(before)}` : "";
    return (await (await api(`/drafts?status=${status}${query}`)).json()) as DraftList;
  }

  /**
   * DB に直に案を入れる（上限・投稿済みの確かめ用。50件ずつのまとまり）。
   * @param count 件数
   * @param status 状態（approved・needs_review・published）
   */
  async function insertDrafts(count: number, status: string): Promise<void> {
    for (let start = 0; start < count; start += 50) {
      const size = Math.min(50, count - start);
      const batch = await database.pool.query<{ id: string }>(
        "INSERT INTO threads_draft_batch (threads_account_id, client_request_id, draft_count, delimiter_found) VALUES ($1, $2, $3, true) RETURNING id",
        [accountId, randomUUID(), size],
      );
      await database.pool.query(
        `INSERT INTO threads_post_draft (threads_account_id, batch_id, position, body, status, reviewed_at, published_at, threads_media_id)
         SELECT $1, $2, n, '入れた案 ' || ($3::int + n), $4,
           CASE WHEN $4 = 'needs_review' THEN NULL ELSE now() END,
           CASE WHEN $4 = 'published' THEN now() - make_interval(mins => $3::int + n) ELSE NULL END,
           CASE WHEN $4 = 'published' THEN 'm' || ($3::int + n) ELSE NULL END
         FROM generate_series(0, $5::int - 1) AS n`,
        [accountId, batch.rows[0]?.id, start, status, size],
      );
    }
  }

  describe("承認・却下", () => {
    it("同じ requestId の送り直しは、変えたものとして返し二重に記録しない。別の操作なら STALE", async () => {
      const { drafts } = await paste(["一つ目", "二つ目"]);
      const requestId = randomUUID();
      const first = await review({ action: "approve", requestId, items: items(drafts) });
      expect(first.drafts.map((draft) => draft.status)).toEqual(["approved", "approved"]);
      const again = await review({ action: "approve", requestId, items: items(drafts) });
      expect(again.drafts.map((draft) => draft.id)).toEqual(drafts.map((draft) => draft.id));
      expect(again.skipped).toEqual([]);
      const other = await review({
        action: "approve",
        requestId: randomUUID(),
        items: items(drafts),
      });
      expect(other.skipped.map((item) => item.reason)).toEqual(["STALE", "STALE"]);
      const logged = (await (await api("/activity?kind=review")).json()) as {
        items: ActivityEntry[];
      };
      expect(logged.items.map((item) => [item.action, item.itemCount])).toEqual([
        ["drafts_approved", 2],
      ]);
    });

    it("規約に注意の案は、確かめ（confirmPolicyCaution）がなければ承認しない", async () => {
      expect(checkPublishable(CAUTION_BODY, []).policyCautions.length).toBeGreaterThan(0);
      const { drafts } = await paste([CAUTION_BODY, "ふつうの案です"]);
      const without = await review({ action: "approve", items: items(drafts) });
      expect(without.drafts.map((draft) => draft.body)).toEqual(["ふつうの案です"]);
      expect(without.skipped).toEqual([{ id: drafts[0]?.id, reason: "POLICY_CONFIRM_REQUIRED" }]);
      const withConfirm = await review({
        action: "approve",
        items: items(drafts.slice(0, 1)),
        confirmPolicyCaution: true,
      });
      expect(withConfirm.drafts.map((draft) => draft.status)).toEqual(["approved"]);
    });

    it("承認済みが上限なら承認しない。承認待ちが上限なら承認待ちに戻さない（LIMIT）", async () => {
      await insertDrafts(APPROVED_LIMIT, "approved");
      const { drafts } = await paste(["上限を超える案"]);
      const approved = await review({ action: "approve", items: items(drafts) });
      expect(approved.skipped.map((item) => item.reason)).toEqual(["LIMIT"]);
      expect(approved.counts.approved).toBe(APPROVED_LIMIT);

      await insertDrafts(NEEDS_REVIEW_LIMIT - 1, "needs_review");
      const queue = (await list("approved")).drafts.slice(0, 2);
      const reopened = await review({ action: "reopen", items: items(queue) });
      expect(reopened.drafts).toHaveLength(0);
      expect(reopened.skipped.map((item) => item.reason)).toEqual(["LIMIT", "LIMIT"]);
    });

    it("投稿に失敗の案を承認し直すと、承認した日時は元のまま、投稿の順の先頭に入る", async () => {
      const { drafts } = await paste(["先に承認した案", "失敗した案"]);
      const approved = await review({ action: "approve", items: items(drafts) });
      const failedId = drafts[1]?.id;
      await database.pool.query(
        "UPDATE threads_post_draft SET status = 'publish_failed', publish_failed_at = now(), publish_error = 'network', reviewed_at = now() - interval '1 day' WHERE id = $1",
        [failedId],
      );
      const failed = (await list("publish_failed")).drafts;
      const before = failed[0]?.reviewedAt;
      const requeued = await review({ action: "approve", items: items(failed) });
      expect(requeued.drafts[0]).toMatchObject({ status: "approved", reviewedAt: before });
      expect(requeued.drafts[0]?.prioritizedAt).not.toBeNull();
      expect((await list("approved")).drafts.map((draft) => draft.id)).toEqual([
        failedId,
        approved.drafts[0]?.id,
      ]);
      const logged = (await (await api("/activity?kind=review")).json()) as {
        items: ActivityEntry[];
      };
      expect(logged.items[0]?.action).toBe("drafts_requeued");
    });
  });

  describe("消す・取り消す", () => {
    it("消せるのは承認待ちと却下だけ（承認済み・投稿済みは THREADS_DRAFT_STATE）", async () => {
      const { drafts } = await paste(["承認する", "却下する", "残す"]);
      const [toApprove, toReject] = drafts;
      if (!toApprove || !toReject) throw new Error("案がない");
      await review({ action: "approve", items: items([toApprove]) });
      await review({ action: "reject", items: items([toReject]), note: "いらない" });
      const approvedDelete = await api(`/drafts/${toApprove.id}`, "DELETE");
      expect(approvedDelete.status).toBe(409);
      expect(((await approvedDelete.json()) as ErrorBody).error.code).toBe("THREADS_DRAFT_STATE");
      await insertDrafts(1, "published");
      const published = (await list("published")).drafts[0];
      const publishedDelete = await api(`/drafts/${published?.id}`, "DELETE");
      expect(((await publishedDelete.json()) as ErrorBody).error.code).toBe("THREADS_DRAFT_STATE");

      const bulk = await api("/drafts/delete", "POST", {
        ids: drafts.map((draft) => draft.id),
      });
      expect(((await bulk.json()) as DeletedCount).deletedCount).toBe(2);
      expect((await list("approved")).drafts.map((draft) => draft.id)).toEqual([toApprove.id]);
      expect((await list("needs_review")).drafts).toEqual([]);
      const logged = (await (await api("/activity?kind=draft")).json()) as {
        items: ActivityEntry[];
      };
      expect(logged.items[0]).toMatchObject({ action: "drafts_deleted", itemCount: 2 });
      expect((await api("/drafts/delete", "POST", { ids: [] })).status).toBe(400);
    });

    it("ためたのを取り消すと、そのまとまりの承認待ちだけが消える。送り直しは残りだけ返す", async () => {
      const clientRequestId = randomUUID();
      const pasted = (await (
        await api("/draft-batches", "POST", { clientRequestId, text: "一\n@@@\n二\n@@@\n三" })
      ).json()) as DraftBatchResult;
      expect([pasted.draftCount, pasted.overLimitCount]).toEqual([3, 0]);
      await review({ action: "approve", items: items(pasted.drafts.slice(0, 1)) });
      const undone = await api(`/draft-batches/${pasted.batchId}`, "DELETE");
      expect(((await undone.json()) as DeletedCount).deletedCount).toBe(2);
      expect((await list("approved")).drafts).toHaveLength(1);
      const resent = (await (
        await api("/draft-batches", "POST", { clientRequestId, text: "一\n@@@\n二\n@@@\n三" })
      ).json()) as DraftBatchResult;
      expect([resent.batchId, resent.drafts.length]).toEqual([pasted.batchId, 0]);
      const other = (await loginAs(app, { lineUserId: `U${"7".repeat(32)}` })).cookie;
      const otherAccount = (await (
        await call(app, other, BASE, "POST", { name: "ほかの人" })
      ).json()) as ThreadsAccount;
      expect(
        (
          await call(
            app,
            other,
            `${BASE}/${otherAccount.id}/draft-batches/${pasted.batchId}`,
            "DELETE",
          )
        ).status,
      ).toBe(404);
    });

    it("Threads の上限を超える件数を返す", async () => {
      const pasted = await paste([`${"あ".repeat(501)}`, "短い案"]);
      expect(pasted.overLimitCount).toBe(1);
    });
  });

  describe("NG ワード", () => {
    it("まとめて足し、もうある語は返し、足した語を含む承認済みの案を承認待ちに戻す。上限を超えると何も足さない", async () => {
      const { drafts } = await paste(["絶対に伸びる話", "ふつうの話"]);
      await review({ action: "approve", items: items(drafts) });
      await api("/ng-words", "POST", { words: ["最強"] });
      const response = await api("/ng-words", "POST", { words: ["絶対", "最強", "絶対", "必ず"] });
      expect(response.status).toBe(201);
      const result = (await response.json()) as NgWordsResult;
      expect(result.added.map((word) => word.word)).toEqual(["絶対", "必ず"]);
      expect(result.duplicates).toEqual(["最強", "絶対"]);
      expect(result.reopenedCount).toBe(1);
      expect((await list("needs_review")).drafts.map((draft) => draft.body)).toEqual([
        "絶対に伸びる話",
      ]);
      const tooMany = Array.from({ length: NG_WORD_LIMIT - 2 }, (_, index) => `語${index}`);
      const limit = await api("/ng-words", "POST", { words: tooMany });
      expect(((await limit.json()) as ErrorBody).error.code).toBe("THREADS_NG_WORD_LIMIT");
      expect((await (await api("/posting-rules")).json()) as { ngWords: unknown[] }).toMatchObject({
        ngWords: { length: 3 },
      });
    });
  });

  describe("一覧", () => {
    it("承認待ちは、ためた新しいまとまりが先（まとまりの中は貼った順）", async () => {
      await paste(["古い一", "古い二"]);
      await paste(["新しい一", "新しい二"]);
      expect((await list("needs_review")).drafts.map((draft) => draft.body)).toEqual([
        "新しい一",
        "新しい二",
        "古い一",
        "古い二",
      ]);
    });

    it("投稿済みは新しい順に50件ずつ読み、続きは nextCursor。壊れたカーソルは 400", async () => {
      await insertDrafts(PUBLISHED_PAGE_SIZE + 1, "published");
      const first = await list("published");
      expect(first.drafts).toHaveLength(PUBLISHED_PAGE_SIZE);
      expect(first.drafts[0]?.body).toBe("入れた案 0");
      expect(first.nextCursor).not.toBeNull();
      const second = await list("published", first.nextCursor ?? undefined);
      expect(second.drafts.map((draft) => draft.body)).toEqual([`入れた案 ${PUBLISHED_PAGE_SIZE}`]);
      expect(second.nextCursor).toBeNull();
      const bad = await api("/drafts?status=published&before=broken");
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as ErrorBody).error.fields?.[0]?.path).toBe("before");
    });
  });
});
