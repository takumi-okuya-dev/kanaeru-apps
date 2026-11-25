# Tasks: アンケートの入力の画面に Googleフォームのリンクを出す（survey-002）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)

テストを先に書き、落ちることを見てから作る。

## Phase 1: 画面（US1）

- [x] T001 [US1] `SurveyPage.test.tsx` に、入力の画面のリンク（href・target・rel・「送る」の下・主のボタンが1つ）・URL がなければ出ない・回答済みでも出る・お礼で消えるを書き、落ちることを確かめる
- [x] T002 [US1] `SurveyPage.tsx` の入力の画面に、補助のリンクの節を足す（`summary.googleFormUrl` があるときだけ）

## Phase 2: 通しのテストと文書

- [x] T003 [US1] `e2e/tests/survey.spec.ts` に、入力の画面のリンク（href・target）と、お礼で消えることを足す
- [x] T004 `docs/apps/survey.md`（今の形）と `docs/decisions.md` を直す

## Phase 3: 仕上げ

- [ ] T005 `pnpm format:check`・`pnpm typecheck`・`pnpm lint` と、関わる Vitest を通す。E2E・全テストは CI で流す
- [ ] T006 公開のあと、アンケートの回答率（SM-2）を見て、リンクの位置を見直す
