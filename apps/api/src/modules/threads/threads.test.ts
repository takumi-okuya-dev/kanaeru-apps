// Threads の運用の窓口の結合のテスト（本物の PostgreSQL）：台帳の公開の状態・ログイン・持ち主の確かめ（ほかの人のものは 404）・
// 運用アカウント（作る・上限・名前・消す）・戦略（版）・プロンプトの設定とプロンプト・投稿のルールと NG ワード・
// 案をまとめてためる（区切り・送り直し・上限）・案を直す・承認と却下と戻す・CHECK と約束の食い違い。
// 約束の zod の形は、@hono/zod-openapi を読んだあとに作られたものだけが .openapi() を持つので、先に読む。
import "@hono/zod-openapi";
import type {
  DraftBatchResult,
  DraftList,
  GeneratedPrompt,
  NgWord,
  NgWordsResult,
  PostDraft,
  PostingRules,
  ReviewResult,
  Strategy,
  ThreadsAccount,
  ThreadsAccountList,
} from "@workspace/contracts/threads";
import {
  DRAFT_STATUSES,
  REJECT_REASON_CODES,
  THREADS_ACCOUNT_LIMIT,
  TONE_PRESET_VALUES,
  emptyStrategyValues,
} from "@workspace/contracts/threads";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { upsertVisibility } from "../suite/index.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { createDomainFeatures } from "../../kernel/features.ts";

const database = useTestDatabase();

/** ない ID。 */
const MISSING_ID = "0193a1b2-0000-7000-8000-000000000000";

/** 道の頭。 */
const BASE = "/api/v1/threads/accounts";

/**
 * Threads の API を組み立てる（台帳の公開は beforeEach の showThreadsApp）。
 * @returns 組み立てた API
 */
function buildThreadsApp(): TestApp {
  return buildApp(database, testConfig(), {
    features: createDomainFeatures([]),
  });
}

/**
 * CHECK の制約の定義を読む。
 * @param name 制約の名前
 * @returns 定義の文
 */
async function checkDefinition(name: string): Promise<string> {
  const result = await database.pool.query<{ definition: string }>(
    "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = $1",
    [name],
  );
  return result.rows[0]?.definition ?? "";
}

describe("Threads の運用の窓口", () => {
  let app: TestApp;
  let cookie: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    app = buildThreadsApp();
    cookie = (await loginAs(app, { displayName: "たくみ" })).cookie;
  });

  /**
   * 運用アカウントを作る。
   * @param name 名前
   * @param who クッキー（既定は今の利用者）
   * @returns 作った運用アカウント
   */
  async function createAccount(name = "たくみの運用", who = cookie): Promise<ThreadsAccount> {
    const response = await call(app, who, BASE, "POST", { name });
    expect(response.status).toBe(201);
    return (await response.json()) as ThreadsAccount;
  }

  /**
   * 案をまとめてためる。
   * @param accountId 運用アカウントの ID
   * @param text 貼る文
   * @returns ためた結果
   */
  async function paste(accountId: string, text: string): Promise<DraftBatchResult> {
    const response = await call(app, cookie, `${BASE}/${accountId}/draft-batches`, "POST", {
      clientRequestId: randomUUID(),
      text,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as DraftBatchResult;
  }

  /**
   * 案を承認・却下・戻す。
   * @param accountId 運用アカウントの ID
   * @param body 入力
   * @returns 応答
   */
  async function review(accountId: string, body: unknown): Promise<Response> {
    return call(app, cookie, `${BASE}/${accountId}/drafts/review`, "POST", body);
  }

  describe("入口", () => {
    it("台帳で見えなければ、ログインしていても 404（行がなければ運営者だけ・切はだれにも）", async () => {
      await database.pool.query("DELETE FROM app_setting WHERE app_key = 'threads'");
      expect((await call(app, cookie, BASE)).status).toBe(404);
      await upsertVisibility(database.db, "threads", "off");
      expect((await call(app, cookie, BASE)).status).toBe(404);
      await upsertVisibility(database.db, "threads", "public");
      expect((await call(app, cookie, BASE)).status).toBe(200);
    });

    it("ログインしていなければ 401", async () => {
      const response = await app.request(BASE);
      expect(response.status).toBe(401);
    });
  });

  describe("運用アカウント", () => {
    it("作ると一覧に出て、案の数は0から", async () => {
      const created = await createAccount("  AI部  ");
      expect(created.name).toBe("AI部");
      const response = await call(app, cookie, BASE);
      const list = (await response.json()) as ThreadsAccountList;
      expect(list.limit).toBe(THREADS_ACCOUNT_LIMIT);
      expect(list.accounts.map((account) => account.id)).toEqual([created.id]);
      expect(list.accounts[0]?.counts).toEqual({
        needsReview: 0,
        approved: 0,
        rejected: 0,
        published: 0,
        publishFailed: 0,
      });
    });

    it("名前が空なら 400 で、欄の理由が出る", async () => {
      const response = await call(app, cookie, BASE, "POST", { name: "   " });
      expect(response.status).toBe(400);
      const body = (await response.json()) as ErrorBody;
      expect(body.error.fields?.[0]?.path).toBe("name");
    });

    it("上限まで作ると、次は 409 THREADS_ACCOUNT_LIMIT", async () => {
      for (let index = 0; index < THREADS_ACCOUNT_LIMIT; index += 1) {
        await createAccount(`アカウント${index}`);
      }
      const response = await call(app, cookie, BASE, "POST", { name: "もう1つ" });
      expect(response.status).toBe(409);
      expect(((await response.json()) as ErrorBody).error.code).toBe("THREADS_ACCOUNT_LIMIT");
    });

    it("ほかの人の運用アカウントは、読む・直す・消すのどれも 404 で、一覧にも出ない", async () => {
      const mine = await createAccount();
      const other = (await loginAs(app, { displayName: "ほかの人" })).cookie;
      expect((await call(app, other, `${BASE}/${mine.id}`)).status).toBe(404);
      expect(
        (await call(app, other, `${BASE}/${mine.id}`, "PATCH", { name: "乗っ取り" })).status,
      ).toBe(404);
      expect(
        (await call(app, other, `${BASE}/${mine.id}`, "DELETE", { confirmName: mine.name })).status,
      ).toBe(404);
      expect((await call(app, other, `${BASE}/${mine.id}/strategy`)).status).toBe(404);
      const list = (await (await call(app, other, BASE)).json()) as ThreadsAccountList;
      expect(list.accounts).toEqual([]);
    });

    it("名前を直せる。ない ID は 404", async () => {
      const created = await createAccount();
      const response = await call(app, cookie, `${BASE}/${created.id}`, "PATCH", {
        name: "新しい名前",
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as ThreadsAccount).name).toBe("新しい名前");
      expect((await call(app, cookie, `${BASE}/${MISSING_ID}`)).status).toBe(404);
      expect((await call(app, cookie, `${BASE}/not-a-uuid`)).status).toBe(404);
    });

    it("消すときは名前を入れる。違う名前・空は 400 で消えない（threads-012）", async () => {
      const created = await createAccount("消す練習");
      const url = `${BASE}/${created.id}`;
      const wrong = await call(app, cookie, url, "DELETE", { confirmName: "違う名前" });
      expect(wrong.status).toBe(400);
      expect(((await wrong.json()) as ErrorBody).error.code).toBe("THREADS_ACCOUNT_NAME_MISMATCH");
      expect((await call(app, cookie, url, "DELETE", { confirmName: "" })).status).toBe(400);
      expect((await call(app, cookie, url, "DELETE")).status).toBe(400);
      expect((await call(app, cookie, url)).status).toBe(200);
      // 前後の空白は除いて比べる
      expect((await call(app, cookie, url, "DELETE", { confirmName: " 消す練習 " })).status).toBe(
        204,
      );
      expect(
        (await call(app, cookie, `${BASE}/${MISSING_ID}`, "DELETE", { confirmName: "消す練習" }))
          .status,
      ).toBe(404);
    });

    it("消すと、戦略・案・NG ワードも一緒に消える", async () => {
      const created = await createAccount();
      await call(app, cookie, `${BASE}/${created.id}/ng-words`, "POST", { words: ["絶対"] });
      await paste(created.id, "A の本文\n@@@\nB の本文");
      expect(
        (await call(app, cookie, `${BASE}/${created.id}`, "DELETE", { confirmName: created.name }))
          .status,
      ).toBe(204);
      expect((await call(app, cookie, `${BASE}/${created.id}`)).status).toBe(404);
      const drafts = await database.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM threads_post_draft",
      );
      const words = await database.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM threads_ng_word",
      );
      expect(drafts.rows[0]?.n).toBe(0);
      expect(words.rows[0]?.n).toBe(0);
    });
  });

  describe("戦略", () => {
    it("まだなら空の値と版 0。保存すると版が増え、古い版で保存すると 409", async () => {
      const { id } = await createAccount();
      const empty = (await (await call(app, cookie, `${BASE}/${id}/strategy`)).json()) as Strategy;
      expect(empty.version).toBe(0);
      expect(empty.filledCount).toBe(0);
      expect(empty.updatedAt).toBeNull();

      const values = {
        ...emptyStrategyValues(),
        targetPersona: "20〜30代の会社員",
        tonePreset: "polite_warm",
      };
      const first = await call(app, cookie, `${BASE}/${id}/strategy`, "PUT", {
        ...values,
        version: 0,
      });
      expect(first.status).toBe(200);
      const saved = (await first.json()) as Strategy;
      expect(saved.version).toBe(1);
      expect(saved.targetPersona).toBe("20〜30代の会社員");
      expect(saved.filledCount).toBe(2);

      const second = await call(app, cookie, `${BASE}/${id}/strategy`, "PUT", {
        ...values,
        version: 1,
      });
      expect(((await second.json()) as Strategy).version).toBe(2);

      const stale = await call(app, cookie, `${BASE}/${id}/strategy`, "PUT", {
        ...values,
        version: 1,
      });
      expect(stale.status).toBe(409);
      expect(((await stale.json()) as ErrorBody).error.code).toBe("THREADS_VERSION_CONFLICT");
    });

    it("まだないのに版 1 以上で送ると 409。知らない口調は 400", async () => {
      const { id } = await createAccount();
      const values = emptyStrategyValues();
      const stale = await call(app, cookie, `${BASE}/${id}/strategy`, "PUT", {
        ...values,
        version: 3,
      });
      expect(stale.status).toBe(409);
      const bad = await call(app, cookie, `${BASE}/${id}/strategy`, "PUT", {
        ...values,
        tonePreset: "angry",
        version: 0,
      });
      expect(bad.status).toBe(400);
    });
  });

  describe("プロンプト", () => {
    it("設定を保存でき、割合の合計が100でなければ 400", async () => {
      const { id } = await createAccount();
      const current = await (await call(app, cookie, `${BASE}/${id}/prompt-settings`)).json();
      expect(current).toMatchObject({ count: 30 });
      const length = {
        target: 200,
        shortLength: 60,
        mediumLength: 120,
        longLength: 180,
        shortRatio: 30,
        mediumRatio: 40,
        longRatio: 30,
      };
      const ok = await call(app, cookie, `${BASE}/${id}/prompt-settings`, "PUT", {
        count: 10,
        length,
      });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ count: 10, length });
      const bad = await call(app, cookie, `${BASE}/${id}/prompt-settings`, "PUT", {
        count: 10,
        length: { ...length, longRatio: 40 },
      });
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as ErrorBody).error.fields?.[0]?.path).toBe("length.longRatio");
    });

    it("戦略・投稿のルール・NG ワード・却下の理由がプロンプトに入る", async () => {
      const { id } = await createAccount("AI部");
      await call(app, cookie, `${BASE}/${id}/strategy`, "PUT", {
        ...emptyStrategyValues(),
        targetPersona: "モヤモヤしている20代の会社員",
        tonePreset: null,
        version: 0,
      });
      await call(app, cookie, `${BASE}/${id}/core-rules`, "PUT", {
        coreRules: "絵文字は1つまで\n\n",
      });
      await call(app, cookie, `${BASE}/${id}/ng-words`, "POST", { words: ["必ず儲かる"] });
      const batch = await paste(id, "却下する案の本文です\n@@@\n残す案の本文です");
      const target = batch.drafts[0];
      if (!target) throw new Error("案がありません");
      await review(id, {
        action: "reject",
        items: [{ id: target.id, version: target.version }],
        reasons: ["thin"],
      });

      const response = await call(app, cookie, `${BASE}/${id}/prompt`);
      expect(response.status).toBe(200);
      const generated = (await response.json()) as GeneratedPrompt;
      expect(generated.prompt).toContain("モヤモヤしている20代の会社員");
      expect(generated.prompt).toContain("絵文字は1つまで");
      expect(generated.prompt).toContain("必ず儲かる");
      expect(generated.prompt).toContain("却下する案の本文です");
      expect(generated.summary).toMatchObject({
        coreRuleCount: 1,
        ngWordCount: 1,
        rejectedCount: 1,
        recentDraftCount: 1,
      });
      expect(generated.parts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("投稿のルールと NG ワード", () => {
    it("NG ワードは足した順に並び、照合の形で同じものは足さずに返す。外すと消える", async () => {
      const { id } = await createAccount();
      const first = await call(app, cookie, `${BASE}/${id}/ng-words`, "POST", { words: ["絶対"] });
      expect(first.status).toBe(201);
      const added = ((await first.json()) as NgWordsResult).added[0] as NgWord;
      await call(app, cookie, `${BASE}/${id}/ng-words`, "POST", { words: ["最強"] });
      const dup = await call(app, cookie, `${BASE}/${id}/ng-words`, "POST", { words: [" 絶対 "] });
      expect(dup.status).toBe(201);
      expect((await dup.json()) as NgWordsResult).toEqual({
        added: [],
        duplicates: ["絶対"],
        reopenedCount: 0,
      });

      const rules = (await (
        await call(app, cookie, `${BASE}/${id}/posting-rules`)
      ).json()) as PostingRules;
      expect(rules.ngWords.map((word) => word.word)).toEqual(["絶対", "最強"]);

      expect((await call(app, cookie, `${BASE}/${id}/ng-words/${added.id}`, "DELETE")).status).toBe(
        204,
      );
      expect((await call(app, cookie, `${BASE}/${id}/ng-words/${added.id}`, "DELETE")).status).toBe(
        404,
      );
    });

    it("投稿のルールを保存できる。上限を超えると 400", async () => {
      const { id } = await createAccount();
      const ok = await call(app, cookie, `${BASE}/${id}/core-rules`, "PUT", {
        coreRules: "敬語で書く",
      });
      expect(((await ok.json()) as PostingRules).coreRules).toBe("敬語で書く");
      const bad = await call(app, cookie, `${BASE}/${id}/core-rules`, "PUT", {
        coreRules: "あ".repeat(2001),
      });
      expect(bad.status).toBe(400);
    });
  });

  describe("案をまとめてためる", () => {
    it("@@@ の行で分け、貼った順にためる", async () => {
      const { id } = await createAccount();
      const result = await paste(id, "1つ目\n@@@\n2つ目\n＠＠＠\n3つ目");
      expect(result.delimiterFound).toBe(true);
      expect(result.drafts.map((draft) => [draft.position, draft.body, draft.status])).toEqual([
        [0, "1つ目", "needs_review"],
        [1, "2つ目", "needs_review"],
        [2, "3つ目", "needs_review"],
      ]);
      const account = (await (await call(app, cookie, `${BASE}/${id}`)).json()) as ThreadsAccount;
      expect(account.counts.needsReview).toBe(3);
    });

    it("区切りがなければ全体を1件にし、delimiterFound が false", async () => {
      const { id } = await createAccount();
      const result = await paste(id, "区切りのない文");
      expect(result.delimiterFound).toBe(false);
      expect(result.drafts).toHaveLength(1);
    });

    it("同じ clientRequestId で送り直しても、二重にためない", async () => {
      const { id } = await createAccount();
      const input = { clientRequestId: randomUUID(), text: "A\n@@@\nB" };
      const first = (await (
        await call(app, cookie, `${BASE}/${id}/draft-batches`, "POST", input)
      ).json()) as DraftBatchResult;
      const again = await call(app, cookie, `${BASE}/${id}/draft-batches`, "POST", input);
      expect(again.status).toBe(201);
      const second = (await again.json()) as DraftBatchResult;
      expect(second.batchId).toBe(first.batchId);
      expect(second.drafts.map((draft) => draft.id)).toEqual(first.drafts.map((draft) => draft.id));
      const count = await database.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM threads_post_draft",
      );
      expect(count.rows[0]?.n).toBe(2);
    });

    it("空白だけ・区切りだけなら 400 で、欄は text", async () => {
      const { id } = await createAccount();
      for (const text of ["   ", "@@@\n@@@"]) {
        const response = await call(app, cookie, `${BASE}/${id}/draft-batches`, "POST", {
          clientRequestId: randomUUID(),
          text,
        });
        expect(response.status).toBe(400);
        expect(((await response.json()) as ErrorBody).error.fields?.[0]?.path).toBe("text");
      }
    });

    it("1件が2,000文字を超えると 400 で、何件目かが分かる", async () => {
      const { id } = await createAccount();
      const response = await call(app, cookie, `${BASE}/${id}/draft-batches`, "POST", {
        clientRequestId: randomUUID(),
        text: `短い\n@@@\n${"あ".repeat(2001)}`,
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).error.fields?.[0]?.message).toContain("2件目");
    });
  });

  describe("案の一覧と直す", () => {
    it("状態ごとに読め、比べる相手は承認待ち・承認済み・却下（threads-011）", async () => {
      const { id } = await createAccount();
      const { drafts } = await paste(id, "あ\n@@@\nい\n@@@\nう");
      const [first, second] = drafts;
      if (!first || !second) throw new Error("案がありません");
      await review(id, { action: "approve", items: [{ id: first.id, version: first.version }] });
      await review(id, {
        action: "reject",
        items: [{ id: second.id, version: second.version }],
        note: "薄い",
      });
      const list = async (status: string) =>
        (await (
          await call(app, cookie, `${BASE}/${id}/drafts?status=${status}`)
        ).json()) as DraftList;
      expect((await list("needs_review")).drafts.map((draft) => draft.body)).toEqual(["う"]);
      expect((await list("approved")).drafts.map((draft) => draft.body)).toEqual(["あ"]);
      const rejected = await list("rejected");
      expect(rejected.drafts.map((draft) => [draft.body, draft.rejectNote])).toEqual([
        ["い", "薄い"],
      ]);
      expect(rejected.compareWith.map((item) => item.id).sort()).toEqual(
        [first.id, second.id, drafts[2]?.id].sort(),
      );
      expect(rejected.compareWith.find((item) => item.id === second.id)?.status).toBe("rejected");
      expect((await list("published")).drafts).toEqual([]);
      const bad = await call(app, cookie, `${BASE}/${id}/drafts?status=publishing`);
      expect(bad.status).toBe(400);
    });

    it("承認待ちの本文を直すと版が増える。古い版は 409、承認済みは直すと承認待ちに戻る（threads-011）", async () => {
      const { id } = await createAccount();
      const { drafts } = await paste(id, "直す前\n@@@\n承認する");
      const [target, other] = drafts;
      if (!target || !other) throw new Error("案がありません");
      const ok = await call(app, cookie, `${BASE}/${id}/drafts/${target.id}`, "PUT", {
        body: "直したあと",
        version: target.version,
      });
      expect(ok.status).toBe(200);
      const updated = (await ok.json()) as PostDraft;
      expect([updated.body, updated.version]).toEqual(["直したあと", target.version + 1]);

      const stale = await call(app, cookie, `${BASE}/${id}/drafts/${target.id}`, "PUT", {
        body: "古い版",
        version: target.version,
      });
      expect(((await stale.json()) as ErrorBody).error.code).toBe("THREADS_VERSION_CONFLICT");

      await review(id, { action: "approve", items: [{ id: other.id, version: other.version }] });
      const approved = await call(app, cookie, `${BASE}/${id}/drafts/${other.id}`, "PUT", {
        body: "  承認済みを直す  ",
        version: other.version + 1,
      });
      expect(approved.status).toBe(200);
      const reopened = (await approved.json()) as PostDraft;
      expect([reopened.status, reopened.body, reopened.reviewedAt]).toEqual([
        "needs_review",
        "承認済みを直す",
        null,
      ]);
      expect(reopened.editedAt).not.toBeNull();
    });

    it("案を消せる。ない案は 404", async () => {
      const { id } = await createAccount();
      const { drafts } = await paste(id, "消す案");
      const target = drafts[0];
      if (!target) throw new Error("案がありません");
      expect((await call(app, cookie, `${BASE}/${id}/drafts/${target.id}`, "DELETE")).status).toBe(
        204,
      );
      expect((await call(app, cookie, `${BASE}/${id}/drafts/${target.id}`, "DELETE")).status).toBe(
        404,
      );
    });
  });

  describe("承認と却下", () => {
    it("まとめて承認し、却下し、承認待ちに戻せる", async () => {
      const { id } = await createAccount();
      const { drafts } = await paste(id, "一\n@@@\n二");
      const items = drafts.map((draft) => ({ id: draft.id, version: draft.version }));
      const approved = (await (
        await review(id, { action: "approve", items })
      ).json()) as ReviewResult;
      expect(approved.drafts.map((draft) => draft.status)).toEqual(["approved", "approved"]);
      expect(approved.drafts.every((draft) => draft.reviewedAt !== null)).toBe(true);

      const rejectItems = approved.drafts.map((draft) => ({
        id: draft.id,
        version: draft.version,
      }));
      const rejected = (await (
        await review(id, { action: "reject", items: rejectItems, reasons: ["tone", "tone"] })
      ).json()) as ReviewResult;
      expect(rejected.drafts.map((draft) => draft.rejectReasons)).toEqual([["tone"], ["tone"]]);

      const reopenItems = rejected.drafts.map((draft) => ({
        id: draft.id,
        version: draft.version,
      }));
      const reopened = (await (
        await review(id, { action: "reopen", items: reopenItems })
      ).json()) as ReviewResult;
      expect(
        reopened.drafts.map((draft) => [draft.status, draft.reviewedAt, draft.rejectReasons]),
      ).toEqual([
        ["needs_review", null, null],
        ["needs_review", null, null],
      ]);
    });

    it("却下は理由かメモが要る（400）", async () => {
      const { id } = await createAccount();
      const { drafts } = await paste(id, "理由なし");
      const target = drafts[0];
      if (!target) throw new Error("案がありません");
      const response = await review(id, {
        action: "reject",
        items: [{ id: target.id, version: target.version }],
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).error.fields?.[0]?.path).toBe("reasons");
    });

    it("NG ワードを含む案と、500文字を超える案は承認せず、理由を返す（threads-011）", async () => {
      const { id } = await createAccount();
      await call(app, cookie, `${BASE}/${id}/ng-words`, "POST", { words: ["必ず儲かる"] });
      const { drafts } = await paste(id, `これは必ず儲かる話です\n@@@\n${"い".repeat(501)}`);
      const response = await review(id, {
        action: "approve",
        items: drafts.map((draft) => ({ id: draft.id, version: draft.version })),
      });
      expect(response.status).toBe(200);
      const result = (await response.json()) as ReviewResult;
      expect(result.drafts).toEqual([]);
      expect(result.skipped.map((item) => item.reason)).toEqual(["NG_WORD", "OVER_THREADS_LIMIT"]);
    });

    it("合わない案（版・状態・ない案）は飛ばし、合う案だけ変える（threads-011）", async () => {
      const { id } = await createAccount();
      const { drafts } = await paste(id, "A\n@@@\nB");
      const [first, second] = drafts;
      if (!first || !second) throw new Error("案がありません");
      const result = (await (
        await review(id, {
          action: "approve",
          items: [
            { id: first.id, version: first.version },
            { id: second.id, version: second.version + 5 },
            { id: MISSING_ID, version: 1 },
          ],
        })
      ).json()) as ReviewResult;
      expect(result.drafts.map((draft) => draft.id)).toEqual([first.id]);
      expect(result.skipped).toEqual([
        { id: second.id, reason: "STALE" },
        { id: MISSING_ID, reason: "NOT_FOUND" },
      ]);
      expect(result.counts).toMatchObject({ needsReview: 1, approved: 1 });
      const state = (await (
        await review(id, { action: "reopen", items: [{ id: second.id, version: second.version }] })
      ).json()) as ReviewResult;
      expect(state.skipped).toEqual([{ id: second.id, reason: "STALE" }]);
    });

    it("ほかの運用アカウントの案は、ないのと同じ（NOT_FOUND で飛ばす）", async () => {
      const mine = await createAccount("1つ目");
      const another = await createAccount("2つ目");
      const { drafts } = await paste(mine.id, "1つ目の案");
      const target = drafts[0];
      if (!target) throw new Error("案がありません");
      const response = await review(another.id, {
        action: "approve",
        items: [{ id: target.id, version: target.version }],
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as ReviewResult).skipped).toEqual([
        { id: target.id, reason: "NOT_FOUND" },
      ]);
    });
  });

  describe("DB の CHECK と約束", () => {
    it("口調・却下の理由・状態の CHECK は、約束の選択肢と同じ", async () => {
      const tone = await checkDefinition("threads_strategy_tone_preset_check");
      for (const value of TONE_PRESET_VALUES) expect(tone).toContain(`'${value}'`);
      const reasons = await checkDefinition("threads_post_draft_reject_reasons_valid");
      for (const code of REJECT_REASON_CODES) expect(reasons).toContain(`'${code}'`);
      const status = await checkDefinition("threads_post_draft_status_check_v2");
      for (const value of DRAFT_STATUSES) expect(status).toContain(`'${value}'`);
    });
  });
});
