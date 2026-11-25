# Implementation Plan: 利用規約とプライバシーポリシーのページ（suite-002）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 置き場所

| 所 | ファイル |
|---|---|
| 本文の正本 | `apps/web/src/features/suite/legal-content.ts`（`TERMS`・`PRIVACY`・`LEGAL_TEXT_IS_DRAFT`・〈 〉を集める `legalPlaceholders`） |
| 道と題 | `apps/web/src/features/suite/legal-paths.ts`（`LEGAL_PATHS`・`LEGAL_TITLES`。本文を読まない） |
| 文の読み方と写し | `apps/web/src/features/suite/legal-text.ts`（`splitLegalText`・`legalToMarkdown`・`syncLegalMarkdown`。React を読まない） |
| 写しを作る手順 | `apps/web/legal-md.ts`（`pnpm exec tsx apps/web/legal-md.ts`。apps/web の tsconfig の `*.ts` に入るので、設定を直さない） |
| 画面 | `apps/web/src/features/suite/LegalPage.tsx`（`TermsPage`・`PrivacyPage`）・`LegalLink.tsx`・`routes.ts`（`termsRoute`・`privacyRoute`。`layout: "bare"`・開いたときに読む）・`index.ts`（道と `LegalLink`） |
| リンク | `features/suite/AccountSettingsPage.tsx`（規約とポリシー）・`features/suite/JoinPage.tsx`・`features/threads/TokenConnectForm.tsx` |
| 予約語 | `packages/contracts/src/core/apps.ts`（`RESERVED_APP_KEYS` に `terms`・`privacy`） |
| 写し | `_bmad-output/legal/terms-draft.md`・`privacy-policy-draft.md`（印より上は手で書く。下は作る） |

## 領域の外の変更

- `packages/contracts/src/core/apps.ts`：予約語に2語（共通。道の頭の取り合いを防ぐのに要る最小の変更）。
- `apps/web/legal-md.ts`：apps/web の直下の手順（設定のファイルは直さない）。

API・DB の変更はない（画面は API が index.html を返すどの道でも開ける）。

## テスト

- 単体：`legal-content.test.ts`（写しと正本・〈 〉の一覧・節の印・文の読み方。node の環境）・`LegalPage.test.tsx`（題と節・帯・印・表を dl で・リンク）・`AccountSettingsPage.test.tsx`・`JoinPage.test.tsx`・`threads/TokenConnectForm.test.tsx`（リンク）。
- 通し：`e2e/tests/legal.spec.ts`（ログインなしで両方・axe・横のスクロール・CSP、設定 › アカウントから、Threads の接続の欄から新しいタブで。Threads は始めに公開・終わりに切）。
