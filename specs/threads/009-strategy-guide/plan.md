# Implementation Plan: 戦略のガイドと AI との壁打ち（threads-009）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `packages/shared/src/strategy-guidance.ts`・`strategy-prompts.ts`・`strategy-sparring.ts` | `packages/contracts/src/threads/` の同じ名前（中身はそのまま） |
| `packages/shared/test/strategy-*.test.ts` | `packages/contracts/src/threads/strategy-*.test.ts` |
| `components/strategy/`（HintPanel・DeepenPanel・ProgressCard・SparringDialog・SparringCandidates など） | `StrategyGuide.tsx`（`FieldGuide`・`StrategyAiSection`）と `StrategyPage.tsx` の組みこみ |

## 作ったもの

- 約束：上の3つ（DB・窓口の変更はない）
- 画面：`StrategyGuide.tsx`、`StrategyPage.tsx`
- テスト：`packages/contracts/src/threads/strategy-guidance.test.ts`・`strategy-prompts.test.ts`・`strategy-sparring.test.ts`・`strategy-sparring-parse.test.ts`・`e2e/tests/threads.spec.ts`

## PR の分け方

1. 機能の PR だけ（DB の変更・共通の変更はない）
