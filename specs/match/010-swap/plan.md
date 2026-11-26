# Implementation Plan: 組み合わせを手で入れかえる（match-010）

**Branch**: `feature/match-010-swap`（match-009 の上に積む） | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md)

## Summary

試合表の画面に、担当の端末だけの「組み合わせを直す」の形を足す。直す形では名前がボタンになり、パソコンはドラッグ（HTML の drag and drop）、スマホとキーボードは「名前を押す → 相手の名前を押す」で入れかえる。計算は状態を持たない関数（`swap.ts`）で、まだの試合の名前どうし・ミニゲームのチームの人どうしの入れかえと、ほかのチームへの移しだけ。保存は今の `editor.apply`（端末に残して送る）。窓口・DB・約束は変えない。

## Technical Context

**Language/Version**: TypeScript 6.0・React 19

**Primary Dependencies**: 新しい依存はない（ドラッグはブラウザの drag and drop。スマホのブラウザはドラッグの知らせを送らないので、押して入れかえる形を同じボタンに持たせる）

**Testing**: Vitest（`swap.test.ts`。property-based：どう入れかえても約束の形のまま・終わった試合とほかの組は変わらない）・Playwright（パソコンでドラッグ・スマホの幅で2人を順に押す・同じ試合に2回入るときの知らせ・ミニゲームの移し。両方の幅で axe・CSP）

**Constraints**: 試合表の道だけ（共通のファイルは触らない）。読み上げとキーボードで使える（押した名前は aria-pressed・結果は role="status"）

## Constitution Check

| 原則 | 確かめ |
|---|---|
| III. 気軽さ（電波がなくても） | 端末の中の計算と今の保存（端末に残して送る） |
| IV. 小さく始める | 入れかえと移しだけ（取り消し・組をまたぐ移しは作らない） |

違反なし。
