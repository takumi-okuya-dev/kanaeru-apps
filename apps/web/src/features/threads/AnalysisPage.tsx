// アルゴリズムの分析（threads-006。めぐるの「解析」）：直近90日の確定した投稿から、時間帯・曜日・長さ・本文の特徴・
// 書き出しの型・テーマごとの閲覧の中央値と、はっきりした傾向、おすすめに乗った目安の投稿を出す（読むたびに計算する）。
// 本文で変えられる傾向は、次に作るプロンプトの「■伸びた傾向」に入る（設定で切れる）。
// 内容の分類は、外の AI に貼るプロンプトを作ってコピーし、答えを貼って保存する（アプリは AI を呼ばない。AD-20）。手でも直せる。
import {
  ANALYSIS_CLASSIFY_BATCH,
  ANALYSIS_MIN_BUCKET,
  ANALYSIS_SCOPES,
  ANALYSIS_SCOPE_LABELS,
  ANALYSIS_THEMES_MAX,
  ANALYSIS_THEME_NAME_MAX,
  AnalysisSettingsInput,
  OPENING_TYPES,
  OPENING_TYPE_LABELS,
  classifyPrompt,
  formatRatio,
  parseClassifyAnswer,
} from "@workspace/contracts/threads";
import type {
  AnalysisScope,
  AnalysisTheme,
  AnalysisView,
  ClassificationsList,
  ClassifyItem,
  OpeningType,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import { jstDateTime } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useMemo, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { useThreadsCan } from "./team-access.ts";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { saveAnalysisSettings, saveClassifications } from "./api.ts";
import { CopyButton } from "./CopyButton.tsx";
import { threadsPaths } from "./paths.ts";
import { THREADS_QUERY_KEYS, useAnalysis, useClassifications } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 区切りの1行。 */
type BucketRow = AnalysisView["time"][number];

/**
 * 数を見やすくする（値がなければ「—」）。
 * @param value 数
 * @returns 文字
 */
function formatCount(value: number | null): string {
  return value === null ? "—" : Math.round(value).toLocaleString("ja-JP");
}

/**
 * 割合を百分率にする（値がなければ「—」）。
 * @param value 割合（0〜1）
 * @returns 文字
 */
function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/**
 * 倍率を見やすくする（値がなければ「—」）。
 * @param value 倍率
 * @returns 文字
 */
function formatTimes(value: number | null): string {
  return value === null ? "—" : `${formatRatio(value)}倍`;
}

/**
 * 区切りの印の札。
 * @param props 印（mark）
 * @param props.mark 印
 * @returns 要素
 */
function MarkBadge({ mark }: { mark: BucketRow["mark"] }) {
  if (mark === "untried") return <Badge>試していない</Badge>;
  if (mark === "few") return <Badge>件数が少ない</Badge>;
  return null;
}

/**
 * 上の集計と見方。
 * @param props 分析（view）
 * @param props.view 分析
 * @returns 節の要素
 */
function SummarySection({ view }: { view: AnalysisView }) {
  const { totals, period } = view;
  return (
    <section aria-labelledby="threads-analysis-summary" className="flex flex-col gap-xxs">
      <h2 id="threads-analysis-summary" className="text-l font-bold">
        材料
      </h2>
      <p className="text-m">
        {`${period.from}〜${period.to}（${period.days}日）に確定した投稿：${totals.confirmed}件（うち宣伝 ${totals.promo}件・分類済み ${totals.classified}件）。`}
      </p>
      {view.needMore !== null ? (
        <p className="text-m">{`確定した投稿が、あと${view.needMore}件たまると見られます。`}</p>
      ) : null}
      <Disclosure summary="見方" variant="heading">
        <ul className="flex list-disc flex-col gap-x3s pl-m text-s text-text-sub">
          <li>投稿から7日で確定した投稿だけを使います（遅れて確定・計れないものは使いません）。</li>
          <li>平均ではなく中央値で比べます（数件だけ極端に伸びるため）。</li>
          <li>
            {`区切りの件数が${ANALYSIS_MIN_BUCKET}件に足りないものは「件数が少ない」と出し、傾向には使いません。`}
          </li>
          <li>
            傾向は、両方が{ANALYSIS_MIN_BUCKET}
            件以上で、閲覧の中央値が1.5倍以上違うものだけです。相関なので、原因とは限りません。件数が少ないうちは偶然に振り回されます。
          </li>
          <li>
            Threads
            から表示の順位は取れないため、「おすすめに乗った目安」は、投稿した時点のフォロワーの数と閲覧から推し量っています。
          </li>
        </ul>
      </Disclosure>
    </section>
  );
}

/**
 * 傾向の節。
 * @param props 運用アカウントの ID（accountId）・分析（view）
 * @param props.accountId 運用アカウントの ID
 * @param props.view 分析
 * @returns 節の要素
 */
function TrendsSection({ accountId, view }: { accountId: string; view: AnalysisView }) {
  const timing = view.trends.some(
    (trend) => trend.dimension === "time" || trend.dimension === "day",
  );
  return (
    <section aria-labelledby="threads-analysis-trends" className="flex flex-col gap-xxs">
      <h2 id="threads-analysis-trends" className="text-l font-bold">
        伸びた傾向
      </h2>
      {view.trends.length === 0 ? (
        <p className="text-m">今は、はっきりした傾向はありません。</p>
      ) : (
        <ul aria-label="伸びた傾向" className="flex flex-col gap-xxs">
          {view.trends.map((trend) => (
            <li
              key={`${trend.dimension}:${trend.key}`}
              className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
            >
              <p className="text-m font-bold">{trend.text}</p>
              <p className="text-s text-text-sub">
                {`${trend.count}件。閲覧の中央値 ${formatCount(trend.views)}（ほかの${trend.otherCount}件は ${formatCount(trend.otherViews)}。${formatRatio(trend.ratio)}倍）`}
              </p>
              <div className="flex flex-wrap gap-xxs">
                {trend.inPrompt ? <Badge variant="success">次のプロンプトに入る</Badge> : null}
                {trend.dimension === "time" || trend.dimension === "day" ? (
                  <Badge>時刻の見直しの参考に</Badge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {timing ? (
        <div className="flex flex-col items-start gap-x3s">
          <p className="text-s text-text-sub">
            {view.schedule.enabled && view.schedule.slotTimes.length > 0
              ? `今の自動投稿の時刻：${view.schedule.slotTimes.join("・")}。時刻は自動では変えません（設定で直せます）。`
              : "自動投稿の時刻は、まだ決めていません（設定で決められます）。"}
          </p>
          <ButtonRow>
            <Link
              to={threadsPaths.settings(accountId)}
              hash="threads-schedule"
              className={buttonVariants({ variant: "secondary" })}
            >
              投稿の時刻を開く
            </Link>
          </ButtonRow>
        </div>
      ) : null}
      <p className="text-s text-text-sub">
        {view.settings.trendsInPrompt
          ? "本文で変えられる傾向（長さ・本文の特徴・書き出しの型・テーマ）は、宣伝を除いた投稿で求めて、次に作るプロンプトに入れます（投稿のルールや NG ワードと食い違うものは入れません）。"
          : "伸びた傾向は、プロンプトに入れない設定です。"}
      </p>
    </section>
  );
}

/**
 * 区切りの表（狭い画面でも横に動かないよう、行ごとのカードにする）。
 * @param props 題（title）・行（rows）・空のときの文（empty）
 * @param props.title 題
 * @param props.rows 行
 * @param props.empty 行がないときの文
 * @returns 節の要素
 */
function BucketSection({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: BucketRow[];
  empty: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-xxs">
      <h3 className="text-m font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-s text-text-sub">{empty}</p>
      ) : (
        <ul aria-label={title} className="flex flex-col gap-x3s">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-col gap-x3s rounded-sm border border-border bg-surface p-xxs"
            >
              <div className="flex flex-wrap items-center gap-xxs">
                <span className="text-m font-bold">{row.label}</span>
                <MarkBadge mark={row.mark} />
              </div>
              <dl className="grid grid-cols-2 gap-x3s text-s wide:grid-cols-4">
                <div className="flex flex-col">
                  <dt className="text-text-sub">件数</dt>
                  <dd className="font-bold">{row.count}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-text-sub">閲覧（中央値）</dt>
                  <dd className="font-bold">{formatCount(row.views)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-text-sub">反応率</dt>
                  <dd className="font-bold">{formatPercent(row.engagementRate)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-text-sub">返信率</dt>
                  <dd className="font-bold">{formatPercent(row.replyRate)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 本文の特徴の表。
 * @param props 分析（view）
 * @param props.view 分析
 * @returns 節の要素
 */
function FeatureSection({ view }: { view: AnalysisView }) {
  return (
    <section aria-label="本文の特徴" className="flex flex-col gap-xxs">
      <h3 className="text-m font-bold">本文の特徴</h3>
      <ul aria-label="本文の特徴" className="flex flex-col gap-x3s">
        {view.features.map((row) => (
          <li
            key={row.key}
            className="flex flex-col gap-x3s rounded-sm border border-border bg-surface p-xxs"
          >
            <div className="flex flex-wrap items-center gap-xxs">
              <span className="text-m font-bold">{row.label}</span>
              <MarkBadge mark={row.mark} />
            </div>
            <dl className="grid grid-cols-3 gap-x3s text-s">
              <div className="flex flex-col">
                <dt className="text-text-sub">あり</dt>
                <dd className="font-bold">{`${formatCount(row.with.views)}（${row.with.count}件）`}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-text-sub">なし</dt>
                <dd className="font-bold">{`${formatCount(row.without.views)}（${row.without.count}件）`}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-text-sub">あり÷なし</dt>
                <dd className="font-bold">{formatTimes(row.ratio)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * おすすめに乗った目安の節。
 * @param props 分析（view）
 * @param props.view 分析
 * @returns 節の要素
 */
function RecommendedSection({ view }: { view: AnalysisView }) {
  const { recommended } = view;
  return (
    <section aria-labelledby="threads-analysis-recommended" className="flex flex-col gap-xxs">
      <h2 id="threads-analysis-recommended" className="text-l font-bold">
        おすすめに乗った目安
      </h2>
      <p className="text-s text-text-sub">
        閲覧が投稿した時点のフォロワーの数を超え、広がり（閲覧÷フォロワー）が上位20%の投稿です。
      </p>
      {!recommended.available ? (
        <p className="text-m">
          {`フォロワーの数がわかる確定した投稿が${ANALYSIS_MIN_BUCKET}件たまると出ます（今 ${view.totals.withFollowers}件）。`}
        </p>
      ) : recommended.posts.length === 0 ? (
        <p className="text-m">フォロワーの数を超えて広がった投稿は、まだありません。</p>
      ) : (
        <ul aria-label="おすすめに乗った目安の投稿" className="flex flex-col gap-xxs">
          {recommended.posts.map((post) => (
            <li
              key={post.id}
              className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
            >
              <p className="text-m break-words">{post.head}</p>
              <p className="text-s text-text-sub">{`投稿：${jstDateTime(post.publishedAt)}`}</p>
              <dl className="grid grid-cols-2 gap-x3s text-s wide:grid-cols-5">
                <div className="flex flex-col">
                  <dt className="text-text-sub">閲覧</dt>
                  <dd className="font-bold">{formatCount(post.views)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-text-sub">広がり</dt>
                  <dd className="font-bold">{formatTimes(post.spread)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-text-sub">24時間の閲覧</dt>
                  <dd className="font-bold">{formatCount(post.firstSpeed)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-text-sub">後からの伸び</dt>
                  <dd className="font-bold">{formatTimes(post.laterGrowth)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-text-sub">返信率</dt>
                  <dd className="font-bold">{formatPercent(post.replyRate)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {recommended.compare ? (
        <dl
          aria-label="おすすめに乗った目安とほかの投稿の比べ"
          className="grid grid-cols-3 gap-x3s rounded-sm border border-border bg-surface-sunken p-xs text-s"
        >
          <dt className="text-text-sub">中央値</dt>
          <dd className="font-bold">{`目安（${recommended.compare.recommended.count}件）`}</dd>
          <dd className="font-bold">{`ほか（${recommended.compare.others.count}件）`}</dd>
          <dt className="text-text-sub">24時間の閲覧</dt>
          <dd>{formatCount(recommended.compare.recommended.firstSpeed)}</dd>
          <dd>{formatCount(recommended.compare.others.firstSpeed)}</dd>
          <dt className="text-text-sub">後からの伸び</dt>
          <dd>{formatTimes(recommended.compare.recommended.laterGrowth)}</dd>
          <dd>{formatTimes(recommended.compare.others.laterGrowth)}</dd>
          <dt className="text-text-sub">返信率</dt>
          <dd>{formatPercent(recommended.compare.recommended.replyRate)}</dd>
          <dd>{formatPercent(recommended.compare.others.replyRate)}</dd>
          <dt className="text-text-sub">文字数</dt>
          <dd>{formatCount(recommended.compare.recommended.length)}</dd>
          <dd>{formatCount(recommended.compare.others.length)}</dd>
          <dt className="text-text-sub">問いかけあり</dt>
          <dd>{`${recommended.compare.recommended.questionCount}件／${recommended.compare.recommended.count}件`}</dd>
          <dd>{`${recommended.compare.others.questionCount}件／${recommended.compare.others.count}件`}</dd>
        </dl>
      ) : null}
      {recommended.available && view.totals.withFollowers < view.totals.confirmed ? (
        <p className="text-s text-text-sub">
          {`フォロワーの数を記録する前の${view.totals.confirmed - view.totals.withFollowers}件は、広がりを出せないので外しています。`}
        </p>
      ) : null}
    </section>
  );
}

/**
 * 外の AI で内容を分類する節（プロンプトを作ってコピーし、答えを貼って保存する）。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 節の要素
 */
function ClassifySection({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const query = useClassifications(accountId, "unclassified");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  const targets = useMemo(
    () => (query.data?.posts ?? []).map((post) => ({ draftId: post.draftId, body: post.body })),
    [query.data],
  );
  const themes = query.data?.themes ?? [];
  const prompt = targets.length > 0 ? classifyPrompt(targets, themes) : "";
  const read = answer.trim() ? parseClassifyAnswer(answer, targets, themes) : undefined;
  // 読み取った候補を保存の前に直した分（投稿の ID ごと。答えを貼り直すと消す）
  const [edits, setEdits] = useState<Record<string, ClassChoice>>({});
  const [editing, setEditing] = useState<ClassifyItem>();
  const parsed = read
    ? { ...read, items: read.items.map((item) => ({ ...item, ...edits[item.draftId] })) }
    : undefined;
  const bodyOf = new Map(targets.map((target) => [target.draftId, target.body]));

  /** 読み取った分類を保存する。 */
  const save = async () => {
    if (pending || !parsed) return;
    if (parsed.items.length === 0) {
      setResult({
        tone: "danger",
        message: "保存できる分類がありません。答えの形を確かめてください。",
      });
      return;
    }
    setPending(true);
    setResult(undefined);
    try {
      const saved = await saveClassifications(accountId, {
        source: "ai",
        items: parsed.items.map((item) => ({
          draftId: item.draftId,
          openingType: item.openingType,
          themeId: item.themeId,
        })),
      });
      setAnswer("");
      setEdits({});
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      setResult({
        tone: "success",
        message: `${saved.saved}件の分類を保存しました。${saved.skipped.length > 0 ? `${saved.skipped.length}件は保存しませんでした（期間の外か、知らないテーマ）。` : ""}`,
      });
    } catch (caught) {
      setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="threads-analysis-classify" className="flex flex-col gap-xs">
      <h2 id="threads-analysis-classify" className="text-l font-bold">
        内容を分類する
      </h2>
      <p className="text-s text-text-sub">
        {`書き出しの型（${OPENING_TYPES.map((type) => OPENING_TYPE_LABELS[type]).join("・")}）とテーマを、外の AI に付けてもらいます。プロンプトをコピーして外の AI に貼り、答えをそのまま下に貼ってください。1回に${ANALYSIS_CLASSIFY_BATCH}件までです。`}
      </p>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ResponseMessage tone="danger">{`読みこめませんでした。${errorMessage(query.error)}`}</ResponseMessage>
      ) : targets.length === 0 ? (
        <p className="text-m">分類がまだの確定した投稿はありません。</p>
      ) : (
        <>
          <Field
            label="分類のプロンプト"
            description={`分類がまだの投稿：${targets.length + query.data.remaining}件（今回 ${targets.length}件）`}
          >
            <Textarea readOnly rows={6} value={prompt} />
          </Field>
          <CopyButton text={prompt} label="プロンプトをコピー" />
          <Field
            label="AI の分類の答え"
            description="【1】書き出しの型：…／テーマ：… の行を読みます。"
          >
            <Textarea
              rows={6}
              value={answer}
              onChange={(change) => {
                setAnswer(change.target.value);
                setEdits({});
              }}
            />
          </Field>
          {parsed ? (
            <div className="flex flex-col gap-x3s text-s">
              <p>{`読み取れた分類：${parsed.items.length}件（保存の前に、1件ずつ直せます）`}</p>
              {parsed.items.length > 0 ? (
                <ul aria-label="分類の候補" className="flex flex-col gap-x3s">
                  {parsed.items.map((item) => (
                    <li
                      key={item.draftId}
                      className="flex flex-wrap items-center justify-between gap-xxs rounded-sm border border-border bg-surface p-xxs"
                    >
                      <span className="min-w-0 flex-1 break-words">
                        {`【${item.index}】${headOf(bodyOf.get(item.draftId) ?? "")}`}
                        <span className="block text-text-sub">
                          {`${OPENING_TYPE_LABELS[item.openingType]}／${themes.find((theme) => theme.id === item.themeId)?.name ?? "テーマなし"}`}
                        </span>
                      </span>
                      <Button
                        size="small"
                        onClick={() => setEditing(item)}
                        aria-label={`【${item.index}】の分類を直す`}
                      >
                        直す
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {parsed.problems.length > 0 ? (
                <ul aria-label="読み取れなかった投稿" className="flex flex-col gap-x3s">
                  {parsed.problems.map((problem) => (
                    <li
                      key={problem.index}
                    >{`【${problem.index}】保存しません（${problem.reason}）`}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <ButtonRow>
            <Button
              variant="primary"
              onClick={() => void save()}
              aria-disabled={pending || !parsed || undefined}
            >
              {pending ? "保存しています…" : "分類を保存"}
            </Button>
          </ButtonRow>
        </>
      )}
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      {editing ? (
        <CandidateDialog
          index={editing.index}
          body={bodyOf.get(editing.draftId) ?? ""}
          initial={{ openingType: editing.openingType, themeId: editing.themeId }}
          themes={themes}
          onApply={(choice) => setEdits({ ...edits, [editing.draftId]: choice })}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </section>
  );
}

/** 書き出しの型とテーマ。 */
type ClassChoice = { openingType: OpeningType; themeId: string | null };

/**
 * 本文の書き出し（改行をつめて24文字まで）。
 * @param body 本文
 * @returns 書き出し
 */
function headOf(body: string): string {
  const chars = [...body.replace(/\s*\n\s*/g, " ")];
  return chars.length > 24 ? `${chars.slice(0, 24).join("")}…` : chars.join("");
}

/** CandidateDialog が受け取るもの。 */
type CandidateDialogProps = {
  /** 何件目（【n】） */
  index: number;
  /** 本文 */
  body: string;
  /** 今の候補 */
  initial: ClassChoice;
  /** テーマ */
  themes: AnalysisTheme[];
  /** 直した候補を受け取る（まだ保存しない） */
  onApply: (choice: ClassChoice) => void;
  /** 閉じる */
  onClose: () => void;
};

/**
 * 読み取った分類の候補を、保存の前に直す枠（めぐるの ClassifyDialog の候補の選び直し）。
 * @param props 何件目・本文・今の候補・テーマ・直した候補を受け取る・閉じる
 * @returns 枠の要素
 */
function CandidateDialog({ index, body, initial, themes, onApply, onClose }: CandidateDialogProps) {
  const [opening, setOpening] = useState<OpeningType>(initial.openingType);
  const [theme, setTheme] = useState<string>(initial.themeId ?? "none");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`【${index}】の分類を直す`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            やめる
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply({ openingType: opening, themeId: theme === "none" ? null : theme });
              onClose();
            }}
          >
            候補を直す
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xs">
        <p className="text-s break-words whitespace-pre-wrap text-text-sub">{body}</p>
        <ChoiceChips
          label="書き出しの型"
          options={OPENING_TYPES.map((type) => ({ value: type, label: OPENING_TYPE_LABELS[type] }))}
          value={opening}
          onValueChange={setOpening}
        />
        <ChoiceChips
          label="テーマ"
          options={[
            { value: "none", label: "なし" },
            ...themes.map((item) => ({ value: item.id, label: item.name })),
          ]}
          value={theme}
          onValueChange={setTheme}
        />
        <p className="text-s text-text-sub">直した候補は「分類を保存」で保存します。</p>
      </div>
    </Dialog>
  );
}

/** 分類を手で直す枠が受け取るもの。 */
type EditTarget = ClassificationsList["posts"][number];

/**
 * 分類を手で付ける・直す枠。
 * @param props 運用アカウントの ID・対象・テーマ・閉じる
 * @param props.accountId 運用アカウントの ID
 * @param props.target 対象の投稿
 * @param props.themes テーマ
 * @param props.onClose 閉じる
 * @returns 枠の要素
 */
function EditClassificationDialog({
  accountId,
  target,
  themes,
  onClose,
}: {
  accountId: string;
  target: EditTarget;
  themes: AnalysisTheme[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState<OpeningType | null>(target.openingType);
  const [theme, setTheme] = useState<string>(target.themeId ?? "none");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  /** 保存する。 */
  const save = async () => {
    if (pending) return;
    if (!opening) {
      setError("書き出しの型を選んでください。");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await saveClassifications(accountId, {
        source: "manual",
        items: [
          {
            draftId: target.draftId,
            openingType: opening,
            themeId: theme === "none" ? null : theme,
          },
        ],
      });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      onClose();
    } catch (caught) {
      setError(`保存できませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="分類を直す"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            やめる
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            aria-disabled={pending || undefined}
          >
            {pending ? "保存しています…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xs">
        <p className="text-s break-words whitespace-pre-wrap text-text-sub">{target.body}</p>
        <ChoiceChips
          label="書き出しの型"
          options={OPENING_TYPES.map((type) => ({ value: type, label: OPENING_TYPE_LABELS[type] }))}
          value={opening}
          onValueChange={setOpening}
          error={error && !opening ? error : undefined}
        />
        <ChoiceChips
          label="テーマ"
          options={[
            { value: "none", label: "なし" },
            ...themes.map((item) => ({ value: item.id, label: item.name })),
          ]}
          value={theme}
          onValueChange={setTheme}
        />
        {error && opening ? <ResponseMessage tone="danger">{error}</ResponseMessage> : null}
      </div>
    </Dialog>
  );
}

/**
 * 分類を手で直す節。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 節の要素
 */
function ManualClassifySection({ accountId }: { accountId: string }) {
  const [mode, setMode] = useState<"unclassified" | "classified">("classified");
  const query = useClassifications(accountId, mode);
  const [editing, setEditing] = useState<EditTarget>();
  const themes = query.data?.themes ?? [];
  const themeName = (id: string | null) =>
    id === null ? "なし" : (themes.find((item) => item.id === id)?.name ?? "なし");
  return (
    <section aria-labelledby="threads-analysis-manual" className="flex flex-col gap-xs">
      <h2 id="threads-analysis-manual" className="text-l font-bold">
        分類を手で直す
      </h2>
      <ChoiceChips
        label="表示する投稿"
        options={[
          { value: "classified", label: "分類済み" },
          { value: "unclassified", label: "まだの投稿" },
        ]}
        value={mode}
        onValueChange={setMode}
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ResponseMessage tone="danger">{`読みこめませんでした。${errorMessage(query.error)}`}</ResponseMessage>
      ) : query.data.posts.length === 0 ? (
        <p className="text-m">
          {mode === "classified"
            ? "分類済みの投稿はありません。"
            : "分類がまだの確定した投稿はありません。"}
        </p>
      ) : (
        <ul
          aria-label={mode === "classified" ? "分類済みの投稿" : "分類がまだの投稿"}
          className="flex flex-col gap-xxs"
        >
          {query.data.posts.map((post) => (
            <li
              key={post.draftId}
              className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
            >
              <p className="line-clamp-2 text-m break-words">{post.body}</p>
              <p className="text-s text-text-sub">
                {post.openingType
                  ? `書き出しの型：${OPENING_TYPE_LABELS[post.openingType]}／テーマ：${themeName(post.themeId)}`
                  : "まだ分類していません"}
              </p>
              <div>
                <Button size="small" variant="secondary" onClick={() => setEditing(post)}>
                  {post.openingType ? "分類を直す" : "分類を付ける"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <EditClassificationDialog
          accountId={accountId}
          target={editing}
          themes={themes}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </section>
  );
}

/**
 * 分析の設定の節（テーマ・伸びた傾向をプロンプトに入れるか）。
 * @param props 運用アカウントの ID（accountId）・今の設定（settings）
 * @param props.accountId 運用アカウントの ID
 * @param props.settings 今の設定
 * @returns 節の要素
 */
function SettingsSection({
  accountId,
  settings,
}: {
  accountId: string;
  settings: AnalysisView["settings"];
}) {
  const queryClient = useQueryClient();
  const [include, setInclude] = useState(settings.trendsInPrompt);
  const [themes, setThemes] = useState<{ id?: string; name: string }[]>(settings.themes);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);

  /** 保存する。 */
  const save = async () => {
    if (pending) return;
    setResult(undefined);
    const parsed = AnalysisSettingsInput.safeParse({
      trendsInPrompt: include,
      themes: themes.filter((theme) => theme.id !== undefined || theme.name.trim() !== ""),
      version: settings.version,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const saved = await saveAnalysisSettings(accountId, parsed.data);
      setThemes(saved.themes);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      setResult({ tone: "success", message: "分析の設定を保存しました。" });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="threads-analysis-settings" className="flex flex-col gap-xs">
      <h2 id="threads-analysis-settings" className="text-l font-bold">
        分析の設定
      </h2>
      <label className="flex min-h-l items-center gap-xxs text-m">
        <input
          type="checkbox"
          className="size-s accent-primary"
          checked={include}
          onChange={(change) => setInclude(change.target.checked)}
        />
        伸びた傾向を、次のプロンプトに入れる
      </label>
      <div className="flex flex-col gap-xxs">
        <h3 className="text-m font-bold">テーマ</h3>
        <p className="text-s text-text-sub">
          {`投稿のテーマの名前を決めます（${ANALYSIS_THEMES_MAX}個まで・1つ${ANALYSIS_THEME_NAME_MAX}文字まで）。消したテーマの分類は「なし」に戻ります。`}
        </p>
        {themes.map((theme, index) => (
          <div key={theme.id ?? `new-${index.toString()}`} className="flex items-end gap-xxs">
            <Field
              label={`テーマ ${index + 1}`}
              error={errors[`themes.${index}.name`]}
              className="flex-1"
            >
              <Input
                value={theme.name}
                maxLength={ANALYSIS_THEME_NAME_MAX}
                onChange={(change) => {
                  const name = change.target.value;
                  setThemes((current) =>
                    current.map((item, at) => (at === index ? { ...item, name } : item)),
                  );
                }}
              />
            </Field>
            <Button
              variant="secondary"
              size="small"
              onClick={() => setThemes((current) => current.filter((_, at) => at !== index))}
            >
              {`テーマ ${index + 1} を外す`}
            </Button>
          </div>
        ))}
        {errors.themes ? <ResponseMessage tone="danger">{errors.themes}</ResponseMessage> : null}
        <ButtonRow>
          <Button
            variant="secondary"
            aria-disabled={themes.length >= ANALYSIS_THEMES_MAX || undefined}
            onClick={() => {
              if (themes.length < ANALYSIS_THEMES_MAX)
                setThemes((current) => [...current, { name: "" }]);
            }}
          >
            テーマを足す
          </Button>
        </ButtonRow>
      </div>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button
            variant="primary"
            onClick={() => void save()}
            aria-disabled={pending || undefined}
          >
            {pending ? "保存しています…" : "分析の設定を保存"}
          </Button>
        </ButtonRow>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </section>
  );
}

/**
 * 分析の画面の中身。
 * @param props 運用アカウント（account）
 * @param props.account 運用アカウント
 * @returns 画面の要素
 */
function AnalysisContent({ account }: { account: ThreadsAccount }) {
  const [scope, setScope] = useState<AnalysisScope>("all");
  const query = useAnalysis(account.id, scope);
  const can = useThreadsCan();
  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  const view = query.data;
  return (
    <ThreadsPage
      wide
      title="分析"
      lead={`${account.name}：伸びやすい時間帯・長さ・書き出しを見つけます`}
    >
      <SummarySection view={view} />
      <ChoiceChips
        label="分析する投稿"
        options={ANALYSIS_SCOPES.map((value) => ({ value, label: ANALYSIS_SCOPE_LABELS[value] }))}
        value={scope}
        onValueChange={setScope}
      />
      {view.needMore === null ? (
        <>
          <TrendsSection accountId={account.id} view={view} />
          <section aria-labelledby="threads-analysis-buckets" className="flex flex-col gap-xs">
            <h2 id="threads-analysis-buckets" className="text-l font-bold">
              区切りごとの反応
            </h2>
            <BucketSection title="時間帯" rows={view.time} empty="" />
            <BucketSection title="曜日（祝日は休日）" rows={view.day} empty="" />
            <BucketSection title="文字数" rows={view.length} empty="" />
            <FeatureSection view={view} />
            <BucketSection
              title="書き出しの型"
              rows={view.opening}
              empty="分類した投稿がまだありません。"
            />
            <BucketSection
              title="テーマ"
              rows={view.theme}
              empty="テーマがまだありません（下の「分析の設定」で決めます）。"
            />
          </section>
          <RecommendedSection view={view} />
        </>
      ) : null}
      <ClassifySection accountId={account.id} />
      <ManualClassifySection accountId={account.id} />
      {can.manage ? (
        <SettingsSection accountId={account.id} settings={view.settings} />
      ) : (
        <section aria-labelledby="threads-analysis-settings" className="flex flex-col gap-xxs">
          <h2 id="threads-analysis-settings" className="text-l font-bold">
            分析の設定
          </h2>
          <p className="text-m">
            伸びた傾向を投稿のプロンプトに{view.settings.trendsInPrompt ? "入れます" : "入れません"}
            。 テーマ：
            {view.settings.themes.length > 0
              ? view.settings.themes.map((theme) => theme.name).join("、")
              : "まだありません"}
          </p>
          <p className="text-s text-text-sub">分析の設定は、持ち主だけが変えられます。</p>
        </section>
      )}
    </ThreadsPage>
  );
}

/** AnalysisPage が受け取るもの。 */
export type AnalysisPageProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 分析の画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @returns 画面の要素
 */
export function AnalysisPage({ accountId }: AnalysisPageProps) {
  return (
    <AccountGate accountId={accountId}>
      {(account) => <AnalysisContent account={account} />}
    </AccountGate>
  );
}

const analysisRouteApi = getRouteApi("/threads/accounts/$accountId/analysis");

/**
 * 分析の道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function AnalysisRoute() {
  const { accountId } = analysisRouteApi.useParams();
  return <AnalysisPage accountId={accountId} />;
}
