# Implementation Plan: 時間差のメンション（threads-007）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `packages/shared/src/mention.ts`・`schemas.ts` のメンションの形 | `packages/contracts/src/threads/mention.ts`（中身はそのまま＋案の `PostMention`）・`mention-schemas.ts`（PUT と版・日本語の誤り） |
| `threads.mention_settings`・`mention_people`・`post_mentions` | `threads_mention_setting`・`threads_mention_person`・`threads_post_mention` |
| `mention/mention-service.ts`・`mention-view.ts`・`mention-routes.ts` | `modules/threads/mention.ts`・`routes-mention.ts` |
| `mention/mention-runner.ts`（005 の runAutoPost の最後） | `mention-runner.ts`（`job-runner.ts` の公開のあと。2b） |
| 承認の返信の文の確かめ・却下で消す | `routes.ts` の `reviewDrafts` |
| `MentionSettingsSection`・`MentionPanel` | `MentionSettingsSection.tsx`（設定の画面）・`MentionPanel.tsx`（投稿の案のカード） |

## 作ったもの

- 約束：`mention.ts`・`mention-schemas.ts`・`errors.ts`（3つ）・`schemas.ts`（案に `mention`）・`autopost.ts`（定期の仕事の結果に `mentions`）・`activity.ts`（操作6つ）
- 表：`apps/api/drizzle/0014_threads_mention.sql`（足すだけ）
- API：`mention.ts`・`mention-runner.ts`・`routes-mention.ts`、`routes.ts`（一覧にメンション・承認と却下）・`views.ts`・`job-runner.ts`・`analysis.ts`（自分の返信を引く）・`route-helpers.ts`・`index.ts`
- 画面：`MentionSettingsSection.tsx`・`MentionPanel.tsx`、`SettingsPage.tsx`・`StockPage.tsx`・`api.ts`・`queries.ts`
- テスト：`packages/contracts/src/threads/mention.test.ts`（めぐるの単体テストを写した）・`apps/api/src/modules/threads/mention.test.ts`（偽の Threads で返信まで）・`e2e/tests/threads.spec.ts`

## PR の分け方

1. DB の変更の PR：`schema.ts` と `0014_threads_mention.sql`
2. 機能の PR：ほか全部（共通の変更はない）
