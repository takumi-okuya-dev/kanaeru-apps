# Implementation Plan: アルゴリズムの分析（threads-006）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `packages/shared/src/analysis/`（types・holidays・values・analyze・prompt） | `packages/contracts/src/threads/analysis-types.ts`・`holidays.ts`・`analysis-values.ts`・`analysis.ts`・`analysis-prompt.ts`（中身はそのまま） |
| `schemas.ts` の解析の形 | `analysis-schemas.ts`（日本語の誤り・PUT と版） |
| `threads.analysis_settings`・`post_classifications` | `threads_analysis_setting`・`threads_post_classification` |
| `metrics/analysis-service.ts`・`analysis-routes.ts` | `modules/threads/analysis.ts`・`routes-analysis.ts` |
| `trendsForAccountPrompt`（プロンプトの節） | `routes.ts` のプロンプトの道から呼ぶ |
| 画面の「解析」・`ClassifyDialog` | `AnalysisPage.tsx`（分類は画面の節と、手で直す枠） |

## 作ったもの

- 約束：上の5つと `analysis-schemas.ts`、`activity.ts`（操作2つ）
- 表：`apps/api/drizzle/0013_threads_analysis.sql`（足すだけ）
- API：`analysis.ts`・`routes-analysis.ts`、`routes.ts`（プロンプトに傾向）・`route-helpers.ts`（操作の記録・`coreRuleLines` を移した）・`index.ts`
- 画面：`AnalysisPage.tsx`・`CopyButton.tsx`（`ResearchPage.tsx` から分けた）、`paths.ts`・`routes.ts`・`index.ts`・`nav-items.ts`・`api.ts`・`queries.ts`
- テスト：`packages/contracts/src/threads/analysis.test.ts`（めぐるの単体テストを1つにまとめた）・`apps/api/src/modules/threads/analysis.test.ts`・`e2e/tests/threads.spec.ts`

## PR の分け方

1. DB の変更の PR：`schema.ts` と `0013_threads_analysis.sql`
2. 機能の PR：ほか全部（共通の変更はない）
