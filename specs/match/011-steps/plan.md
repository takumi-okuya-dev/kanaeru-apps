# Implementation Plan: 名簿と設定に手順を出す（match-011）

**Branch**: `feature/match-011-steps` | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md)

## Summary

手順の状態を中身から決める状態を持たない関数（`steps.ts` の `rosterSteps`）と、名簿と設定の題の下に出す部品（`RosterSteps.tsx`）を足す。押すと見出しへ移ってフォーカスを移す（`#match-roster`・`#match-settings`・「試合表を作る」のボタン）、組んでいれば試合表の画面へ。窓口・DB・約束は変えない。

## Technical Context

**Language/Version**: TypeScript 6.0・React 19。新しい依存はない

**Testing**: Vitest（`steps.test.ts`）・Playwright（`e2e/tests/match.spec.ts` の、貼り付けた名簿から作る流れに、手順の状態の確かめを足す。両方の幅で axe）

**Constraints**: 試合表の領域の中だけ。見た目は tokens.css の名前だけ

## Constitution Check

| 原則 | 確かめ |
|---|---|
| III. 気軽さ | はじめての人が次にすることを画面で知る |
| IV. 小さく始める | 名簿と設定の手順だけ（ツアー・使い方のページは作らない） |

違反なし。
