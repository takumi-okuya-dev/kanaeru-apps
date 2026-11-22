# Implementation Plan: 受付の交流会から名簿を入れる・前に入れたレベル（match-006）

**Branch**: `feature/match-006-reception-import` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・[research.md](./research.md)・構成の決めごと AD-23・AD-25

## Summary

名簿と設定の画面に「受付の交流会から」を足す。画面は event の交流会の一覧から主催者の行を出し、選んだ交流会のチェックインした人と申込みの名簿を match の窓口から読む。match の窓口は event の判定で主催者かを確かめ、reception と booking の `index.ts` から名前と account を読み、覚えているレベルを付けて返す。名簿の人に account を持たせ、担当の端末が中身を送ったときにレベルを覚える。

## Technical Context

**Language/Version**: TypeScript 6.0・Hono＋@hono/zod-openapi・React 19・TanStack Query。新しい依存はない

**Storage**: PostgreSQL。DB の変更はない（`match_level_memory` は match-001 の 0021 で作ってある）

**Testing**: Vitest（結合：`reception-import.test.ts`・`applicant-roster.test.ts`。単体：`reception-import.test.ts`〈画面〉・`table.test.ts`）・Playwright（`match-reception.spec.ts`）

**Constraints**: match → reception・booking・event・suite の `index.ts` だけ（表を読まない）。名前は試合表に持たない。booking のフォルダは関数1つと出す行だけ

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 名前は運営の画面にだけ出し、試合表には呼び名・レベルと account だけ。booking はメールアドレス・媒体・案内の同意を出さない。account は見るだけのページ・QR に出さない |
| III. 気軽さ | 当日はチェックインした人を1回で入れられる。レベルは覚えたものが入る |
| V. 運用費 | 部品・費用は増えない |
| 技術の制約 | 領域どうしは `index.ts` からだけ。booking の変更は小さく分けて PR に書く |

違反なし。

## 形

| 場所 | 中身 |
|---|---|
| `packages/contracts/src/match/` | `table.ts`（`MatchPlayer.accountId`）・`reception.ts`・`errors.ts`（`EVENT_NOT_FOUND`） |
| `apps/api/src/modules/booking/` | `repository.ts`（`listApplicantRoster`）・`index.ts`（出す行）・`applicant-roster.test.ts` |
| `apps/api/src/modules/match/` | `routes-reception.ts`・`level-memory.ts`・`routes.ts`（`PUT` で覚える）・`repository.ts`（書くときに今の中身も読む）・`index.ts`・`reception-import.test.ts` |
| `apps/web/src/features/match/` | `ReceptionImportDialog.tsx`・`reception-import.ts`・`RosterPage.tsx`（ボタン）・`api.ts`・`queries.ts`・`roster-read.ts`・`roster-edit.ts`（account を引き継ぐ） |
| `e2e/tests/` | `match-reception.spec.ts` |
