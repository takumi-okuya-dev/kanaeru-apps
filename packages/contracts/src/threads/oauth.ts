// アプリの Meta のアプリでの接続（OAuth）と Meta のデータの削除（threads-010）の窓口の形と文言。
import { z } from "zod";

/** OAuth の接続が使えるか（機能の印 threads.oauth・Meta のアプリ・鍵の設定がそろっているか）。 */
export const OauthAvailability = z.object({ available: z.boolean() });

/** OAuth の接続を始めた結果（この URL へ移る）。 */
export const OauthStartResult = z.object({ authorizeUrl: z.string() });

/** OAuth の接続の完了の入力（Threads から戻った画面が送る）。 */
export const OauthCompleteInput = z.object({
  state: z.string().min(1).max(200),
  code: z.string().min(1).max(2000).optional(),
  error: z.string().max(200).optional(),
});

/** OAuth の接続の完了の入力の型。 */
export type OauthCompleteInput = z.infer<typeof OauthCompleteInput>;

/** OAuth の接続の完了の結果（画面が移る先。アプリの中の道）。 */
export const OauthCompleteResult = z.object({ redirectTo: z.string() });

/** データの削除の状況。 */
export const DataDeletionStatus = z.object({
  status: z.enum(["pending", "completed", "failed"]),
  receivedAt: z.string(),
  completedAt: z.string().nullable(),
});

/** データの削除の状況の型。 */
export type DataDeletionStatus = z.infer<typeof DataDeletionStatus>;

/** データの削除の状況の見える名前。 */
export const DATA_DELETION_STATUS_LABELS: Record<DataDeletionStatus["status"], string> = {
  pending: "受け付けました（削除の途中です）",
  completed: "削除しました",
  failed: "削除の途中です（自動でやり直しています）",
};

/** OAuth の接続の結果（設定の画面の問い合わせ oauth=）の文。 */
export const OAUTH_RESULT_MESSAGES: Record<
  string,
  { tone: "success" | "danger"; message: string }
> = {
  connect: { tone: "success", message: "Meta のアプリで Threads につなぎました。" },
  reconnect: { tone: "success", message: "Meta のアプリで Threads につなぎ直しました。" },
  cancelled: {
    tone: "danger",
    message: "Threads の画面で許可されなかったため、つないでいません。",
  },
  failed: {
    tone: "danger",
    message: "Threads からトークンを受け取れませんでした。少し待ってから、もう一度お試しください。",
  },
  not_found: { tone: "danger", message: "つなごうとしたアカウントが見つかりません。" },
};
