# Tasks: 割引・紹介割（reception-002）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/discounts.md](./contracts/discounts.md)

テストを先に書き、落ちることを見てから作る。[P] は別のファイルで、並べて進められるもの。event の変更（Phase 1）と reception の変更（Phase 2〜）は別のコミット。

## Phase 1: event の割引（US1）

- [x] T001 [P] `packages/contracts/src/event/event.test.ts` に割引の入力（名前・額・10まで・名前の重なり）を書き、`event.ts`・`errors.ts`・`index.ts` を直す
- [x] T002 `apps/api/src/modules/event/schema.ts` に `event_discount` を書き、`pnpm db:generate --name event_discount` → SQL を読む → `pnpm db:migrate`
- [x] T003 `apps/api/src/modules/event/discounts.test.ts` に、作る・直す・外す・送らなければ変えない・ない ID は 400・受付係は 403・要約に出る・`findEventDiscount`・`listEventDiscounts` を書き、`discounts.ts`・`summary.ts`・`routes.ts`・`index.ts` を直す
- [x] T004 A2 の割引の節（`DiscountFields.tsx`・`EventFormPage.tsx`。テストは `EventFormPage.test.tsx`）

## Phase 2: チェックインの割引（US2・US3）

- [x] T005 [P] `packages/contracts/src/reception/checkin.test.ts` に `discountId`・`referrerName` を書き、`checkin.ts`・`errors.ts`・`index.ts` を直す
- [x] T006 `apps/api/src/modules/reception/schema.ts` に4つの列と複合の外部キー・CHECK を書き、`pnpm db:generate --name checkin_discount` → SQL を読む → `pnpm db:migrate`
- [x] T007 [P] `amount.test.ts`（参加費 − 割引・0で止める・無料は0）を書き、`amount.ts` を直す
- [x] T008 `discounts.test.ts` に、自分・手のチェックインの金額と写し・選べない割引は 400・直すと決め直す（割引・支払い方法）・名前だけなら変えない・写しはあとの直しで変わらない・紹介者は主催者だけ・受付係の空の保存で残る を書き、`discount.ts`・`repository.ts`・`views.ts`・`routes.ts` を直す

## Phase 3: 内訳と CSV（US4）

- [x] T009 同じテストに、内訳（割引ごとの人数と額・割引なし・紹介者）と CSV の列・受付係は 403 を書き、`csv.ts`（＋`csv.test.ts`）・`routes.ts` を直す

## Phase 4: 画面

- [x] T010 [P] `checkin-form.test.ts` を書き、`checkin-form.ts`・`format.ts` を直す（割引のチップ・紹介者の欄）
- [x] T011 `CheckinFields.tsx`・`CheckinPage.tsx`・`ManualCheckinForm.tsx`・`CheckinEditDialog.tsx`（受付係は紹介者の欄を空で出す）・`ParticipantsTab.tsx`（割引の名前を添える）
- [x] T012 `TotalsTab.tsx`（＋`TotalsTab.test.tsx`）に割引と紹介者の内訳

## Phase 5: 通しのテスト

- [x] T013 `e2e/tests/discounts.spec.ts`：主催者が紹介割 1,000円を登録 → 参加者が紹介割と紹介者の名前でチェックイン → 5,000円の交流会の合計が 4,000円 → 主催者が内訳と CSV で紹介者を見る（両方の幅で axe）。受付係の直す枠に紹介者が出ない

## Phase 6: 仕上げ

- [x] T014 `docs/apps/event.md`・`docs/apps/reception.md`・`docs/architecture.md`、PRD（B1 を置きかえ・FR-23〜25・決定の表）・構成の決めごと（AD-3・AD-5・AD-6・AD-7・Capability map）・EXPERIENCE.md・DESIGN.md を直す
- [x] T015 `pnpm check` を通す・画面を撮って崩れを確かめる
- [ ] T016 本番に出したあと、quickstart 3 を確かめる
