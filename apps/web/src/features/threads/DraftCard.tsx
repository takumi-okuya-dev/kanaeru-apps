// 投稿の案の1枚（threads-001 の StockPage.tsx から分けた。threads-011 でめぐるの DraftCard・DraftLabels の振る舞いを写した）。
// - 文字数・NG ワード・Threads の上限・規約に注意・状態の印と、ためた・承認・却下・直した・投稿の日時
// - 承認待ちは似ている度合い（どの案にも出す。80％以上は「似ている案があります」）。押すと似ている案を3件まで開き、その案へ移れる
// - 本文の NG ワード（承認待ち）と規約に注意（却下のほか）の所を、印を付けて出す（HTML を差しこまず、文字として描く）
// 承認待ち：承認・却下・直す・消す。承認済み：次に投稿する・直す・承認待ちに戻す・却下。投稿に失敗：承認し直す・承認待ちに戻す・却下。
// 却下：承認待ちに戻す・消す。投稿済み：Threads で見る（消さない。反応の記録が消えるため）。
import {
  DRAFT_STATUS_LABELS,
  PUBLISH_ERROR_LABELS,
  SIMILARITY_THRESHOLD,
  THREADS_TEXT_LIMIT,
  rejectReasonLabel,
  threadsLength,
} from "@workspace/contracts/threads";
import type {
  DraftStatus,
  MentionSettings,
  NgWord,
  PostDraft,
  PublishCheck,
  SimilarityResult,
} from "@workspace/contracts/threads";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { jstDateTime } from "@workspace/contracts/core";
import { useId, useState } from "react";
import type * as React from "react";
import { useThreadsCan } from "./team-access.ts";
import { MentionPanel } from "./MentionPanel.tsx";

/** 結果の知らせ。 */
export type CardResult = { tone: "success" | "danger" | "info"; message: string };

/** 似ている度合いを比べる相手（一覧の compareWith の1件）。 */
export type CompareTarget = { id: string; body: string; status: DraftStatus };

/** 本文の印の種類（NG ワード・規約に注意）。 */
type MarkKind = "ng" | "policy";

/** 本文の印の範囲（元の本文の [開始, 終了)）。 */
type Mark = { start: number; end: number; kind: MarkKind };

/**
 * 判定の結果から、本文の印の範囲を作る。
 * @param check 承認できるかの判定
 * @param kinds 出す種類
 * @returns 印の範囲
 */
function marksOf(check: PublishCheck, kinds: ReadonlySet<MarkKind>): Mark[] {
  return [
    ...(kinds.has("ng")
      ? check.ngWords.flatMap((hit) =>
          hit.ranges.map(([start, end]) => ({ start, end, kind: "ng" as const })),
        )
      : []),
    ...(kinds.has("policy")
      ? check.policyCautions.flatMap((hit) =>
          hit.ranges.map(([start, end]) => ({ start, end, kind: "policy" as const })),
        )
      : []),
  ];
}

/**
 * 本文を、当たった所に印を付けて描く（重なるときは NG ワードを先にする。色だけでなく下線と読み上げの名前でも分ける）。
 * @param props 本文（body）と印の範囲（marks）
 * @returns 本文の要素
 */
function HighlightedBody({ body, marks }: { body: string; marks: Mark[] }) {
  if (marks.length === 0) return <>{body}</>;
  const kinds: (MarkKind | null)[] = Array.from({ length: body.length }, () => null);
  for (const mark of [...marks].sort(
    (a, b) => (a.kind === "ng" ? 1 : 0) - (b.kind === "ng" ? 1 : 0),
  )) {
    for (let i = mark.start; i < mark.end && i < body.length; i += 1) kinds[i] = mark.kind;
  }
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let i = 1; i <= body.length; i += 1) {
    if (i < body.length && kinds[i] === kinds[from]) continue;
    const text = body.slice(from, i);
    const kind = kinds[from];
    parts.push(
      kind === "ng" ? (
        <mark
          key={from}
          className="bg-surface text-danger-text underline decoration-danger decoration-2"
        >
          {text}
          <span className="sr-only">（NGワード）</span>
        </mark>
      ) : kind === "policy" ? (
        <mark key={from} className="bg-warning text-text underline">
          {text}
          <span className="sr-only">（規約に注意）</span>
        </mark>
      ) : (
        text
      ),
    );
    from = i;
  }
  return <>{parts}</>;
}

/** SimilarityLabel が受け取るもの。 */
type SimilarityLabelProps = {
  /** 似ている度合い（比べない短い本文は undefined） */
  result: SimilarityResult | undefined;
  /** ID から比べる相手を引く */
  find: (id: string) => CompareTarget | undefined;
  /** 似ている案へ移る */
  onJump: (target: CompareTarget) => void;
};

/**
 * 似ている度合いと、押すと開く似ている案（めぐるの SimilarityLabel）。80％以上は文でも「似ている案があります」と添える。
 * @param props 似ている度合い・相手の引き方・移る
 * @returns 要素（比べない本文では何も出さない）
 */
function SimilarityLabel({ result, find, onJump }: SimilarityLabelProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!result) return null;
  const high = result.score >= SIMILARITY_THRESHOLD;
  const matches = result.matches
    .map((match) => ({ ...match, target: find(match.id) }))
    .filter((match): match is typeof match & { target: CompareTarget } => !!match.target)
    .slice(0, 3);
  const label = `似ている度合い ${result.score}％${high ? "・似ている案があります" : ""}`;
  return (
    <div className="flex flex-col gap-x3s">
      {matches.length > 0 ? (
        <Button
          variant="text"
          size="small"
          aria-expanded={open}
          aria-controls={panelId}
          className={high ? "self-start text-danger-text" : "self-start"}
          onClick={() => setOpen((current) => !current)}
        >
          {label}
        </Button>
      ) : (
        <span className="text-s text-text-sub">{label}</span>
      )}
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="似ている案"
          className="flex flex-col gap-x3s rounded-sm border border-border bg-surface-sunken p-xxs"
        >
          <ul className="flex flex-col gap-x3s">
            {matches.map((match) => (
              <li key={match.id}>
                <Button
                  variant="text"
                  size="small"
                  className="min-h-l w-full flex-col items-start gap-x3s p-x3s text-left font-normal whitespace-normal"
                  onClick={() => onJump(match.target)}
                >
                  <span className="text-text-sub">
                    {match.score}％・{DRAFT_STATUS_LABELS[match.target.status]}（押すと移ります）
                  </span>
                  <span className="line-clamp-3 break-words whitespace-pre-wrap">
                    {match.target.body}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** 開く枠（カードから開くもの）。 */
export type CardDialog =
  | { kind: "edit"; draft: PostDraft }
  | { kind: "reject"; drafts: PostDraft[] }
  | { kind: "delete"; drafts: PostDraft[] };

/** DraftCard が受け取るもの。 */
export type DraftCardProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 案 */
  draft: PostDraft;
  /** 承認できるかの判定（返信の文も合わせたもの） */
  check: PublishCheck;
  /** 時間差のメンションの設定（threads-007。読めていなければ undefined） */
  mentionSettings: MentionSettings | undefined;
  /** NG ワード */
  ngWords: readonly NgWord[];
  /** 似ている度合い（承認待ちだけ。出さないときは undefined） */
  similarity: SimilarityResult | undefined;
  /** ID から比べる相手を引く */
  findTarget: (id: string) => CompareTarget | undefined;
  /** 似ている案へ移る */
  onJump: (target: CompareTarget) => void;
  /** 移ってきた案として目立たせるか */
  highlighted: boolean;
  /** 選んでいるか（選べない状態なら undefined） */
  selected: boolean | undefined;
  /** 選ぶ・外す */
  onSelect: (selected: boolean) => void;
  /** 操作中か */
  pending: boolean;
  /** このカードの結果 */
  result: CardResult | undefined;
  /** 投稿の予定の時刻（承認済みで、予定があるときだけ） */
  scheduledAt: string | undefined;
  /** 承認する・承認待ちに戻す */
  onReview: (action: "approve" | "reopen") => void;
  /** 「次に投稿する」を付ける・外す */
  onPriority: (prioritized: boolean) => void;
  /** 枠を開く */
  onOpen: (dialog: CardDialog) => void;
};

/**
 * 案のカードの、案の DOM の ID（似ている案へ移るときに使う）。
 * @param draftId 案の ID
 * @returns DOM の ID
 */
export function draftCardId(draftId: string): string {
  return `threads-draft-card-${draftId}`;
}

/**
 * 案の1枚。
 * @param props 案・判定・似ている度合い・選択・操作
 * @returns カードの要素
 */
export function DraftCard({
  accountId,
  draft,
  check,
  mentionSettings,
  ngWords,
  similarity,
  findTarget,
  onJump,
  highlighted,
  selected,
  onSelect,
  pending,
  result,
  scheduledAt,
  onReview,
  onPriority,
  onOpen,
}: DraftCardProps) {
  // 担当の人は、承認を任されていなければ承認・却下・戻す・却下の案を消すを出さない（threads-013。判定の正は API）
  const can = useThreadsCan();
  const length = threadsLength(draft.body);
  const headingId = `threads-draft-${draft.id}`;
  // NG ワードは承認待ちだけ（承認済みは NG ワードを足すと承認待ちに戻るので残らない）。規約に注意は却下のほか
  const showNg = draft.status === "needs_review" && check.ngWords.length > 0;
  const showPolicy = draft.status !== "rejected" && check.policyCautions.length > 0;
  const kinds = new Set<MarkKind>([
    ...(showNg ? ["ng" as const] : []),
    ...(showPolicy ? ["policy" as const] : []),
  ]);
  const marks = marksOf(check, kinds);
  const reviewedLabel =
    draft.status === "rejected"
      ? "却下"
      : draft.reviewedAt && draft.status !== "needs_review"
        ? "承認"
        : null;
  return (
    <li
      id={draftCardId(draft.id)}
      tabIndex={-1}
      aria-labelledby={headingId}
      className={
        highlighted
          ? "flex flex-col gap-xs rounded-md border-2 border-primary bg-surface p-xs"
          : "flex flex-col gap-xs rounded-md border border-border bg-surface p-xs"
      }
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
        {showNg ? (
          <Badge variant="danger">
            NGワード：{check.ngWords.map((hit) => hit.word).join("、")}
          </Badge>
        ) : null}
        {check.overThreadsLimit && draft.status === "needs_review" ? (
          <Badge variant="danger">Threads の上限を超えています</Badge>
        ) : null}
        {draft.status === "publishing" ? <Badge>投稿中</Badge> : null}
        {draft.carryover ? <Badge>前の時刻から持ち越し</Badge> : null}
        {draft.prioritizedAt ? <Badge variant="success">次に投稿する</Badge> : null}
        {scheduledAt ? (
          <span className="text-s text-text-sub">投稿の予定：{jstDateTime(scheduledAt)}</span>
        ) : null}
      </div>
      <p className="flex flex-wrap gap-x-xxs text-s text-text-sub">
        <span>ためた：{jstDateTime(draft.createdAt)}</span>
        {reviewedLabel && draft.reviewedAt ? (
          <span>
            {reviewedLabel}：{jstDateTime(draft.reviewedAt)}
          </span>
        ) : null}
        {draft.editedAt ? <span>直した：{jstDateTime(draft.editedAt)}</span> : null}
        {draft.createdByName ? <span>作った人：{draft.createdByName}</span> : null}
        {draft.updatedByName && draft.updatedByName !== draft.createdByName ? (
          <span>最後に直した人：{draft.updatedByName}</span>
        ) : null}
        {draft.publishedAt ? <span>投稿：{jstDateTime(draft.publishedAt)}</span> : null}
      </p>
      {draft.status === "needs_review" ? (
        <SimilarityLabel result={similarity} find={findTarget} onJump={onJump} />
      ) : null}
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
          承認し直すと、投稿の順の先頭に戻ります。
        </p>
      ) : null}
      <p className="text-m break-words whitespace-pre-wrap">
        <HighlightedBody body={draft.body} marks={marks} />
      </p>
      {showPolicy ? (
        <ul className="flex flex-col gap-x3s text-s text-text-sub">
          {check.policyCautions.map((caution) => (
            <li key={caution.id}>
              規約に注意：{caution.label}（{caution.suggestion}）{" "}
              <a
                href={caution.policyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-link underline"
              >
                {caution.policyName}を開く（新しいタブ）
              </a>
            </li>
          ))}
          {draft.status === "approved" ? (
            <li>規約に注意の表現があります。承認待ちに戻して確かめることをおすすめします。</li>
          ) : null}
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
      {mentionSettings && can.review ? (
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
              {can.review ? (
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
                </>
              ) : null}
              {can.writeContent ? (
                <Button size="small" onClick={() => onOpen({ kind: "edit", draft })}>
                  直す
                </Button>
              ) : null}
            </>
          ) : null}
          {draft.status === "approved" ? (
            <>
              {can.review ? (
                <Button
                  size="small"
                  aria-disabled={pending || undefined}
                  onClick={() => onPriority(draft.prioritizedAt === null)}
                >
                  {draft.prioritizedAt ? "「次に投稿する」を外す" : "次に投稿する"}
                </Button>
              ) : null}
              {can.writeContent ? (
                <Button size="small" onClick={() => onOpen({ kind: "edit", draft })}>
                  直す
                </Button>
              ) : null}
              {can.review ? (
                <>
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
            </>
          ) : null}
          {draft.status === "publish_failed" && can.review ? (
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
          {draft.status === "rejected" && can.review ? (
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
          {(draft.status === "needs_review" && can.writeContent) ||
          (draft.status === "rejected" && can.review) ? (
            <Button
              variant="text"
              size="small"
              onClick={() => onOpen({ kind: "delete", drafts: [draft] })}
            >
              消す
            </Button>
          ) : null}
        </div>
        {!check.approvable && draft.status === "needs_review" && can.review ? (
          <p className="text-s text-text-sub">
            NGワードを含むか Threads の上限を超えるので、直してから承認してください。
          </p>
        ) : null}
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </li>
  );
}
