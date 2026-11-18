# Tasks: チェックイン・合計・内訳・参加者の書き出し（reception-001）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/reception.md](./contracts/reception.md)

テストを先に書き、落ちることを見てから作る。[P] は別のファイルで、並べて進められるもの。

## Phase 1: 約束と表（全部の土台）

- [ ] T001 [P] `packages/contracts/src/reception/checkin.test.ts` を書き、`options.ts`・`name.ts`・`errors.ts`・`checkin.ts`・`index.ts` を作る
- [ ] T002 `apps/api/src/modules/reception/schema.ts` を書き、`pnpm db:generate --name reception` → SQL を読む → `pnpm db:migrate`

## Phase 2: 自分のチェックイン（US1）

- [ ] T003 [US1] `apps/api/test/helpers/reception.ts` と `apps/api/src/modules/reception/reception.test.ts` に、自分のチェックイン（初期値〈表示名・前回の名前と知ったきっかけ〉・作る・金額〈参加費・無料は0〉・2回目は増えない・入力の誤り・ない交流会 404・未ログイン 401）を書く
- [ ] T004 [US1] `repository.ts`・`amount.ts`・`routes.ts`（`me` の2つ）・`index.ts` を作り、`apps/api/src/modules.list.ts` に1行足す

## Phase 3: 一覧・手・直す・取り消す・合計（US2・US3）

- [ ] T005 [US2] 同じテストに、一覧（新しい順・手の印と入れた人・同じ名前の印〈手と LINE・手どうし・LINE どうしは付けない〉）・手でのチェックイン・権限（どちらでもない 403・ない交流会 404）を書く
- [ ] T006 [US3] 同じテストに、直す（支払い方法を直すと金額を決め直す・名前だけなら変えない・参加費を直したあと）・取り消す（DELETE・別の交流会の ID は 404）・合計（0人も出す・取り消すと外れる）を書く
- [ ] T007 [US2・US3] `views.ts`・`routes.ts` に窓口を足す

## Phase 4: 内訳・CSV・消し方と survey が使うもの（US4・US5）

- [ ] T008 [P] [US4] `csv.test.ts` を書き、`csv.ts` を作る（BOM・CRLF・囲み・式の差しこみ）
- [ ] T009 [US4] 同じテストに、内訳と CSV（主催者だけ。受付係は 403）・account を消すと CASCADE・入れた人を消すと SET NULL を書き、窓口を足す
- [ ] T010 [US5] `exports.test.ts` に `findCheckin`・`getCheckin`・`listCheckins` を書き、`index.ts` から出す

## Phase 5: 画面（US1・US2・US3・US4）

- [ ] T011 [P] `packages/ui/src/components/choice-chips.test.tsx` を書き、`choice-chips.tsx` を作る（共通。別のコミット。research R14）
- [ ] T012 [P] `apps/web/src/features/reception/format.test.ts`・`checkin-form.test.ts`・`slots.test.tsx` を書き、`format.ts`・`checkin-form.ts`・`slots.ts` を作る
- [ ] T013 [US1] `CheckinPage.test.tsx` を書き、`api.ts`・`queries.ts`・`CheckinFields.tsx`・`CheckinPage.tsx` を作る
- [ ] T014 [US2・US3] `ReceptionPage.tsx`・`ParticipantsTab.tsx`・`ManualCheckinForm.tsx`・`CheckinEditDialog.tsx`・`TotalsTab.tsx` を作る
- [ ] T015 [US4] `DataPage.tsx` を作る
- [ ] T016 `routes.ts`・`index.ts` を作り、`apps/web/src/features.list.ts` に1行足す

## Phase 6: 通しのテスト

- [ ] T017 [US1] `e2e/tests/reception.spec.ts`：参加者が試験用のログインでチェックインし、済んだ状態・チェックイン済み・アンケートが開いたら「アンケートに答える」（両方の幅で axe）
- [ ] T018 [US2・US3・US4] 同じファイル：受付係が手でチェックインし、支払い方法を直すと合計が変わる。受付係には内訳と A5 が出ない。主催者が CSV を書き出す

## Phase 7: 仕上げ

- [ ] T019 `docs/apps/reception.md` を書き、`docs/README.md` 2章・`docs/architecture.md`・`docs/rules/coding.md`（6-3・6-5）を直す
- [ ] T020 `pnpm check` を通す（quickstart 1）
- [ ] T021 本番に出したあと、quickstart 3 を確かめる
