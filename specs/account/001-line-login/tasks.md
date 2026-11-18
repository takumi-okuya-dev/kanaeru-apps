# Tasks: アカウント・LINE ログイン・今の利用者（account-001）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/account.md](./contracts/account.md)

テストを先に書き、落ちることを見てから作る。[P] は別のファイルで、並べて進められるもの。

## Phase 1: 共通の変更（research R1・R3。別のコミット）

- [x] T001 `apps/api/test/config.test.ts` に `TEST_LOGIN_ENABLED`（既定は切・staging と production で入なら止まる）のテストを足す
- [x] T002 `apps/api/src/kernel/config.ts` に `TEST_LOGIN_ENABLED` を足し、`.env.example`・`apps/api/vitest.config.ts`・`e2e/env.ts` を合わせる
- [x] T003 `apps/api/src/kernel/http.ts` に `DomainConfig` と `DomainRouteDeps.config`・`fetch` を足し、`apps/api/src/app.ts` が渡す（`AppDeps.fetch`）。`apps/api/test/helpers/app.ts` の既定は投げる出口
- [x] T004 `apps/web/src/lib/api.test.ts` に 401 の知らせのテストを足し、`apps/web/src/lib/api.ts` に `onUnauthenticated` を足す

## Phase 2: 約束と表（US1〜US4 の土台）

- [x] T005 [P] `packages/contracts/src/account/account.test.ts` を書き、`errors.ts`・`account.ts`・`index.ts` を作る（`package.json` の exports）
- [x] T006 `apps/api/src/modules/account/schema.ts` を書き、`pnpm db:generate --name account` → SQL を読む → `pnpm db:migrate`

## Phase 3: LINE の確かめ（US1）

- [x] T007 [P] [US1] `apps/api/src/modules/account/line-verifier.test.ts`（`aud` で選ぶ・並びにない/空・400・5xx・時間切れ・形の違う答え・送る本文）を書く
- [x] T008 [US1] `apps/api/src/modules/account/line-verifier.ts` を作る

## Phase 4: 窓口とセッション（US1・US2・US3・US4）

- [x] T009 [US1] `apps/api/src/modules/account/account.test.ts` に、LINE のログイン（作る・2回目は同じ・名前の上書き・クッキーの属性・失敗・届かない・知らない欄・札が DB にない）を書く
- [x] T010 [US2] 同じファイルに、`requireSession`（クッキーなし・知らない札・期限切れ・ログアウト後・消したあと）と `me` を書く
- [x] T011 [US3] 同じファイルに、`isOrganizer` と `DELETE /api/v1/accounts/{accountId}`（主催者 204・主催者でない 403・ない ID 404・セッションも消える）を書く
- [x] T012 [US4] 同じファイルに、試験用のログイン（入で作る・切で 404・入力の誤り）を書く
- [x] T013 `repository.ts`・`session.ts`・`routes.ts`・`index.ts` を作り、`apps/api/src/modules.list.ts` に1行足す
- [x] T014 `apps/api/test/helpers/account.ts`（`loginAs`・`withCookie`）を作り、テストで使う

## Phase 5: 画面（US4・US5）

- [x] T015 [US5] `apps/web/src/features/account/session.test.tsx`（自動のログインは1度だけ・失敗でボタン・手元のログインへの案内・401 の知らせで読み直す）を書く
- [x] T016 [US5] `api.ts`・`session.ts`・`SessionGate.tsx` を作る
- [x] T017 [US4] `DevLoginPage.test.tsx` を書き、`DevLoginPage.tsx`・`routes.ts`・`index.ts` を作り、`apps/web/src/features.list.ts` に1行足す
- [x] T018 [US4] `e2e/tests/account.spec.ts`（手元のログイン → 今の利用者・`accounts/me`・ログアウト・両方の幅で axe）を書く

## Phase 6: 仕上げ

- [x] T019 `docs/apps/account.md` を書き、`docs/README.md` 2章・`docs/architecture.md`・`docs/rules/coding.md`（6-1 の設定・6-5 のテストの手伝い・6-6 の `deps`）を直す
- [x] T020 `pnpm check` を通す（quickstart 1）
- [ ] T021 本番に出したあと、quickstart 3 を確かめる
