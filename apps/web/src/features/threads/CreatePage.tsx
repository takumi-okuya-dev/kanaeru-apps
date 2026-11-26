// 案を作る（めぐるの「投稿をつくる」。AI の段階1：アプリは外の AI に何も送らない。AD-20）。
// 1. プロンプトの設定（作る件数・文字数）を保存する
// 2. 「プロンプトを作る」でプロンプトを出し、コピーして外の AI（ChatGPT・Claude）に貼る
// 3. 返ってきた答えを貼り、「案をためる」で @@@ の行ごとに案にする（送る前に何件に分かれるかを出す）
// threads-011（めぐるの「投稿をつくる」の振る舞いを写した）：
// - 開いたらすぐプロンプトを作る。「プロンプトに入っている情報」で、何がどれだけ入ったかと直す画面へのリンクを出す
// - 文字数の設定は、作る件数の短文・中文・長文の内訳を出し、はじめの値に戻せる
// - ためたあとは画面に残り、件数・区切りなし・Threads の上限を超える件数と「取り消す」（貼った文を戻す）を出す
// - 貼った文があるまま画面を離れるときは確かめる。承認待ちが上限なら、ためられないことを先に出す
import {
  HINTED_KEYS,
  NEEDS_REVIEW_LIMIT,
  PASTE_MAX_DRAFTS,
  POST_LENGTH_DEFAULTS,
  PromptSettings,
  checkStrategy,
  findPasteProblem,
  splitDrafts,
  splitLengthMix,
  strategyFieldOf,
} from "@workspace/contracts/threads";
import type {
  DraftBatchResult,
  GeneratedPrompt,
  PromptSettings as PromptSettingsValue,
} from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useBlocker } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { createDraftBatch, fetchPrompt, savePromptSettings, undoDraftBatch } from "./api.ts";
import { THREADS_QUERY_KEYS, usePromptSettings, useStrategy } from "./queries.ts";
import { useThreadsCan } from "./team-access.ts";

/** 設定の欄の名前と見える名前（文字数の欄）。 */
const LENGTH_FIELDS = [
  { key: "target", label: "1投稿の文字数の目標", description: "50〜500。10きざみ" },
  { key: "shortLength", label: "短文の文字数", description: "10〜目標。5きざみ" },
  { key: "mediumLength", label: "中文の文字数", description: "10〜目標。5きざみ" },
  { key: "longLength", label: "長文の文字数", description: "10〜目標。5きざみ" },
  { key: "shortRatio", label: "短文の割合（％）", description: "5きざみ" },
  { key: "mediumRatio", label: "中文の割合（％）", description: "5きざみ" },
  { key: "longRatio", label: "長文の割合（％）", description: "3つを合わせて100" },
] as const;

/** 設定の欄の値（文字のまま）。 */
type SettingsValues = { count: string } & Record<(typeof LENGTH_FIELDS)[number]["key"], string>;

/**
 * 設定を、欄の値にする。
 * @param settings プロンプトの設定
 * @returns 欄の値
 */
function toSettingsValues(settings: PromptSettingsValue): SettingsValues {
  const { length } = settings;
  return {
    count: String(settings.count),
    target: String(length.target),
    shortLength: String(length.shortLength),
    mediumLength: String(length.mediumLength),
    longLength: String(length.longLength),
    shortRatio: String(length.shortRatio),
    mediumRatio: String(length.mediumRatio),
    longRatio: String(length.longRatio),
  };
}

/**
 * 欄の文字を数にする（数でなければ NaN にして、約束の確かめに任せる）。
 * @param value 欄の文字
 * @returns 数
 */
function toNumber(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

/** SettingsForm が受け取るもの。 */
type SettingsFormProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 読んだ設定 */
  settings: PromptSettingsValue;
};

/**
 * プロンプトの設定のフォーム。
 * @param props 運用アカウントの ID（accountId）・読んだ設定（settings）
 * @returns フォームの要素
 */
function SettingsForm({ accountId, settings }: SettingsFormProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<SettingsValues>(() => toSettingsValues(settings));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string }>();
  const [pending, setPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(formRef.current);
  }, [focusRequest]);

  // 作る件数の短文・中文・長文の内訳（割合の合計が100で、件数が数のときだけ）
  const ratios = [values.shortRatio, values.mediumRatio, values.longRatio].map(toNumber) as [
    number,
    number,
    number,
  ];
  const ratioSum = ratios.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const count = toNumber(values.count);
  const mix =
    ratioSum === 100 && Number.isInteger(count) && count > 0 ? splitLengthMix(count, ratios) : null;

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setResult(undefined);
    const parsed = PromptSettings.safeParse({
      count: toNumber(values.count),
      length: Object.fromEntries(LENGTH_FIELDS.map(({ key }) => [key, toNumber(values[key])])),
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const saved = await savePromptSettings(accountId, parsed.data);
      queryClient.setQueryData(THREADS_QUERY_KEYS.promptSettings(accountId), saved);
      setResult({ tone: "success", message: "設定を保存しました。" });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setFocusRequest((count) => count + 1);
      } else {
        setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(submitEvent) => void submit(submitEvent)}
      className="flex flex-col gap-s"
    >
      <Field label="作る件数" description="1〜50件" error={errors.count} required>
        <Input
          inputMode="numeric"
          autoComplete="off"
          value={values.count}
          onChange={(change) =>
            setValues((current) => ({ ...current, count: change.target.value }))
          }
        />
      </Field>
      <Disclosure summary="文字数と長さの割合" variant="heading">
        <p className="text-s text-text-sub" aria-live="polite">
          {mix
            ? `${toNumber(values.count)}件の内訳：短文 ${mix[0]}件（${values.shortLength}文字）・中文 ${mix[1]}件（${values.mediumLength}文字）・長文 ${mix[2]}件（${values.longLength}文字）`
            : `割合の合計を100にすると、内訳を出します（今は${ratioSum}）。`}
        </p>
        <div className="grid grid-cols-1 gap-s wide:grid-cols-2">
          {LENGTH_FIELDS.map(({ key, label, description }) => (
            <Field
              key={key}
              label={label}
              description={description}
              error={errors[`length.${key}`]}
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                value={values[key]}
                onChange={(change) => {
                  const value = change.target.value;
                  setValues((current) => ({ ...current, [key]: value }));
                }}
              />
            </Field>
          ))}
        </div>
        {/* 途中の「戻す」は、下の「設定を保存」と見分けやすいよう左に置く（右寄せの ButtonRow にしない） */}
        <div>
          <Button
            type="button"
            onClick={() =>
              setValues((current) => ({
                ...current,
                ...Object.fromEntries(
                  LENGTH_FIELDS.map(({ key }) => [key, String(POST_LENGTH_DEFAULTS[key])]),
                ),
              }))
            }
          >
            文字数と割合をはじめの値に戻す（保存はまだ）
          </Button>
        </div>
      </Disclosure>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button type="submit" aria-disabled={pending || undefined}>
            {pending ? "保存しています…" : "設定を保存"}
          </Button>
        </ButtonRow>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/** PromptMaterials が受け取るもの。 */
type PromptMaterialsProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 作ったプロンプト */
  prompt: GeneratedPrompt;
};

/** 戦略の項目の判定の見える名前。 */
const CHECK_LABELS = { ok: "十分", short: "短め", empty: "まだ" } as const;

/**
 * 「プロンプトに入っている情報」（めぐるの PromptMaterials）。入ったものの数と、直す画面へのリンク。はじめは閉じている。
 * @param props 運用アカウントの ID・作ったプロンプト
 * @returns 要素
 */
function PromptMaterials({ accountId, prompt }: PromptMaterialsProps) {
  const strategy = useStrategy(accountId);
  const check = strategy.data ? checkStrategy(strategy.data) : undefined;
  const { summary } = prompt;
  const params = { accountId };
  const linkClass = "text-s text-text-link underline";
  return (
    <Disclosure
      summary="プロンプトに入っている情報"
      variant="heading"
      className="rounded-sm border border-border bg-surface p-xs"
    >
      <div className="grid grid-cols-1 gap-xs wide:grid-cols-2">
        <section aria-label="戦略" className="flex flex-col gap-x3s">
          <div className="flex items-center justify-between gap-xxs">
            <h3 className="text-m font-bold">
              戦略（十分 {check?.done ?? summary.strategyFilledCount}項目）
            </h3>
            <Link to="/threads/accounts/$accountId/strategy" params={params} className={linkClass}>
              戦略を直す
            </Link>
          </div>
          {check ? (
            <ul className="flex flex-col text-s">
              {HINTED_KEYS.map((key) => {
                const item = check.items[key];
                return (
                  <li key={key} className="flex items-center gap-xxs border-b border-border py-x3s">
                    <span className="min-w-0 flex-1">{strategyFieldOf(key).label}</span>
                    <span className={item.status === "ok" ? "text-success-text" : "text-text-sub"}>
                      {CHECK_LABELS[item.status]}
                    </span>
                    {item.chars > 0 ? (
                      <span className="text-text-sub">{item.chars}文字</span>
                    ) : null}
                    <Link
                      to="/threads/accounts/$accountId/strategy"
                      params={params}
                      hash={`field-${key}`}
                      aria-label={`「${strategyFieldOf(key).label}」を直す`}
                      className={linkClass}
                    >
                      直す
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
        <section aria-label="ほかの材料" className="flex flex-col gap-xs text-s">
          <div className="flex flex-col gap-x3s">
            <p>
              投稿のルール：{summary.coreRuleCount}行／NGワード：{summary.ngWordCount}個
            </p>
            <Link
              to="/threads/accounts/$accountId/settings"
              params={params}
              hash="threads-core-rules"
              className={linkClass}
            >
              設定で直す
            </Link>
          </div>
          <div className="flex flex-col gap-x3s">
            <p>
              宣伝：{summary.promotionCount}件／参考の投稿：{summary.referencePostCount}件
            </p>
            <Link to="/threads/accounts/$accountId/research" params={params} className={linkClass}>
              リサーチで直す
            </Link>
          </div>
          <p>
            最近の案：{summary.recentDraftCount}件（同じ内容を避ける）／却下の案：
            {summary.rejectedCount}件（避けること）
          </p>
          <div className="flex flex-col gap-x3s">
            <p>低調の投稿：{summary.poorPostCount}件</p>
            <Link
              to="/threads/accounts/$accountId/performance"
              params={params}
              className={linkClass}
            >
              反応を見る
            </Link>
          </div>
          <div className="flex flex-col gap-x3s">
            <p>伸びた傾向：{summary.trendCount}件</p>
            <Link to="/threads/accounts/$accountId/analysis" params={params} className={linkClass}>
              分析を見る
            </Link>
          </div>
          <p>1日の投稿の数：{summary.dailyPostCount}件</p>
        </section>
      </div>
    </Disclosure>
  );
}

/** PromptSection が受け取るもの。 */
type PromptSectionProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * プロンプトを作ってコピーする節。開いたらすぐ作る（めぐると同じ）。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
function PromptSection({ accountId }: PromptSectionProps) {
  const [prompt, setPrompt] = useState<GeneratedPrompt>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [copied, setCopied] = useState<number>();
  const started = useRef(false);

  /** プロンプトを作る（最新の戦略・ルール・案から毎回作り直す）。 */
  const generate = async () => {
    if (pending) return;
    setFailure(undefined);
    setCopied(undefined);
    setPending(true);
    try {
      setPrompt(await fetchPrompt(accountId));
    } catch (caught) {
      setFailure(`作れませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  // 開いたらすぐ作る（1回だけ）
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate();
  });

  /**
   * 文をコピーする。
   * @param text 文
   * @param index 何番目か
   */
  const copy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
    } catch {
      setFailure("コピーできませんでした。欄の文を選んで、手でコピーしてください。");
    }
  };

  const parts = prompt?.parts ?? [];
  // 主のボタンは次にコピーするもの1つだけ（はじめは1つ目、コピーしたらその次。全部コピーしたら主はなし）
  const nextPart = copied === undefined ? 0 : copied + 1;
  return (
    <section aria-labelledby="threads-prompt" className="flex flex-col gap-xs">
      <h2 id="threads-prompt" className="text-l font-bold">
        2. プロンプトをコピーして、外の AI に貼る
      </h2>
      <p className="text-s text-text-sub">
        戦略・NGワード・最近の案などから作ります。アプリから AI には何も送りません。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button
            variant={prompt ? "secondary" : "primary"}
            onClick={() => void generate()}
            aria-disabled={pending || undefined}
          >
            {pending ? "作っています…" : prompt ? "プロンプトを作り直す" : "プロンプトを作る"}
          </Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
      {prompt ? (
        <div className="flex flex-col gap-s">
          <p className="text-m">
            {prompt.count}件を作るプロンプトです。
            {parts.length > 1 ? "長いので、2回に分けて順に貼ってください。" : null}
          </p>
          <p className="text-s text-text-sub">
            入れたもの：戦略 {prompt.summary.strategyFilledCount}
            項目・投稿のルール {prompt.summary.coreRuleCount}行・NGワード{" "}
            {prompt.summary.ngWordCount}個・却下の案 {prompt.summary.rejectedCount}
            件・宣伝 {prompt.summary.promotionCount}件・参考の投稿{" "}
            {prompt.summary.referencePostCount}件・低調の投稿 {prompt.summary.poorPostCount}件
          </p>
          <PromptMaterials accountId={accountId} prompt={prompt} />
          {parts.map((part, index) => {
            const label =
              parts.length > 1 ? `プロンプト（${index + 1}／${parts.length}）` : "プロンプト";
            return (
              <div key={label} className="flex flex-col gap-xxs">
                <Disclosure summary={`${label}の中身を見る`}>
                  <Field label={label}>
                    <Textarea readOnly rows={8} value={part} />
                  </Field>
                </Disclosure>
                <div className="flex flex-col items-start gap-xxs">
                  <ButtonRow>
                    <Button
                      variant={index === nextPart ? "primary" : "secondary"}
                      onClick={() => void copy(part, index)}
                    >
                      {parts.length > 1 ? `${index + 1}つ目をコピー` : "コピー"}
                    </Button>
                  </ButtonRow>
                  {copied === index ? (
                    <ResponseMessage tone="success">コピーしました。</ResponseMessage>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

/** ためた結果（取り消すときに、貼った文を戻す）。 */
type Registered = { result: DraftBatchResult; text: string };

/** PasteSection が受け取るもの。 */
type PasteSectionProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 承認待ちの案の数（上限ならためられない） */
  needsReview: number;
};

/**
 * 外の AI の答えを貼って、案をためる節。ためたあとも画面に残り、結果と「取り消す」を出す。
 * @param props 運用アカウントの ID（accountId）・承認待ちの数（needsReview）
 * @returns 節の要素
 */
function PasteSection({ accountId, needsReview }: PasteSectionProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  // 送り直し（通信が切れたあとの再送）では同じ ID を使い、二重にためない。文を変えたら作り直す
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const [registered, setRegistered] = useState<Registered>();
  const [undoing, setUndoing] = useState(false);
  const [undoResult, setUndoResult] = useState<{ tone: "success" | "danger"; message: string }>();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const atLimit = needsReview >= NEEDS_REVIEW_LIMIT;

  // 貼った文があるまま画面を離れるときは確かめる（タブを閉じる・読みこみ直すも）
  const dirty = text.trim() !== "";
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  const split = splitDrafts(text);
  const preview =
    text.trim() === ""
      ? undefined
      : split.delimiterFound
        ? `${split.parts.length}件の案に分かれます。`
        : "区切り（@@@）が見つかりません。全体を1件の案にします。";

  /** 運用アカウントの問い合わせを読み直す（承認待ちの数・最近の案はプロンプトの材料）。 */
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
    await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.accounts });
  };

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending || atLimit) return;
    setFailure(undefined);
    setUndoResult(undefined);
    const problem = split.parts.length === 0 ? "empty" : findPasteProblem(text, split.parts);
    if (problem) {
      setError(
        problem === "empty"
          ? "貼り付ける文を入れてください。"
          : problem === "drafts"
            ? `1回にためられるのは${PASTE_MAX_DRAFTS}件までです。分けて貼ってください。`
            : problem === "text"
              ? "1回に貼れる文字数を超えています。分けて貼ってください。"
              : `${problem.slice("draft:".length)}件目が長すぎます。区切り（@@@）を確かめてください。`,
      );
      areaRef.current?.focus();
      return;
    }
    setError(undefined);
    setPending(true);
    const sent = text;
    try {
      const result = await createDraftBatch(accountId, { clientRequestId: requestId, text: sent });
      setRegistered({ result, text: sent });
      setText((current) => (current === sent ? "" : current));
      setRequestId(crypto.randomUUID());
      await refresh();
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.text) {
        setError(fields.text);
        areaRef.current?.focus();
      } else {
        setFailure(`ためられませんでした。${errorMessage(caught)}`);
      }
    } finally {
      setPending(false);
    }
  };

  /** ためた1回分を取り消す（貼った文を欄に戻す。書きかけがあれば上書きしない）。 */
  const undo = async () => {
    if (!registered || undoing) return;
    setUndoing(true);
    setUndoResult(undefined);
    try {
      const { deletedCount } = await undoDraftBatch(accountId, registered.result.batchId);
      setText((current) => (current.trim() === "" ? registered.text : current));
      setRequestId(crypto.randomUUID());
      setRegistered(undefined);
      setUndoResult({
        tone: "success",
        message: `${deletedCount}件のためた案を取り消しました。貼った文を欄に戻しました。`,
      });
      await refresh();
    } catch (caught) {
      setUndoResult({ tone: "danger", message: `取り消せませんでした。${errorMessage(caught)}` });
    } finally {
      setUndoing(false);
    }
  };

  return (
    <section aria-labelledby="threads-paste" className="flex flex-col gap-xs">
      <h2 id="threads-paste" className="text-l font-bold">
        3. AI の答えを貼って、案をためる
      </h2>
      {atLimit ? (
        <p role="status" className="rounded-sm border border-border bg-surface-sunken p-xs text-m">
          承認待ちの案が上限（{NEEDS_REVIEW_LIMIT}
          件）に達しています。投稿の案で承認か却下をするか、いらない案を消してからためてください。
        </p>
      ) : null}
      <form
        noValidate
        onSubmit={(submitEvent) => void submit(submitEvent)}
        className="flex flex-col gap-xs"
      >
        <Field
          label="AI の答え"
          description="答えをそのまま貼ってください。@@@ だけの行で、案を分けます。"
          error={error}
          required
        >
          <Textarea
            ref={areaRef}
            rows={12}
            value={text}
            onChange={(change) => {
              setText(change.target.value);
              setRequestId(crypto.randomUUID());
            }}
          />
        </Field>
        {preview ? (
          <p className="text-m" aria-live="polite">
            {preview}
          </p>
        ) : null}
        <div className="flex flex-col items-start gap-xxs">
          <ButtonRow>
            <Button
              type="submit"
              variant="primary"
              disabled={atLimit}
              aria-disabled={pending || undefined}
            >
              {pending ? "ためています…" : "案をためる"}
            </Button>
          </ButtonRow>
          {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
          {registered ? (
            <div
              role="status"
              className="flex w-full flex-col items-start gap-x3s rounded-sm border border-border bg-surface p-xs text-m"
            >
              <p className="font-bold">{registered.result.draftCount}件の案をためました。</p>
              {!registered.result.delimiterFound ? (
                <p>区切り（@@@）が見つからなかったため、1件としてためました。</p>
              ) : null}
              {registered.result.overLimitCount > 0 ? (
                <p className="text-danger-text">
                  そのうち{registered.result.overLimitCount}件は Threads の上限を超えています。
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-xxs">
                <Link
                  to="/threads/accounts/$accountId/stock"
                  params={{ accountId }}
                  className="text-text-link underline"
                >
                  投稿の案で確かめる
                </Link>
                <Button
                  size="small"
                  aria-disabled={undoing || undefined}
                  onClick={() => void undo()}
                >
                  {undoing ? "取り消しています…" : "取り消す"}
                </Button>
              </div>
            </div>
          ) : null}
          {undoResult ? (
            <ResponseMessage tone={undoResult.tone}>{undoResult.message}</ResponseMessage>
          ) : null}
        </div>
      </form>
      <ConfirmDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
        title="貼った文が、まだためていません"
        confirmLabel="ためずに離れる"
        cancelLabel="この画面に残る"
        onConfirm={() => {
          if (blocker.status === "blocked") blocker.proceed();
        }}
      >
        画面を離れると、貼った文は消えます。
      </ConfirmDialog>
    </section>
  );
}

/** CreateContent が受け取るもの。 */
type CreateContentProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 運用アカウントの名前 */
  accountName: string;
  /** 承認待ちの案の数 */
  needsReview: number;
};

/**
 * 案を作る画面の中身。
 * @param props 運用アカウントの ID（accountId）・名前（accountName）・承認待ちの数（needsReview）
 * @returns 画面の要素
 */
function CreateContent({ accountId, accountName, needsReview }: CreateContentProps) {
  const settings = usePromptSettings(accountId);
  // 作る件数と文字数を変えるのは持ち主だけ（担当の人には読むだけで出す。threads-013）
  const can = useThreadsCan();
  return (
    <ThreadsPage
      title="案を作る"
      lead={`${accountName}：プロンプトを外の AI に貼り、返ってきた案をまとめてためます。`}
    >
      <section
        aria-labelledby="threads-settings-heading"
        className="flex max-w-form flex-col gap-xs"
      >
        <h2 id="threads-settings-heading" className="text-l font-bold">
          1. 作る件数と文字数
        </h2>
        {settings.isPending ? (
          <Loading />
        ) : settings.isError ? (
          <LoadFailure error={settings.error} retry={() => void settings.refetch()} />
        ) : can.manage ? (
          <SettingsForm accountId={accountId} settings={settings.data} />
        ) : (
          <p className="text-m">
            作る件数は{settings.data.count}件、1投稿の文字数の目標は
            {settings.data.length.target}文字です（変えるのは持ち主だけです）。
          </p>
        )}
      </section>
      <div className="flex max-w-form flex-col gap-m">
        <PromptSection accountId={accountId} />
        <PasteSection accountId={accountId} needsReview={needsReview} />
      </div>
    </ThreadsPage>
  );
}

/** CreatePage が受け取るもの。 */
export type CreatePageProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 案を作る画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @returns 画面の要素
 */
export function CreatePage({ accountId }: CreatePageProps) {
  return (
    <AccountGate accountId={accountId}>
      {(account) => (
        <CreateContent
          accountId={account.id}
          accountName={account.name}
          needsReview={account.counts.needsReview}
        />
      )}
    </AccountGate>
  );
}

const createRouteApi = getRouteApi("/threads/accounts/$accountId/create");

/**
 * 案を作る道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function CreateRoute() {
  const { accountId } = createRouteApi.useParams();
  return <CreatePage accountId={accountId} />;
}
