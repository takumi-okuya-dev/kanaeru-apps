# Tasks: 交流会・要約・QR・受付係と招待・アンケートの開閉・権限（event-001）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/event.md](./contracts/event.md)

テストを先に書き、落ちることを見てから作る。[P] は別のファイルで、並べて進められるもの。

## Phase 1: 約束と表（全部の土台）

- [x] T001 [P] `packages/contracts/src/event/event.test.ts`・`admin-paths.test.ts` を書き、`errors.ts`・`event.ts`・`admin-paths.ts`・`index.ts` を作る
- [x] T002 `apps/api/src/modules/event/schema.ts` を書き、`pnpm db:generate --name event` → SQL を読む → `pnpm db:migrate`

## Phase 2: 権限と要約（US5）

- [x] T003 [US5] `apps/api/src/modules/event/access.test.ts`（`requireEventRole` を付けた試しの道：主催者・受付係・どちらでもない・ない交流会・形の違う ID・外したあと。`getEventRole`・`getEventSummary`）を書く
- [x] T004 [US5] `repository.ts`・`access.ts`・`summary.ts` を作る

## Phase 3: 交流会の窓口（US1・US3・US6）

- [x] T005 [US1] `apps/api/src/modules/event/event.test.ts` に、作る（0円・入力の誤り・主催者でない 403・未ログイン 401）・直す・詳細・一覧（主催者・受付係・どちらでもない・並び）を書く
- [x] T006 [US3] 同じファイルに、アンケートの開閉と要約（ログインした誰でも・オープンチャットの URL・401・404）を書く
- [x] T007 `routes.ts`・`index.ts` を作り、`apps/api/src/modules.list.ts` に1行足す

## Phase 4: 招待と受付係（US4）

- [x] T008 [US4] 同じファイルに、招待のリンク（作る・読む・作り直すと前のが使えない）・招待の中身・受ける（受付係になる・2回目も1つ・主催者は何もしない・期限切れ 410・知らない 404・すでに受付係なら期限切れでも通す）・受付係の一覧と外す（外すと 403）・account を消すと受付係も消える を書く
- [x] T009 [US4] `routes.ts` に招待と受付係の窓口を足す

## Phase 5: 画面（US1・US2・US3・US4・US6）

- [x] T010 [P] `apps/web/src/features/event/format.test.ts`・`links.test.ts` を書き、`format.ts`・`links.ts` を作る
- [x] T011 [P] [US2] `QrCode.test.tsx` を書き、`QrCode.tsx` を作る（`uqr` を足す。`pnpm audit` を確かめる）
- [x] T012 [P] `EventAdminNav.test.tsx` を書き、`admin-tabs.ts`・`EventAdminNav.tsx` を作る
- [x] T013 [US1] `EventFormPage.test.tsx` を書き、`api.ts`・`queries.ts`・`EventFormPage.tsx` を作る
- [x] T014 [US6] `EventListPage.tsx`・`EventAccessGate.tsx`（読みこみと役目の確かめ・主催者だけの画面の「使えない」）・`navigation.tsx` を作る
- [x] T015 [US2・US3・US4] `EventSetupPage.tsx`・`QrPrintPage.tsx`・`print.css` を作る
- [x] T016 [US4] `InviteAcceptPage.tsx` を作る
- [x] T017 `routes.ts`・`index.ts` を作り、`apps/web/src/features.list.ts` に1行足す

## Phase 6: 通しのテスト（共通の変更は別のコミット。research R9）

- [x] T018 `e2e/env.ts` に E2E の主催者を決め、`e2e/tests/a11y.spec.ts`・`keyboard.spec.ts`・`health.spec.ts` を、はじめの画面がナビへ移っても通る形にする
- [x] T019 [US1・US2・US3] `e2e/tests/event.spec.ts`：主催者が交流会を作る → 準備で QR → アンケートを開く（両方の幅で axe）
- [x] T020 [US4・US6] 同じファイル：受付係が招待を受ける → 一覧に出る → 準備の画面は使えない

## Phase 7: 仕上げ

- [x] T021 `docs/apps/event.md` を書き、`docs/README.md` 2章・`docs/architecture.md` を直す
- [x] T022 `pnpm check` を通す（quickstart 1）
- [ ] T023 本番に出したあと、quickstart 3 を確かめる
