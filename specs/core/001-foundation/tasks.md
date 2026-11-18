# Tasks: 共通の土台（core-001）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[contracts/core.md](./contracts/core.md)

テストを先に書き、落ちることを見てから作る。[P] は別のファイルで、並べて進められるもの。

## Phase 1: 見本の領域を消す（US4）

- [x] T001 [US4] `notes` の API・画面・約束・E2E・地図を消し、`modules.list.ts`・`features.list.ts` の1行を消す
- [x] T002 [US4] `note` を消す DB の変更 `apps/api/drizzle/0001_drop_note.sql` を作り、SQL を読む（0000 は書き換えない）
- [x] T003 [US4] 見本のデータの手順を、足すもののない形にする（`apps/api/scripts/lib/seed.ts`・`test/seed.test.ts`）
- [x] T004 [US4] 領域が0でも `apps/web/src/router.tsx` の型が通るようにする
- [x] T005 [US4] E2E（a11y・keyboard・health）を、見つからない画面とはじめの画面で確かめる形にする
- [x] T006 [US4] 文書から notes を消す（`docs/rules/specs.md`・`coding.md`・`README.md`・`CLAUDE.md`・`docs/README.md`・`docs/architecture.md`）

## Phase 2: 設定（US3）

- [x] T007 [US3] `apps/api/test/config.test.ts` に `LINE_CHANNEL_IDS`・`ORGANIZER_LINE_USER_ID`・`OPEN_CHAT_URL`・`WEB_DIST_DIR` の確かめのテストを足す
- [x] T008 [US3] `apps/api/src/kernel/config.ts` に4つの設定を足す。`.env.example`・`apps/api/vitest.config.ts`・`e2e/env.ts` を合わせる

## Phase 3: DB に届かないとき（US2）

- [x] T009 [P] [US2] `apps/api/src/kernel/pg-errors.test.ts` に `isDbUnavailable` のテスト（拒否・時間切れ・包まれたもの・SQLSTATE 08/57P0x・違反は false）
- [x] T010 [US2] `packages/contracts/src/core/messages.ts` の `UNAVAILABLE` を `DB_UNAVAILABLE` にし、`kernel/errors.ts` に `toAppError` を足す。`kernel/pg-errors.ts` に `isDbUnavailable`
- [x] T011 [US2] `app.ts` の `onError` を `toAppError` に替え、`platform/health` は `DB_UNAVAILABLE` を返す。`apps/api/test/app.test.ts` に「領域の窓口で DB に届かない → 503」を足す

## Phase 4: 画面のファイルと CSP（US1）

- [x] T012 [US1] `apps/api/src/platform/web/web.test.ts` に、画面のファイル・SPA の戻り・拡張子のある道の 404・`..` の道・`/api` の見出し・キャッシュ・`index.html` がないと止まる、のテストを足す
- [x] T013 [US1] `apps/api/src/platform/web/`（`serveWeb`・`webSecureHeaders`・画面の CSP）を作り、`app.ts` で `/api` と画面の見出しを分けてつなぐ
- [x] T014 [US1] `apps/web/vite.config.ts` の preview の CSP を消し、E2E（`e2e/playwright.config.ts`・`e2e/env.ts`・`health.spec.ts`）を API が画面を返す形にする

## Phase 5: LIFF・道・日本時間（US3）

- [x] T015 [P] [US3] `packages/contracts/src/core/participant-paths.test.ts`・`jst.test.ts` を書く
- [x] T016 [P] [US3] `packages/contracts/src/core/participant-paths.ts`・`jst.ts` を作り、`core/index.ts` から出す
- [x] T017 [US3] `apps/web` に `@line/liff` 2.32 を足し、`__LIFF_ID__` を `vite.config.ts`・`vitest.config.ts`・`env.d.ts` に足す
- [x] T018 [US3] `apps/web/src/lib/liff.test.ts`（仮の形）を書き、`apps/web/src/lib/liff.ts` を作る
- [x] T019 [US3] `apps/web/src/main.tsx` で、ルーターより先に `initLiff()` を呼ぶ（失敗したら「読みこめない」の文）

## Phase 6: 見た目の値（US4）

- [x] T020 [US4] `packages/ui/src/styles/tokens.test.ts` をプロダクトの DESIGN.md（`inherits` を合わせる）に向ける
- [x] T021 [US4] `packages/ui/src/styles/tokens.css` を墨にし、`primary-subtle` を足す

## Phase 7: 仕上げ

- [x] T022 `docs/architecture.md`・`docs/rules/coding.md`（CSP の置き場所・LIFF・設定）・`docs/decisions.md` を直す
- [x] T023 `pnpm check` を通す（quickstart 1）
- [ ] T024 本番に出したあと、quickstart 3 を確かめる
