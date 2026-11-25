# Implementation Plan: 当日の組み直し・大きく映す・担当の受け渡し（match-003）

**Branch**: `feature/match-003-day-of` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。理由と仮決めは [research.md](./research.md)、中身の形は [data-model.md](./data-model.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

当日の「人を選んで直す」（来なかった・来た・帰る → その人の組のこれからの試合だけを組み直す）と、当日に分け方・試合の形を変えても終わった試合を残す移し方、大きく映す画面、担当の端末の受け渡しの見せ方を足す。どれも画面の側（端末の中）の計算で、サーバーは中身の形を確かめて持つだけ（AD-28）。窓口と DB は変えない（約束の中身の形だけを広げる）。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: React 19・TanStack Router/Query・fast-check（match-002 で足したもの）。新しい依存はない

**Storage**: なし（DB の変更なし。`match_table.content` の JSON の形を広げる）

**Testing**: Vitest（`day-of.test.ts`・`regroup.test.ts` の property-based と例・約束の `table.test.ts`・窓口の `routes.test.ts`）・Playwright（`e2e/tests/match.spec.ts` に当日の流れ。1440px と 375px・axe・CSP・横のスクロール）

**Constraints**: 試合表の道は LIFF を始めない。共通のファイルは触らない。大きな字は SVG で描く（tokens.css を変えない）。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 足したのは当日の印と組み合わせの記録だけ（呼び名と ID）。氏名は持たない |
| III. 気軽さ | 組み直しは端末の中の計算（電波がなくても計算できる形。保存はネットなしの段） |
| IV. 小さく始める | PRD 7.1 の3番だけ。見るだけ・QR・ネットなしは作らない |
| V. 運用費ゼロに近く | サーバーの仕事は増えない（大きく映すの読み直しは担当でない端末だけ・30秒おき） |
| 技術の制約 | 画面は `@workspace/ui` の部品と tokens.css の名前（大きな字は SVG の単位。research R5） |

違反なし。
