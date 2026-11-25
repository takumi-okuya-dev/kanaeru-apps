# Tasks: サイドバーの項目を常に出す（core-022）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

テストを先に書き、落ちることを見てから作る。

## Phase 1: 外枠（US3）

- [x] T001 `shell/current-nav.test.ts` に、薄い項目が「今の項目」にならないことを書き、`lib/feature.ts` の型と `current-nav.ts` を直す
- [x] T002 `shell/AppShell.test.tsx` に、薄い項目（サイドバーとタブバー・`aria-disabled`・補足・押すと一覧へ移り知らせが出る）を書き、`AppShell.tsx` を直す

## Phase 2: 受付（US1）

- [x] T003 [US1] `features/event/last-event.test.ts` を書き、`last-event.ts` を作る（読む・書く・持ち主が違う人・ログアウトで消す・`onAccountChange`）
- [x] T004 [US1] `features/event/nav-items.test.tsx` を直し（外でも出す・記録の行き先・役目の出し分け・記録がなければ薄く・交流会の中で記録を書く・問い合わせない）、`nav-items.ts` と `index.ts` を直す

## Phase 3: 試合表（US2）

- [x] T005 [US2] `features/match/nav-items.test.tsx` を書き（外は何も出さない・一覧で記録の行き先・記録がなければ薄く・試合表の中で記録を書く）、`last-table.ts` を作り `nav-items.ts` を直す

## Phase 4: 仕上げ

- [x] T006 `e2e/tests/` のサイドバーの期待を読み、変わる所を直す
- [x] T007 `docs/apps/` の受付・試合表と `docs/README.md` を直し、`docs/decisions.md` に1行足す
- [ ] T008 `pnpm check` を通す（手元で DB が使えるとき。使えなければ CI）
