# Implementation Plan: ホーム・切り替え・接続・戦略・リサーチ・宣伝・反応・設定をめぐるにそろえる（threads-012）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `pages/research.tsx`・`components/research/`（`ReferencePostFields`・`ReferencePostAddDialog`・`ReferencePostFormDialog`・`ExplainOne`・`ExplainBatchPanel`・`KeywordFormDialog`）・`components/guides/ResearchGuide.tsx` | `ReferenceSection.tsx`・`ReferencePostFields.tsx`・`ReferencePostDialogs.tsx`・`reference-post-form.ts`・`ExplainBatchPanel.tsx`・`KeywordsSection.tsx`・`KeywordDialog.tsx`・`ResearchGuide.tsx`（`ResearchPage.tsx` は節を並べるだけにした） |
| API の参考の投稿・キーワードを直す | `research.ts`・`routes-research.ts` の `PUT …/reference-posts/{itemId}`・`PUT …/research-keywords/{itemId}` |
| `pages/account-home.tsx`・`components/guides/IntroGuide.tsx`・`components/NotConnectedNotice.tsx`・`pages/home.tsx` の振り分け | `HomePage.tsx`・`LandingPage.tsx`・約束の `home.ts`（`AccountHome`・`homeNextStep`）・API の `home.ts`・`routes-home.ts`（`GET …/home`・`POST …/open`） |
| `components/sidebar/AccountSwitcher.tsx` | `AccountSwitcher.tsx`（`ThreadsPage.tsx` の題の上）。約束の `ThreadsAccount` に `connectionStatus`・`username`・`displayName`・`profilePictureUrl`・`lastOpenedAt` |
| `accounts/account-service.ts` の `openAccount`・`deleteAccount`（名前の確かめ） | `home.ts` の `openAccount`・`repository.ts` の `markAccountOpened`・`routes.ts` の `DELETE …/accounts/{accountId}`（`ThreadsAccountDeleteInput`・`confirmNameMatches`） |
| `components/connect/TokenConnectForm.tsx`・`ThreadsAccountGuide.tsx`・`AccountSwitchSteps.tsx`・`ConnectMethods.tsx`・`pages/guide-threads-token.tsx` | `TokenConnectForm.tsx`・`ConnectGuide.tsx`・`connect-guide.ts`・`TokenGuidePage.tsx`（`/threads/guide/threads-token`）・`OauthConnect.tsx`・`OauthCompletePage.tsx` |
| `connection/token-connect.ts` の名前だけが同じときの読み直し・`username-match.ts` | `username-match.ts`・`connection.ts`（`THREADS_ACCOUNT_REGISTERED`） |
| `connection-service.ts` の確定の前の確かめ・`revocation.ts` | `oauth.ts`（`assertOauthAllowed`・連携の解除の記録・`cleanupRevocations`・`cleanupDeletionIdentifiers`）・表 `threads_revocation` |
| `token-refresh.ts` | `connection.ts` の `refreshExpiringTokens`（接続し直しが要るものも） |
| `threads-check-service.ts`・`components/settings/PostingScheduleSection.tsx`・`PostingRulesSection.tsx`・`PolicyInfoDialog.tsx` | `routes-autopost.ts` の `POST …/threads-check`・`PublishCheck.tsx`・`PolicyInfoDialog.tsx`・約束の `THREADS_CHECK_MESSAGES`・`policy.ts` |
| `pages/strategy.tsx`・`components/strategy/SectionChips.tsx`・`ProgressCard.tsx` | `StrategyPage.tsx`・`StrategyGuide.tsx`・`StrategyProgress.tsx`・約束の `strategy-guidance.ts`・`strategy-prompts.ts` |
| `components/promotions/PromotionFormDialog.tsx`・`pages/promotions.tsx` | `PromotionsSection.tsx`・約束の `promotion-event.ts`・`research-schemas.ts` |
| `packages/shared/src/csv.ts`・`drafts/draft-service.ts` の材料の版・`metrics/performance-service.ts` の続き・`strategy/materials.ts` | 約束の `performance-csv.ts`・API の `performance.ts`・`materials.ts`・`drafts.ts`（ためたときに版を写す）・`PerformancePage.tsx` |
| `components/analysis/ClassifyDialog.tsx`・`RecommendedCard.tsx`・`ScheduleHint.tsx` | `AnalysisPage.tsx` |
| `components/external-media/FieldCard.tsx`・`pages/external-media-listing.tsx` | `ListingPage.tsx`・約束の `media*.ts` |

## 表

`apps/api/drizzle/0011_threads_screens_parity.sql`（表を1つ・列を足すだけ。どれも空を許す。中身は spec の Clarifications の最後）。

## 共通のファイル

この仕様では直していない（領域のフォルダと、DB の変更のファイルだけ）。threads-011 の前に入れた本文の幅（`AppShell.tsx` の中央寄せ・`tokens.css` の `--container-content`）は、別の小さな共通の PR にする。
要る共通の変更（作っていない）：画面の CSP の `img-src` に Threads のプロフィールの画像の源を足す・利用規約の画面。

## テスト

- 結合：`home.test.ts`（ホーム・開いた記録・プロフィールの読み直し）・`connect-guidance.test.ts`（自分の別の運用アカウント・名前だけが同じときの読み直し）・`promotions.test.ts`（イベントの情報・状態の変更・上限）・`research.test.ts`（直す・版）・`oauth.test.ts`（連携の解除・データの削除の要求での拒否・片付け）・`autopost.test.ts`（投稿できるかの確かめ・接続し直しからの延長）・`metrics.test.ts`（CSV の列・材料の版・続き）・`threads.test.ts`（名前を入れて消す）
- 単体：約束の `home.test.ts`・`performance-csv.test.ts`・`account-settings.test.ts`・`strategy.test.ts`・`media.test.ts`、画面の `connect-guide.test.ts`・`landing.test.ts`・`reference-post-form.test.ts`・`StrategyProgress.test.tsx`・`nav-items.test.tsx`
- 通し：`e2e/tests/threads-home.spec.ts`・`threads-research.spec.ts`・`threads-connect.spec.ts`・`threads-strategy.spec.ts`・`threads-promotions.spec.ts`・`threads-settings.spec.ts`・`threads-analysis-media.spec.ts`

## PR の分け方

1. DB の変更の PR：`schema.ts` と `0011_threads_screens_parity.sql`（threads-011 の `0010` のあと）
2. 機能の PR：ほか全部
