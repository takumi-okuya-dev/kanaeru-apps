# Implementation Plan: 投稿の案・案を作るをめぐるにそろえる（threads-011）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `drafts/review-service.ts` の `reviewDrafts`（飛ばす理由・requestId・上限・requeue） | `modules/threads/drafts.ts` の `reviewDrafts`（kanaeru の操作の幅のまま。投稿に失敗の承認を requeue にする） |
| `drafts/draft-service.ts` の `updateDraft`・`deleteDrafts`・`deleteBatch`・`listPublishedPage`・`listDraftRows` の並び | `drafts.ts` の `editDraft`・`deleteDraftsLocked`・`undoBatch`・`listPublishedPage`、`repository.ts` の `listDrafts`・`deleteDrafts`・`listCompareBodies` |
| `drafts/posting-rules-service.ts` の `addNgWords` | `drafts.ts` の `addNgWords` |
| `post-draft-routes.ts` の `DELETE draft-batches/:batchId`・`POST post-drafts/delete`・`GET post-drafts/published` | `routes.ts` の `DELETE …/draft-batches/{batchId}`・`POST …/drafts/delete`・`GET …/drafts?status=published&before=` |
| `mention/mention-service.ts` の `attachMentionsBulk` | `mention.ts` の `attachMentionsBulk`・`routes-mention.ts` の `POST …/drafts/mentions` |
| `publish/publish-executor.ts` の `markFailed`（メンションを post_failed に） | `publish-executor.ts` の `markFailed` |
| `packages/shared` の `SkipReason`・`mergeChecks` と画面の文言 | `packages/contracts/src/threads/review.ts`（`REVIEW_SKIP_REASONS`・`reviewSkipMessage`・`reviewSummary`・`mergeChecks`）・`ng-words.ts`（`splitNgWords`）・`schemas.ts` |
| `pages/stock.tsx`・`components/stock/*` | `StockPage.tsx`・`DraftCard.tsx`（カード・似ている度合い・本文の印）・`DraftDialogs.tsx`（直す・却下）・`review-send.ts`（分けて送る・結果の文） |
| `PasteComposer`・`PromptMaterials`・`LengthSettings` | `CreatePage.tsx` |
| `NgWordsDialog` | `SettingsPage.tsx` の NG ワードの節 |

## 作ったもの

- 約束：`schemas.ts`（`ReviewInput` に `requestId`・`confirmPolicyCaution`、`ReviewResult` に `skipped`・`counts`、`PostDraft.editedAt`、`DraftList` の `compareWith.status`・`nextCursor`、`DraftListQuery.before`、`DraftBatchResult` の `draftCount`・`overLimitCount`、`NgWordsInput`・`NgWordsResult`〈前の `NgWordInput` を置きかえ〉、`DraftDeleteInput`・`DeletedCount`、`MentionBulkInput`・`MentionBulkResult`）・`review.ts`・`ng-words.ts`・`activity.ts`（操作4つ）
- 表：`apps/api/drizzle/0010_threads_stock_parity.sql`（列を2つ足すだけ）
- API：`drafts.ts`（新しい）、`routes.ts`・`repository.ts`・`views.ts`・`mention.ts`・`routes-mention.ts`・`publish-executor.ts`・`route-helpers.ts`（NG ワードの記録は道の中で数と語を書く）
- 画面：`DraftCard.tsx`・`DraftDialogs.tsx`・`review-send.ts`（新しい）、`StockPage.tsx`・`CreatePage.tsx`・`SettingsPage.tsx`・`api.ts`・`queries.ts`（投稿済みは `useInfiniteQuery`）・`routes.ts`（`?tab=`）・`paths.ts`（`STOCK_TABS`。道は約束〈zod〉を読まないため）・`nav-items.ts`（承認待ちの数）
- テスト：`apps/api/src/modules/threads/stock.test.ts`（新しい）・`threads.test.ts`・`mention.test.ts`（まとめて付ける・投稿に失敗）・`autopost.test.ts`・`research.test.ts`、`packages/contracts/src/threads/review.test.ts`・`ng-words.test.ts`、`apps/web/src/features/threads/review-send.test.ts`・`nav-items.test.tsx`、`e2e/tests/threads.spec.ts`

## 共通のファイル

直していない（領域のフォルダと、DB の変更のファイルだけ）。

## PR の分け方

1. DB の変更の PR：`schema.ts` と `0010_threads_stock_parity.sql`
2. 機能の PR：ほか全部
