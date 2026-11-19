// 宣伝とリサーチ（threads-004。めぐるの戦略の「宣伝」「リサーチ」）：
// - 宣伝の投稿の割合（％）と、宣伝したい内容（イベントの情報は任意）。宣伝中で期限内のものが、案を作るプロンプトに入る
// - 参考の投稿（伸びている投稿）。「なぜ良いか」の解説は、外の AI に貼るプロンプトを作り、答えを貼り戻して保存する（AI の段階1）
// - リサーチのキーワード。キーワードの案も、外の AI に頼んで貼り戻し、選んだものだけを足す
// 入力の誤りは欄のそば、結果は押したボタンの近く、消す前は確かめる（EXPERIENCE.md）。
import {
  POSTED_DATE_MODES,
  PROMOTION_CONTENT_MAX,
  PROMOTION_STATUSES,
  PROMOTION_STATUS_LABELS,
  PromotionInput,
  REFERENCE_BODY_MAX,
  REFERENCE_PLATFORMS,
  ReferencePostInput,
  ResearchKeywordInput,
  formatEventWhen,
  parseExplanations,
  parseKeywordIdeas,
} from "@workspace/contracts/threads";
import type {
  EVENT_FORMATS,
  ExplanationProblem,
  KeywordIdea,
  PostedDateMode,
  Promotion,
  ReferencePlatform,
  ReferencePost,
  ResearchKeyword,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import {
  createKeywords,
  createPromotion,
  createReferencePosts,
  deleteKeyword,
  deletePromotion,
  deleteReferencePost,
  fetchExplainPrompt,
  fetchKeywordIdeaPrompt,
  saveExplanations,
  savePromotionRatio,
  updatePromotion,
} from "./api.ts";
import { CopyButton } from "./CopyButton.tsx";
import { THREADS_QUERY_KEYS, useKeywords, usePromotions, useReferencePosts } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 欄ごとの誤り。 */
type Errors = Record<string, string | undefined>;

/** 節が受け取るもの。 */
type SectionProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

// ---- 宣伝 ----

/** 宣伝のフォームの値（画面の欄）。 */
type PromotionForm = {
  title: string;
  content: string;
  targetPersona: string;
  targetLocation: string;
  targetAgeRange: string;
  cta: string;
  linkedUrl: string;
  priority: string;
  status: (typeof PROMOTION_STATUSES)[number];
  validUntil: string;
  hasEvent: boolean;
  eventStart: string;
  eventEnd: string;
  eventFormat: (typeof EVENT_FORMATS)[number];
  venueName: string;
  station: string;
  capacity: string;
  feeYen: string;
};

/**
 * 宣伝からフォームの値を作る（新しく足すときは空）。
 * @param promotion 宣伝
 * @returns フォームの値
 */
function promotionForm(promotion: Promotion | undefined): PromotionForm {
  const event = promotion?.event;
  return {
    title: promotion?.title ?? "",
    content: promotion?.content ?? "",
    targetPersona: promotion?.targetPersona ?? "",
    targetLocation: promotion?.targetLocation ?? "",
    targetAgeRange: promotion?.targetAgeRange ?? "",
    cta: promotion?.cta ?? "",
    linkedUrl: promotion?.linkedUrl ?? "",
    priority: String(promotion?.priority ?? 0),
    status: promotion?.status ?? "active",
    validUntil: promotion?.validUntil ?? "",
    hasEvent: Boolean(event),
    eventStart: event?.startAt ?? "",
    eventEnd: event?.endAt ?? "",
    eventFormat: event?.format ?? "venue",
    venueName: event?.venueName ?? "",
    station: event?.station ?? "",
    capacity: event?.capacity?.toString() ?? "",
    feeYen: event?.feeYen?.toString() ?? "",
  };
}

/**
 * 数の欄を数にする（空は null）。
 * @param value 欄の文字
 * @returns 数（読めなければ NaN のまま約束に止めてもらう）
 */
function numberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

/**
 * 宣伝を足す・直す枠。
 * @param props 運用アカウントの ID・直す宣伝（なければ足す）・閉じる・保存したあと
 * @param props.accountId 運用アカウントの ID
 * @param props.promotion 直す宣伝
 * @param props.onClose 閉じる
 * @param props.onDone 保存したあと
 * @returns 枠の要素
 */
function PromotionDialog({
  accountId,
  promotion,
  onClose,
  onDone,
}: {
  accountId: string;
  promotion: Promotion | undefined;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [form, setForm] = useState<PromotionForm>(() => promotionForm(promotion));
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  /**
   * 欄を変える。
   * @param key 欄
   * @param value 値
   */
  const set = <K extends keyof PromotionForm>(key: K, value: PromotionForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  /** 保存する。 */
  const save = async () => {
    if (pending) return;
    setFailure(undefined);
    const parsed = PromotionInput.safeParse({
      title: form.title,
      content: form.content,
      targetPersona: form.targetPersona,
      targetLocation: form.targetLocation,
      targetAgeRange: form.targetAgeRange,
      cta: form.cta,
      linkedUrl: form.linkedUrl,
      priority: Number(form.priority),
      status: form.status,
      validUntil: form.validUntil === "" ? null : form.validUntil,
      event: form.hasEvent
        ? {
            startAt: form.eventStart,
            endAt: form.eventEnd === "" ? null : form.eventEnd,
            format: form.eventFormat,
            venueName: form.venueName,
            prefecture: promotion?.event?.prefecture ?? null,
            address: promotion?.event?.address ?? null,
            building: promotion?.event?.building ?? null,
            station: form.station,
            capacity: numberOrNull(form.capacity),
            feeYen: numberOrNull(form.feeYen),
            feeNote: promotion?.event?.feeNote ?? null,
            cancelPolicy: promotion?.event?.cancelPolicy ?? null,
            audience: promotion?.event?.audience ?? null,
            organizer: promotion?.event?.organizer ?? null,
          }
        : null,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (promotion) await updatePromotion(accountId, promotion.id, parsed.data, promotion.version);
      else await createPromotion(accountId, parsed.data);
      await onDone(promotion ? "宣伝を直しました。" : "宣伝を足しました。");
      onClose();
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFailure(`保存できませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={promotion ? "宣伝を直す" : "宣伝を足す"}
      footer={
        <div className="flex flex-col-reverse gap-xxs wide:flex-row wide:justify-end">
          <Button onClick={onClose} aria-disabled={pending || undefined}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            aria-disabled={pending || undefined}
          >
            {pending ? "保存しています…" : "保存"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-xs">
        <Field
          label="タイトル"
          description="管理のための名前（プロンプトにも入ります）"
          error={errors.title}
          required
        >
          <Input value={form.title} onChange={(change) => set("title", change.target.value)} />
        </Field>
        <Field
          label="宣伝の内容"
          description={`${PROMOTION_CONTENT_MAX.toLocaleString("ja-JP")}文字まで`}
          error={errors.content}
          required
        >
          <Textarea
            rows={4}
            value={form.content}
            onChange={(change) => set("content", change.target.value)}
          />
        </Field>
        <Field label="届けたい人" error={errors.targetPersona}>
          <Input
            value={form.targetPersona}
            onChange={(change) => set("targetPersona", change.target.value)}
          />
        </Field>
        <Field label="地域" error={errors.targetLocation}>
          <Input
            value={form.targetLocation}
            onChange={(change) => set("targetLocation", change.target.value)}
          />
        </Field>
        <Field label="年代" error={errors.targetAgeRange}>
          <Input
            value={form.targetAgeRange}
            onChange={(change) => set("targetAgeRange", change.target.value)}
          />
        </Field>
        <Field
          label="してほしいこと"
          description="例：プロフィールのリンクから申し込む"
          error={errors.cta}
        >
          <Input value={form.cta} onChange={(change) => set("cta", change.target.value)} />
        </Field>
        <Field label="リンクの URL" error={errors.linkedUrl}>
          <Input
            type="url"
            value={form.linkedUrl}
            onChange={(change) => set("linkedUrl", change.target.value)}
          />
        </Field>
        <Field
          label="優先度"
          description="0〜100。大きいほど先に宣伝します"
          error={errors.priority}
        >
          <Input
            inputMode="numeric"
            value={form.priority}
            onChange={(change) => set("priority", change.target.value)}
          />
        </Field>
        <ChoiceChips
          label="状態"
          options={PROMOTION_STATUSES.map((value) => ({
            value,
            label: PROMOTION_STATUS_LABELS[value],
          }))}
          value={form.status}
          onValueChange={(value) => set("status", value)}
        />
        <Field
          label="掲載の期限"
          description="空なら期限なし。過ぎると宣伝しません"
          error={errors.validUntil}
        >
          <Input
            type="date"
            value={form.validUntil}
            onChange={(change) => set("validUntil", change.target.value)}
          />
        </Field>
        <label className="flex min-h-l items-center gap-xxs text-m">
          <input
            type="checkbox"
            className="size-s accent-primary"
            checked={form.hasEvent}
            onChange={(change) => set("hasEvent", change.target.checked)}
          />
          イベントの情報を付ける（日時・場所・参加費の1行がプロンプトに入ります）
        </label>
        {form.hasEvent ? (
          <div className="flex flex-col gap-xs rounded-sm border border-border p-xs">
            <Field label="始まり" error={errors["event.startAt"]} required>
              <Input
                type="datetime-local"
                value={form.eventStart}
                onChange={(change) => set("eventStart", change.target.value)}
              />
            </Field>
            <Field label="終わり" error={errors["event.endAt"]}>
              <Input
                type="datetime-local"
                value={form.eventEnd}
                onChange={(change) => set("eventEnd", change.target.value)}
              />
            </Field>
            <ChoiceChips
              label="開き方"
              options={[
                { value: "venue", label: "会場" },
                { value: "online", label: "オンライン" },
              ]}
              value={form.eventFormat}
              onValueChange={(value) => set("eventFormat", value)}
            />
            <Field label="会場の名前" error={errors["event.venueName"]}>
              <Input
                value={form.venueName}
                onChange={(change) => set("venueName", change.target.value)}
              />
            </Field>
            <Field label="最寄りの駅" error={errors["event.station"]}>
              <Input
                value={form.station}
                onChange={(change) => set("station", change.target.value)}
              />
            </Field>
            <Field label="定員" error={errors["event.capacity"]}>
              <Input
                inputMode="numeric"
                value={form.capacity}
                onChange={(change) => set("capacity", change.target.value)}
              />
            </Field>
            <Field label="参加費（円）" error={errors["event.feeYen"]}>
              <Input
                inputMode="numeric"
                value={form.feeYen}
                onChange={(change) => set("feeYen", change.target.value)}
              />
            </Field>
          </div>
        ) : null}
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </Dialog>
  );
}

/**
 * 宣伝の投稿の割合と宣伝の節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
function PromotionsSection({ accountId }: SectionProps) {
  const queryClient = useQueryClient();
  const query = usePromotions(accountId);
  const [ratio, setRatio] = useState<string>();
  const [ratioError, setRatioError] = useState<string>();
  const [ratioResult, setRatioResult] = useState<Result>();
  const [dialog, setDialog] = useState<{ promotion: Promotion | undefined }>();
  const [removing, setRemoving] = useState<Promotion>();
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string>();
  const [result, setResult] = useState<Result>();

  /**
   * 読み直す。
   * @returns 読み直しの終わり
   */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  const ratioValue = ratio ?? String(query.data.ratioPercent);

  /**
   * 割合を保存する。
   * @param submitEvent 送る出来事
   */
  const saveRatio = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    setRatioResult(undefined);
    const value = Number(ratioValue);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setRatioError("0〜100の整数にしてください。");
      return;
    }
    setRatioError(undefined);
    try {
      await savePromotionRatio(accountId, value);
      await refresh();
      setRatioResult({ tone: "success", message: `宣伝の投稿の割合を${value}％にしました。` });
    } catch (caught) {
      setRatioResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    }
  };

  /** 消す（確かめの枠から）。 */
  const confirmRemove = async () => {
    if (!removing || removePending) return;
    setRemoveError(undefined);
    setRemovePending(true);
    try {
      await deletePromotion(accountId, removing.id);
      await refresh();
      setRemoving(undefined);
      setResult({ tone: "success", message: "宣伝を消しました。" });
    } catch (caught) {
      setRemoveError(`消せませんでした。${errorMessage(caught)}`);
    } finally {
      setRemovePending(false);
    }
  };

  return (
    <section aria-labelledby="threads-promotions" className="flex flex-col gap-xs">
      <h2 id="threads-promotions" className="text-l font-bold">
        宣伝
      </h2>
      <form
        noValidate
        onSubmit={(submitEvent) => void saveRatio(submitEvent)}
        className="flex flex-col gap-xs"
      >
        <Field
          label="宣伝の投稿の割合（％）"
          description="作る案のうち、宣伝の投稿にする割合です。"
          error={ratioError}
        >
          <Input
            inputMode="numeric"
            value={ratioValue}
            onChange={(change) => setRatio(change.target.value)}
          />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit">割合を保存</Button>
          {ratioResult ? (
            <ResponseMessage tone={ratioResult.tone}>{ratioResult.message}</ResponseMessage>
          ) : null}
        </div>
      </form>
      {query.data.items.length === 0 ? (
        <p className="text-m">
          まだ宣伝はありません。宣伝したいイベントやサービスを足すと、案を作るプロンプトに入ります。
        </p>
      ) : (
        <ul aria-label="宣伝の一覧" className="flex flex-col gap-xs">
          {query.data.items.map((promotion) => (
            <li
              key={promotion.id}
              className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
            >
              <div className="flex flex-wrap items-center gap-xxs">
                <span className="text-m font-bold">{promotion.title}</span>
                <Badge variant={promotion.isTargetable ? "success" : "neutral"}>
                  {promotion.isExpired ? "期限切れ" : PROMOTION_STATUS_LABELS[promotion.status]}
                </Badge>
                {promotion.validUntil ? (
                  <span className="text-s text-text-sub">期限：{promotion.validUntil}</span>
                ) : null}
              </div>
              <p className="text-m break-words whitespace-pre-wrap">{promotion.content}</p>
              {promotion.event ? (
                <p className="text-s text-text-sub">イベント：{formatEventWhen(promotion.event)}</p>
              ) : null}
              <div className="flex flex-wrap gap-xxs">
                <Button size="small" onClick={() => setDialog({ promotion })}>
                  直す
                </Button>
                <Button variant="text" size="small" onClick={() => setRemoving(promotion)}>
                  消す
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col items-start gap-xxs">
        <Button onClick={() => setDialog({ promotion: undefined })}>宣伝を足す</Button>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
      {dialog ? (
        <PromotionDialog
          accountId={accountId}
          promotion={dialog.promotion}
          onClose={() => setDialog(undefined)}
          onDone={async (message) => {
            await refresh();
            setResult({ tone: "success", message });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        title={`「${removing?.title ?? ""}」を消します`}
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={removePending}
        error={removeError}
        onConfirm={() => void confirmRemove()}
      >
        消した宣伝は元に戻せません。
      </ConfirmDialog>
    </section>
  );
}

// ---- 参考の投稿 ----

/** 解説の読み取りの問題の文。 */
const EXPLANATION_PROBLEMS: Record<ExplanationProblem, string> = {
  not_found: "ID が見つかりません",
  already_explained: "もう解説があります",
  duplicate: "同じ投稿が2回あります",
  empty: "解説が空です",
  too_long: "長すぎます",
};

/**
 * 参考の投稿の節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
function ReferenceSection({ accountId }: SectionProps) {
  const queryClient = useQueryClient();
  const query = useReferencePosts(accountId);
  const [body, setBody] = useState("");
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState<ReferencePlatform>("threads");
  const [postedDateMode, setPostedDateMode] = useState<PostedDateMode>("unknown");
  const [postedDate, setPostedDate] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<Result>();
  const [prompt, setPrompt] = useState<{ text: string; pendingCount: number }>();
  const [promptError, setPromptError] = useState<string>();
  const [answer, setAnswer] = useState("");
  const [saveResult, setSaveResult] = useState<Result>();
  const [removing, setRemoving] = useState<ReferencePost>();
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string>();

  /**
   * 読み直す。
   * @returns 読み直しの終わり
   */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  const posts = query.data.items;
  const parsed = answer.trim() === "" ? [] : parseExplanations(answer, posts);
  const savable = parsed.filter((item) => item.problem === null && item.id !== null);

  /**
   * 足す。
   * @param submitEvent 送る出来事
   */
  const add = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    setResult(undefined);
    const input = ReferencePostInput.safeParse({
      body,
      keyword,
      postUrl: "",
      whyGood: "",
      platform,
      postedDateMode,
      postedDate: postedDateMode === "exact" ? postedDate : null,
      metrics: {
        likes: null,
        replies: null,
        views: null,
        saves: null,
        reposts: null,
        followers: null,
      },
      author: "",
      memo: "",
    });
    if (!input.success) {
      setErrors(fieldErrorsFromIssues(input.error.issues));
      return;
    }
    setErrors({});
    try {
      await createReferencePosts(accountId, [input.data]);
      await refresh();
      setBody("");
      setKeyword("");
      setResult({ tone: "success", message: "参考の投稿を足しました。" });
    } catch (caught) {
      setResult({ tone: "danger", message: `足せませんでした。${errorMessage(caught)}` });
    }
  };

  /** 解説のプロンプトを作る。 */
  const makePrompt = async () => {
    setPromptError(undefined);
    try {
      const made = await fetchExplainPrompt(accountId);
      setPrompt({ text: made.prompt, pendingCount: made.pendingCount });
    } catch (caught) {
      setPromptError(`作れませんでした。${errorMessage(caught)}`);
    }
  };

  /** 読み取った解説を保存する。 */
  const saveAnswers = async () => {
    setSaveResult(undefined);
    if (savable.length === 0) {
      setSaveResult({
        tone: "danger",
        message: "保存できる解説がありません。【ID:…】の行と「@@@」の区切りを確かめてください。",
      });
      return;
    }
    try {
      const saved = await saveExplanations(
        accountId,
        savable.map((item) => ({ id: item.id ?? "", whyGood: item.text })),
      );
      await refresh();
      setAnswer("");
      setPrompt(undefined);
      setSaveResult({ tone: "success", message: `${saved.saved.length}件の解説を保存しました。` });
    } catch (caught) {
      setSaveResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    }
  };

  /** 消す（確かめの枠から）。 */
  const confirmRemove = async () => {
    if (!removing || removePending) return;
    setRemoveError(undefined);
    setRemovePending(true);
    try {
      await deleteReferencePost(accountId, removing.id);
      await refresh();
      setRemoving(undefined);
      setResult({ tone: "success", message: "参考の投稿を消しました。" });
    } catch (caught) {
      setRemoveError(`消せませんでした。${errorMessage(caught)}`);
    } finally {
      setRemovePending(false);
    }
  };

  return (
    <section aria-labelledby="threads-references" className="flex flex-col gap-xs">
      <h2 id="threads-references" className="text-l font-bold">
        参考の投稿
      </h2>
      <p className="text-m">
        伸びている投稿と「なぜ良いか」が、案を作るプロンプトに入ります（新しいものから10件）。
      </p>
      {posts.length === 0 ? (
        <p className="text-m text-text-sub">まだ参考の投稿はありません。</p>
      ) : (
        <ul aria-label="参考の投稿の一覧" className="flex flex-col gap-xs">
          {posts.map((post) => (
            <li
              key={post.id}
              className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
            >
              <div className="flex flex-wrap items-center gap-xxs">
                <Badge>ID:{post.shortId}</Badge>
                {post.keyword ? (
                  <span className="text-s text-text-sub">キーワード：{post.keyword}</span>
                ) : null}
              </div>
              <p className="text-m break-words whitespace-pre-wrap">{post.body}</p>
              <p className="text-s text-text-sub">
                {post.whyGood ? `なぜ良いか：${post.whyGood}` : "まだ解説がありません。"}
              </p>
              <div>
                <Button variant="text" size="small" onClick={() => setRemoving(post)}>
                  消す
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        noValidate
        onSubmit={(submitEvent) => void add(submitEvent)}
        className="flex flex-col gap-xs"
      >
        <Field
          label="参考の投稿の本文"
          description={`${REFERENCE_BODY_MAX.toLocaleString("ja-JP")}文字まで`}
          error={errors.body}
          required
        >
          <Textarea rows={3} value={body} onChange={(change) => setBody(change.target.value)} />
        </Field>
        <Field label="見つけたキーワード" error={errors.keyword}>
          <Input value={keyword} onChange={(change) => setKeyword(change.target.value)} />
        </Field>
        <ChoiceChips
          label="媒体"
          options={REFERENCE_PLATFORMS.map((item) => ({ value: item.value, label: item.label }))}
          value={platform}
          onValueChange={setPlatform}
        />
        <ChoiceChips
          label="元の投稿の投稿日"
          options={POSTED_DATE_MODES.map((item) => ({ value: item.value, label: item.label }))}
          value={postedDateMode}
          onValueChange={setPostedDateMode}
        />
        {postedDateMode === "exact" ? (
          <Field label="投稿日" error={errors.postedDate} required>
            <Input
              type="date"
              value={postedDate}
              onChange={(change) => setPostedDate(change.target.value)}
            />
          </Field>
        ) : null}
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit">参考の投稿を足す</Button>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      </form>
      <div className="flex flex-col gap-xs rounded-md border border-border p-xs">
        <h3 className="text-m font-bold">「なぜ良いか」を外の AI に解説してもらう</h3>
        <div className="flex flex-col items-start gap-xxs">
          <Button onClick={() => void makePrompt()}>解説のプロンプトを作る</Button>
          {promptError ? <ResponseMessage tone="danger">{promptError}</ResponseMessage> : null}
        </div>
        {prompt ? (
          prompt.text === "" ? (
            <p className="text-m">解説がまだの参考の投稿はありません。</p>
          ) : (
            <>
              <Field
                label="解説のプロンプト"
                description={`解説がまだの投稿：${prompt.pendingCount}件（1回に10件まで）`}
              >
                <Textarea readOnly rows={6} value={prompt.text} />
              </Field>
              <CopyButton text={prompt.text} label="プロンプトをコピー" />
              <Field
                label="AI の解説の答え"
                description="答えをそのまま貼ります。【ID:…】の行で投稿を見分けます。"
              >
                <Textarea
                  rows={6}
                  value={answer}
                  onChange={(change) => setAnswer(change.target.value)}
                />
              </Field>
              {parsed.length > 0 ? (
                <ul aria-label="読み取った解説" className="flex flex-col gap-x3s text-s">
                  {parsed.map((item, index) => (
                    // 読み取った順で見分ける（ID がないブロックもある）
                    <li key={`${item.shortId ?? "none"}-${index.toString()}`}>
                      {item.shortId ? `ID:${item.shortId}` : "ID なし"}：
                      {item.problem
                        ? `保存しません（${EXPLANATION_PROBLEMS[item.problem]}）`
                        : "保存します"}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-col items-start gap-xxs">
                <Button variant="primary" onClick={() => void saveAnswers()}>
                  解説を保存
                </Button>
              </div>
            </>
          )
        ) : null}
        {saveResult ? (
          <ResponseMessage tone={saveResult.tone}>{saveResult.message}</ResponseMessage>
        ) : null}
      </div>
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        title="参考の投稿を消します"
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={removePending}
        error={removeError}
        onConfirm={() => void confirmRemove()}
      >
        消した参考の投稿は元に戻せません。
      </ConfirmDialog>
    </section>
  );
}

// ---- キーワード ----

/** キーワードの案の問題の文。 */
const IDEA_PROBLEMS: Record<NonNullable<KeywordIdea["problem"]>, string> = {
  too_long: "長すぎます",
  registered: "登録済み",
  duplicate: "重なっています",
};

/**
 * リサーチのキーワードの節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
function KeywordsSection({ accountId }: SectionProps) {
  const queryClient = useQueryClient();
  const query = useKeywords(accountId);
  const [keyword, setKeyword] = useState("");
  const [purpose, setPurpose] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<Result>();
  const [ideaPrompt, setIdeaPrompt] = useState<string>();
  const [ideaAnswer, setIdeaAnswer] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [ideaResult, setIdeaResult] = useState<Result>();
  const [removing, setRemoving] = useState<ResearchKeyword>();
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string>();

  /**
   * 読み直す。
   * @returns 読み直しの終わり
   */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  const keywords = query.data.items;
  const ideas =
    ideaAnswer.trim() === ""
      ? []
      : parseKeywordIdeas(
          ideaAnswer,
          keywords.map((item) => item.keyword),
        );

  /**
   * 足す。
   * @param submitEvent 送る出来事
   */
  const add = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    setResult(undefined);
    const input = ResearchKeywordInput.safeParse({ keyword, purpose });
    if (!input.success) {
      setErrors(fieldErrorsFromIssues(input.error.issues));
      return;
    }
    setErrors({});
    try {
      await createKeywords(accountId, [input.data]);
      await refresh();
      setKeyword("");
      setPurpose("");
      setResult({ tone: "success", message: `「${input.data.keyword}」を足しました。` });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields["items.0.keyword"]) setErrors({ keyword: fields["items.0.keyword"] });
      else setResult({ tone: "danger", message: `足せませんでした。${errorMessage(caught)}` });
    }
  };

  /** キーワードの案のプロンプトを作る。 */
  const makeIdeaPrompt = async () => {
    try {
      setIdeaPrompt((await fetchKeywordIdeaPrompt(accountId)).prompt);
    } catch (caught) {
      setIdeaResult({ tone: "danger", message: `作れませんでした。${errorMessage(caught)}` });
    }
  };

  /** 選んだ案を足す。 */
  const addIdeas = async () => {
    setIdeaResult(undefined);
    const items = ideas
      .filter((idea) => idea.problem === null && chosen.has(idea.keyword))
      .map((idea) => ({ keyword: idea.keyword, purpose: idea.purpose }));
    if (items.length === 0) {
      setIdeaResult({ tone: "danger", message: "足すキーワードを選んでください。" });
      return;
    }
    try {
      await createKeywords(accountId, items);
      await refresh();
      setIdeaAnswer("");
      setChosen(new Set());
      setIdeaResult({ tone: "success", message: `${items.length}個のキーワードを足しました。` });
    } catch (caught) {
      setIdeaResult({ tone: "danger", message: `足せませんでした。${errorMessage(caught)}` });
    }
  };

  /** 消す（確かめの枠から）。 */
  const confirmRemove = async () => {
    if (!removing || removePending) return;
    setRemoveError(undefined);
    setRemovePending(true);
    try {
      await deleteKeyword(accountId, removing.id);
      await refresh();
      setRemoving(undefined);
      setResult({ tone: "success", message: `「${removing.keyword}」を消しました。` });
    } catch (caught) {
      setRemoveError(`消せませんでした。${errorMessage(caught)}`);
    } finally {
      setRemovePending(false);
    }
  };

  return (
    <section aria-labelledby="threads-keywords" className="flex flex-col gap-xs">
      <h2 id="threads-keywords" className="text-l font-bold">
        リサーチのキーワード
      </h2>
      <p className="text-m">Threads の検索に入れて、参考の投稿を探すための言葉です。</p>
      {keywords.length === 0 ? (
        <p className="text-m text-text-sub">まだキーワードはありません。</p>
      ) : (
        <ul aria-label="キーワードの一覧" className="flex flex-col gap-xxs">
          {keywords.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-xxs">
              <span className="text-m font-bold">{item.keyword}</span>
              {item.purpose ? <span className="text-s text-text-sub">{item.purpose}</span> : null}
              <Button
                variant="text"
                size="small"
                aria-label={`「${item.keyword}」を消す`}
                onClick={() => setRemoving(item)}
              >
                消す
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        noValidate
        onSubmit={(submitEvent) => void add(submitEvent)}
        className="flex flex-col gap-xs"
      >
        <Field label="足すキーワード" error={errors.keyword} required>
          <Input value={keyword} onChange={(change) => setKeyword(change.target.value)} />
        </Field>
        <Field label="狙い" error={errors.purpose}>
          <Input value={purpose} onChange={(change) => setPurpose(change.target.value)} />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit">キーワードを足す</Button>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      </form>
      <div className="flex flex-col gap-xs rounded-md border border-border p-xs">
        <h3 className="text-m font-bold">キーワードの案を外の AI に出してもらう</h3>
        <div>
          <Button onClick={() => void makeIdeaPrompt()}>キーワードの案のプロンプトを作る</Button>
        </div>
        {ideaPrompt ? (
          <>
            <Field label="キーワードの案のプロンプト">
              <Textarea readOnly rows={5} value={ideaPrompt} />
            </Field>
            <CopyButton text={ideaPrompt} label="プロンプトをコピー" />
            <Field
              label="AI のキーワードの案の答え"
              description="「キーワード｜狙い」の行をそのまま貼ります。"
            >
              <Textarea
                rows={5}
                value={ideaAnswer}
                onChange={(change) => setIdeaAnswer(change.target.value)}
              />
            </Field>
            {ideas.length > 0 ? (
              <fieldset className="flex flex-col gap-x3s">
                <legend className="text-m font-bold">足す案を選ぶ</legend>
                {ideas.map((idea, index) => (
                  // 読み取った順で見分ける（同じ言葉が並ぶことがある）
                  <label
                    key={`${idea.keyword}-${index.toString()}`}
                    className="flex min-h-l items-center gap-xxs text-m"
                  >
                    <input
                      type="checkbox"
                      className="size-s accent-primary"
                      disabled={idea.problem !== null}
                      checked={idea.problem === null && chosen.has(idea.keyword)}
                      onChange={(change) =>
                        setChosen((current) => {
                          const next = new Set(current);
                          if (change.target.checked) next.add(idea.keyword);
                          else next.delete(idea.keyword);
                          return next;
                        })
                      }
                    />
                    {idea.keyword}
                    {idea.purpose ? `（${idea.purpose}）` : ""}
                    {idea.problem ? `：${IDEA_PROBLEMS[idea.problem]}` : ""}
                  </label>
                ))}
              </fieldset>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-col items-start gap-xxs">
          {ideaPrompt ? (
            <Button variant="primary" onClick={() => void addIdeas()}>
              選んだキーワードを足す
            </Button>
          ) : null}
          {ideaResult ? (
            <ResponseMessage tone={ideaResult.tone}>{ideaResult.message}</ResponseMessage>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        title={`「${removing?.keyword ?? ""}」を消します`}
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={removePending}
        error={removeError}
        onConfirm={() => void confirmRemove()}
      >
        消したキーワードは元に戻せません。
      </ConfirmDialog>
    </section>
  );
}

/**
 * 宣伝とリサーチの画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 画面の要素
 */
export function ResearchPage({ accountId }: { accountId: string }) {
  return (
    <AccountGate accountId={accountId}>
      {(account: ThreadsAccount) => (
        <Page
          title="宣伝とリサーチ"
          lead={`${account.name}：宣伝・参考の投稿・キーワードは、案を作るプロンプトの材料になります。`}
        >
          <div className="flex max-w-form flex-col gap-l">
            <PromotionsSection accountId={account.id} />
            <ReferenceSection accountId={account.id} />
            <KeywordsSection accountId={account.id} />
          </div>
        </Page>
      )}
    </AccountGate>
  );
}

const researchRouteApi = getRouteApi("/threads/accounts/$accountId/research");

/**
 * 宣伝とリサーチの道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function ResearchRoute() {
  const { accountId } = researchRouteApi.useParams();
  return <ResearchPage accountId={accountId} />;
}
