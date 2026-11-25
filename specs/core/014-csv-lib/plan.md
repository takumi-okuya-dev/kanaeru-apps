# Implementation Plan: CSV を読む処理を画面の共通に移し、貼った表も読む（core-014）

**Branch**: `feature/core-014-csv-lib` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・構成の決めごと AD-18・AD-29・PRD 試合表アプリ FR-M1・FR-M30

## Summary

`apps/web/src/features/booking/csv-read.ts` とテストを `apps/web/src/lib/` へ `git mv` で移し、booking の `ImportPage.tsx` の読み込みの道を直す。`parseCsv` に区切りの選び方（`","`・`"\t"`・`"auto"`。既定はカンマ）を足し、区切りを決める `detectDelimiter` を出す。切る処理（`splitRecords`）は区切りを引数で受け取るだけで、囲みの決まりは変えない。

## Technical Context

**Language/Version**: TypeScript 6.0・React 19。新しい依存はない

**Storage**: なし（DB の変更なし）

**Testing**: Vitest（`apps/web/src/lib/csv-read.test.ts`：今のテストをそのまま＋タブ区切りと区切りの決め方）。booking の画面のテストと E2E はそのまま通す

**Constraints**: 業務を知らない（AD-18）。booking のふるまいを変えない。依存の向き（領域 → 共通）は lint の境界の規則のまま

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関わらない |
| II. 個人の情報は最小限 | 画面の中で読むだけで、サーバーに送らない（今と同じ） |
| III. 気軽さ | 貼るだけで名簿を入れられる道具を用意する（FR-M30。画面は match） |
| IV. 小さく始める | 新しい依存を足さない。区切りの決め方は見出しの行だけで決める単純な形 |
| V. 運用費 | 費用は増えない |
| 技術の制約 | 共通（`apps/web/src/lib`）を足すので、領域の PR に混ぜず、この共通の PR で先に入れる（並行開発の決まり 3-3）。2つ目の領域（match）が要り、形は booking で固まった（AD-18） |

違反なし。

## 形

| 場所 | 中身 |
|---|---|
| `apps/web/src/lib/csv-read.ts`（共通。booking から移す） | `decodeCsv`・`parseCsv(text, { delimiter })`・`detectDelimiter`・`splitPastedNames`・`ParsedCsv`・`CsvDelimiter`・`ParseCsvOptions` |
| `apps/web/src/lib/csv-read.test.ts`（移す） | 今の6件＋タブ区切りと区切りの決め方 |
| `apps/web/src/features/booking/ImportPage.tsx` | 読み込みの道を `../../lib/csv-read.ts` に直すだけ |
| 文書 | `docs/rules/coding.md` 6-2（画面の CSV を読む処理の置き場所）・`docs/architecture.md`（lib の中身）・`docs/apps/booking.md`（画面のファイルの一覧から外す） |

## 契約・データ

API・約束（`packages/contracts`）・DB は変えない（`contracts/`・`data-model.md` は作らない）。
