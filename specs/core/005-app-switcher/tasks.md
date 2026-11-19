# Tasks: アプリの切り替え・アプリの台帳・スイート全体の設定（core-005）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)

## Phase 1: 構想と仕様

- [x] T001 PRD（`_bmad-output/prd-kanaeru-suite/prd-kanaeru-suite.md`。Constitution IV）
- [x] T002 この仕様（spec・plan・tasks）

## Phase 2: アプリの一覧と suite（API）

- [x] T003 [P] `packages/contracts/src/core/apps.test.ts` を書き、`app-definition.ts`・`apps.list.ts`・`apps.ts` を作る。`.gitattributes` と並行開発の決まり 3-1 に `apps.list.ts` を足す
- [x] T004 [P] `packages/contracts/src/suite/`（公開の状態と窓口の形）とそのテスト
- [x] T005 `modules/suite/schema.ts` → `pnpm db:generate --name suite` → SQL を読み、受付アプリ＝公開の行を足す（`0008_suite.sql`）
- [x] T006 `modules/suite/`（repository・visibility・routes・index）と `modules.list.ts` の1行。`suite.test.ts`（見えるアプリ・台帳・requireApp・初めの行）
- [x] T007 `app.ts`：一覧の確かめと `requireApp` の自動の付け方。`apps/api/test/apps-registry.test.ts`
- [x] T008 account：`DELETE /api/v1/accounts/me`（409 の読みかえ）・`findSessionViewer`。結合のテスト

## Phase 3: 画面

- [x] T009 [P] `packages/ui`：メニュー・下から出す枠・チップの `labelHidden`（とテスト）
- [x] T010 [P] `lib/apps.ts`・`lib/settings.ts`・`lib/icon.tsx` とテスト
- [x] T011 `features/suite`（すべてのアプリ・設定の一覧・アカウント・台帳）と `features.list.ts` の1行。account の `signOut`・`withdrawAccount`・`useKnownAccount`
- [x] T012 `router.tsx`（今のアプリ・ナビの絞りこみ・設定のナビ・はじめの画面）と `router.test.tsx`
- [x] T013 `shell/AppSwitcher.tsx`・`AppShell.tsx` と `AppShell.test.tsx`

## Phase 4: E2E と文書

- [x] T014 `apps/api/test/e2e-server.ts`（見本のアプリ）と `e2e/tests/suite.spec.ts`（両方の幅・axe・CSP）
- [x] T015 文書：`docs/architecture.md`・`docs/apps/suite.md`・`docs/apps/account.md`・`docs/README.md`・`docs/rules/specs.md`・`docs/rules/coding.md`・`docs/rules/parallel-development.md`・`CLAUDE.md`・`docs/decisions.md`・構成の決めごと（AD-3・AD-15・AD-16 の仮決め）
- [x] T016 `pnpm check`
- [ ] T017 主催者が仮決めを確かめる（spec の Clarifications）
