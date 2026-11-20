// Threads の運用の窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["threads"] から import type で読む）。
// 読み書きは lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
import type {
  ActivityKind,
  AnalysisScope,
  AnalysisSettingsInput,
  ClassificationsInput,
  OauthCompleteInput,
  ListingUpdateInput,
  Media,
  MediaDefaultsInput,
  MentionAttachInput,
  MentionPersonInput,
  MentionPersonUpdateInput,
  MentionSettingsInput,
  DraftBatchInput,
  FeedbackInput,
  PerformanceTab,
  DraftListStatus,
  DraftUpdateInput,
  PostingScheduleSaveInput,
  PromotionInput,
  ReferencePostInput,
  ResearchKeywordInput,
  PriorityInput,
  PromptSettings,
  ReviewInput,
  StrategyInput,
  ThreadsAssignmentInput,
} from "@workspace/contracts/threads";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";
import { fetchDownload } from "../../lib/download.ts";
import type { DownloadedFile } from "../../lib/download.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["threads"]>> | undefined;

/**
 * 運用アカウントの道の呼び出しの道具。
 * @returns 呼び出しの道具の運用アカウントの部分
 */
function accounts() {
  return threads().accounts;
}

/**
 * Threads の窓口の頭（/api/v1/threads）の呼び出しの道具。
 * @returns 呼び出しの道具
 */
function threads() {
  client ??= createApiClient<ModuleRoutes["threads"]>();
  return client.api.v1.threads;
}

/**
 * 1つの運用アカウントの道。
 * @param accountId 運用アカウントの ID
 * @returns 道と道の値
 */
function account(accountId: string) {
  return { endpoint: accounts()[":accountId"], param: { accountId } };
}

/**
 * 自分の運用アカウントの一覧。
 * @returns 一覧
 */
export function fetchAccounts() {
  return request(() => accounts().$get());
}

/**
 * 運用アカウントを作る。
 * @param name 名前
 * @returns 作った運用アカウント
 */
export function createAccount(name: string) {
  return request(() => accounts().$post({ json: { name } }));
}

/**
 * 運用アカウントを読む。
 * @param accountId 運用アカウントの ID
 * @returns 運用アカウント
 */
export function fetchAccount(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.$get({ param }));
}

/**
 * 運用アカウントのホームの材料の数を読む（threads-012）。
 * @param accountId 運用アカウントの ID
 * @returns 材料の数
 */
export function fetchAccountHome(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.home.$get({ param }));
}

/**
 * 運用アカウントを開いたことを残す（つないでいればプロフィールを読み直す。threads-012）。
 * @param accountId 運用アカウントの ID
 * @returns 読み直した運用アカウント
 */
export function openAccount(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.open.$post({ param }));
}

/**
 * 運用アカウントの名前を直す。
 * @param accountId 運用アカウントの ID
 * @param name 名前
 * @returns 直した運用アカウント
 */
export function renameAccount(accountId: string, name: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.$patch({ param, json: { name } }));
}

/**
 * 運用アカウントを消す（アカウントの名前をそのまま入れて確かめる。threads-012）。
 * @param accountId 運用アカウントの ID
 * @param confirmName 入れたアカウントの名前
 * @returns なし
 */
export function deleteAccount(accountId: string, confirmName: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.$delete({ param, json: { confirmName } }));
}

/**
 * 戦略を読む。
 * @param accountId 運用アカウントの ID
 * @returns 戦略
 */
export function fetchStrategy(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.strategy.$get({ param }));
}

/**
 * 戦略を保存する。
 * @param accountId 運用アカウントの ID
 * @param input 戦略の入力
 * @returns 保存した戦略
 */
export function saveStrategy(accountId: string, input: StrategyInput) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.strategy.$put({ param, json: input }));
}

/**
 * プロンプトの設定を読む。
 * @param accountId 運用アカウントの ID
 * @returns プロンプトの設定
 */
export function fetchPromptSettings(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["prompt-settings"].$get({ param }));
}

/**
 * プロンプトの設定を保存する。
 * @param accountId 運用アカウントの ID
 * @param input プロンプトの設定
 * @returns 保存した設定
 */
export function savePromptSettings(accountId: string, input: PromptSettings) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["prompt-settings"].$put({ param, json: input }));
}

/**
 * 外の AI に貼るプロンプトを作る。
 * @param accountId 運用アカウントの ID
 * @returns プロンプトと要約
 */
export function fetchPrompt(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.prompt.$get({ param }));
}

/**
 * 投稿のルールと NG ワードを読む。
 * @param accountId 運用アカウントの ID
 * @returns 投稿のルールと NG ワード
 */
export function fetchPostingRules(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["posting-rules"].$get({ param }));
}

/**
 * 投稿のルールを保存する。
 * @param accountId 運用アカウントの ID
 * @param coreRules 投稿のルール
 * @returns 保存したあとの投稿のルールと NG ワード
 */
export function saveCoreRules(accountId: string, coreRules: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["core-rules"].$put({ param, json: { coreRules } }));
}

/**
 * NG ワードをまとめて足す（threads-011）。
 * @param accountId 運用アカウントの ID
 * @param words 足す語
 * @returns 足した語・もうあった語・承認待ちに戻した数
 */
export function addNgWords(accountId: string, words: string[]) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["ng-words"].$post({ param, json: { words } }));
}

/**
 * NG ワードを外す。
 * @param accountId 運用アカウントの ID
 * @param ngWordId NG ワードの ID
 * @returns なし
 */
export function deleteNgWord(accountId: string, ngWordId: string) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["ng-words"][":ngWordId"].$delete({ param: { accountId, ngWordId } }),
  );
}

/**
 * 外の AI の答えを貼って、案をまとめてためる。
 * @param accountId 運用アカウントの ID
 * @param input 送り直しの ID と貼った文
 * @returns ためた案
 */
export function createDraftBatch(accountId: string, input: DraftBatchInput) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["draft-batches"].$post({ param, json: input }));
}

/**
 * ためた1回分を取り消す（そのまとまりの承認待ちの案だけを消す。threads-011）。
 * @param accountId 運用アカウントの ID
 * @param batchId まとまりの ID
 * @returns 消した数
 */
export function undoDraftBatch(accountId: string, batchId: string) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["draft-batches"][":batchId"].$delete({ param: { accountId, batchId } }),
  );
}

/**
 * 投稿の案の一覧を読む。
 * @param accountId 運用アカウントの ID
 * @param status 状態
 * @param before 投稿済みの続きを読むときの、前の応答の nextCursor
 * @returns 案の一覧と比べる相手
 */
export function fetchDrafts(accountId: string, status: DraftListStatus, before?: string) {
  const { endpoint, param } = account(accountId);
  return request(() =>
    endpoint.drafts.$get({ param, query: { status, ...(before ? { before } : {}) } }),
  );
}

/**
 * 案をまとめて消す（承認待ちと却下だけ。threads-011）。
 * @param accountId 運用アカウントの ID
 * @param ids 案の ID
 * @returns 消した数
 */
export function deleteDrafts(accountId: string, ids: string[]) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.drafts.delete.$post({ param, json: { ids } }));
}

/**
 * 選んだ承認待ちの案に、「いつも付ける」の人で時間差のメンションをまとめて付ける（threads-011）。
 * @param accountId 運用アカウントの ID
 * @param items 案と版
 * @returns 付けた案と、付けられなかった案
 */
export function attachMentionsBulk(accountId: string, items: { id: string; version: number }[]) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.drafts.mentions.$post({ param, json: { items } }));
}

/**
 * 承認待ち・承認済みの案の本文を直す（承認済みは承認待ちに戻る）。
 * @param accountId 運用アカウントの ID
 * @param draftId 案の ID
 * @param input 本文と版
 * @returns 直した案
 */
export function updateDraft(accountId: string, draftId: string, input: DraftUpdateInput) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint.drafts[":draftId"].$put({ param: { accountId, draftId }, json: input }),
  );
}

/**
 * 投稿の案を消す。
 * @param accountId 運用アカウントの ID
 * @param draftId 案の ID
 * @returns なし
 */
export function deleteDraft(accountId: string, draftId: string) {
  const { endpoint } = account(accountId);
  return request(() => endpoint.drafts[":draftId"].$delete({ param: { accountId, draftId } }));
}

/**
 * 案を承認する・却下する・承認待ちに戻す（できるものだけ変える。できなかったものは理由が返る）。
 * @param accountId 運用アカウントの ID
 * @param input 操作と案
 * @returns 変えた案・変えなかった案と理由・数
 */
export function reviewDrafts(accountId: string, input: ReviewInput) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.drafts.review.$post({ param, json: input }));
}

/**
 * Threads への接続を読む。
 * @param accountId 運用アカウントの ID
 * @returns 接続
 */
export function fetchConnection(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.connection.$get({ param }));
}

/**
 * トークンを貼ってつなぐ（つなぎ直しも同じ）。
 * @param accountId 運用アカウントの ID
 * @param token 貼ったトークン
 * @returns つないだ結果
 */
export function connectThreads(accountId: string, token: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.connection.$post({ param, json: { token } }));
}

/**
 * 接続を切る。
 * @param accountId 運用アカウントの ID
 * @returns 切ったあとの接続
 */
export function disconnectThreads(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.connection.$delete({ param }));
}

/**
 * 持っているトークンで接続を確かめる。
 * @param accountId 運用アカウントの ID
 * @returns 確かめたあとの接続
 */
export function checkConnection(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.connection.check.$post({ param }));
}

/**
 * Threads に投稿できる状態かと、直近24時間の投稿の数を確かめる（投稿はしない。threads-012）。
 * @param accountId 運用アカウントの ID
 * @returns 確かめた結果
 */
export function checkThreadsPublish(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["threads-check"].$post({ param }));
}

/**
 * 投稿の設定を読む。
 * @param accountId 運用アカウントの ID
 * @returns 投稿の設定と決まり
 */
export function fetchPostingSchedule(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["posting-schedule"].$get({ param }));
}

/**
 * 投稿の設定を保存する。
 * @param accountId 運用アカウントの ID
 * @param input 入力
 * @returns 保存した設定
 */
export function savePostingSchedule(accountId: string, input: PostingScheduleSaveInput) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["posting-schedule"].$put({ param, json: input }));
}

/**
 * 自動投稿の状態・次の投稿・知らせを読む。
 * @param accountId 運用アカウントの ID
 * @returns 自動投稿の状態
 */
export function fetchAutoPost(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["auto-post"].$get({ param }));
}

/**
 * 「投稿の直前に承認待ちへ戻した」の知らせを閉じる。
 * @param accountId 運用アカウントの ID
 * @returns なし
 */
export function seeBlockedNotice(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["auto-post"]["blocked-notice-seen"].$post({ param }));
}

/**
 * 承認済みの案に「次に投稿する」を付ける・外す。
 * @param accountId 運用アカウントの ID
 * @param draftId 案の ID
 * @param input 付けるか・版
 * @returns 変えた案
 */
export function setDraftPriority(accountId: string, draftId: string, input: PriorityInput) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint.drafts[":draftId"].priority.$put({ param: { accountId, draftId }, json: input }),
  );
}

/**
 * 反応の画面を読む（threads-003。50件ずつ。threads-012）。
 * @param accountId 運用アカウントの ID
 * @param tab 絞りこみ
 * @param before 続きを読むときの、前の応答の nextCursor
 * @returns 集計と一覧と、続きの位置
 */
export function fetchPerformance(accountId: string, tab: PerformanceTab, before?: string) {
  const { endpoint, param } = account(accountId);
  return request(() =>
    endpoint.performance.$get({ param, query: { tab, ...(before ? { before } : {}) } }),
  );
}

/**
 * 低調の投稿の改善のメモを保存する。
 * @param accountId 運用アカウントの ID
 * @param draftId 案の ID
 * @param input メモ・次のプロンプトに入れるか・版
 * @returns 保存したあとの項目
 */
export function saveFeedback(accountId: string, draftId: string, input: FeedbackInput) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint.performance[":draftId"].feedback.$put({ param: { accountId, draftId }, json: input }),
  );
}

/**
 * 反応の CSV を受け取る。
 * @param accountId 運用アカウントの ID
 * @param kind posts：投稿ごと・snapshots：取りこみごと
 * @returns 中身とファイルの名前
 */
export function downloadPerformanceCsv(
  accountId: string,
  kind: "posts" | "snapshots",
): Promise<DownloadedFile> {
  const { endpoint, param } = account(accountId);
  return fetchDownload(
    () => endpoint.performance.export.$get({ param, query: { kind } }),
    `threads-${kind}.csv`,
  );
}

/**
 * 宣伝の一覧と割合を読む（threads-004）。
 * @param accountId 運用アカウントの ID
 * @returns 宣伝の一覧
 */
export function fetchPromotions(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.promotions.$get({ param }));
}

/**
 * 宣伝を足す。
 * @param accountId 運用アカウントの ID
 * @param input 入力
 * @returns 足した宣伝
 */
export function createPromotion(accountId: string, input: PromotionInput) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.promotions.$post({ param, json: input }));
}

/**
 * 宣伝を直す。
 * @param accountId 運用アカウントの ID
 * @param itemId 宣伝の ID
 * @param input 入力
 * @param version 読んだ版
 * @returns 直した宣伝
 */
export function updatePromotion(
  accountId: string,
  itemId: string,
  input: PromotionInput,
  version: number,
) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint.promotions[":itemId"].$put({
      param: { accountId, itemId },
      json: { ...input, version },
    }),
  );
}

/**
 * 宣伝を消す。
 * @param accountId 運用アカウントの ID
 * @param itemId 宣伝の ID
 * @returns なし
 */
export function deletePromotion(accountId: string, itemId: string) {
  const { endpoint } = account(accountId);
  return request(() => endpoint.promotions[":itemId"].$delete({ param: { accountId, itemId } }));
}

/**
 * 宣伝の投稿の割合を保存する。
 * @param accountId 運用アカウントの ID
 * @param ratioPercent 割合（％）
 * @returns 保存した割合
 */
export function savePromotionRatio(accountId: string, ratioPercent: number) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["promotion-ratio"].$put({ param, json: { ratioPercent } }));
}

/**
 * 参考の投稿の一覧を読む。
 * @param accountId 運用アカウントの ID
 * @returns 一覧
 */
export function fetchReferencePosts(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["reference-posts"].$get({ param }));
}

/**
 * 参考の投稿を足す。
 * @param accountId 運用アカウントの ID
 * @param items 入力
 * @returns 足した参考の投稿
 */
export function createReferencePosts(accountId: string, items: ReferencePostInput[]) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["reference-posts"].$post({ param, json: { items } }));
}

/**
 * 参考の投稿を直す（読んだ版と同じときだけ。threads-012）。
 * @param accountId 運用アカウントの ID
 * @param itemId 参考の投稿の ID
 * @param post 入力
 * @param version 読んだ版
 * @returns 直した参考の投稿
 */
export function updateReferencePost(
  accountId: string,
  itemId: string,
  post: ReferencePostInput,
  version: number,
) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["reference-posts"][":itemId"].$put({
      param: { accountId, itemId },
      json: { post, version },
    }),
  );
}

/**
 * 参考の投稿を消す。
 * @param accountId 運用アカウントの ID
 * @param itemId 参考の投稿の ID
 * @returns なし
 */
export function deleteReferencePost(accountId: string, itemId: string) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["reference-posts"][":itemId"].$delete({ param: { accountId, itemId } }),
  );
}

/**
 * 解説のプロンプトを作る（itemId を渡せばその1件、なければ解説がまだのものをまとめて）。
 * @param accountId 運用アカウントの ID
 * @param itemId 1件だけのときの参考の投稿の ID
 * @returns プロンプト
 */
export function fetchExplainPrompt(accountId: string, itemId?: string) {
  const { endpoint, param } = account(accountId);
  return request(() =>
    endpoint["reference-posts"]["explain-prompt"].$get({
      param,
      query: itemId ? { id: itemId } : {},
    }),
  );
}

/**
 * 貼り戻した解説を保存する。
 * @param accountId 運用アカウントの ID
 * @param items 参考の投稿の ID と解説
 * @returns 保存した結果
 */
export function saveExplanations(accountId: string, items: { id: string; whyGood: string }[]) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["reference-posts"].explanations.$post({ param, json: { items } }));
}

/**
 * キーワードの一覧を読む。
 * @param accountId 運用アカウントの ID
 * @returns 一覧
 */
export function fetchKeywords(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["research-keywords"].$get({ param }));
}

/**
 * キーワードを足す。
 * @param accountId 運用アカウントの ID
 * @param items 入力
 * @returns 足したキーワード
 */
export function createKeywords(accountId: string, items: ResearchKeywordInput[]) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["research-keywords"].$post({ param, json: { items } }));
}

/**
 * キーワードを直す（読んだ版と同じときだけ。threads-012）。
 * @param accountId 運用アカウントの ID
 * @param itemId キーワードの ID
 * @param input 入力
 * @param version 読んだ版
 * @returns 直したキーワード
 */
export function updateKeyword(
  accountId: string,
  itemId: string,
  input: ResearchKeywordInput,
  version: number,
) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["research-keywords"][":itemId"].$put({
      param: { accountId, itemId },
      json: { ...input, version },
    }),
  );
}

/**
 * キーワードを消す。
 * @param accountId 運用アカウントの ID
 * @param itemId キーワードの ID
 * @returns なし
 */
export function deleteKeyword(accountId: string, itemId: string) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["research-keywords"][":itemId"].$delete({ param: { accountId, itemId } }),
  );
}

/**
 * キーワードの案のプロンプトを作る。
 * @param accountId 運用アカウントの ID
 * @returns プロンプト
 */
export function fetchKeywordIdeaPrompt(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["research-keywords"]["idea-prompt"].$get({ param }));
}

/**
 * 操作の記録を読む（threads-005）。
 * @param accountId 運用アカウントの ID
 * @param kind 種類で絞る（なければすべて）
 * @returns 記録
 */
export function fetchActivity(accountId: string, kind: ActivityKind | undefined) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.activity.$get({ param, query: kind ? { kind } : {} }));
}

/**
 * アルゴリズムの分析を読む（threads-006）。
 * @param accountId 運用アカウントの ID
 * @param scope 範囲
 * @returns 分析の画面
 */
export function fetchAnalysis(accountId: string, scope: AnalysisScope) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.analysis.$get({ param, query: { scope } }));
}

/**
 * 分析の設定を保存する。
 * @param accountId 運用アカウントの ID
 * @param input テーマ・プロンプトに入れるか・版
 * @returns 保存した設定
 */
export function saveAnalysisSettings(accountId: string, input: AnalysisSettingsInput) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.analysis.settings.$put({ param, json: input }));
}

/**
 * 分類する・直す投稿の一覧を読む。
 * @param accountId 運用アカウントの ID
 * @param mode まだの投稿・分類済み
 * @returns 一覧
 */
export function fetchClassifications(accountId: string, mode: "unclassified" | "classified") {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.analysis.classifications.$get({ param, query: { mode } }));
}

/**
 * 投稿の分類を保存する。
 * @param accountId 運用アカウントの ID
 * @param input 付け方と分類
 * @returns 保存した数と飛ばした投稿
 */
export function saveClassifications(accountId: string, input: ClassificationsInput) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.analysis.classifications.$put({ param, json: input }));
}

/**
 * 時間差のメンションの設定を読む（threads-007）。
 * @param accountId 運用アカウントの ID
 * @returns 設定
 */
export function fetchMentionSettings(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["mention-settings"].$get({ param }));
}

/**
 * ひとことと時間差を保存する。
 * @param accountId 運用アカウントの ID
 * @param input ひとこと・時間差・版
 * @returns 設定
 */
export function saveMentionSettings(accountId: string, input: MentionSettingsInput) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["mention-settings"].$put({ param, json: input }));
}

/**
 * メンションする人を足す。
 * @param accountId 運用アカウントの ID
 * @param input ユーザー名・呼び名・いつも付ける
 * @returns 設定
 */
export function addMentionPerson(accountId: string, input: MentionPersonInput) {
  const { endpoint, param } = account(accountId);
  return request(() =>
    endpoint["mention-people"].$post({ param, json: { always: false, ...input } }),
  );
}

/**
 * メンションする人を直す。
 * @param accountId 運用アカウントの ID
 * @param personId 人の ID
 * @param input 呼び名・いつも付ける
 * @returns 設定
 */
export function updateMentionPerson(
  accountId: string,
  personId: string,
  input: MentionPersonUpdateInput,
) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["mention-people"][":personId"].$put({ param: { accountId, personId }, json: input }),
  );
}

/**
 * メンションする人を消す。
 * @param accountId 運用アカウントの ID
 * @param personId 人の ID
 * @returns 設定
 */
export function removeMentionPerson(accountId: string, personId: string) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["mention-people"][":personId"].$delete({ param: { accountId, personId } }),
  );
}

/**
 * 案に時間差のメンションを付ける・直す（投稿済みは今から返信する）。
 * @param accountId 運用アカウントの ID
 * @param draftId 案の ID
 * @param input 版・選んだ人・文
 * @returns 直したあとの案
 */
export function attachMention(accountId: string, draftId: string, input: MentionAttachInput) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint.drafts[":draftId"].mention.$put({ param: { accountId, draftId }, json: input }),
  );
}

/**
 * 案の時間差のメンションを外す・やめる。
 * @param accountId 運用アカウントの ID
 * @param draftId 案の ID
 * @returns 直したあとの案
 */
export function detachMention(accountId: string, draftId: string) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint.drafts[":draftId"].mention.$delete({ param: { accountId, draftId } }),
  );
}

/**
 * 外部メディアの一覧を読む（threads-008）。
 * @param accountId 運用アカウントの ID
 * @returns 宣伝と媒体ごとの状況
 */
export function fetchExternalMedia(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["external-media"].$get({ param }));
}

/**
 * 宣伝×媒体の掲載文を読む。
 * @param accountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @param media 媒体
 * @returns 掲載文の画面の中身
 */
export function fetchListing(accountId: string, promotionId: string, media: Media) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["external-media"][":promotionId"][":media"].$get({
      param: { accountId, promotionId, media },
    }),
  );
}

/**
 * 掲載文を作る・作り直す。
 * @param accountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @param media 媒体
 * @param version 読んだ版
 * @returns 掲載文の画面の中身
 */
export function generateListing(
  accountId: string,
  promotionId: string,
  media: Media,
  version: number,
) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["external-media"][":promotionId"][":media"].generate.$post({
      param: { accountId, promotionId, media },
      json: { version },
    }),
  );
}

/**
 * 掲載文の欄・状況・掲載 URL・画像の種類を保存する。
 * @param accountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @param media 媒体
 * @param input 入力
 * @returns 掲載文の画面の中身
 */
export function updateListing(
  accountId: string,
  promotionId: string,
  media: Media,
  input: ListingUpdateInput,
) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["external-media"][":promotionId"][":media"].$put({
      param: { accountId, promotionId, media },
      json: input,
    }),
  );
}

/**
 * 媒体の既定値を読む。
 * @param accountId 運用アカウントの ID
 * @returns 5つの媒体の既定値
 */
export function fetchMediaDefaults(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint["media-defaults"].$get({ param }));
}

/**
 * 媒体の既定値を保存する。
 * @param accountId 運用アカウントの ID
 * @param media 媒体
 * @param input 既定値と版
 * @returns 保存した既定値
 */
export function saveMediaDefaults(accountId: string, media: Media, input: MediaDefaultsInput) {
  const { endpoint } = account(accountId);
  return request(() =>
    endpoint["media-defaults"][":media"].$put({ param: { accountId, media }, json: input }),
  );
}

/**
 * OAuth の接続が使えるかを読む（threads-010）。
 * @returns 使えるか
 */
export function fetchOauthAvailability() {
  return request(() => threads().oauth.availability.$get());
}

/**
 * アプリの Meta のアプリでの接続を始める。
 * @param accountId 運用アカウントの ID
 * @returns Threads の認可の URL
 */
export function startOauth(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.oauth.start.$post({ param }));
}

/**
 * OAuth の接続を完了する（Threads から戻ったあと）。
 * @param input state と code（許可しなかったときは error）
 * @returns 画面が移る先
 */
export function completeOauth(input: OauthCompleteInput) {
  return request(() => threads().oauth.complete.$post({ json: input }));
}

/**
 * データの削除の状況を読む（ログインなし）。
 * @param code 確認のコード
 * @returns 状況
 */
export function fetchDataDeletion(code: string) {
  return request(() => threads()["data-deletion"][":code"].$get({ param: { code } }));
}

// ---- チーム運用（threads-013。組織そのものは suite の窓口。ここは Threads の組織の画面・担当・運用状況・知らせ）----

/**
 * 今の利用者の、この運用アカウントでの関わりとできること（画面の出し分け。判定の正は API）。
 * @param accountId 運用アカウントの ID
 * @returns 関わりとできること
 */
export function fetchAccountAccess(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.access.$get({ param }));
}

/**
 * このアカウントのチームと、入れられる組織（持ち主と担当の人だけ）。
 * @param accountId 運用アカウントの ID
 * @returns チーム
 */
export function fetchAccountTeam(accountId: string) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.team.$get({ param }));
}

/**
 * 運用アカウントを組織に入れる・外す（null で外す。持ち主だけ）。
 * @param accountId 運用アカウントの ID
 * @param organizationId 入れる組織（null で外す）
 * @returns 変えたあとのチーム
 */
export function placeAccount(accountId: string, organizationId: string | null) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.team.placement.$put({ param, json: { organizationId } }));
}

/**
 * 組織に見せるを切り替える（持ち主だけ）。
 * @param accountId 運用アカウントの ID
 * @param shared 見せるか
 * @returns 変えたあとのチーム
 */
export function setAccountShared(accountId: string, shared: boolean) {
  const { endpoint, param } = account(accountId);
  return request(() => endpoint.team.shared.$put({ param, json: { shared } }));
}

/**
 * 担当の人に承認を任せる・やめる（持ち主だけ）。
 * @param accountId 運用アカウントの ID
 * @param personId 担当の人
 * @param delegated 任せるか
 * @returns 変えたあとのチーム
 */
export function setDelegation(accountId: string, personId: string, delegated: boolean) {
  const { endpoint, param } = account(accountId);
  return request(() =>
    endpoint.team.delegations[":personId"].$put({
      param: { ...param, personId },
      json: { delegated },
    }),
  );
}

/**
 * 入っている組織と、組織に入っている運用アカウントの数。
 * @returns 組織の一覧
 */
export function fetchTeamOrganizations() {
  return request(() => threads().organizations.$get());
}

/**
 * Threads の組織の画面。
 * @param organizationId 組織の ID
 * @returns 組織の画面
 */
export function fetchTeamOrganization(organizationId: string) {
  return request(() =>
    threads().organizations[":organizationId"].$get({ param: { organizationId } }),
  );
}

/**
 * 担当を付け外しする（管理者だけ）。
 * @param organizationId 組織の ID
 * @param input 運用アカウント・担当の人・付けるか
 * @returns 変えたあとの組織の画面
 */
export function setAssignment(organizationId: string, input: ThreadsAssignmentInput) {
  return request(() =>
    threads().organizations[":organizationId"].assignments.$put({
      param: { organizationId },
      json: input,
    }),
  );
}

/**
 * 運用状況（数と日付だけ）。
 * @param organizationId 組織の ID
 * @returns 運用状況
 */
export function fetchTeamStatus(organizationId: string) {
  return request(() =>
    threads().organizations[":organizationId"].status.$get({ param: { organizationId } }),
  );
}

/**
 * はじめの画面に1回だけ出す知らせ（担当が付いた・退会で引き継いだ）。
 * @returns 知らせ
 */
export function fetchTeamNotices() {
  return request(() => threads()["team-notices"].$get());
}

/**
 * 知らせを見たことにする。
 * @returns なし
 */
export function seeTeamNotices() {
  return request(() => threads()["team-notices"].seen.$post());
}
