# Implementation Plan: 操作の記録（threads-005）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `activity/activity-log.ts`（チームのときだけ・同じトランザクション・操作した人の名前と役割） | `modules/threads/activity-log.ts`（いつも・操作のあと・操作した人なし） |
| 各サービスの `recordActivity` の呼び出し | 書きこみの道の middleware（`route-helpers.ts` の `activityRecorder`。道の形から種類と操作を決める）と、承認・却下（`routes.ts`）・自動投稿（`publish-executor.ts`）の中の呼び出し |
| 日次の処理の90日の片付け | 定期の仕事の片付け（`job-runner.ts`） |
| 「チーム」の画面の記録 | 設定の画面の `ActivitySection.tsx` |

## 作ったもの

- 約束：`packages/contracts/src/threads/activity.ts`
- 表：`threads_activity_log`（`apps/api/drizzle/0012_threads_activity.sql`。足すだけ）
- API：`activity-log.ts`・`routes-activity.ts`、`route-helpers.ts`・`routes.ts`・`publish-executor.ts`・`job-runner.ts`・`index.ts` を直した
- 画面：`ActivitySection.tsx`、`SettingsPage.tsx`・`api.ts`・`queries.ts` を直した
- テスト：`research.test.ts`（操作の記録）・`autopost.test.ts`（自動の投稿の記録）・`e2e/tests/threads.spec.ts`

## PR の分け方

1. DB の変更の PR：`schema.ts` と `0012_threads_activity.sql`
2. 機能の PR：ほか全部（共通の変更はない）
