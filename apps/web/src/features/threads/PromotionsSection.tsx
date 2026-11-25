// 宣伝とリサーチの画面の「宣伝」の節（threads-004。宣伝の投稿の割合と、宣伝したい内容。イベントの情報は任意）。
// threads-012：イベントの情報の欄（都道府県・住所・建物・参加費のメモ・キャンセルの決まり・対象・主催）・カードからの状態の変更・
// 宣伝の対象と対象外に分けた一覧・カードの優先度と属性と CTA と URL・上限の知らせ（めぐるの pages/promotions.tsx・PromotionFormDialog）。
import {
  PREFECTURES,
  PROMOTION_CONTENT_MAX,
  PROMOTION_STATUSES,
  PROMOTION_STATUS_LABELS,
  PromotionInput,
  formatEventWhen,
} from "@workspace/contracts/threads";
import type {
  EVENT_FORMATS,
  Promotion,
  PromotionInput as PromotionInputValue,
} from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { createPromotion, deletePromotion, savePromotionRatio, updatePromotion } from "./api.ts";
import { useThreadsCan } from "./team-access.ts";
import { THREADS_QUERY_KEYS, usePromotions } from "./queries.ts";

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
  prefecture: string;
  address: string;
  building: string;
  station: string;
  capacity: string;
  feeYen: string;
  feeNote: string;
  cancelPolicy: string;
  audience: string;
  organizer: string;
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
    prefecture: event?.prefecture ?? "",
    address: event?.address ?? "",
    building: event?.building ?? "",
    station: event?.station ?? "",
    capacity: event?.capacity?.toString() ?? "",
    feeYen: event?.feeYen?.toString() ?? "",
    feeNote: event?.feeNote ?? "",
    cancelPolicy: event?.cancelPolicy ?? "",
    audience: event?.audience ?? "",
    organizer: event?.organizer ?? "",
  };
}

/**
 * 都道府県を選ぶ欄（Field の中で使う。選ばないこともできる）。
 * @param props 値（value）・変えたとき（onChange）
 * @param props.value 値（選んでいなければ ""）
 * @param props.onChange 変えたとき
 * @returns 欄の要素
 */
function PrefectureSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-l`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      <option value="">選んでいません</option>
      {PREFECTURES.map((prefecture) => (
        <option key={prefecture} value={prefecture}>
          {prefecture}
        </option>
      ))}
    </select>
  );
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
            prefecture: form.prefecture === "" ? null : form.prefecture,
            address: form.address,
            building: form.building,
            station: form.station,
            capacity: numberOrNull(form.capacity),
            feeYen: numberOrNull(form.feeYen),
            feeNote: form.feeNote,
            cancelPolicy: form.cancelPolicy,
            audience: form.audience,
            organizer: form.organizer,
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
          イベントの情報を付ける（日時・場所・参加費の1行がプロンプトに入り、外部メディアの掲載文にも使います）
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
            <Field label="都道府県" error={errors["event.prefecture"]}>
              <PrefectureSelect
                value={form.prefecture}
                onChange={(value) => set("prefecture", value)}
              />
            </Field>
            <Field
              label="市区町村・番地"
              description="例：台東区上野4-1-8"
              error={errors["event.address"]}
            >
              <Input
                value={form.address}
                onChange={(change) => set("address", change.target.value)}
              />
            </Field>
            <Field label="建物・階" description="例：3階" error={errors["event.building"]}>
              <Input
                value={form.building}
                onChange={(change) => set("building", change.target.value)}
              />
            </Field>
            <Field
              label="最寄りの駅"
              description="例：御徒町駅 徒歩3分"
              error={errors["event.station"]}
            >
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
            <Field label="参加費（円）" description="無料は 0" error={errors["event.feeYen"]}>
              <Input
                inputMode="numeric"
                value={form.feeYen}
                onChange={(change) => set("feeYen", change.target.value)}
              />
            </Field>
            <Field
              label="参加費の説明"
              description="割引などがあれば"
              error={errors["event.feeNote"]}
            >
              <Input
                value={form.feeNote}
                onChange={(change) => set("feeNote", change.target.value)}
              />
            </Field>
            <Field label="キャンセルの決まり" error={errors["event.cancelPolicy"]}>
              <Textarea
                rows={3}
                value={form.cancelPolicy}
                onChange={(change) => set("cancelPolicy", change.target.value)}
              />
            </Field>
            <Field
              label="対象者"
              description="例：IT・コンサル系の方、初参加歓迎"
              error={errors["event.audience"]}
            >
              <Input
                value={form.audience}
                onChange={(change) => set("audience", change.target.value)}
              />
            </Field>
            <Field label="主催者名" error={errors["event.organizer"]}>
              <Input
                value={form.organizer}
                onChange={(change) => set("organizer", change.target.value)}
              />
            </Field>
            <p className="text-s text-text-sub">申し込み先は、上の「リンクの URL」を使います。</p>
          </div>
        ) : null}
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </Dialog>
  );
}

/** 宣伝の状態。 */
type PromotionStatus = Promotion["status"];

/** 状態を変えたときの結果の文（「〜を」に続ける）。 */
const STATUS_DONE: Record<PromotionStatus, string> = {
  active: "宣伝中に戻しました",
  paused: "一時停止にしました",
  ended: "終わったにしました",
};

/**
 * 宣伝から、直す入力を作る（状態だけを変えるときに、ほかの欄をそのまま送る）。
 * @param promotion 宣伝
 * @returns 入力
 */
function promotionInputOf(promotion: Promotion): PromotionInputValue {
  return {
    title: promotion.title,
    content: promotion.content,
    targetPersona: promotion.targetPersona,
    targetLocation: promotion.targetLocation,
    targetAgeRange: promotion.targetAgeRange,
    cta: promotion.cta,
    linkedUrl: promotion.linkedUrl,
    priority: promotion.priority,
    status: promotion.status,
    validUntil: promotion.validUntil,
    event: promotion.event,
  };
}

/** 宣伝のカードが受け取るもの。 */
type PromotionCardProps = {
  /** 宣伝 */
  promotion: Promotion;
  /** 状態を変えている途中か */
  pending: boolean;
  /** 直す */
  onEdit: () => void;
  /** 消す */
  onRemove: () => void;
  /** 状態を変える */
  onStatus: (status: PromotionStatus) => void;
};

/**
 * 宣伝のカード（状態・優先度・期限・内容・属性・してほしいこと・URL と、操作のボタン）。
 * @param props 宣伝・途中か・直す・消す・状態を変える
 * @returns カードの要素
 */
function PromotionCard({ promotion, pending, onEdit, onRemove, onStatus }: PromotionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const attributes = [
    promotion.targetLocation,
    promotion.targetPersona,
    promotion.targetAgeRange,
  ].filter((value) => value !== "");
  const long = promotion.content.length > 120 || promotion.content.split("\n").length > 3;
  const busy = pending || undefined;
  return (
    <li className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs">
      <div className="flex flex-wrap items-center gap-xxs">
        <Badge variant={promotion.isTargetable ? "success" : "neutral"}>
          {promotion.isExpired ? "期限切れ" : PROMOTION_STATUS_LABELS[promotion.status]}
        </Badge>
        <span className="text-s text-text-sub">
          優先度 {promotion.priority}
          {promotion.validUntil ? `・期限 ${promotion.validUntil}` : ""}
        </span>
      </div>
      <h4 className="text-m font-bold break-words">{promotion.title}</h4>
      <p
        id={`threads-promotion-content-${promotion.id}`}
        className={`text-m break-words whitespace-pre-wrap${expanded || !long ? "" : " line-clamp-3"}`}
      >
        {promotion.content}
      </p>
      {long ? (
        <div>
          <Button
            variant="text"
            size="small"
            aria-expanded={expanded}
            aria-controls={`threads-promotion-content-${promotion.id}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "閉じる" : "もっと見る"}
          </Button>
        </div>
      ) : null}
      {attributes.length > 0 ? (
        <ul aria-label="届けたい人・地域・年代" className="flex flex-wrap gap-x3s">
          {attributes.map((attribute) => (
            <li key={attribute}>
              <Badge>{attribute}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {promotion.cta ? (
        <p className="text-s text-text-sub">してほしいこと：{promotion.cta}</p>
      ) : null}
      {promotion.linkedUrl ? (
        <a
          href={promotion.linkedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-s break-all text-text-link underline"
        >
          {promotion.linkedUrl}（新しいタブで開く）
        </a>
      ) : null}
      {promotion.event ? (
        <p className="text-s text-text-sub">イベント：{formatEventWhen(promotion.event)}</p>
      ) : null}
      <div className="flex flex-wrap gap-xxs">
        <Button size="small" onClick={onEdit}>
          直す
        </Button>
        {promotion.status === "active" ? (
          <Button size="small" aria-disabled={busy} onClick={() => !pending && onStatus("paused")}>
            一時停止
          </Button>
        ) : (
          <Button size="small" aria-disabled={busy} onClick={() => !pending && onStatus("active")}>
            宣伝中に戻す
          </Button>
        )}
        {promotion.status !== "ended" ? (
          <Button size="small" aria-disabled={busy} onClick={() => !pending && onStatus("ended")}>
            終了
          </Button>
        ) : null}
        <Button variant="text" size="small" onClick={onRemove}>
          消す
        </Button>
      </div>
    </li>
  );
}

/**
 * 宣伝の投稿の割合と宣伝の節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
export function PromotionsSection({ accountId }: SectionProps) {
  const can = useThreadsCan();
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
  const [statusPending, setStatusPending] = useState<string>();

  /**
   * 読み直す。
   * @returns 読み直しの終わり
   */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  const ratioValue = ratio ?? String(query.data.ratioPercent);
  const items = query.data.items;
  const atLimit = items.length >= query.data.limit;
  const targetable = items.filter((promotion) => promotion.isTargetable);
  const others = items.filter((promotion) => !promotion.isTargetable);

  /**
   * カードから状態だけを変える（ほかの欄はそのまま。読んだ版と同じときだけ）。
   * @param promotion 宣伝
   * @param status 新しい状態
   */
  const changeStatus = async (promotion: Promotion, status: PromotionStatus) => {
    if (statusPending) return;
    setResult(undefined);
    setStatusPending(promotion.id);
    try {
      await updatePromotion(
        accountId,
        promotion.id,
        { ...promotionInputOf(promotion), status },
        promotion.version,
      );
      await refresh();
      setResult({
        tone: "success",
        message: `「${promotion.title}」を${STATUS_DONE[status]}。`,
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "THREADS_VERSION_CONFLICT") {
        await refresh();
        setResult({
          tone: "danger",
          message:
            "ほかの画面で先に直されていたため、変えられませんでした。読みこみ直したので、もう一度選んでください。",
        });
      } else {
        setResult({ tone: "danger", message: `変えられませんでした。${errorMessage(caught)}` });
      }
    } finally {
      setStatusPending(undefined);
    }
  };

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
      {/* 宣伝の割合は設定なので、変えるのは持ち主だけ（threads-013） */}
      {can.manage ? (
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
      ) : (
        <p className="text-m">宣伝の投稿の割合は{ratioValue}％です（変えるのは持ち主だけです）。</p>
      )}
      {atLimit ? (
        <ResponseMessage tone="info">
          足せる上限（{query.data.limit}件）に達しています。使わないものを消してから足してください。
        </ResponseMessage>
      ) : null}
      {items.length === 0 ? (
        <p className="text-m">
          まだ宣伝はありません。宣伝したいイベントやサービスを足すと、案を作るプロンプトに入ります。
        </p>
      ) : (
        <>
          <section
            aria-labelledby="threads-promotions-targetable"
            className="flex flex-col gap-xxs"
          >
            <h3 id="threads-promotions-targetable" className="text-m font-bold">
              宣伝の対象（{targetable.length}件）
            </h3>
            {targetable.length === 0 ? (
              <p className="text-s text-text-sub">
                いま宣伝の対象はありません（宣伝中で期限内のものが、プロンプトに入ります）。
              </p>
            ) : (
              <ul aria-label="宣伝の対象" className="flex flex-col gap-xs">
                {targetable.map((promotion) => (
                  <PromotionCard
                    key={promotion.id}
                    promotion={promotion}
                    pending={statusPending === promotion.id}
                    onEdit={() => setDialog({ promotion })}
                    onRemove={() => setRemoving(promotion)}
                    onStatus={(status) => void changeStatus(promotion, status)}
                  />
                ))}
              </ul>
            )}
          </section>
          {others.length > 0 ? (
            <section aria-labelledby="threads-promotions-others" className="flex flex-col gap-xxs">
              <h3 id="threads-promotions-others" className="text-m font-bold">
                対象外（{others.length}件）
              </h3>
              <ul aria-label="対象外の宣伝" className="flex flex-col gap-xs">
                {others.map((promotion) => (
                  <PromotionCard
                    key={promotion.id}
                    promotion={promotion}
                    pending={statusPending === promotion.id}
                    onEdit={() => setDialog({ promotion })}
                    onRemove={() => setRemoving(promotion)}
                    onStatus={(status) => void changeStatus(promotion, status)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      <div className="flex flex-col items-start gap-xxs">
        <Button
          onClick={() => {
            if (!atLimit) setDialog({ promotion: undefined });
          }}
          aria-disabled={atLimit || undefined}
        >
          宣伝を足す
        </Button>
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
