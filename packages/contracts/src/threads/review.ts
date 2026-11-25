// 承認・却下の判定と却下理由（specs/004-review-approval research.md R10・R14）。
// checkPublishable は承認のチェック（API）・ラベル（Web）・配信の直前のチェック（005）で同じものを使う。
import { findNgWords, type NgWordForMatch, type NgWordHit } from "./ng-words.ts";
import { findPolicyCautions } from "./policy.ts";
import { isOverThreadsLimit } from "./threads-text.ts";

/** 却下理由の候補（コードと表示名）。コードをDBに保存し、表示とプロンプトでは表示名にする。 */
export const REJECT_REASONS = [
  { code: "similar", label: "似た投稿がある" },
  { code: "tone", label: "トーンが違う" },
  { code: "thin", label: "内容が薄い" },
  { code: "inaccurate", label: "事実と違う" },
  { code: "too_promotional", label: "宣伝っぽすぎる" },
  { code: "policy", label: "規約に触れそう" },
] as const;

/** 却下理由の候補のコード。 */
export type RejectReasonCode = (typeof REJECT_REASONS)[number]["code"];

/** 却下理由の候補のコードの一覧。 */
export const REJECT_REASON_CODES = REJECT_REASONS.map((r) => r.code) as [
  RejectReasonCode,
  ...RejectReasonCode[],
];

/**
 * 却下理由の候補のコードを表示名にする。
 * @param code - 候補のコード（知らないコードも受ける）
 * @returns 表示名（知らないコードはそのまま）
 */
export function rejectReasonLabel(code: string): string {
  // DBの制約で候補のコードだけが入るが、知らないコードでもプロンプトの生成を止めない
  return REJECT_REASONS.find((r) => r.code === code)?.label ?? code;
}

/** 「規約に注意」の照合の結果（FR-039）。ranges は元の本文の [開始, 終了)。 */
export type PolicyCautionHit = {
  id: string;
  label: string;
  policyName: string;
  policyUrl: string;
  suggestion: string;
  ranges: [number, number][];
};

/** 配信できるかの判定の結果。 */
export type PublishCheck = {
  ngWords: NgWordHit[];
  overThreadsLimit: boolean;
  policyCautions: PolicyCautionHit[];
  /** 承認できるか（NGワードなし、かつThreadsの上限内）。規約に注意は確認が要るだけで、承認は止めない */
  approvable: boolean;
};

/**
 * 下書きを承認・配信できるかを判定する（FR-005・FR-018）。
 * @param body - 下書きの本文
 * @param ngWords - そのAccountのNGワード
 * @returns 判定の結果
 */
export function checkPublishable(body: string, ngWords: NgWordForMatch[]): PublishCheck {
  const ng = findNgWords(body, ngWords);
  const overThreadsLimit = isOverThreadsLimit(body);
  return {
    ngWords: ng,
    overThreadsLimit,
    policyCautions: findPolicyCautions(body),
    approvable: ng.length === 0 && !overThreadsLimit,
  };
}

/**
 * 案の本文と時間差のメンションの返信の文の判定を1つにする（どちらかに当たれば当たり。threads-011）。
 * 承認のとき、返信の文も案と一緒に承認するため（API の承認の確かめと画面の判定で同じものを使う）。
 * @param body - 本文の判定
 * @param reply - 返信の文の判定（なければ null）
 * @returns まとめた判定
 */
export function mergeChecks(body: PublishCheck, reply: PublishCheck | null): PublishCheck {
  if (!reply) return body;
  return {
    ngWords: [...body.ngWords, ...reply.ngWords],
    overThreadsLimit: body.overThreadsLimit || reply.overThreadsLimit,
    policyCautions: [...body.policyCautions, ...reply.policyCautions],
    approvable: body.approvable && reply.approvable,
  };
}

// ---- まとめての承認・却下で飛ばした理由（threads-011。めぐるの SkipReason を写した）----

/** 状態を変えなかった理由。 */
export const REVIEW_SKIP_REASONS = [
  "NOT_FOUND",
  "STALE",
  "PUBLISHING",
  "NG_WORD",
  "OVER_THREADS_LIMIT",
  "POLICY_CONFIRM_REQUIRED",
  "LIMIT",
] as const;

/** 状態を変えなかった理由の型。 */
export type ReviewSkipReason = (typeof REVIEW_SKIP_REASONS)[number];

/** まとめての操作で飛ばした理由の短い名前（「NGワード 1件・Threads の上限 2件」に使う）。 */
export const REVIEW_SKIP_LABELS: Record<ReviewSkipReason, string> = {
  NOT_FOUND: "消えていた",
  STALE: "ほかの画面で変わった",
  PUBLISHING: "投稿中",
  NG_WORD: "NGワード",
  OVER_THREADS_LIMIT: "Threads の上限",
  POLICY_CONFIRM_REQUIRED: "規約の確かめがない",
  LIMIT: "件数の上限",
};

/**
 * 1件の操作で状態を変えられなかったときの文（何が起きたか・どうすればよいか）。
 * @param reason - 変えなかった理由
 * @param action - 操作
 * @param limits - 件数の上限（承認済み・承認待ち）
 * @param limits.approved - 承認済みの上限
 * @param limits.needsReview - 承認待ちの上限
 * @returns 文
 */
export function reviewSkipMessage(
  reason: ReviewSkipReason,
  action: "approve" | "reject" | "reopen",
  limits: { approved: number; needsReview: number },
): string {
  switch (reason) {
    case "NG_WORD":
      return "NGワードを含むため、承認できませんでした。本文を直してください。";
    case "OVER_THREADS_LIMIT":
      return "Threads の上限（500文字・リンク5つ）を超えるため、承認できませんでした。本文を直してください。";
    case "POLICY_CONFIRM_REQUIRED":
      return "規約に注意の表現があります。内容を確かめてから承認してください。";
    case "STALE":
      return "ほかの画面で先に変わっていました。読みこみ直したので、もう一度確かめてください。";
    case "NOT_FOUND":
      return "この案は、もう消えています。";
    case "PUBLISHING":
      return "Threads に投稿している途中です。数分待ってから、もう一度お試しください。";
    case "LIMIT":
      return action === "reopen"
        ? `承認待ちの案が上限（${limits.needsReview}件）に達しています。承認か却下をしてから戻してください。`
        : `承認済みの案が上限（${limits.approved}件）に達しています。投稿されるのを待つか、承認待ちに戻してから承認してください。`;
  }
}

/**
 * まとめての操作の結果の文。飛ばしたものがあれば、理由ごとの件数を添える（例：3件を承認しました。2件は承認できませんでした（NGワード 1件・件数の上限 1件））。
 * @param doneLabel - 変えた件数の文（例：「3件を承認しました」）
 * @param verb - できなかったことの言い方（例：「承認」）
 * @param skipped - 飛ばした理由
 * @returns 文
 */
export function reviewSummary(
  doneLabel: string,
  verb: string,
  skipped: readonly { reason: ReviewSkipReason }[],
): string {
  if (skipped.length === 0) return `${doneLabel}。`;
  const counts = new Map<ReviewSkipReason, number>();
  for (const item of skipped) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  const detail = [...counts]
    .map(([reason, count]) => `${REVIEW_SKIP_LABELS[reason]} ${count}件`)
    .join("・");
  return `${doneLabel}。${skipped.length}件は${verb}できませんでした（${detail}）。`;
}
