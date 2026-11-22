# Implementation Plan: 名簿を入れた受付の交流会を出す・ホーム画面のアイコン（match-007）

**Branch**: `feature/match-007-event-link-and-icon` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・[research.md](./research.md)・構成の決めごと AD-25・AD-26・AD-27

## Summary

「受付の交流会から」で名簿を入れたとき、担当の端末が中身に交流会の写し（ID・名前・日時）を置き、送ったときにサーバーが入れてよい交流会なら `match_table.event_id` につなぐ。一覧と試合表の答えに、写しと「受付アプリで開けるか」を付け、運営の画面の一覧と題の下に出す。試合表のホーム画面のアイコン（SVG と PNG）と manifest を `apps/web/public/match/` に置き、運営の画面を開いている間だけ見出しにリンクを付け、Service Worker に持たせる。

## Technical Context

**Language/Version**: TypeScript 6.0・Hono＋@hono/zod-openapi・React 19。新しい依存はない（PNG は E2E の Playwright で作る）

**Storage**: PostgreSQL。DB の変更はない（`event_id` は 0021 にある）

**Testing**: Vitest（結合：`reception-link.test.ts`。単体：画面の `reception-link.test.ts`・`home-screen.test.tsx`・`scoped-service-worker.test.ts`）・Playwright（`match-reception.spec.ts`・`match-home-screen.spec.ts`）

**Constraints**: match → event・suite の `index.ts` だけ。見るだけのページ・QR に交流会を出さない。共通の変更（`apps/web/public/`・`scoped-service-worker.ts`・`vite.config.ts`・`docs/architecture.md`）は小さくし、PR に書く

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 写しは交流会の ID・名前・日時だけ（参加者の情報ではない）。運営の画面と担当の端末にだけ出し、見るだけのページ・QR には出さない |
| III. 気軽さ | どの交流会の名簿か・受付アプリへの行き来が1行で分かる。ホーム画面から1回で開ける |
| V. 運用費 | 部品・費用は増えない（静かなファイルを数個） |
| 技術の制約 | 領域どうしは `index.ts` からだけ。Service Worker は `/match/` のまま（AD-27） |

違反なし。

## 形

| 場所 | 中身 |
|---|---|
| `packages/contracts/src/match/` | `table.ts`（`MatchReceptionSource`・`MatchReceptionEventLink`・中身と一覧の欄）・`index.ts` |
| `apps/api/src/modules/match/` | `reception-link.ts`（`canImportEvent`・`resolveReceptionLinks`）・`routes.ts`（つなぎ直す・見せ方を付ける）・`repository.ts`（写しとつないだ交流会を読む・`setLinkedEvent`）・`routes-reception.ts`（同じ判定を使う）・`reception-link.test.ts` |
| `apps/web/src/features/match/` | `roster-edit.ts`・`ReceptionImportDialog.tsx`・`ReceptionEventNote.tsx`・`RosterPage.tsx`・`BoardPage.tsx`・`ListPage.tsx`・`home-screen.ts`・`use-home-screen.ts`・`MatchGate.tsx`・テスト |
| 共通（小さく） | `apps/web/public/match/`（アイコンと manifest。試合表だけのフォルダ）・`apps/web/scoped-service-worker.ts`（`publicFiles`）・`apps/web/vite.config.ts`（1行）・`e2e/scripts/render-match-icons.ts`（手で流す）・`docs/architecture.md`（1行） |
| `e2e/tests/` | `match-reception.spec.ts`（足す）・`match-home-screen.spec.ts` |
