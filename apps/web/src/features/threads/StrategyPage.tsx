// 戦略（めぐるの「課題」）。区分ごとに欄を並べ、どの欄も空でよい。口調は選択肢のチップ（「選ばない」に戻せる）。
// 保存は全部を置きかえ、読んだ版と同じときだけ受ける。ほかの画面で先に保存されていたら、「読みこみ直す」か「上書きする」を選んでもらう。
// threads-009：上に「AI と考える」（全体の見直し・壁打ち）、項目ごとに入力の量の印・考えるヒント・AI と深める（StrategyGuide.tsx）。
// threads-012：進みのカードと区分へ移るチップ（StrategyProgress.tsx）・活動の軸の「5問から AI と整理する」・欄ごとの文字数・
// 保存していない変更の守り（離れる前の確かめ・変更を捨てる）・#field-<キー> で開いたらその項目へ移る（案を作る画面のリンク）。
import {
  HINTED_KEYS,
  SPARRING_SECTION_IDS,
  STRATEGY_FIELDS,
  STRATEGY_SECTIONS,
  STRATEGY_TEXT_MAX,
  TONE_PRESETS,
  StrategyInput,
  checkStrategy,
  countChars,
  sameStrategyValues,
} from "@workspace/contracts/threads";
import type {
  HintedKey,
  SparringKey,
  SparringSectionId,
  Strategy,
  StrategySectionId,
  StrategyValues,
} from "@workspace/contracts/threads";
import { jstDateTime } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useBlocker, useRouterState } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/cn";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { fetchStrategy, saveStrategy } from "./api.ts";
import { THREADS_QUERY_KEYS, useStrategy } from "./queries.ts";
import { AxisGuide, FieldGuide, SectionThink, StrategyOverallReview } from "./StrategyGuide.tsx";
import {
  StrategyProgress,
  StrategySectionTabs,
  goToStrategyField,
  strategyFieldElementId,
  strategySectionElementId,
} from "./StrategyProgress.tsx";

/** ヒントを持つ項目。 */
const HINTED = new Set<string>(HINTED_KEYS);

/** 口調を選ばないときのチップの値。 */
const NO_TONE = "none";

/** 口調のチップの選択肢（最初に「選ばない」）。 */
const TONE_OPTIONS = [
  { value: NO_TONE, label: "選ばない" },
  ...TONE_PRESETS.map((preset) => ({ value: preset.value, label: preset.label })),
] as const;

/** 区分の下の補い（めぐるの課題の画面の文）。 */
const SECTION_NOTES: Partial<Record<(typeof STRATEGY_SECTIONS)[number]["id"], string>> = {
  purpose:
    "何のために発信するかを先に決めると、ほかの項目が書きやすくなります。ここに書いた内容も、案を作る材料になります。",
  drafts: "Threads には自動で入らない下書きです。案を作るときは、投稿の向きの軸として使います。",
};

/** 区分のタブの直前の目印（区分を切り替えたときに戻る先）。 */
const TABS_ANCHOR_ID = "threads-strategy-tabs";

/**
 * 「AI と考える」を置く区分か（下書きは対象にしない。めぐるの specs/018 FR-006）。
 * @param id 区分
 * @returns 置くなら true
 */
function isSparringSection(id: StrategySectionId): id is SparringSectionId {
  return (SPARRING_SECTION_IDS as readonly string[]).includes(id);
}

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

/**
 * 今の道の #（ほかの画面の「直す」のリンク〈#field-<キー>〉）。
 * @returns # のあとの文字（なければ ""）
 */
function useLocationHash(): string {
  return useRouterState({ select: (state) => state.location.hash.replace(/^#/, "") });
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
  const [saved, setSaved] = useState<Strategy>(strategy);
  const [values, setValues] = useState<StrategyValues>(() => toValues(strategy));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string }>();
  const [pending, setPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [conflict, setConflict] = useState<Strategy | null>(null);
  const [sparringDirty, setSparringDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const hash = useLocationHash();

  // 今見せている区分（1区分ずつ見せる。初めは、保存した内容でまだ終わっていない最初の区分。threads-017）
  const [current, setCurrent] = useState<StrategySectionId>(() => {
    const initial = checkStrategy(toValues(strategy));
    return (
      STRATEGY_SECTIONS.find((section) => {
        const counts = initial.sections[section.id];
        return counts !== null && counts.done < counts.total;
      })?.id ?? STRATEGY_SECTIONS[0].id
    );
  });
  // 区分を切り替えたあとに移る項目（描き直してから移る）
  const [pendingField, setPendingField] = useState<string | null>(null);

  /**
   * 項目へ移る（その項目の区分を見せてから移る）。
   * @param key 項目のキー
   */
  const goToField = (key: string) => {
    const section = STRATEGY_FIELDS.find((field) => field.key === key)?.section;
    if (section) setCurrent(section);
    setPendingField(key);
  };

  /**
   * 区分を選ぶ（区分の頭へ戻る）。
   * @param id 区分
   */
  const selectSection = (id: StrategySectionId) => {
    setCurrent(id);
    // タブより下まで読み進めていたら、タブの直前へ戻る（タブは上に固定されるので、区分の見出しがタブのすぐ下に来る）
    const anchor = document.getElementById(TABS_ANCHOR_ID);
    if (anchor && anchor.getBoundingClientRect().top < 0) {
      requestAnimationFrame(() => anchor.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    }
  };

  useEffect(() => {
    if (!pendingField) return;
    goToStrategyField(pendingField);
    setPendingField(null);
  }, [pendingField]);

  // 保存の誤りの欄へ移るのは、保存1回につき1度だけ（移ったあとは、ほかの区分へ自由に切り替えられる。threads-017）
  const handledFocusRef = useRef(0);
  useEffect(() => {
    if (focusRequest === 0 || handledFocusRef.current === focusRequest) return;
    // 誤りのある欄の区分を見せてから、その欄へ移る
    const invalid = STRATEGY_FIELDS.find((field) => errors[field.key]);
    if (invalid && invalid.section !== current) {
      setCurrent(invalid.section);
      return;
    }
    handledFocusRef.current = focusRequest;
    focusFirstInvalid(formRef.current);
    // errors と current は、誤りの区分へ切り替えたあとにもう一度流すために見る
  }, [focusRequest, errors, current]);

  // ほかの画面の「直す」（#field-<キー>）から来たら、その項目へ移る（めぐる 014 FR-122）
  useEffect(() => {
    const key = /^field-(\w+)$/.exec(hash)?.[1];
    if (key) goToField(key);
    // goToField は毎回作り直すので、道の # が変わったときだけ流す
  }, [hash]);

  const baseline = toValues(saved);
  const dirty = !sameStrategyValues(values, baseline);
  const check = checkStrategy(values);

  // 保存していない変更・入れていない壁打ちの答えがあるまま離れるときは確かめる（タブを閉じる・読みこみ直すも）
  const leaveGuard = dirty || sparringDirty;
  const leaveGuardRef = useRef(leaveGuard);
  leaveGuardRef.current = leaveGuard;
  const blocker = useBlocker({
    shouldBlockFn: () => leaveGuardRef.current,
    enableBeforeUnload: () => leaveGuardRef.current,
    withResolver: true,
  });

  /**
   * 保存した戦略を画面と問い合わせの控えに入れる。
   * @param next 保存した（読みこんだ）戦略
   */
  const applySaved = (next: Strategy) => {
    setSaved(next);
    queryClient.setQueryData(THREADS_QUERY_KEYS.strategy(accountId), next);
  };

  /**
   * 保存する（保存中に入力が続いても、その分は消さない）。
   * @param version 読んだ版
   */
  const save = async (version: number) => {
    setResult(undefined);
    const sent = values;
    const parsed = StrategyInput.safeParse({ ...sent, version });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const next = await saveStrategy(accountId, parsed.data);
      applySaved(next);
      // 保存中に入力が続いていなければ、保存した値（前後の空白を除いたもの）に合わせる
      setValues((current) => (sameStrategyValues(current, sent) ? toValues(next) : current));
      setResult({ tone: "success", message: "戦略を保存しました。" });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setFocusRequest((count) => count + 1);
      } else if (caught instanceof ApiError && caught.code === "THREADS_VERSION_CONFLICT") {
        try {
          setConflict(await fetchStrategy(accountId));
        } catch (reloadError) {
          setResult({
            tone: "danger",
            message: `ほかの画面で先に保存されましたが、新しい内容を読めませんでした。${errorMessage(reloadError)}`,
          });
        }
      } else {
        setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
      }
    } finally {
      setPending(false);
    }
  };

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    void save(saved.version);
  };

  /**
   * 1つの欄の値を変える。
   * @param key 項目のキー
   * @param text 新しい値
   */
  const setText = (key: Exclude<keyof StrategyValues, "tonePreset">, text: string) => {
    setValues((current) => ({ ...current, [key]: text }));
  };

  const currentIndex = STRATEGY_SECTIONS.findIndex((section) => section.id === current);
  const section = STRATEGY_SECTIONS[currentIndex] ?? STRATEGY_SECTIONS[0];
  const previous = STRATEGY_SECTIONS[currentIndex - 1];
  const following = STRATEGY_SECTIONS[currentIndex + 1];
  const applySparring = (updates: Partial<Record<SparringKey, string>>) =>
    setValues((currentValues) => ({ ...currentValues, ...updates }));

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex max-w-form flex-col gap-s">
      <p className="text-s text-text-sub">
        空の欄があっても保存できます。入れた欄だけがプロンプトに入ります。
      </p>
      <StrategyProgress check={check} updatedAt={saved.updatedAt} onGoToField={goToField}>
        <StrategyOverallReview values={values} />
      </StrategyProgress>
      {/* 区分を選んだとき戻る先の印。フォームの間の余白を2つ重ねないよう、上の余白を打ち消す */}
      <div id={TABS_ANCHOR_ID} className="-mt-s" />
      <StrategySectionTabs
        check={check}
        current={section.id}
        onSelect={selectSection}
        actions={
          <div className="flex items-center gap-xxs">
            <p className="text-s text-text-sub" aria-live="polite">
              {dirty ? "保存していない変更があります" : "保存済み"}
            </p>
            <Button
              type="submit"
              size="small"
              variant="primary"
              aria-disabled={pending || undefined}
            >
              {pending ? "保存しています…" : "保存"}
            </Button>
          </div>
        }
      />
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      <section
        key={section.id}
        id={strategySectionElementId(section.id)}
        aria-labelledby={`${strategySectionElementId(section.id)}-heading`}
        className="flex flex-col gap-s"
      >
        <div className="flex flex-wrap items-center gap-xxs">
          <h2
            id={`${strategySectionElementId(section.id)}-heading`}
            className="min-w-0 flex-1 text-l font-bold"
          >
            {section.title}
          </h2>
          {isSparringSection(section.id) ? (
            <SectionThink
              section={section.id}
              check={check}
              values={values}
              onApply={applySparring}
              onDirtyChange={setSparringDirty}
            />
          ) : null}
        </div>
        {SECTION_NOTES[section.id] ? (
          <p className="text-s text-text-sub">{SECTION_NOTES[section.id]}</p>
        ) : null}
        {STRATEGY_FIELDS.filter((field) => field.section === section.id).map((field) => {
          if (field.key === "tonePreset") {
            return (
              <div
                key={field.key}
                id={strategyFieldElementId(field.key)}
                className="flex scroll-mt-m flex-col gap-xxs"
              >
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
            );
          }
          const key = field.key;
          const chars = countChars(values[key]);
          const over = chars > STRATEGY_TEXT_MAX;
          return (
            <div
              key={key}
              id={strategyFieldElementId(key)}
              className="flex scroll-mt-m flex-col gap-xxs"
            >
              <Field
                label={key === "activityAxis" ? `${field.label}（任意）` : field.label}
                description={field.description}
                error={errors[key]}
              >
                <Textarea
                  rows={field.rows}
                  placeholder={field.placeholder}
                  value={values[key]}
                  onChange={(change) => setText(key, change.target.value)}
                />
              </Field>
              <p
                className={cn(
                  "self-end text-s tabular-nums",
                  over ? "font-bold text-danger-text" : "text-text-sub",
                )}
              >
                {`${chars.toLocaleString("ja-JP")}／${STRATEGY_TEXT_MAX.toLocaleString("ja-JP")}文字`}
                {over ? "（多すぎます）" : ""}
              </p>
              {key === "activityAxis" ? (
                <AxisGuide values={values} onApply={(text) => setText("activityAxis", text)} />
              ) : null}
              {HINTED.has(key) ? (
                <FieldGuide
                  fieldKey={key as HintedKey}
                  label={field.label}
                  check={check}
                  values={values}
                  onApply={(text) => setText(key, text)}
                />
              ) : null}
            </div>
          );
        })}
      </section>
      <div className="border-t border-border pt-xs">
        <ButtonRow>
          {previous ? (
            <Button onClick={() => selectSection(previous.id)}>{`← ${previous.chip}`}</Button>
          ) : null}
          {following ? (
            <Button variant="primary" onClick={() => selectSection(following.id)}>
              {`次の区分へ：${following.chip} →`}
            </Button>
          ) : null}
        </ButtonRow>
      </div>
      <div>
        <Button
          size="small"
          variant="text"
          aria-disabled={!dirty || pending || undefined}
          onClick={() => {
            if (dirty && !pending) setConfirmDiscard(true);
          }}
        >
          変更を捨てる
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="保存していない変更を捨てますか"
        confirmLabel="変更を捨てる"
        onConfirm={() => {
          setValues(baseline);
          setErrors({});
          setResult(undefined);
          setConfirmDiscard(false);
        }}
      >
        最後に保存した内容に戻します。捨てた変更は元に戻せません。
      </ConfirmDialog>
      <Dialog
        open={conflict !== null}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
        title="ほかの画面で先に保存されました"
        description={
          conflict?.updatedAt
            ? `${jstDateTime(conflict.updatedAt)}に、ほかの画面で戦略が保存されています。どちらにするかを選んでください。`
            : "ほかの画面で戦略が保存されています。どちらにするかを選んでください。"
        }
        footer={
          <>
            <Button
              onClick={() => {
                if (!conflict) return;
                applySaved(conflict);
                setValues(toValues(conflict));
                setConflict(null);
                setResult({ tone: "success", message: "新しい内容を読みこみ直しました。" });
              }}
            >
              読みこみ直す
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!conflict) return;
                const latest = conflict;
                setConflict(null);
                // 入れた内容のまま、新しい版で保存し直す
                applySaved(latest);
                void save(latest.version);
              }}
            >
              上書きする
            </Button>
          </>
        }
      >
        <ul className="list-disc pl-s text-s">
          <li>読みこみ直す：この画面で入れた内容は捨て、新しい内容を出します。</li>
          <li>上書きする：この画面で入れた内容で、新しい内容を置きかえます。</li>
        </ul>
      </Dialog>
      <ConfirmDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
        title="保存していない変更があります"
        confirmLabel="保存せずに離れる"
        cancelLabel="この画面に残る"
        onConfirm={() => {
          if (blocker.status === "blocked") blocker.proceed();
        }}
      >
        画面を離れると、保存していない変更と、まだ入れていない AI の答えは消えます。
      </ConfirmDialog>
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
    <ThreadsPage title="戦略" lead={`${accountName}：誰に、何を、どんな人柄で発信するか`}>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <StrategyForm accountId={accountId} strategy={query.data} />
      )}
    </ThreadsPage>
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
