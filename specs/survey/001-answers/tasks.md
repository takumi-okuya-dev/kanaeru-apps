# Tasks: アンケートの回答・困りごとの一覧と書き出し（survey-001）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/survey.md](./contracts/survey.md)

テストを先に書き、落ちることを見てから作る。[P] は別のファイルで、並べて進められるもの。

## Phase 1: 約束と表（全部の土台）

- [x] T001 [P] `packages/contracts/src/survey/answer.test.ts` を書き（入力の形・正規化・選択肢の並び・高い順・エラー）、`options.ts`・`errors.ts`・`answer.ts`・`index.ts` を作る
- [x] T002 `apps/api/src/modules/survey/schema.ts` を書き、`pnpm db:generate --name survey` → SQL を読む → `pnpm db:migrate`

## Phase 2: 参加者の回答（US1）

- [x] T003 [US1] `apps/api/test/helpers/survey.ts` と `apps/api/src/modules/survey/survey.test.ts` に、自分の回答（チェックインの前後の `checkedIn`・作る・直す〈1行のまま〉・空で送る・閉じると 409・チェックインがないと 403・入力の誤り 400・ない交流会 404・未ログイン 401・同時に送っても1行・選択肢の code はどれも DB に入る）を書く
- [x] T004 [US1] `repository.ts`・`views.ts`・`routes.ts`（`me` の2つ）・`index.ts` を作り、`apps/api/src/modules.list.ts` に1行足す

## Phase 3: 代わりの入力・一覧（US2・US3）

- [x] T005 [US3] 同じテストに、代わりの入力（閉じていても受ける・前の回答を読む・別の交流会の ID は 404・受付係は 403）を書く
- [x] T006 [US2] 同じテストに、一覧（名前はチェックインの名前・直した名前で出る・新しい順・`tester=yes`・`sort=price` の順・受付係とほかの人は 403）と、チェックインの取り消し・アカウントの削除で消える（CASCADE）を書く
- [x] T007 [US2・US3] `routes.ts` に窓口を足す

## Phase 4: CSV（US4）

- [x] T008 [P] [US4] `csv.test.ts` を書き、`csv.ts` を作る（BOM・CRLF・囲み・式の差しこみ・空欄）
- [x] T009 [US4] 同じ結合のテストに CSV（主催者だけ・古い順・見出し）を書き、窓口を足す

## Phase 5: 画面（US1〜US4）

- [x] T010 [P] `apps/web/src/features/survey/survey-form.test.ts`（「答えない」のチップの並びも）を書き、`format.ts`・`survey-form.ts` を作る
- [x] T011 [US1] `SurveyPage.test.tsx`（入力・空で送る・お礼と2つのボタン・回答済みは「送り直す」・閉じている・チェックインしていない・送ったときに閉じていた）を書き、`api.ts`・`queries.ts`・`SurveyFields.tsx`・`SurveyPage.tsx` を作る
- [x] T012 [US2] `ConcernsPage.test.tsx`（行・絞りこみと並べ替えの問い合わせ・空）を書き、`ConcernsPage.tsx` を作る
- [x] T013 [US3・US4] `ProxyAnswerSection.tsx`・`ConcernsCsvSection.tsx` を作る
- [x] T014 `routes.ts`・`index.ts`（差しこみの登録）を作り、`apps/web/src/features.list.ts` に1行足す

## Phase 6: 通しのテスト

- [x] T015 [US1] `e2e/tests/survey.spec.ts`：主催者がアンケートを開いたあと、参加者が答えてお礼と「続けて交流会のアンケートへ」「交流会のLINEグループに参加する」を見る。開き直すと「送り直す」（両方の幅で axe）
- [x] T016 [US2・US3・US4] 同じファイル：主催者が手でのチェックインの人の回答を代わりに入れ、困りごとの画面で絞りこみ・並べ替え、CSV を書き出す。受付係は困りごとを開けない

## Phase 7: 仕上げ

- [x] T017 `docs/apps/survey.md` を書き、`docs/README.md` 2章・`docs/architecture.md` を直す
- [x] T018 `pnpm check` を通す（quickstart 1）
- [ ] T019 本番に出したあと、quickstart 3 を確かめる
