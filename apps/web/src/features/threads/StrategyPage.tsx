// 戦略（めぐるの「課題」）。区分ごとに欄を並べ、どの欄も空でよい。口調は選択肢のチップ（「選ばない」に戻せる）。
// 保存は全部を置きかえ、読んだ版と同じときだけ受ける。ほかの画面で先に保存されていたら、ボタンの近くで読みこみ直しを頼む。
// threads-009：上に「AI と考える」（進み・全体の見直し・活動の軸・壁打ち）、項目ごとに入力の量の印・考えるヒント・AI と深める（StrategyGuide.tsx）。
import {
  HINTED_KEYS,
  STRATEGY_FIELDS,
  STRATEGY_SECTIONS,
  TONE_PRESETS,
  StrategyInput,
  checkStrategy,
} from "@workspace/contracts/threads";
import type { HintedKey, Strategy, StrategyValues } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { saveStrategy } from "./api.ts";
import { THREADS_QUERY_KEYS, useStrategy } from "./queries.ts";
import { FieldGuide, StrategyAiSection } from "./StrategyGuide.tsx";

/** ヒントを持つ項目。 */
const HINTED = new Set<string>(HINTED_KEYS);

/** 口調を選ばないときのチップの値。 */
const NO_TONE = "none";

/** 口調のチップの選択肢（最初に「選ばない」）。 */
const TONE_OPTIONS = [
  { value: NO_TONE, label: "選ばない" },
  ...TONE_PRESETS.map((preset) => ({ value: preset.value, label: preset.label })),
] as const;

/**
 * 戦略から、欄の値を取り出す。
 * @param strategy 戦略
 * @returns 欄の値
 */
function toValues(strategy: Strategy): StrategyValues {
  const {
    version: _version,
    filledCount: _filled,
    total: _total,
    updatedAt: _updated,
    ...values
  } = strategy;
  return values;
}

/** StrategyForm が受け取るもの。 */
type StrategyFormProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 読んだ戦略 */
  strategy: Strategy;
};

/**
 * 戦略の入力のフォーム。
 * @param props 運用アカウントの ID（accountId）・読んだ戦略（strategy）
 * @returns フォームの要素
 */
function StrategyForm({ accountId, strategy }: StrategyFormProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<StrategyValues>(() => toValues(strategy));
  const [version, setVersion] = useState(strategy.version);
  const [filled, setFilled] = useState({ count: strategy.filledCount, total: strategy.total });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string }>();
  const [pending, setPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(formRef.current);
  }, [focusRequest]);
  const check = checkStrategy(values);

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setResult(undefined);
    const parsed = StrategyInput.safeParse({ ...values, version });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const saved = await saveStrategy(accountId, parsed.data);
      setVersion(saved.version);
      setFilled({ count: saved.filledCount, total: saved.total });
      queryClient.setQueryData(THREADS_QUERY_KEYS.strategy(accountId), saved);
      setResult({ tone: "success", message: "戦略を保存しました。" });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setFocusRequest((count) => count + 1);
      } else if (caught instanceof ApiError && caught.code === "THREADS_VERSION_CONFLICT") {
        setResult({
          tone: "danger",
          message:
            "ほかの画面で先に保存されました。入れた内容を控えてから、画面を読みこみ直してください。",
        });
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
      className="flex max-w-form flex-col gap-m"
    >
      <p className="text-m">
        入れた項目：
        <span className="tabular-nums">
          {filled.count}／{filled.total}
        </span>
        （どの欄も空のままで保存できます。入れた欄だけがプロンプトに入ります）
      </p>
      <StrategyAiSection
        check={check}
        values={values}
        onApply={(updates) => setValues((current) => ({ ...current, ...updates }))}
      />
      {STRATEGY_SECTIONS.map((section) => (
        <fieldset key={section.id} className="flex flex-col gap-s">
          <legend className="mb-xs text-l font-bold">{section.title}</legend>
          {STRATEGY_FIELDS.filter((field) => field.section === section.id).map((field) =>
            field.key === "tonePreset" ? (
              <div key={field.key} className="flex flex-col gap-xxs">
                <ChoiceChips
                  label={field.label}
                  description={field.description}
                  options={TONE_OPTIONS}
                  value={values.tonePreset ?? NO_TONE}
                  onValueChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      tonePreset: value === NO_TONE ? null : value,
                    }))
                  }
                  error={errors.tonePreset}
                />
                <FieldGuide
                  fieldKey="tonePreset"
                  label={field.label}
                  check={check}
                  values={values}
                  onApply={() => undefined}
                />
              </div>
            ) : (
              <div key={field.key} className="flex flex-col gap-xxs">
                <Field
                  label={field.label}
                  description={field.description}
                  error={errors[field.key]}
                >
                  <Textarea
                    rows={field.rows}
                    placeholder={field.placeholder}
                    value={values[field.key]}
                    onChange={(change) => {
                      const value = change.target.value;
                      const key = field.key as Exclude<typeof field.key, "tonePreset">;
                      setValues((current) => ({ ...current, [key]: value }));
                    }}
                  />
                </Field>
                {HINTED.has(field.key) ? (
                  <FieldGuide
                    fieldKey={field.key as HintedKey}
                    label={field.label}
                    check={check}
                    values={values}
                    onApply={(text) => {
                      const key = field.key as Exclude<typeof field.key, "tonePreset">;
                      setValues((current) => ({ ...current, [key]: text }));
                    }}
                  />
                ) : null}
              </div>
            ),
          )}
        </fieldset>
      ))}
      <div className="flex flex-col items-start gap-xxs">
        <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
          {pending ? "保存しています…" : "保存"}
        </Button>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/** StrategyLoader が受け取るもの。 */
type StrategyLoaderProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 運用アカウントの名前 */
  accountName: string;
};

/**
 * 戦略を読み、フォームを出す。
 * @param props 運用アカウントの ID（accountId）・名前（accountName）
 * @returns 画面の要素
 */
function StrategyLoader({ accountId, accountName }: StrategyLoaderProps) {
  const query = useStrategy(accountId);
  return (
    <Page
      title="戦略"
      lead={`${accountName}：誰に向けて、何を、どんな人柄で発信するか。ここに書いたことが、案を作るプロンプトに入ります。`}
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <StrategyForm accountId={accountId} strategy={query.data} />
      )}
    </Page>
  );
}

/** StrategyPage が受け取るもの。 */
export type StrategyPageProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 戦略の画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @returns 画面の要素
 */
export function StrategyPage({ accountId }: StrategyPageProps) {
  return (
    <AccountGate accountId={accountId}>
      {(account) => <StrategyLoader accountId={account.id} accountName={account.name} />}
    </AccountGate>
  );
}

const strategyRouteApi = getRouteApi("/threads/accounts/$accountId/strategy");

/**
 * 戦略の道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function StrategyRoute() {
  const { accountId } = strategyRouteApi.useParams();
  return <StrategyPage accountId={accountId} />;
}
