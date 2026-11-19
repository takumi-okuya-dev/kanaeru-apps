# Implementation Plan: 外部メディアの掲載文（threads-008）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `packages/shared/src/media/`（types・common・5つの媒体・index） | `packages/contracts/src/threads/media-types.ts`・`media-common.ts`・`media-kokuchpro.ts`・`media-peatix.ts`・`media-tsunagate.ts`・`media-jmty.ts`・`media-youtrust.ts`・`media.ts` |
| `schemas.ts` の外部媒体展開の形 | `media-schemas.ts`（版 0・日本語の誤り） |
| `threads.promotion_listings`・`media_defaults` | `threads_promotion_listing`・`threads_media_default` |
| `external-media/external-media-service.ts`・`external-media-routes.ts` | `modules/threads/external-media.ts`・`routes-media.ts` |
| 画面の `external-media.tsx`・`external-media-listing.tsx` | `MediaPage.tsx`・`ListingPage.tsx` |

## 作ったもの

- 約束：上の8つと `media-schemas.ts`、`activity.ts`（操作3つ）
- 表：`apps/api/drizzle/0015_threads_media.sql`（足すだけ）
- API：`external-media.ts`・`routes-media.ts`、`route-helpers.ts`・`index.ts`
- 画面：`MediaPage.tsx`・`ListingPage.tsx`、`paths.ts`・`routes.ts`・`index.ts`・`nav-items.ts`・`api.ts`・`queries.ts`
- テスト：`packages/contracts/src/threads/media.test.ts`（めぐるの単体テストを1つにまとめた）・`apps/api/src/modules/threads/media.test.ts`・`e2e/tests/threads.spec.ts`

## PR の分け方

1. DB の変更の PR：`schema.ts` と `0015_threads_media.sql`
2. 機能の PR：ほか全部（共通の変更はない）
