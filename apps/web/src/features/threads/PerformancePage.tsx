// 反応（threads-003。めぐるの「パフォーマンス」）：投稿ごとの反応（閲覧・いいね・返信・リポスト・引用・シェア）と、
// そのアカウントの基準値（確定した新しい30件の閲覧の中央値）に比べた判定（好調・普通・低調）。
// 低調の投稿には、傾向のメモと「次のプロンプトに入れる」を付けられる（新しい5件が、次に作るプロンプトの「避けること」に入る）。
// CSV で書き出せる（投稿ごと・取りこみごと。列はめぐると同じ）。反応は定期の仕事が 24時間・3日・7日に取りこむ。
// 一覧は50件ずつで、「さらに表示する」で続きを読む。メモは欄から離れたとき、「次のプロンプトに入れる」は押したときに保存する（threads-012）。
import {
  FEEDBACK_MEMO_MAX,
  FeedbackInput,
  JUDGMENT_LABELS,
  METRICS_STATE_LABELS,
  METRIC_LABELS,
  PERFORMANCE_TABS,
  PERFORMANCE_TAB_LABELS,
  formatBaseline,
  formatRatio,
} from "@workspace/contracts/threads";
import type {
  PerformanceItem,
  PerformanceSummary,
  PerformanceTab,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import { jstDate, jstDateTime } from "@workspace/contracts/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useId, useRef, useState } from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { saveFile } from "../../lib/download.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { threadsPaths } from "./paths.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { downloadPerformanceCsv, saveFeedback } from "./api.ts";
import { THREADS_QUERY_KEYS, usePerformance } from "./queries.ts";

/** 外のページへのリンクの属性。 */
const EXTERNAL_LINK = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * 上の集計。
 * @param props 運用アカウントの ID（accountId）・集計（summary）
 * @param props.accountId 運用アカウントの ID
 * @param props.summary 集計
 * @returns 要素
 */
function SummarySection({
  accountId,
  summary,
}: {
  accountId: string;
  summary: PerformanceSummary;
}) {
  return (
    <section aria-labelledby="threads-performance-summary" className="flex flex-col gap-xxs">
      <h2 id="threads-performance-summary" className="text-l font-bold">
        基準値
      </h2>
      <p className="text-m">
        {summary.baseline === null
          ? `確定した投稿が5件たまると、判定を始めます（今 ${summary.baselineSampleCount}件）。`
          : `閲覧の基準値：${formatBaseline(summary.baseline)}（確定した新しい${summary.baselineSampleCount}件の中央値）。2倍以上で好調、0.5倍以下で低調です。`}
      </p>
      {summary.baselineIsZero ? (
        <p className="text-s text-text-sub">基準値が0のため、判定できません。</p>
      ) : null}
      <p className="text-s text-text-sub">
        {summary.lastFetchedAt
          ? `最後に取りこんだ日時：${jstDateTime(summary.lastFetchedAt)}。`
          : "まだ取りこんでいません。"}
        反応は投稿から24時間・3日・7日に取りこみ、7日で確定します（夜間〈0時〜8時〉は止まり、朝に補います）。
      </p>
      {summary.connectionStatus !== "connected" ? (
        <p className="text-m text-danger-text">
          Threads につながっていないため、反応を取りこめません。設定の「Threads
          への接続」を確かめてください。
        </p>
      ) : null}
      {summary.insightsDenied ? (
        <div className="flex flex-col items-start gap-xxs">
          <p className="text-m text-danger-text">
            反応を読む権限（threads_manage_insights）がないため、取りこめません。Meta
            のアプリで権限を足し、トークンを作り直してつなぎ直してください。
          </p>
          <Link
            to={threadsPaths.settings(accountId)}
            hash="threads-connection"
            className={buttonVariants({ variant: "secondary", size: "small" })}
          >
            つなぎ直す（設定の「Threads への接続」へ）
          </Link>
        </div>
      ) : null}
    </section>
  );
}

/**
 * 次のプロンプトに入るかの説明（めぐるの promptNote）。
 * @param feedback 改善のメモ
 * @returns 説明の文
 */
function promptNote(feedback: NonNullable<PerformanceItem["feedback"]>): string {
  if (!feedback.includeInPrompt) return "外しています。次からのプロンプトには入りません。";
  if (feedback.inNextPrompt) return "次のプロンプトに入ります。";
  return "低調の新しい5件に入っていないため、今は入りません。";
}

/**
 * 改善のメモ（低調の投稿だけ）。保存のボタンはなく、メモは欄から離れたとき（変わっていれば）、
 * 「次のプロンプトに入れる」は押したときに保存する（めぐるの FeedbackEditor）。
 * @param props 運用アカウントの ID（accountId）・項目（item）
 * @param props.accountId 運用アカウントの ID
 * @param props.item 項目
 * @returns 要素
 */
function FeedbackForm({ accountId, item }: { accountId: string; item: PerformanceItem }) {
  const queryClient = useQueryClient();
  const memoId = useId();
  const errorId = useId();
  // 保存した値（保存のたびに版が進むので、返った項目で置きかえる）
  const [current, setCurrent] = useState(item.feedback);
  const [memo, setMemo] = useState(item.feedback?.memo ?? "");
  // 次のプロンプトに入れるか（押したらすぐ欄に出し、保存は後ろで行う）
  const [include, setInclude] = useState(item.feedback?.includeInPrompt ?? true);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string }>();
  const [pending, setPending] = useState(false);
  // 保存の途中に来た変更は捨てずに、いちばん新しいものだけを、終わったあとに続けて保存する
  const savingRef = useRef(false);
  const queuedRef = useRef<{ memo: string; includeInPrompt: boolean } | null>(null);
  const versionRef = useRef(item.feedback?.version ?? 0);
  const savedMemoRef = useRef(item.feedback?.memo ?? "");
  if (!current) return null;

  /**
   * 1回保存する（確かめに通らなければ false）。
   * @param next 保存する値
   * @param next.memo メモ
   * @param next.includeInPrompt 次のプロンプトに入れるか
   * @returns 続けてよいなら true
   */
  const saveOnce = async (next: { memo: string; includeInPrompt: boolean }): Promise<boolean> => {
    const parsed = FeedbackInput.safeParse({
      memo: next.memo.trim() ? next.memo : null,
      includeInPrompt: next.includeInPrompt,
      version: versionRef.current,
    });
    if (!parsed.success) {
      setError(fieldErrorsFromIssues(parsed.error.issues).memo);
      return false;
    }
    setError(undefined);
    try {
      const saved = await saveFeedback(accountId, item.id, parsed.data);
      setCurrent(saved.feedback);
      if (saved.feedback) {
        versionRef.current = saved.feedback.version;
        savedMemoRef.current = saved.feedback.memo ?? "";
      }
      setResult({ tone: "success", message: "保存しました。" });
      return true;
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.memo) setError(fields.memo);
      else if (caught instanceof ApiError && caught.status === 409)
        setResult({
          tone: "danger",
          message:
            "ほかの画面で先に保存されたため、保存できませんでした。画面を読みこみ直してから、もう一度入れてください。",
        });
      else setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
      return false;
    }
  };

  /**
   * 保存する（保存の途中なら、いちばん新しい値を覚えておき、終わったあとに続けて保存する）。
   * @param next 保存する値（メモと、次のプロンプトに入れるか）
   * @param next.memo メモ
   * @param next.includeInPrompt 次のプロンプトに入れるか
   */
  const save = async (next: { memo: string; includeInPrompt: boolean }) => {
    if (savingRef.current) {
      queuedRef.current = next;
      return;
    }
    savingRef.current = true;
    setPending(true);
    setResult(undefined);
    try {
      let job: { memo: string; includeInPrompt: boolean } | null = next;
      while (job) {
        if (!(await saveOnce(job))) {
          queuedRef.current = null;
          break;
        }
        job = queuedRef.current;
        queuedRef.current = null;
      }
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
    } finally {
      savingRef.current = false;
      setPending(false);
    }
  };

  /** 欄から離れたとき、変わっていれば保存する。 */
  const commitMemo = () => {
    if (memo.trim() === savedMemoRef.current.trim() && !queuedRef.current) return;
    void save({ memo, includeInPrompt: include });
  };

  return (
    <div className="flex flex-col gap-xxs rounded-sm border border-border bg-surface-sunken p-xs">
      <label htmlFor={memoId} className="text-m font-bold">
        低調の傾向のメモ
        <span className="font-normal text-text-sub">（任意・なぜ伸びなかったと思うか）</span>
      </label>
      <Textarea
        id={memoId}
        rows={2}
        maxLength={FEEDBACK_MEMO_MAX}
        placeholder="例：前置きが長く、結論が最後まで出てこない"
        value={memo}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(change) => setMemo(change.target.value)}
        onBlur={commitMemo}
      />
      {error ? (
        <p id={errorId} className="text-s text-danger-text">
          {error}
        </p>
      ) : null}
      <p className="text-s text-text-sub">
        欄から離れると保存します。次に作るプロンプトの「避けること」に入ります（{[...memo].length}／
        {FEEDBACK_MEMO_MAX}文字）。
      </p>
      <label className="flex min-h-l items-center gap-xxs text-m">
        <input
          type="checkbox"
          className="size-s accent-primary"
          checked={include}
          onChange={() => {
            const next = !include;
            setInclude(next);
            void save({ memo, includeInPrompt: next });
          }}
        />
        次のプロンプトに入れる
      </label>
      <p className="text-s text-text-sub">{promptNote(current)}</p>
      {pending ? (
        <p aria-busy="true" className="text-s text-text-sub">
          保存しています…
        </p>
      ) : null}
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
    </div>
  );
}

/**
 * 投稿ごとの反応の1枚。
 * @param props 運用アカウントの ID（accountId）・項目（item）
 * @param props.accountId 運用アカウントの ID
 * @param props.item 項目
 * @returns カードの要素
 */
function ItemCard({ accountId, item }: { accountId: string; item: PerformanceItem }) {
  const headingId = `threads-performance-${item.id}`;
  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-xs"
    >
      <div className="flex flex-wrap items-center gap-xxs">
        <h3 id={headingId} className="sr-only">{`投稿：${item.body.slice(0, 20)}`}</h3>
        {item.judgment ? (
          <Badge
            variant={
              item.judgment === "good" ? "success" : item.judgment === "poor" ? "danger" : "neutral"
            }
          >
            {JUDGMENT_LABELS[item.judgment]}
            {item.ratio !== null ? `（${formatRatio(item.ratio)}倍）` : ""}
          </Badge>
        ) : (
          <Badge>{METRICS_STATE_LABELS[item.state]}</Badge>
        )}
        <span className="text-s text-text-sub">投稿：{jstDateTime(item.publishedAt)}</span>
        {item.confirmAt ? (
          <span className="text-s text-text-sub">確定の目安：{jstDate(item.confirmAt)}</span>
        ) : null}
      </div>
      <p className="text-m break-words whitespace-pre-wrap">{item.body}</p>
      {item.metrics ? (
        <dl className="grid grid-cols-3 gap-xxs text-s wide:grid-cols-6">
          {METRIC_LABELS.map(({ key, label }) => (
            <div key={key} className="flex flex-col">
              <dt className="text-text-sub">{label}</dt>
              <dd className="font-bold">{item.metrics?.[key]?.toLocaleString("ja-JP") ?? "—"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.lastElapsedHours !== null ? (
        <p className="text-s text-text-sub">投稿から{item.lastElapsedHours}時間の値です。</p>
      ) : null}
      {item.unmeasurableReason ? (
        <p className="text-s text-text-sub">
          {item.unmeasurableReason === "not_found"
            ? "Threads で投稿が見つからないため、計れません（消された可能性があります）。"
            : "投稿の ID がわからないため、計れません。"}
        </p>
      ) : null}
      {item.threadsPermalink ? (
        <div>
          <a
            href={item.threadsPermalink}
            {...EXTERNAL_LINK}
            className={buttonVariants({ variant: "text", size: "small" })}
          >
            Threads で見る（新しいタブ）
          </a>
        </div>
      ) : null}
      <FeedbackForm accountId={accountId} item={item} />
    </li>
  );
}

/**
 * CSV の書き出しの節。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 節の要素
 */
function ExportSection({ accountId }: { accountId: string }) {
  const mutation = useMutation({
    mutationFn: (kind: "posts" | "snapshots") => downloadPerformanceCsv(accountId, kind),
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
  });
  return (
    <section aria-labelledby="threads-performance-export" className="flex flex-col gap-xxs">
      <h2 id="threads-performance-export" className="text-l font-bold">
        CSV で書き出す
      </h2>
      <p className="text-s text-text-sub">
        Excel で開ける CSV
        にします。投稿ごと（今の値と判定）と、取りこみごと（24時間・3日・7日の値）があります。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <div className="flex flex-wrap gap-xxs">
          <Button
            aria-disabled={mutation.isPending || undefined}
            onClick={() => !mutation.isPending && mutation.mutate("posts")}
          >
            投稿ごとに書き出す
          </Button>
          <Button
            aria-disabled={mutation.isPending || undefined}
            onClick={() => !mutation.isPending && mutation.mutate("snapshots")}
          >
            取りこみごとに書き出す
          </Button>
        </div>
        {mutation.isSuccess ? (
          <ResponseMessage tone="success">{`${mutation.data.filename} を保存しました。`}</ResponseMessage>
        ) : null}
        {mutation.isError ? (
          <ResponseMessage tone="danger">{`書き出せませんでした。${errorMessage(mutation.error)}`}</ResponseMessage>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 反応の画面の中身。
 * @param props 運用アカウント（account）
 * @param props.account 運用アカウント
 * @returns 画面の要素
 */
function PerformanceContent({ account }: { account: ThreadsAccount }) {
  const [tab, setTab] = useState<PerformanceTab>("all");
  const query = usePerformance(account.id, tab);
  if (query.isPending) return <Loading />;
  // 読めたあとの続きの失敗では、画面を差しかえず、ボタンの近くに出す
  if (query.isLoadingError)
    return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  const [first] = query.data.pages;
  if (!first) return <Loading />;
  const { summary } = first;
  const items = query.data.pages.flatMap((page) => page.items);
  return (
    <ThreadsPage
      title="反応"
      lead={`${account.name}：投稿ごとの反応を、このアカウントの基準値と比べて判定します。`}
    >
      <SummarySection accountId={account.id} summary={summary} />
      <ChoiceChips
        label="表示する投稿"
        options={PERFORMANCE_TABS.map((value) => ({
          value,
          label: `${PERFORMANCE_TAB_LABELS[value]}（${summary.counts[value]}）`,
        }))}
        value={tab}
        onValueChange={setTab}
      />
      {items.length === 0 ? (
        <p className="text-m">
          {tab === "all"
            ? "まだ投稿済みの投稿はありません。自動投稿で投稿すると、ここに反応が出ます。"
            : `${PERFORMANCE_TAB_LABELS[tab]}の投稿はありません。`}
        </p>
      ) : (
        <ul aria-label={`${PERFORMANCE_TAB_LABELS[tab]}の投稿`} className="flex flex-col gap-xs">
          {items.map((item) => (
            <ItemCard key={item.id} accountId={account.id} item={item} />
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <div className="flex flex-col items-start gap-xxs">
          <Button
            variant="secondary"
            aria-disabled={query.isFetchingNextPage || undefined}
            onClick={() => !query.isFetchingNextPage && void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "読みこんでいます…" : "さらに表示する"}
          </Button>
          {query.isFetchNextPageError ? (
            <ResponseMessage tone="danger">{`続きを読みこめませんでした。${errorMessage(query.error)}`}</ResponseMessage>
          ) : null}
        </div>
      ) : null}
      <ExportSection accountId={account.id} />
    </ThreadsPage>
  );
}

/** PerformancePage が受け取るもの。 */
export type PerformancePageProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 反応の画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @returns 画面の要素
 */
export function PerformancePage({ accountId }: PerformancePageProps) {
  return (
    <AccountGate accountId={accountId}>
      {(account) => <PerformanceContent account={account} />}
    </AccountGate>
  );
}

const performanceRouteApi = getRouteApi("/threads/accounts/$accountId/performance");

/**
 * 反応の道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function PerformanceRoute() {
  const { accountId } = performanceRouteApi.useParams();
  return <PerformancePage accountId={accountId} />;
}
