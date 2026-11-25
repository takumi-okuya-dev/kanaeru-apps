# Implementation Plan: 反応の分析（threads-003）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `metrics/metrics-runner.ts`（Cron の中・KV の補いの日付・`db.batch`・SQL の一括の判定） | `modules/threads/metrics-runner.ts`（定期の仕事の中・補いは毎回・トランザクション・JS の中央値） |
| `metrics/performance-service.ts`（ページ送り・書き出しは画面で CSV を作る） | `modules/threads/performance.ts`（最大200件・CSV は API が作る） |
| `metrics/performance-routes.ts` | `modules/threads/routes-metrics.ts` |
| `metrics/prompt-service.ts` の `poorPosts` | `routes.ts` のプロンプトの窓口に `listPoorForPrompt` と1日の投稿の数を足した |
| 画面 `PerformancePage` | `apps/web/src/features/threads/PerformancePage.tsx`（kanaeru の部品・ナビに「反応」） |

## 作ったもの

- 約束：`packages/contracts/src/threads/metrics.ts`（`performance.ts` を入口から出した）・`autopost.ts`（定期の仕事の結果に `metrics`）
- 表：`threads_post_metric`・`threads_post_metric_snapshot`・`threads_follower_snapshot`（`apps/api/drizzle/0010_threads_metrics.sql`。表を足すだけ）
- API：`metrics-runner.ts`・`performance.ts`・`routes-metrics.ts`、`job-runner.ts`・`routes.ts`・`index.ts` を直した
- 画面：`PerformancePage.tsx`、`api.ts`・`queries.ts`・`paths.ts`・`routes.ts`・`index.ts`・`nav-items.ts` を直した
- テスト：`metrics.test.ts`（結合）・`nav-items.test.tsx`・`e2e/tests/threads.spec.ts`

## PR の分け方

1. DB の変更の PR：`schema.ts` と `0010_threads_metrics.sql`
2. 機能の PR：ほか全部（共通の変更はない）
