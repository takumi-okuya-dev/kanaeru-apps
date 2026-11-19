// 投稿の案（めぐるの「投稿ストック」）。状態（承認待ち・承認済み・却下）をチップで選び、案ごとにカードで出す。
// 案ごとに Threads の文字数・NG ワード・規約に注意・似ている度合い（ほかの案との近さ。80％以上で知らせる）を出す。
// 承認待ち：承認・却下・直す・消す。承認済み：承認待ちに戻す・却下・消す。却下：承認待ちに戻す・消す。
// 承認待ちと承認済みは、選んでまとめて承認・却下できる。結果は押したボタンの近くに出し、消す前は確かめる（EXPERIENCE.md）。
// threads-002：上に自動投稿の状態（次の投稿・知らせ）を出す。承認済みは投稿の順に並べ、予定の時刻と「次に投稿する」を出す。
// 投稿済み（Threads の投稿へのリンク）と投稿に失敗（理由・承認し直す）のチップを足した。投稿中の案は変えられない。
// threads-007：カードの中で時間差のメンションを付ける・直す・外す（MentionPanel.tsx）。
import {
  DRAFT_BODY_MAX,
  DRAFT_LIST_STATUSES,
  DRAFT_STATUS_LABELS,
  PUBLISH_ERROR_LABELS,
  REJECT_NOTE_MAX,
  REJECT_REASONS,
  SIMILARITY_THRESHOLD,
  THREADS_TEXT_LIMIT,
  checkPublishable,
  computeSimilarities,
  rejectReasonLabel,
  threadsLength,
} from "@workspace/contracts/threads";
import type {
  DraftListStatus,
  MentionSettings,
  NgWord,
  PostDraft,
  RejectReasonCode,
  ReviewInput,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { jstDateTime } from "@workspace/contracts/core";
import { useMemo, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { AutoPostPanel } from "./AutoPostPanel.tsx";
import { deleteDraft, reviewDrafts, setDraftPriority, updateDraft } from "./api.ts";
import { MentionPanel } from "./MentionPanel.tsx";
import { THREADS_QUERY_KEYS, useDrafts, useMentionSettings, usePostingRules } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 開いている枠。 */
type OpenDialog =
  | { kind: "edit"; draft: PostDraft }
  | { kind: "reject"; drafts: PostDraft[] }
  | { kind: "delete"; draft: PostDraft }
  | undefined;

/**
 * 案を、承認・却下の入力の項目にする。
 * @param drafts 案
 * @returns 項目
 */
function toItems(drafts: readonly PostDraft[]): ReviewInput["items"] {
  return drafts.map((draft) => ({ id: draft.id, version: draft.version }));
}

/** DraftCard が受け取るもの。 */
type DraftCardProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 案 */
  draft: PostDraft;
  /** 時間差のメンションの設定（threads-007。読めていなければ undefined） */
  mentionSettings: MentionSettings | undefined;
  /** NG ワード */
  ngWords: readonly NgWord[];
  /** 似ている度合い（出さないときは undefined） */
  similarity: number | undefined;
  /** 選んでいるか（選べない状態なら undefined） */
  selected: boolean | undefined;
  /** 選ぶ・外す */
  onSelect: (selected: boolean) => void;
  /** 操作中か */
  pending: boolean;
  /** このカードの結果 */
  result: Result | undefined;
  /** 投稿の予定の時刻（承認済みで、予定があるときだけ） */
  scheduledAt: string | undefined;
  /** 承認する・承認待ちに戻す */
  onReview: (action: "approve" | "reopen") => void;
  /** 「次に投稿する」を付ける・外す */
  onPriority: (prioritized: boolean) => void;
  /** 枠を開く */
  onOpen: (dialog: NonNullable<OpenDialog>) => void;
};

/**
 * 案の1枚。
 * @param props 案・NG ワード・似ている度合い・選択・操作
 * @returns カードの要素
 */
function DraftCard({
  accountId,
  draft,
  mentionSettings,
  ngWords,
  similarity,
  selected,
  onSelect,
  pending,
  result,
  scheduledAt,
  onReview,
  onPriority,
  onOpen,
}: DraftCardProps) {
  const check = checkPublishable(draft.body, [...ngWords]);
  const length = threadsLength(draft.body);
  const headingId = `threads-draft-${draft.id}`;
  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-xs"
    >
      <div className="flex flex-wrap items-center gap-xxs">
        {selected !== undefined ? (
          <label className="flex min-h-l items-center gap-x3s text-m">
            <input
              type="checkbox"
              className="size-s accent-primary"
              checked={selected}
              onChange={(change) => onSelect(change.target.checked)}
            />
            選ぶ
          </label>
        ) : null}
        <h3 id={headingId} className="sr-only">
          {`${DRAFT_STATUS_LABELS[draft.status]}の案：${draft.body.slice(0, 20)}`}
        </h3>
        <span
          className={
            length > THREADS_TEXT_LIMIT ? "text-s text-danger-text" : "text-s text-text-sub"
          }
        >
          {length}／{THREADS_TEXT_LIMIT}文字
        </span>
        {similarity !== undefined && similarity >= SIMILARITY_THRESHOLD ? (
          <Badge variant="danger">似た案あり {similarity}％</Badge>
        ) : null}
        {check.ngWords.length > 0 ? (
          <Badge variant="danger">
            NGワード：{check.ngWords.map((hit) => hit.word).join("、")}
          </Badge>
        ) : null}
        {check.overThreadsLimit ? (
          <Badge variant="danger">Threads の上限を超えています</Badge>
        ) : null}
        {draft.status === "publishing" ? <Badge>投稿中</Badge> : null}
        {draft.carryover ? <Badge>前の時刻から持ち越し</Badge> : null}
        {draft.prioritizedAt ? <Badge variant="success">次に投稿する</Badge> : null}
        {scheduledAt ? (
          <span className="text-s text-text-sub">投稿の予定：{jstDateTime(scheduledAt)}</span>
        ) : null}
        {draft.publishedAt ? (
          <span className="text-s text-text-sub">投稿：{jstDateTime(draft.publishedAt)}</span>
        ) : null}
      </div>
      {draft.blockedReason ? (
        <p className="text-s text-danger-text">
          {draft.blockedReason === "ng_word"
            ? `投稿の直前にNGワード（${(draft.blockedWords ?? []).join("、")}）に当たったため、承認待ちに戻しました。`
            : "投稿の直前に Threads の上限を超えていたため、承認待ちに戻しました。"}
        </p>
      ) : null}
      {draft.status === "publish_failed" && draft.publishError ? (
        <p className="text-s text-danger-text">
          投稿に失敗しました（{PUBLISH_ERROR_LABELS[draft.publishError]}
          {draft.publishFailedAt ? `・${jstDateTime(draft.publishFailedAt)}` : ""}）。
          直す・承認し直すと、投稿の順に戻ります。
        </p>
      ) : null}
      <p className="text-m break-words whitespace-pre-wrap">{draft.body}</p>
      {check.policyCautions.length > 0 ? (
        <ul className="flex flex-col gap-x3s text-s text-text-sub">
          {check.policyCautions.map((caution) => (
            <li key={caution.id}>
              規約に注意：{caution.label}（{caution.suggestion}）
            </li>
          ))}
        </ul>
      ) : null}
      {draft.status === "rejected" ? (
        <p className="text-s text-text-sub">
          却下の理由：
          {[...(draft.rejectReasons ?? []).map(rejectReasonLabel), draft.rejectNote]
            .filter(Boolean)
            .join("・")}
        </p>
      ) : null}
      {mentionSettings ? (
        <MentionPanel
          accountId={accountId}
          draft={draft}
          settings={mentionSettings}
          ngWords={ngWords}
        />
      ) : null}
      <div className="flex flex-col items-start gap-xxs">
        <div className="flex flex-wrap gap-xxs">
          {draft.status === "needs_review" ? (
            <>
              <Button
                variant="primary"
                size="small"
                disabled={!check.approvable}
                aria-disabled={pending || undefined}
                onClick={() => onReview("approve")}
              >
                承認する
              </Button>
              <Button size="small" onClick={() => onOpen({ kind: "reject", drafts: [draft] })}>
                却下する
              </Button>
              <Button size="small" onClick={() => onOpen({ kind: "edit", draft })}>
                直す
              </Button>
            </>
          ) : null}
          {draft.status === "approved" ? (
            <>
              <Button
                size="small"
                aria-disabled={pending || undefined}
                onClick={() => onPriority(draft.prioritizedAt === null)}
              >
                {draft.prioritizedAt ? "「次に投稿する」を外す" : "次に投稿する"}
              </Button>
              <Button
                size="small"
                aria-disabled={pending || undefined}
                onClick={() => onReview("reopen")}
              >
                承認待ちに戻す
              </Button>
              <Button size="small" onClick={() => onOpen({ kind: "reject", drafts: [draft] })}>
                却下する
              </Button>
            </>
          ) : null}
          {draft.status === "publish_failed" ? (
            <>
              <Button
                variant="primary"
                size="small"
                disabled={!check.approvable}
                aria-disabled={pending || undefined}
                onClick={() => onReview("approve")}
              >
                承認し直す
              </Button>
              <Button
                size="small"
                aria-disabled={pending || undefined}
                onClick={() => onReview("reopen")}
              >
                承認待ちに戻す
              </Button>
              <Button size="small" onClick={() => onOpen({ kind: "reject", drafts: [draft] })}>
                却下する
              </Button>
            </>
          ) : null}
          {draft.status === "rejected" ? (
            <Button
              size="small"
              aria-disabled={pending || undefined}
              onClick={() => onReview("reopen")}
            >
              承認待ちに戻す
            </Button>
          ) : null}
          {draft.status === "published" && draft.threadsPermalink ? (
            <a
              href={draft.threadsPermalink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "text", size: "small" })}
            >
              Threads で見る（新しいタブ）
            </a>
          ) : null}
          {draft.status !== "publishing" ? (
            <Button variant="text" size="small" onClick={() => onOpen({ kind: "delete", draft })}>
              消す
            </Button>
          ) : null}
        </div>
        {!check.approvable && draft.status === "needs_review" ? (
          <p className="text-s text-text-sub">
            NGワードを含むか Threads の上限を超えるので、直してから承認してください。
          </p>
        ) : null}
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </li>
  );
}

/** EditDialog が受け取るもの。 */
type EditDialogProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 直す案 */
  draft: PostDraft;
  /** 閉じる */
  onClose: () => void;
  /** 直したあと */
  onDone: () => Promise<void>;
};

/**
 * 案の本文を直す枠。
 * @param props 運用アカウントの ID・直す案・閉じる・直したあと
 * @returns 枠の要素
 */
function EditDialog({ accountId, draft, onClose, onDone }: EditDialogProps) {
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  /** 保存する。 */
  const save = async () => {
    if (pending) return;
    setFailure(undefined);
    if (body.trim() === "") {
      setError("本文を入れてください。");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await updateDraft(accountId, draft.id, { body, version: draft.version });
      await onDone();
      onClose();
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.body) setError(fields.body);
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
      title="案を直す"
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
          label="本文"
          description={`Threads の上限は${THREADS_TEXT_LIMIT}文字です（今 ${threadsLength(body)}文字）。`}
          error={error}
          required
        >
          <Textarea
            rows={8}
            maxLength={DRAFT_BODY_MAX}
            value={body}
            onChange={(change) => setBody(change.target.value)}
          />
        </Field>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </Dialog>
  );
}

/** RejectDialog が受け取るもの。 */
type RejectDialogProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 却下する案 */
  drafts: PostDraft[];
  /** 閉じる */
  onClose: () => void;
  /** 却下したあと */
  onDone: (count: number) => Promise<void>;
};

/**
 * 理由をつけて却下する枠。理由とメモは、次のプロンプトで「避けること」として使う。
 * @param props 運用アカウントの ID・却下する案・閉じる・却下したあと
 * @returns 枠の要素
 */
function RejectDialog({ accountId, drafts, onClose, onDone }: RejectDialogProps) {
  const [reasons, setReasons] = useState<RejectReasonCode[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  /** 却下する。 */
  const reject = async () => {
    if (pending) return;
    setFailure(undefined);
    if (reasons.length === 0 && note.trim() === "") {
      setError("却下の理由を選ぶか、メモを書いてください。");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await reviewDrafts(accountId, {
        action: "reject",
        items: toItems(drafts),
        reasons,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      await onDone(drafts.length);
      onClose();
    } catch (caught) {
      setFailure(`却下できませんでした。${errorMessage(caught)}`);
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
      title={drafts.length > 1 ? `${drafts.length}件の案を却下する` : "案を却下する"}
      description="理由とメモは、次に作るプロンプトに「避けること」として入ります。"
      footer={
        <div className="flex flex-col-reverse gap-xxs wide:flex-row wide:justify-end">
          <Button onClick={onClose} aria-disabled={pending || undefined}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            onClick={() => void reject()}
            aria-disabled={pending || undefined}
          >
            {pending ? "却下しています…" : "却下する"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-s">
        <fieldset
          className="flex flex-col gap-x3s"
          aria-describedby={error ? "threads-reject-error" : undefined}
        >
          <legend className="mb-x3s text-m font-bold">却下の理由（いくつでも）</legend>
          {REJECT_REASONS.map((reason) => (
            <label key={reason.code} className="flex min-h-l items-center gap-xxs text-m">
              <input
                type="checkbox"
                className="size-s accent-primary"
                checked={reasons.includes(reason.code)}
                onChange={(change) =>
                  setReasons((current) =>
                    change.target.checked
                      ? [...current, reason.code]
                      : current.filter((code) => code !== reason.code),
                  )
                }
              />
              {reason.label}
            </label>
          ))}
          {error ? (
            <p id="threads-reject-error" className="text-s text-danger-text">
              {error}
            </p>
          ) : null}
        </fieldset>
        <Field label="メモ" description={`任意。${REJECT_NOTE_MAX}文字まで`}>
          <Textarea
            rows={3}
            maxLength={REJECT_NOTE_MAX}
            value={note}
            onChange={(change) => setNote(change.target.value)}
          />
        </Field>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </Dialog>
  );
}

/** StockContent が受け取るもの。 */
type StockContentProps = {
  /** 運用アカウント */
  account: ThreadsAccount;
};

/**
 * 投稿の案の画面の中身。
 * @param props 運用アカウント（account）
 * @returns 画面の要素
 */
function StockContent({ account }: StockContentProps) {
  const accountId = account.id;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DraftListStatus>("needs_review");
  const drafts = useDrafts(accountId, status);
  const rules = usePostingRules(accountId);
  const mentionSettings = useMentionSettings(accountId);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<OpenDialog>();
  const [pendingId, setPendingId] = useState<string>();
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkResult, setBulkResult] = useState<Result>();
  const [cardResults, setCardResults] = useState<Record<string, Result>>({});
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const list = drafts.data?.drafts ?? [];
  const similarities = useMemo(() => {
    if (!drafts.data || (status !== "needs_review" && status !== "approved")) {
      return new Map<string, number>();
    }
    const result = computeSimilarities(drafts.data.drafts, drafts.data.compareWith);
    return new Map([...result].map(([id, value]) => [id, value.score]));
  }, [drafts.data, status]);

  /** 運用アカウントの問い合わせをまとめて読み直す。 */
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
    await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.accounts });
  };

  /**
   * 表示する状態を変える（選んだ案と結果を消す）。
   * @param next 状態
   */
  const changeStatus = (next: DraftListStatus) => {
    setStatus(next);
    setSelected(new Set());
    setBulkResult(undefined);
    setCardResults({});
  };

  /**
   * 1件を承認する・承認待ちに戻す。
   * @param draft 案
   * @param action 操作
   */
  const reviewOne = async (draft: PostDraft, action: "approve" | "reopen") => {
    if (pendingId) return;
    setPendingId(draft.id);
    try {
      await reviewDrafts(accountId, { action, items: toItems([draft]) });
      await refresh();
    } catch (caught) {
      setCardResults((current) => ({
        ...current,
        [draft.id]: { tone: "danger", message: `できませんでした。${errorMessage(caught)}` },
      }));
    } finally {
      setPendingId(undefined);
    }
  };

  /**
   * 「次に投稿する」を付ける・外す。
   * @param draft 案
   * @param prioritized 付けるなら true
   */
  const priorityOne = async (draft: PostDraft, prioritized: boolean) => {
    if (pendingId) return;
    setPendingId(draft.id);
    try {
      await setDraftPriority(accountId, draft.id, { prioritized, version: draft.version });
      await refresh();
    } catch (caught) {
      setCardResults((current) => ({
        ...current,
        [draft.id]: { tone: "danger", message: `できませんでした。${errorMessage(caught)}` },
      }));
    } finally {
      setPendingId(undefined);
    }
  };

  const selectedDrafts = list.filter((draft) => selected.has(draft.id));
  const selectable = status === "needs_review" || status === "approved";
  const selectableList = list.filter((draft) => draft.status !== "publishing");

  /** 選んだ案をまとめて承認する。 */
  const approveSelected = async () => {
    if (bulkPending || selectedDrafts.length === 0) return;
    setBulkResult(undefined);
    setBulkPending(true);
    try {
      const result = await reviewDrafts(accountId, {
        action: "approve",
        items: toItems(selectedDrafts),
      });
      setSelected(new Set());
      await refresh();
      setBulkResult({ tone: "success", message: `${result.drafts.length}件を承認しました。` });
    } catch (caught) {
      setBulkResult({ tone: "danger", message: `承認できませんでした。${errorMessage(caught)}` });
    } finally {
      setBulkPending(false);
    }
  };

  /** 案を消す（確かめの枠から）。 */
  const confirmDelete = async () => {
    if (dialog?.kind !== "delete" || deletePending) return;
    setDeleteError(undefined);
    setDeletePending(true);
    try {
      await deleteDraft(accountId, dialog.draft.id);
      await refresh();
      setDialog(undefined);
      setBulkResult({ tone: "success", message: "案を消しました。" });
    } catch (caught) {
      setDeleteError(`消せませんでした。${errorMessage(caught)}`);
    } finally {
      setDeletePending(false);
    }
  };

  const counts: Record<DraftListStatus, number> = {
    needs_review: account.counts.needsReview,
    approved: account.counts.approved,
    published: account.counts.published,
    publish_failed: account.counts.publishFailed,
    rejected: account.counts.rejected,
  };

  return (
    <Page
      title="投稿の案"
      lead={`${account.name}：ためた案を承認するか却下します。承認した案は、自動投稿で決めた時刻に投稿されます。`}
      actions={
        <Link
          to="/threads/accounts/$accountId/create"
          params={{ accountId }}
          className={buttonVariants({ variant: "primary" })}
        >
          案を作る
        </Link>
      }
    >
      <AutoPostPanel accountId={accountId} onShowStatus={changeStatus} />
      <ChoiceChips
        label="表示する案"
        options={DRAFT_LIST_STATUSES.map((value) => ({
          value,
          label: `${DRAFT_STATUS_LABELS[value]}（${counts[value]}）`,
        }))}
        value={status}
        onValueChange={changeStatus}
      />
      {selectable && selectableList.length > 0 ? (
        <div className="flex flex-col items-start gap-xxs">
          <div className="flex flex-wrap items-center gap-xxs">
            <Button
              size="small"
              onClick={() =>
                setSelected(
                  selected.size === selectableList.length
                    ? new Set()
                    : new Set(selectableList.map((draft) => draft.id)),
                )
              }
            >
              {selected.size === selectableList.length ? "選んだのを外す" : "すべて選ぶ"}
            </Button>
            {status === "needs_review" ? (
              <Button
                variant="primary"
                size="small"
                disabled={selectedDrafts.length === 0}
                aria-disabled={bulkPending || undefined}
                onClick={() => void approveSelected()}
              >
                {bulkPending ? "承認しています…" : `選んだ${selectedDrafts.length}件を承認`}
              </Button>
            ) : null}
            <Button
              size="small"
              disabled={selectedDrafts.length === 0}
              onClick={() => setDialog({ kind: "reject", drafts: selectedDrafts })}
            >
              選んだ{selectedDrafts.length}件を却下
            </Button>
          </div>
          {bulkResult ? (
            <ResponseMessage tone={bulkResult.tone}>{bulkResult.message}</ResponseMessage>
          ) : null}
        </div>
      ) : bulkResult ? (
        <ResponseMessage tone={bulkResult.tone}>{bulkResult.message}</ResponseMessage>
      ) : null}
      {drafts.isPending || rules.isPending ? (
        <Loading />
      ) : drafts.isError || rules.isError ? (
        <LoadFailure
          error={drafts.error ?? rules.error}
          retry={() => {
            void drafts.refetch();
            void rules.refetch();
          }}
        />
      ) : list.length === 0 ? (
        <p className="text-m">
          {status === "needs_review"
            ? "承認待ちの案はありません。「案を作る」からためてください。"
            : `${DRAFT_STATUS_LABELS[status]}の案はありません。`}
        </p>
      ) : (
        <ul aria-label={`${DRAFT_STATUS_LABELS[status]}の案`} className="flex flex-col gap-xs">
          {list.map((draft) => (
            <DraftCard
              key={draft.id}
              accountId={accountId}
              draft={draft}
              mentionSettings={mentionSettings.data}
              ngWords={rules.data.ngWords}
              similarity={similarities.get(draft.id)}
              selected={
                selectable && draft.status !== "publishing" ? selected.has(draft.id) : undefined
              }
              onSelect={(value) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (value) next.add(draft.id);
                  else next.delete(draft.id);
                  return next;
                })
              }
              pending={pendingId === draft.id}
              result={cardResults[draft.id]}
              scheduledAt={drafts.data.schedule[draft.id]}
              onReview={(action) => void reviewOne(draft, action)}
              onPriority={(prioritized) => void priorityOne(draft, prioritized)}
              onOpen={(next) => {
                setDeleteError(undefined);
                setDialog(next);
              }}
            />
          ))}
        </ul>
      )}
      {dialog?.kind === "edit" ? (
        <EditDialog
          accountId={accountId}
          draft={dialog.draft}
          onClose={() => setDialog(undefined)}
          onDone={refresh}
        />
      ) : null}
      {dialog?.kind === "reject" ? (
        <RejectDialog
          accountId={accountId}
          drafts={dialog.drafts}
          onClose={() => setDialog(undefined)}
          onDone={async (count) => {
            setSelected(new Set());
            await refresh();
            setBulkResult({ tone: "success", message: `${count}件を却下しました。` });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(undefined);
        }}
        title="この案を消します"
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={deletePending}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
      >
        消した案は元に戻せません。
      </ConfirmDialog>
    </Page>
  );
}

/** StockPage が受け取るもの。 */
export type StockPageProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 投稿の案の画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @returns 画面の要素
 */
export function StockPage({ accountId }: StockPageProps) {
  return (
    <AccountGate accountId={accountId}>
      {(account) => <StockContent account={account} />}
    </AccountGate>
  );
}

const stockRouteApi = getRouteApi("/threads/accounts/$accountId/stock");

/**
 * 投稿の案の道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function StockRoute() {
  const { accountId } = stockRouteApi.useParams();
  return <StockPage accountId={accountId} />;
}
