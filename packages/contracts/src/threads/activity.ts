// 操作の記録（threads-005。めぐるの specs/008 の操作の記録を、持ち主1人の運用アカウントに合わせて写した）の形と文言。
// 記録は90日残す（ACTIVITY_LOG_RETENTION_DAYS）。定期の仕事の自動投稿の結果も「自動」として残す。
import { z } from "zod";

/** 日時（時差つきの ISO 8601）。 */
const DateTime = z.iso.datetime({ offset: true });

/** 操作の種類（絞りこみの単位）。 */
export const ACTIVITY_KINDS = ["review", "draft", "content", "settings", "autopost"] as const;

/** 操作の種類の型。 */
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** 操作の種類の見える名前。 */
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  review: "承認・却下",
  draft: "投稿の案",
  content: "戦略・宣伝・リサーチ",
  settings: "設定",
  autopost: "自動投稿",
};

/** 操作（code と見える名前）。 */
export const ACTIVITY_ACTIONS = {
  drafts_approved: "案を承認した",
  drafts_rejected: "案を却下した",
  drafts_reopened: "案を承認待ちに戻した",
  draft_prioritized: "「次に投稿する」を付けた・外した",
  drafts_added: "案をためた",
  draft_edited: "案を直した",
  draft_deleted: "案を消した",
  drafts_deleted: "案をまとめて消した",
  batch_undone: "ためた案を取り消した",
  drafts_requeued: "投稿に失敗した案を投稿の順に入れ直した",
  strategy_saved: "戦略を保存した",
  promotion_saved: "宣伝を保存した",
  promotion_deleted: "宣伝を消した",
  promotion_ratio_saved: "宣伝の割合を保存した",
  reference_posts_added: "参考の投稿を足した",
  reference_posts_explained: "参考の投稿の解説を保存した",
  reference_post_deleted: "参考の投稿を消した",
  keywords_added: "キーワードを足した",
  keyword_deleted: "キーワードを消した",
  feedback_saved: "低調の投稿のメモを保存した",
  analysis_settings_saved: "分析の設定を保存した",
  posts_classified: "投稿の内容を分類した",
  mention_settings_saved: "時間差のメンションの設定を保存した",
  mention_person_added: "メンションする人を足した",
  mention_person_updated: "メンションする人を直した",
  mention_person_removed: "メンションする人を消した",
  mention_attached: "時間差のメンションを付けた",
  mention_detached: "時間差のメンションを外した",
  mentions_attached: "時間差のメンションをまとめて付けた",
  listing_generated: "外部メディアの掲載文を作った",
  listing_saved: "外部メディアの掲載文を保存した",
  media_defaults_saved: "外部メディアの既定値を保存した",
  core_rules_saved: "投稿のルールを保存した",
  ng_word_added: "NGワードを足した",
  ng_word_removed: "NGワードを外した",
  prompt_settings_saved: "プロンプトの設定を保存した",
  account_renamed: "名前を直した",
  threads_connected: "Threads につないだ",
  threads_reconnected: "Threads につなぎ直した",
  threads_disconnected: "Threads への接続を切った",
  schedule_saved: "自動投稿の設定を保存した",
  auto_published: "自動で投稿した",
  auto_publish_failed: "自動の投稿に失敗した",
  organization_placed: "組織に入れた",
  organization_removed: "組織から外した",
  organization_shared: "組織に見せるを切り替えた",
  assignment_added: "担当を付けた",
  assignment_removed: "担当を外した",
  delegation_changed: "承認を任せるを切り替えた",
  account_handed_over: "退会した持ち主から引き継いだ",
} as const;

/** 操作の code。 */
export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

/** 操作の記録の1行。 */
export const ActivityEntry = z.object({
  id: z.guid(),
  kind: z.enum(ACTIVITY_KINDS),
  action: z.string(),
  /** 見える名前（知らない code はそのまま） */
  label: z.string(),
  itemCount: z.number().int(),
  /** 対象の要約（本文の書き出しなど） */
  summary: z.string().nullable(),
  /** した人の表示名（組織に入っている運用アカウントだけ。退会した人は「退会した人」。threads-013） */
  actorName: z.string().nullable().optional(),
  createdAt: DateTime,
});

/** 操作の記録の1行の型。 */
export type ActivityEntry = z.infer<typeof ActivityEntry>;

/** 操作の記録の一覧の問い合わせ。 */
export const ActivityQuery = z.object({
  kind: z.enum(ACTIVITY_KINDS, { error: "種類は、選択肢から選んでください。" }).optional(),
});

/** 操作の記録の一覧（新しい順に最大 ACTIVITY_LIST_MAX 件）。 */
export const ActivityList = z.object({ items: z.array(ActivityEntry) });

/** 操作の記録の一覧で返す件数。 */
export const ACTIVITY_LIST_MAX = 100;
