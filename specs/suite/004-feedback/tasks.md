# Tasks: 改善点を送る（suite-004）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[data-model.md](./data-model.md)

## Phase 1: 表（1つ目の PR。DB の変更だけ）

- [x] T001 表の試験を先に書く `apps/api/src/modules/suite/feedback-schema.test.ts`（本文1〜2000文字・アプリの key は空か1〜40文字・送った人を消すと空になり本文は残る）
- [x] T002 `apps/api/src/modules/suite/schema.ts` に `feedback`、`pnpm db:generate --name suite_feedback` で `0024_suite_feedback.sql`（SQL を読んだ：表と外部キーと索引を足すだけ）
- [x] T003 `docs/apps/suite.md` の表に1行

## Phase 2: 窓口（2つ目の PR）

- [x] T004 [US1] [US2] 約束 `packages/contracts/src/suite/feedback.ts`（送る入力：本文1〜2000・アプリの key 任意／一覧の行：ID・日時・アプリ・本文・送った人の表示名か「退会した人」・済み）
- [x] T005 [US1] [US2] 窓口の試験を先に書く `apps/api/src/modules/suite/feedback.test.ts`（送れる・ログインなしは 401・空と長すぎは 400・台帳にないアプリは 400・1日20件まで 429・運営者でない人の一覧と済みは 403・一覧は新しい順・アプリで絞る・まだのものだけ・済みの付け外し・本文がログに出ない）
- [x] T006 [US1] [US2] `feedback.ts`・`routes-feedback.ts`・`index.ts` の routes に足す

## Phase 3: 画面（2つ目の PR）

- [x] T007 [US1] `FeedbackPage.tsx`（アプリを選ぶ〈任意〉・本文・個人の情報を書かない案内・送った知らせ）
- [x] T008 [US2] `FeedbackInboxPage.tsx`（運営者だけ。新しい順・アプリで絞る・まだのものだけ・済み）
- [x] T009 `features/suite/index.ts` の settings に2つ・`routes.ts` に道
- [x] T010 E2E `e2e/tests/suite-feedback.spec.ts`（送る → 運営者が読んで済み。運営者でない人は開けない）
- [x] T011 `docs/apps/suite.md` の窓口と画面・`pnpm check`
