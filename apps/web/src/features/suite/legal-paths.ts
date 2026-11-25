// 利用規約とプライバシーポリシーの道と題（suite-002）。本文（legal-content.ts）を読まずにリンクだけを出せるよう、ここに分ける。
// suite の道の形（SUITE_ROUTE_PATTERNS）と、ほかの領域が使うリンク（LegalLink）がここを読む。

/** 文書の種類（道と、もう一方へのリンクの印）。 */
export type LegalDocumentKey = "terms" | "privacy";

/** 文書の道（ログインなしで開ける）。 */
export const LEGAL_PATHS = {
  /** 利用規約 */
  terms: "/terms",
  /** プライバシーポリシー */
  privacy: "/privacy",
} as const satisfies Record<LegalDocumentKey, string>;

/** 文書の題（ページの h1 とリンクの名前）。 */
export const LEGAL_TITLES = {
  /** 利用規約 */
  terms: "利用規約",
  /** プライバシーポリシー */
  privacy: "プライバシーポリシー",
} as const satisfies Record<LegalDocumentKey, string>;
