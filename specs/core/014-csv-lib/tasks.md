# Tasks: CSV を読む処理を画面の共通に移し、貼った表も読む（core-014）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

## Phase 1: 仕様

- [x] T001 この仕様（spec・plan・research・tasks）。対話の clarify は飛ばし、【仮決め】を research に書いた

## Phase 2: 移す（ふるまいを変えない）

- [x] T002 `git mv` で `features/booking/csv-read.ts`・`csv-read.test.ts` を `apps/web/src/lib/` へ移し、`ImportPage.tsx` の読み込みの道を直す。今のテストは期待の値を直さずに通す

## Phase 3: 貼った表（テストを先に）

- [x] T003 `apps/web/src/lib/csv-read.test.ts` に、タブ区切り（Google スプレッドシート・Excel の形）と区切りの決め方のテストを書く
- [x] T004 `apps/web/src/lib/csv-read.ts` に `CsvDelimiter`・`ParseCsvOptions`・`detectDelimiter` を足し、`parseCsv` が区切りを受け取る

## Phase 4: 文書と確かめ

- [x] T005 文書：`docs/rules/coding.md` 6-2・`docs/architecture.md`・`docs/apps/booking.md`
- [x] T006 `pnpm check`
- [ ] T007 主催者が仮決めを確かめる（spec の Clarifications・research の R3・R4）
