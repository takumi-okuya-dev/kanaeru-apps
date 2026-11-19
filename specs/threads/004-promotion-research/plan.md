# Implementation Plan: 宣伝とリサーチ（threads-004）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `strategy/promotion-routes.ts`・`research-routes.ts`・`item-service.ts`（Hono の `.get` など・チームの権限・操作の記録） | `modules/threads/research.ts`（読み書き）・`routes-research.ts`（`createRoute`。持ち主だけ） |
| `promotion_settings`（割合の版） | `threads_account.promotion_ratio_percent`（版なし） |
| `packages/shared/src/promotions.ts` | `packages/contracts/src/threads/promotions.ts`（テストも写した） |
| `metrics/prompt-service.ts` の宣伝・参考の投稿 | `research.ts` の `listPromptPromotions`・`listPromptReferencePosts` を `routes.ts` のプロンプトの窓口で使う |
| 戦略の画面の「宣伝」「リサーチ」のタブ | `ResearchPage.tsx`（1つの画面に節を並べる） |

## 作ったもの

- 約束：`research-schemas.ts`・`promotions.ts`（`research.ts`・`promotion-event.ts` を入口から出した）・`errors.ts`（`THREADS_ITEM_LIMIT`・`THREADS_KEYWORD_DUPLICATE`）
- 表：`threads_promotion`・`threads_reference_post`・`threads_research_keyword`・`threads_account.promotion_ratio_percent`（`apps/api/drizzle/0011_threads_research.sql`。足すだけ）
- API：`research.ts`・`routes-research.ts`、`routes.ts`・`index.ts` を直した
- 画面：`ResearchPage.tsx`、`api.ts`・`queries.ts`・`paths.ts`・`routes.ts`・`index.ts`・`nav-items.ts`・`CreatePage.tsx`（要約に宣伝・参考の投稿・低調の数）を直した
- テスト：`research.test.ts`・`promotions.test.ts`・`nav-items.test.tsx`・`e2e/tests/threads.spec.ts`

## PR の分け方

1. DB の変更の PR：`schema.ts` と `0011_threads_research.sql`
2. 機能の PR：ほか全部（共通の変更はない）
