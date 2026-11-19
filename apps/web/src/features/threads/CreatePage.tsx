// 案を作る（めぐるの「投稿をつくる」。AI の段階1：アプリは外の AI に何も送らない。AD-20）。
// 1. プロンプトの設定（作る件数・文字数）を保存する
// 2. 「プロンプトを作る」でプロンプトを出し、コピーして外の AI（ChatGPT・Claude）に貼る
// 3. 返ってきた答えを貼り、「案をためる」で @@@ の行ごとに案にする（送る前に何件に分かれるかを出す）
// ためたら投稿の案の画面へ移り、画面の上の知らせの帯で伝える。
import {
  PASTE_MAX_DRAFTS,
  PromptSettings,
  findPasteProblem,
  splitDrafts,
} from "@workspace/contracts/threads";
import type {
  GeneratedPrompt,
  PromptSettings as PromptSettingsValue,
} from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { createDraftBatch, fetchPrompt, savePromptSettings } from "./api.ts";
import { threadsPaths } from "./paths.ts";
import { THREADS_QUERY_KEYS, usePromptSettings } from "./queries.ts";

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
      <details className="flex flex-col gap-s">
        <summary className="cursor-pointer text-m font-bold">文字数と長さの割合</summary>
        <div className="mt-xs grid grid-cols-1 gap-s wide:grid-cols-2">
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
      </details>
      <div className="flex flex-col items-start gap-xxs">
        <Button type="submit" aria-disabled={pending || undefined}>
          {pending ? "保存しています…" : "設定を保存"}
        </Button>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/** PromptSection が受け取るもの。 */
type PromptSectionProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * プロンプトを作ってコピーする節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
function PromptSection({ accountId }: PromptSectionProps) {
  const [prompt, setPrompt] = useState<GeneratedPrompt>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [copied, setCopied] = useState<number>();

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
  return (
    <section aria-labelledby="threads-prompt" className="flex flex-col gap-xs">
      <h2 id="threads-prompt" className="text-l font-bold">
        2. プロンプトをコピーして、外の AI に貼る
      </h2>
      <p className="text-m">
        戦略・投稿のルール・NGワード・最近の案・却下の理由から作ります。アプリから AI
        には何も送りません。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <Button
          variant="primary"
          onClick={() => void generate()}
          aria-disabled={pending || undefined}
        >
          {pending ? "作っています…" : prompt ? "プロンプトを作り直す" : "プロンプトを作る"}
        </Button>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
      {prompt ? (
        <div className="flex flex-col gap-s">
          <p className="text-m text-text-sub">
            {prompt.count}件を作るプロンプトです（戦略 {prompt.summary.strategyFilledCount}
            項目・投稿のルール {prompt.summary.coreRuleCount}行・NGワード{" "}
            {prompt.summary.ngWordCount}個・却下の案 {prompt.summary.rejectedCount}
            件・宣伝 {prompt.summary.promotionCount}件・参考の投稿{" "}
            {prompt.summary.referencePostCount}件・低調の投稿 {prompt.summary.poorPostCount}
            件を入れました）。
            {parts.length > 1 ? "長いので、2回に分けて順に貼ってください。" : null}
          </p>
          {parts.map((part, index) => {
            const label =
              parts.length > 1 ? `プロンプト（${index + 1}／${parts.length}）` : "プロンプト";
            return (
              <div key={label} className="flex flex-col gap-xxs">
                <Field label={label}>
                  <Textarea readOnly rows={8} value={part} />
                </Field>
                <div className="flex flex-col items-start gap-xxs">
                  <Button onClick={() => void copy(part, index)}>
                    {parts.length > 1 ? `${index + 1}つ目をコピー` : "コピー"}
                  </Button>
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

/** PasteSection が受け取るもの。 */
type PasteSectionProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 外の AI の答えを貼って、案をためる節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
function PasteSection({ accountId }: PasteSectionProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  // 送り直し（通信が切れたあとの再送）では同じ ID を使い、二重にためない。文を変えたら作り直す
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const split = splitDrafts(text);
  const preview =
    text.trim() === ""
      ? undefined
      : split.delimiterFound
        ? `${split.parts.length}件の案に分かれます。`
        : "区切り（@@@）が見つかりません。全体を1件の案にします。";

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setFailure(undefined);
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
    try {
      const result = await createDraftBatch(accountId, { clientRequestId: requestId, text });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.accounts });
      const path = threadsPaths.stock(accountId);
      showNotice({
        tone: "success",
        message: `${result.drafts.length}件の案をためました。承認するか却下してください。`,
        path,
      });
      await navigate({ to: "/threads/accounts/$accountId/stock", params: { accountId } });
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

  return (
    <section aria-labelledby="threads-paste" className="flex flex-col gap-xs">
      <h2 id="threads-paste" className="text-l font-bold">
        3. AI の答えを貼って、案をためる
      </h2>
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
          <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
            {pending ? "ためています…" : "案をためる"}
          </Button>
          {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
        </div>
      </form>
    </section>
  );
}

/** CreateContent が受け取るもの。 */
type CreateContentProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 運用アカウントの名前 */
  accountName: string;
};

/**
 * 案を作る画面の中身。
 * @param props 運用アカウントの ID（accountId）・名前（accountName）
 * @returns 画面の要素
 */
function CreateContent({ accountId, accountName }: CreateContentProps) {
  const settings = usePromptSettings(accountId);
  return (
    <Page
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
        ) : (
          <SettingsForm accountId={accountId} settings={settings.data} />
        )}
      </section>
      <div className="flex max-w-form flex-col gap-m">
        <PromptSection accountId={accountId} />
        <PasteSection accountId={accountId} />
      </div>
    </Page>
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
      {(account) => <CreateContent accountId={account.id} accountName={account.name} />}
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
