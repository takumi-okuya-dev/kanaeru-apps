// 承認・却下・承認待ちに戻すを送る（threads-011。めぐるの components/stock/use-review.ts の送り方を写した）。
// - 1回に送れるのは REVIEW_MAX_ITEMS 件まで。それを超える選択は分けて順に送り、結果をまとめる
// - 操作ごとに requestId を作り、通信が切れて結果がわからないときは同じ ID で1回だけ送り直す（API が二重に変えない）
// - 結果の文は「N件を承認しました。M件は承認できませんでした（理由ごとの件数）」。めぐるの「元に戻す」のトーストは持たない（kanaeru は結果をボタンの近くに出す）
import {
  APPROVED_LIMIT,
  NEEDS_REVIEW_LIMIT,
  REVIEW_MAX_ITEMS,
  reviewSkipMessage,
  reviewSummary,
} from "@workspace/contracts/threads";
import type {
  PostDraft,
  RejectReasonCode,
  ReviewInput,
  ReviewResult,
} from "@workspace/contracts/threads";
import { NetworkError } from "../../lib/api.ts";
import { reviewDrafts } from "./api.ts";

/** 操作。 */
export type ReviewAction = ReviewInput["action"];

/** 操作の指定。 */
export type ReviewOptions = {
  /** 却下の理由（却下のとき） */
  reject?: { reasons: RejectReasonCode[]; note: string };
  /** 規約に注意を確かめた（承認のとき） */
  confirmPolicyCaution?: boolean;
};

/** 変えた件数の文。 */
const DONE: Record<ReviewAction, (count: number) => string> = {
  approve: (count) => `${count}件を承認しました`,
  reject: (count) => `${count}件を却下しました`,
  reopen: (count) => `${count}件を承認待ちに戻しました`,
};

/** できなかったことの言い方。 */
const VERB: Record<ReviewAction, string> = {
  approve: "承認",
  reject: "却下",
  reopen: "承認待ちに戻すことが",
};

/**
 * 1回分を送る（結果がわからない失敗は、同じ requestId で1回だけ送り直す）。
 * @param accountId 運用アカウントの ID
 * @param input 入力
 * @returns 結果
 * @throws {Error} 送れなかったとき
 */
async function sendOnce(accountId: string, input: ReviewInput): Promise<ReviewResult> {
  try {
    return await reviewDrafts(accountId, input);
  } catch (error) {
    if (!(error instanceof NetworkError)) throw error;
    return reviewDrafts(accountId, input);
  }
}

/**
 * 案の状態を変える（分けて送り、結果をまとめる）。
 * @param accountId 運用アカウントの ID
 * @param action 操作
 * @param drafts 案
 * @param options 却下の理由・規約に注意の確かめ
 * @returns まとめた結果
 * @throws {Error} 1つ目のまとまりを送れなかったとき（何も変わっていない）
 */
export async function sendReview(
  accountId: string,
  action: ReviewAction,
  drafts: readonly PostDraft[],
  options: ReviewOptions = {},
): Promise<ReviewResult> {
  let merged: ReviewResult | undefined;
  for (let start = 0; start < drafts.length; start += REVIEW_MAX_ITEMS) {
    const chunk = drafts.slice(start, start + REVIEW_MAX_ITEMS);
    const input: ReviewInput = {
      action,
      requestId: crypto.randomUUID(),
      items: chunk.map((draft) => ({ id: draft.id, version: draft.version })),
      ...(action === "reject" && options.reject
        ? {
            reasons: options.reject.reasons,
            ...(options.reject.note ? { note: options.reject.note } : {}),
          }
        : {}),
      ...(action === "approve" && options.confirmPolicyCaution
        ? { confirmPolicyCaution: true }
        : {}),
    };
    let result: ReviewResult;
    try {
      result = await sendOnce(accountId, input);
    } catch (error) {
      // 2つ目からの失敗は、送れた分を返し、残りは「送れなかった」として数える
      if (!merged) throw error;
      return merged;
    }
    merged = merged
      ? {
          drafts: [...merged.drafts, ...result.drafts],
          skipped: [...merged.skipped, ...result.skipped],
          counts: result.counts,
        }
      : result;
  }
  if (!merged) throw new Error("案を選んでください。");
  return merged;
}

/**
 * 結果の文と色（全部できた：success・一部：info・何もできなかった：danger）。
 * @param action 操作
 * @param drafts 送った案
 * @param result 結果
 * @returns 文と色
 */
export function reviewMessage(
  action: ReviewAction,
  drafts: readonly PostDraft[],
  result: ReviewResult,
): { tone: "success" | "danger" | "info"; message: string } {
  const unsent = drafts.length - result.drafts.length - result.skipped.length;
  const first = result.skipped[0];
  if (drafts.length === 1 && first) {
    return {
      tone: "danger",
      message: reviewSkipMessage(first.reason, action, {
        approved: APPROVED_LIMIT,
        needsReview: NEEDS_REVIEW_LIMIT,
      }),
    };
  }
  const base = reviewSummary(DONE[action](result.drafts.length), VERB[action], result.skipped);
  const message =
    unsent > 0 ? `${base}${unsent}件は送れませんでした。読みこみ直して確かめてください。` : base;
  const tone =
    result.skipped.length === 0 && unsent === 0
      ? "success"
      : result.drafts.length === 0
        ? "danger"
        : "info";
  return { tone, message };
}
