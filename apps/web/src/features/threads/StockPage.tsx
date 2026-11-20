// 投稿の案（めぐるの「投稿ストック」）。状態（承認待ち・承認済み・投稿済み・投稿に失敗・却下）をチップで選び、案ごとにカードで出す（カードは DraftCard.tsx）。
// 選んだ状態は道の ?tab= に残す（読みこみ直しても同じ状態を開く）。結果は押したボタンの近くに出し、消す前は確かめる（EXPERIENCE.md）。
// threads-002：上に自動投稿の状態。承認済みは投稿の順に並べ、予定の時刻と「次に投稿する」を出す。threads-007：カードの中で時間差のメンション。
// threads-011（めぐるの投稿ストックの振る舞いを写した）：
// - まとめての操作は1件ずつ確かめ、できるものだけ変える（「N件を承認しました。M件は承認できませんでした（理由ごとの件数）」）
// - 承認待ち：ためた新しいまとまりが先で、まとまりごとに「○にためたN件」と「このN件を選ぶ」。「承認できるものを選ぶ（N件）」。
//   選んで承認（責任の確かめの枠。規約に注意の確かめも兼ねる）・却下・消す・「いつも付ける」の人でメンションを付ける
// - 承認済み：選んで承認待ちに戻す・却下。却下：選んで承認待ちに戻す・消す。投稿済み：50件ずつ「もっと見る」
// - 規約に注意の案を1件承認するときは確かめの枠を出す。似ている案へは、その状態のチップに切り替えて移る
// めぐるの「元に戻す」のトースト（承認・却下・削除の取り消し）は持たない。kanaeru は消す前に確かめる。
import {
  NEEDS_REVIEW_LIMIT,
  APPROVED_LIMIT,
  DRAFT_LIST_STATUSES,
  DRAFT_STATUS_LABELS,
  REJECTED_LIST_MAX,
  SIMILARITY_THRESHOLD,
  checkPublishable,
  computeSimilarities,
  mergeChecks,
} from "@workspace/contracts/threads";
import type {
  DraftListStatus,
  PostDraft,
  PublishCheck,
  RejectReasonCode,
  SimilarityResult,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import { jstDateTime } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { AutoPostPanel } from "./AutoPostPanel.tsx";
import { attachMentionsBulk, deleteDrafts, setDraftPriority } from "./api.ts";
import { useThreadsCan } from "./team-access.ts";
import { DraftCard, draftCardId } from "./DraftCard.tsx";
import type { CardDialog, CardResult, CompareTarget } from "./DraftCard.tsx";
import { EditDialog, RejectDialog } from "./DraftDialogs.tsx";
import { reviewMessage, sendReview } from "./review-send.ts";
import type { ReviewAction, ReviewOptions } from "./review-send.ts";
import {
  THREADS_QUERY_KEYS,
  useDrafts,
  useMentionSettings,
  usePostingRules,
  usePublishedDrafts,
} from "./queries.ts";

/** 開いている確かめの枠（カードから開く枠のほか、規約に注意・まとめて承認）。 */
type OpenDialog =
  | CardDialog
  | { kind: "policy"; drafts: PostDraft[]; labels: string[] }
  | { kind: "bulk-approve"; drafts: PostDraft[] }
  | undefined;

/** ためたまとまりごとの案。 */
type BatchGroup = { batchId: string; createdAt: string; drafts: PostDraft[] };

/**
 * 承認待ちの案を、ためたまとまりごとに分ける（API の順のまま）。
 * @param drafts 案
 * @returns まとまり
 */
function groupByBatch(drafts: readonly PostDraft[]): BatchGroup[] {
  const groups: BatchGroup[] = [];
  for (const draft of drafts) {
    const last = groups.at(-1);
    if (last?.batchId === draft.batchId) last.drafts.push(draft);
    else groups.push({ batchId: draft.batchId, createdAt: draft.createdAt, drafts: [draft] });
  }
  return groups;
}

/** StockContent が受け取るもの。 */
type StockContentProps = {
  /** 運用アカウント */
  account: ThreadsAccount;
  /** 道の ?tab= の状態 */
  status: DraftListStatus;
  /** 状態を変える（道の ?tab= を変える） */
  onStatusChange: (status: DraftListStatus) => void;
};

/**
 * 投稿の案の画面の中身。
 * @param props 運用アカウント・状態・状態を変える
 * @returns 画面の要素
 */
function StockContent({ account, status, onStatusChange }: StockContentProps) {
  // 担当の人の出し分け（threads-013。判定の正は API）
  const can = useThreadsCan();
  const accountId = account.id;
  const queryClient = useQueryClient();
  const published = status === "published";
  const drafts = useDrafts(accountId, status, !published);
  const publishedPages = usePublishedDrafts(accountId, published);
  const rules = usePostingRules(accountId);
  const mentionSettings = useMentionSettings(accountId);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<OpenDialog>();
  const [pendingId, setPendingId] = useState<string>();
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkResult, setBulkResult] = useState<CardResult>();
  const [cardResults, setCardResults] = useState<Record<string, CardResult>>({});
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogError, setDialogError] = useState<string>();
  const [jumpTarget, setJumpTarget] = useState<string>();

  const list = useMemo(
    () =>
      published
        ? (publishedPages.data?.pages.flatMap((page) => page.drafts) ?? [])
        : (drafts.data?.drafts ?? []),
    [published, publishedPages.data, drafts.data],
  );
  const firstPage = published ? publishedPages.data?.pages[0] : drafts.data;
  const ngWords = useMemo(() => rules.data?.ngWords ?? [], [rules.data]);

  // 承認できるか（NG ワード・Threads の上限。返信の文も合わせる）。承認の確かめそのものは API が行い、ここは出すため
  const checks = useMemo(() => {
    const map = new Map<string, PublishCheck>();
    for (const draft of list) {
      const reply =
        draft.mention?.state === "pending"
          ? checkPublishable(draft.mention.text, [...ngWords])
          : null;
      map.set(draft.id, mergeChecks(checkPublishable(draft.body, [...ngWords]), reply));
    }
    return map;
  }, [list, ngWords]);

  // 似ている度合い（承認待ちだけ。相手は承認待ち・承認済み・却下。計算は画面で行う）
  const compareWith = useMemo(() => firstPage?.compareWith ?? [], [firstPage]);
  const similarities = useMemo(() => {
    if (status !== "needs_review") return new Map<string, SimilarityResult>();
    return computeSimilarities(list, compareWith);
  }, [status, list, compareWith]);
  const targets = useMemo(
    () => new Map<string, CompareTarget>(compareWith.map((item) => [item.id, item])),
    [compareWith],
  );

  /**
   * 案の判定（読めていなければ NG ワードなしで判定する）。
   * @param draft 案
   * @returns 判定
   */
  const checkOf = (draft: PostDraft): PublishCheck =>
    checks.get(draft.id) ?? checkPublishable(draft.body, []);
  /**
   * 規約に注意の分類（NG ワード・上限で承認できないものは除く）。
   * @param draft 案
   * @returns 分類の名前
   */
  const cautionsOf = (draft: PostDraft): string[] => {
    const check = checkOf(draft);
    return check.approvable ? check.policyCautions.map((caution) => caution.label) : [];
  };
  /**
   * 似ている案（80％以上）があるか。
   * @param draft 案
   * @returns あれば true
   */
  const isSimilar = (draft: PostDraft) =>
    (similarities.get(draft.id)?.score ?? 0) >= SIMILARITY_THRESHOLD;

  // 似ている案へ移ったら、その案までスクロールしてフォーカスを移す
  useEffect(() => {
    if (!jumpTarget) return;
    const element = document.getElementById(draftCardId(jumpTarget));
    if (!element) return;
    element.scrollIntoView?.({ block: "center" });
    element.focus();
    const timer = window.setTimeout(() => setJumpTarget(undefined), 3000);
    return () => window.clearTimeout(timer);
  }, [jumpTarget, list]);

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
    onStatusChange(next);
    setSelected(new Set());
    setBulkResult(undefined);
    setCardResults({});
  };

  /**
   * 似ている案へ移る（その状態のチップに切り替える）。
   * @param target 似ている案
   */
  const jumpTo = (target: CompareTarget) => {
    const next: DraftListStatus = target.status === "publishing" ? "approved" : target.status;
    if (next !== status) changeStatus(next);
    setJumpTarget(target.id);
  };

  /**
   * 状態を変える（1件はカードの近く、まとめてはまとめての操作の近くに結果を出す）。
   * @param action 操作
   * @param targets 案
   * @param options 却下の理由・規約に注意の確かめ
   * @returns 送れたら true
   */
  const runReview = async (
    action: ReviewAction,
    targets: PostDraft[],
    options: ReviewOptions = {},
  ): Promise<boolean> => {
    const single = targets.length === 1 && targets[0] ? targets[0] : undefined;
    try {
      const result = await sendReview(accountId, action, targets, options);
      const message = reviewMessage(action, targets, result);
      // 変えた案は選択から外し、変えなかった案は選んだまま残す
      const changed = new Set(result.drafts.map((draft) => draft.id));
      setSelected((current) => new Set([...current].filter((id) => !changed.has(id))));
      if (single) {
        if (result.skipped.length > 0)
          setCardResults((current) => ({ ...current, [single.id]: message }));
        else setBulkResult(message);
      } else {
        setBulkResult(message);
      }
      return true;
    } catch (caught) {
      const message: CardResult = {
        tone: "danger",
        message: `できませんでした。${errorMessage(caught)}`,
      };
      if (single) setCardResults((current) => ({ ...current, [single.id]: message }));
      else setBulkResult(message);
      return false;
    } finally {
      await refresh();
    }
  };

  /**
   * 1件を承認する・承認待ちに戻す（規約に注意の案は、承認の前に確かめる）。
   * @param draft 案
   * @param action 操作
   */
  const reviewOne = async (draft: PostDraft, action: "approve" | "reopen") => {
    if (pendingId) return;
    setCardResults(({ [draft.id]: _removed, ...rest }) => rest);
    const labels = action === "approve" && draft.status === "needs_review" ? cautionsOf(draft) : [];
    if (labels.length > 0) {
      setDialogError(undefined);
      setDialog({ kind: "policy", drafts: [draft], labels });
      return;
    }
    setPendingId(draft.id);
    try {
      await runReview(action, [draft]);
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

  const selectable = status === "needs_review" || status === "approved" || status === "rejected";
  const selectableList = selectable ? list.filter((draft) => draft.status !== "publishing") : [];
  const selectedDrafts = selectableList.filter((draft) => selected.has(draft.id));
  const approvableSelected = selectedDrafts.filter((draft) => checkOf(draft).approvable);
  // 注意の付いていない案：NG ワード・Threads の上限・規約に注意・似ている案（80％以上）のどれにも当たらない
  const cleanDrafts =
    status === "needs_review"
      ? list.filter((draft) => {
          const check = checkOf(draft);
          return check.approvable && check.policyCautions.length === 0 && !isSimilar(draft);
        })
      : [];
  const allSelected = selectableList.length > 0 && selectedDrafts.length === selectableList.length;
  const canBulkMention =
    status === "needs_review" &&
    !!mentionSettings.data &&
    !mentionSettings.data.repliesDenied &&
    mentionSettings.data.people.some((person) => person.always);
  const approvedSlots = Math.max(0, APPROVED_LIMIT - account.counts.approved);

  /**
   * 選んだ案をまとめて操作する（結果はまとめての操作の近く）。
   * @param action 操作
   * @param targets 案
   * @param options 却下の理由・規約に注意の確かめ
   * @returns 送れたら true
   */
  const runBulk = async (
    action: ReviewAction,
    targets: PostDraft[],
    options: ReviewOptions = {},
  ): Promise<boolean> => {
    if (bulkPending || targets.length === 0) return false;
    setBulkResult(undefined);
    setBulkPending(true);
    try {
      return await runReview(action, targets, options);
    } finally {
      setBulkPending(false);
    }
  };

  /** 選んだ案に「いつも付ける」の人でまとめてメンションを付ける。 */
  const mentionSelected = async () => {
    if (bulkPending || selectedDrafts.length === 0) return;
    setBulkResult(undefined);
    setBulkPending(true);
    try {
      const result = await attachMentionsBulk(
        accountId,
        selectedDrafts.map((draft) => ({ id: draft.id, version: draft.version })),
      );
      const done = `${result.drafts.length}件にメンションを付けました。`;
      setBulkResult(
        result.skipped.length === 0
          ? { tone: "success", message: done }
          : {
              tone: result.drafts.length === 0 ? "danger" : "info",
              message: `${done}${result.skipped.length}件には付けられませんでした（「いつも付ける」の人がほかの投稿の予定に入っている・ほかの画面で変わったなど）。`,
            },
      );
    } catch (caught) {
      setBulkResult({ tone: "danger", message: `付けられませんでした。${errorMessage(caught)}` });
    } finally {
      setBulkPending(false);
      await refresh();
    }
  };

  /** 確かめの枠の「消す」。 */
  const confirmDelete = async () => {
    if (dialog?.kind !== "delete" || dialogPending) return;
    setDialogError(undefined);
    setDialogPending(true);
    try {
      const ids = dialog.drafts.map((draft) => draft.id);
      const result = await deleteDrafts(accountId, ids);
      setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
      await refresh();
      setDialog(undefined);
      setBulkResult({
        tone: result.deletedCount === ids.length ? "success" : "info",
        message:
          result.deletedCount === ids.length
            ? `${result.deletedCount}件の案を消しました。`
            : `${result.deletedCount}件の案を消しました。${ids.length - result.deletedCount}件は、ほかの画面で状態が変わったため消していません。`,
      });
    } catch (caught) {
      setDialogError(`消せませんでした。${errorMessage(caught)}`);
    } finally {
      setDialogPending(false);
    }
  };

  /**
   * 確かめの枠から承認する（規約に注意・まとめて承認）。
   * @param targets 案
   * @param confirmPolicyCaution 規約に注意を確かめたか
   */
  const confirmApprove = async (targets: PostDraft[], confirmPolicyCaution: boolean) => {
    if (dialogPending) return;
    setDialogPending(true);
    try {
      if (targets.length === 1 && targets[0]) setPendingId(targets[0].id);
      else setBulkPending(true);
      setDialog(undefined);
      await runReview("approve", targets, { confirmPolicyCaution });
    } finally {
      setDialogPending(false);
      setPendingId(undefined);
      setBulkPending(false);
    }
  };

  /**
   * 却下の枠から却下する。
   * @param targets 案
   * @param reject 理由とメモ
   */
  const submitReject = async (
    targets: PostDraft[],
    reject: { reasons: RejectReasonCode[]; note: string },
  ) => {
    if (dialogPending) return;
    setDialogError(undefined);
    setDialogPending(true);
    try {
      setBulkResult(undefined);
      const ok = await runReview("reject", targets, { reject });
      if (ok) setDialog(undefined);
      else setDialogError("却下できませんでした。読みこみ直して、もう一度お試しください。");
    } finally {
      setDialogPending(false);
    }
  };

  const counts: Record<DraftListStatus, number> = {
    needs_review: account.counts.needsReview,
    approved: account.counts.approved,
    published: account.counts.published,
    publish_failed: account.counts.publishFailed,
    rejected: account.counts.rejected,
  };

  /**
   * 案のカードを描く。
   * @param draft 案
   * @returns カード
   */
  const renderCard = (draft: PostDraft) => (
    <DraftCard
      key={draft.id}
      accountId={accountId}
      draft={draft}
      check={checkOf(draft)}
      mentionSettings={mentionSettings.data}
      ngWords={ngWords}
      similarity={similarities.get(draft.id)}
      findTarget={(id) => targets.get(id)}
      onJump={jumpTo}
      highlighted={jumpTarget === draft.id}
      selected={selectable && draft.status !== "publishing" ? selected.has(draft.id) : undefined}
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
      scheduledAt={firstPage?.schedule[draft.id]}
      onReview={(action) => void reviewOne(draft, action)}
      onPriority={(prioritized) => void priorityOne(draft, prioritized)}
      onOpen={(next) => {
        setDialogError(undefined);
        setDialog(next);
      }}
    />
  );

  const loading = published ? publishedPages.isPending : drafts.isPending;
  const loadError = published ? publishedPages.error : drafts.error;
  const rejectTargets = dialog?.kind === "reject" ? dialog.drafts : [];
  const bulkTargets = dialog?.kind === "bulk-approve" ? dialog.drafts : [];
  const bulkApprovable = bulkTargets.filter((draft) => checkOf(draft).approvable);
  const bulkCount = Math.min(bulkApprovable.length, approvedSlots);
  const bulkCautious = bulkApprovable.filter((draft) => cautionsOf(draft).length > 0).length;

  return (
    <ThreadsPage
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
      {selectableList.length > 0 ? (
        <div className="flex flex-col items-start gap-xxs">
          <div className="flex flex-wrap items-center gap-xxs">
            <Button
              size="small"
              onClick={() =>
                setSelected(
                  allSelected ? new Set() : new Set(selectableList.map((draft) => draft.id)),
                )
              }
            >
              {allSelected ? "選んだのを外す" : "すべて選ぶ"}
            </Button>
            {status === "needs_review" ? (
              <Button
                size="small"
                disabled={cleanDrafts.length === 0}
                onClick={() => setSelected(new Set(cleanDrafts.map((draft) => draft.id)))}
              >
                承認できるものを選ぶ（{cleanDrafts.length}件）
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-xxs">
            {status === "needs_review" && can.review ? (
              <Button
                variant="primary"
                size="small"
                disabled={approvableSelected.length === 0}
                aria-disabled={bulkPending || undefined}
                onClick={() => {
                  setDialogError(undefined);
                  setDialog({ kind: "bulk-approve", drafts: selectedDrafts });
                }}
              >
                {bulkPending ? "送っています…" : `選んだ${selectedDrafts.length}件を承認`}
              </Button>
            ) : null}
            {(status === "approved" || status === "rejected") && can.review ? (
              <Button
                size="small"
                disabled={selectedDrafts.length === 0}
                aria-disabled={bulkPending || undefined}
                onClick={() => void runBulk("reopen", selectedDrafts)}
              >
                {bulkPending ? "送っています…" : `選んだ${selectedDrafts.length}件を承認待ちに戻す`}
              </Button>
            ) : null}
            {(status === "needs_review" || status === "approved") && can.review ? (
              <Button
                size="small"
                disabled={selectedDrafts.length === 0}
                onClick={() => {
                  setDialogError(undefined);
                  setDialog({ kind: "reject", drafts: selectedDrafts });
                }}
              >
                選んだ{selectedDrafts.length}件を却下
              </Button>
            ) : null}
            {canBulkMention && can.review ? (
              <Button
                size="small"
                disabled={selectedDrafts.length === 0}
                aria-disabled={bulkPending || undefined}
                onClick={() => void mentionSelected()}
              >
                選んだ{selectedDrafts.length}件にメンションを付ける
              </Button>
            ) : null}
            {(status === "needs_review" && can.writeContent) ||
            (status === "rejected" && can.review) ? (
              <Button
                variant="text"
                size="small"
                disabled={selectedDrafts.length === 0}
                onClick={() => {
                  setDialogError(undefined);
                  setDialog({ kind: "delete", drafts: selectedDrafts });
                }}
              >
                選んだ{selectedDrafts.length}件を消す
              </Button>
            ) : null}
          </div>
          {bulkResult ? (
            <ResponseMessage tone={bulkResult.tone}>{bulkResult.message}</ResponseMessage>
          ) : null}
        </div>
      ) : bulkResult ? (
        <ResponseMessage tone={bulkResult.tone}>{bulkResult.message}</ResponseMessage>
      ) : null}
      {status === "needs_review" && account.counts.needsReview >= NEEDS_REVIEW_LIMIT ? (
        <p role="status" className="rounded-sm border border-border bg-surface-sunken p-xs text-m">
          承認待ちの案が上限（{NEEDS_REVIEW_LIMIT}
          件）に達しています。承認か却下をするか、いらない案を消してから、新しい案をためてください。
        </p>
      ) : null}
      {loading || rules.isPending ? (
        <Loading />
      ) : loadError || rules.isError ? (
        <LoadFailure
          error={loadError ?? rules.error}
          retry={() => {
            void (published ? publishedPages.refetch() : drafts.refetch());
            void rules.refetch();
          }}
        />
      ) : list.length === 0 ? (
        <p className="text-m">
          {status === "needs_review"
            ? "承認待ちの案はありません。「案を作る」からためてください。"
            : `${DRAFT_STATUS_LABELS[status]}の案はありません。`}
        </p>
      ) : status === "needs_review" ? (
        <div className="flex flex-col gap-s">
          {groupByBatch(list).map((group) => {
            const label = `${jstDateTime(group.createdAt)}にためた${group.drafts.length}件`;
            return (
              <section key={group.batchId} aria-label={label} className="flex flex-col gap-xxs">
                <div className="flex flex-wrap items-center justify-between gap-xxs">
                  <h2 className="text-s font-bold text-text-sub">{label}</h2>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() =>
                      setSelected(
                        (current) =>
                          new Set([...current, ...group.drafts.map((draft) => draft.id)]),
                      )
                    }
                  >
                    この{group.drafts.length}件を選ぶ
                  </Button>
                </div>
                <ul aria-label={`${label}の案`} className="flex flex-col gap-xs">
                  {group.drafts.map(renderCard)}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-xs">
          <ul aria-label={`${DRAFT_STATUS_LABELS[status]}の案`} className="flex flex-col gap-xs">
            {list.map(renderCard)}
          </ul>
          {status === "rejected" && counts.rejected > REJECTED_LIST_MAX ? (
            <p className="text-s text-text-sub">新しい{REJECTED_LIST_MAX}件を出しています。</p>
          ) : null}
          {published && publishedPages.hasNextPage ? (
            <div className="flex flex-col items-start gap-xxs">
              <Button
                aria-disabled={publishedPages.isFetchingNextPage || undefined}
                onClick={() => {
                  if (!publishedPages.isFetchingNextPage) void publishedPages.fetchNextPage();
                }}
              >
                {publishedPages.isFetchingNextPage ? "読みこんでいます…" : "もっと見る"}
              </Button>
              {publishedPages.isFetchNextPageError ? (
                <ResponseMessage tone="danger">
                  続きを読めませんでした。{errorMessage(publishedPages.error)}
                </ResponseMessage>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {dialog?.kind === "edit" ? (
        <EditDialog
          accountId={accountId}
          draft={dialog.draft}
          ngWords={ngWords}
          onClose={() => setDialog(undefined)}
          onDone={async (reopened) => {
            await refresh();
            setBulkResult({
              tone: "success",
              message: reopened
                ? "直したので、承認待ちに戻しました。もう一度承認してください。"
                : "案を直しました。",
            });
          }}
        />
      ) : null}
      {dialog?.kind === "reject" ? (
        <RejectDialog
          count={rejectTargets.length}
          initialReasons={[
            ...(rejectTargets.some(isSimilar) ? (["similar"] as const) : []),
            ...(rejectTargets.some((draft) => cautionsOf(draft).length > 0)
              ? (["policy"] as const)
              : []),
          ]}
          pending={dialogPending}
          failure={dialogError}
          onClose={() => setDialog(undefined)}
          onSubmit={(reject) => void submitReject(rejectTargets, reject)}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(undefined);
        }}
        title={
          dialog?.kind === "delete" && dialog.drafts.length > 1
            ? `選んだ${dialog.drafts.length}件の案を消します`
            : "この案を消します"
        }
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={dialogPending}
        error={dialogError}
        onConfirm={() => void confirmDelete()}
      >
        消した案は元に戻せません。
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "policy"}
        onOpenChange={(open) => {
          if (!open) setDialog(undefined);
        }}
        title="Threads の規約に触れるおそれのある表現があります"
        confirmLabel="承認する"
        pendingLabel="承認しています…"
        danger={false}
        pending={dialogPending}
        onConfirm={() => {
          if (dialog?.kind === "policy") void confirmApprove(dialog.drafts, true);
        }}
      >
        内容を確かめたうえで承認しますか？
        {dialog?.kind === "policy" ? `（${dialog.labels.join("・")}）` : ""}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "bulk-approve"}
        onOpenChange={(open) => {
          if (!open) setDialog(undefined);
        }}
        title={`選んだ${bulkTargets.length}件を承認します`}
        confirmLabel={`${bulkCount}件を承認する`}
        pendingLabel="承認しています…"
        danger={false}
        pending={dialogPending}
        onConfirm={() => {
          if (bulkCount > 0) void confirmApprove(bulkTargets, bulkCautious > 0);
        }}
      >
        <div className="flex flex-col gap-xxs">
          <p>
            承認した投稿は、自動投稿の設定に従って Threads
            に公開されます。投稿の内容は、あなた（アカウントの運用者）の責任のもとで公開されます。内容を確かめたうえで承認してください。
          </p>
          {bulkTargets.length - bulkApprovable.length > 0 ||
          bulkCount < bulkApprovable.length ||
          bulkCautious > 0 ? (
            <ul className="list-disc pl-s">
              {bulkTargets.length - bulkApprovable.length > 0 ? (
                <li>
                  うち{bulkTargets.length - bulkApprovable.length}件は NGワード・Threads
                  の上限に当たるため、承認されません。
                </li>
              ) : null}
              {bulkCount < bulkApprovable.length ? (
                <li>
                  承認済みの案が上限（{APPROVED_LIMIT}件）に近いため、承認されるのは{bulkCount}
                  件までです。
                </li>
              ) : null}
              {bulkCautious > 0 ? (
                <li>うち{bulkCautious}件に、Threads の規約に触れるおそれのある表現があります。</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </ConfirmDialog>
    </ThreadsPage>
  );
}

/** StockPage が受け取るもの。 */
export type StockPageProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 表示する状態（既定は承認待ち） */
  status?: DraftListStatus;
  /** 状態を変える（道の ?tab= を変える。渡さなければ画面の中だけで変える） */
  onStatusChange?: (status: DraftListStatus) => void;
};

/**
 * 投稿の案の画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID・状態・状態を変える
 * @returns 画面の要素
 */
export function StockPage({ accountId, status, onStatusChange }: StockPageProps) {
  const [localStatus, setLocalStatus] = useState<DraftListStatus>(status ?? "needs_review");
  const current = status ?? localStatus;
  return (
    <AccountGate accountId={accountId}>
      {(account) => (
        <StockContent
          key={account.id}
          account={account}
          status={current}
          onStatusChange={onStatusChange ?? setLocalStatus}
        />
      )}
    </AccountGate>
  );
}

const stockRouteApi = getRouteApi("/threads/accounts/$accountId/stock");

/**
 * 投稿の案の道の画面（道の値と ?tab= を読む）。
 * @returns 画面の要素
 */
export function StockRoute() {
  const { accountId } = stockRouteApi.useParams();
  const { tab } = stockRouteApi.useSearch();
  const navigate = stockRouteApi.useNavigate();
  return (
    <StockPage
      accountId={accountId}
      status={tab ?? "needs_review"}
      onStatusChange={(next) =>
        void navigate({ search: next === "needs_review" ? {} : { tab: next }, replace: true })
      }
    />
  );
}
