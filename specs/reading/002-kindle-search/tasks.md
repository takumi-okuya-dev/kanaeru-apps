# Tasks: 読書記録の Kindle の取りこみ・探す・あとで調べる（reading-002）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/reading.md](./contracts/reading.md)・[quickstart.md](./quickstart.md)

テストを先に書き、落ちるのを見てから作る。`[P]` は、ほかと違うファイルで、同時に進められる作業。

## Phase 0: 前提

- [ ] T001 reading-001 の pr1・pr2 が `develop` に入ったことを確かめる。DB の変更の PR はほかに開いていないことを確かめる（AD-17）
- [ ] T002 持ち主から、日本語の Kindle アプリで書き出した HTML を1つ受け取る（リポジトリの外に置く）。形を読んで、research R2・R3 と違う所があれば直す

## Phase 1: 列を足す（PR `feature/reading-002-pr1-research`）

- [ ] T003 [P] 約束：`packages/contracts/src/reading/limits.ts` に `READING_MARKER_LIMITS.learned = 2_000` と `READING_SEARCH_LIMITS.query = 100` を足し、`limits.test.ts` を直す
- [ ] T004 結合のテストを先に書く：`apps/api/src/modules/reading/schema.test.ts` に、`learned` は null か 1〜2,000字・`learned` と `researched_at` は両方ある（null の組）か両方ない、を足す
- [ ] T005 `apps/api/src/modules/reading/schema.ts` の `readingMarker` に `learned`（text）・`researchedAt`（timestamptz）と CHECK 2つ・索引 `(owner_account_id, question, researched_at)` を足す
- [ ] T006 `pnpm db:generate --name reading_research` を流し、できた SQL を読む（列と CHECK と索引を足すだけであること）。`pnpm db:migrate`・`pnpm db:check`
- [ ] T007 [P] 文書：`docs/apps/reading.md` の表に2つの列を足す
- [ ] T008 `pnpm check` を流し、結果を PR に書く。DB の変更の PR なので、ラベル `run-ci` を付ける

## Phase 2: 約束（PR `feature/reading-002-pr2-kindle-search`）

- [ ] T009 [P] `packages/contracts/src/reading/search.ts` と `search.test.ts`：`normalizeForSearch`（NFKC → カタカナをひらがなに → 小文字）・`findMatches(original, query)`（もとの文の中の位置。全角・かな・絵文字でずれない）・`escapeLike`（`%`・`_`・`\`）
- [ ] T010 [P] `packages/contracts/src/reading/research-prompt.ts` と `research-prompt.test.ts`：`buildResearchPrompt({ title, chapter, text, comment, want })`・`RESEARCH_TARGETS`（chatgpt・claude・google の URL の頭と画面の言葉）・`researchUrl(target, prompt)`（2,000字をこえたら null＝コピーに切りかえる）
- [ ] T011 [P] 約束：`question.ts`・`search-result.ts`（`SearchInput`・`SearchResult`・`QuestionList`）と、`marker.ts` の `Marker` に `learned`・`researchedAt`、`MarkerUpdateInput` に `learned` を足す（*.test.ts つき）

## Phase 3: User Story 1 - Kindle の書き出しを取りこむ (Priority: P1) 🎯 MVP

- [ ] T012 [P] [US1] 架空の見本：`apps/web/src/features/reading/import/__fixtures__/kindle-en.html`・`kindle-ja.html`（T002 の形を写した架空の文。章2つ・ハイライト3つ・メモ1つ・ページのある本とない本の見出し・「Highlight(」の空白の揺れ・「…」で終わるもの）
- [ ] T013 [P] [US1] 読み方のテストを先に書く：`import/kindle.test.ts`（R2 の決まりをひとつずつ。英語と日本語の見本で同じ結果・メモだけ・Kindle でない HTML はエラー・スクリプトの要素があっても動かない）
- [ ] T014 [US1] `apps/web/src/features/reading/import/kindle.ts`：`readKindleHtml(text)` が `{ title, author, markers, truncatedCount }` を返す（`ImportedMarker` と同じ形。DOMParser・textContent だけ）
- [ ] T015 [P] [US1] Web のノートブックの貼り付けのテストと読み方：`import/kindle-notebook.ts`・`kindle-notebook.test.ts`（R3）
- [ ] T016 [US1] 画面：`ImportPage.tsx` の「ファイルを選ぶ」で、HTML なら `readKindleHtml`、PDF なら `readGoodNotesPdf` に分ける（`accept` に `.html`）。貼り付けは、Web のノートブックの形なら `kindle-notebook`、そうでなければ reading-001 の貼り付けで読む。下書きに書名を入れ、確かめの画面の `guessBook` に書名を使う。「切れたかもしれない」数を確かめの画面に出す。テストを `ImportPage.test.tsx`・`ConfirmImportPage.test.tsx` に足す。取りこみの `source` は `kindle`

## Phase 4: User Story 2 - すべての本をまたいで探す (Priority: P1)

- [ ] T017 [P] [US2] 窓口のテストを先に書く：`routes.test.ts`「探す」（かな・全角・大文字・記号・本ごと・1冊20件と全体100件・ほかの人の記録に当たらない・消したマーカーに当たらない・空は 400）
- [ ] T018 [US2] `apps/api/src/modules/reading/search.ts`（R5：本人の行から `lower()` の `LIKE … ESCAPE` で候補を取り、`findMatches` で確かめ直す）と、`routes.ts` に `POST /search`
- [ ] T019 [P] [US2] 画面のテストを先に書く：`ShelfPage.test.tsx`（探す欄・結果が本ごと・当たった所・押すと `/reading/books/$bookId#marker-<id>`・URL に言葉が出ない）
- [ ] T020 [US2] 画面：`SearchResults.tsx` と、`ShelfPage.tsx` の上に探す欄（見本の1）。`BookPage.tsx` は道のハッシュ `#marker-<id>` のマーカーへ移る

## Phase 5: User Story 3 - あとで調べる (Priority: P2)

- [ ] T021 [P] [US3] 窓口のテストを先に書く：`routes.test.ts`「あとで調べる」（`GET /questions` の並び・`learned` を入れると `researchedAt`・空で両方消える・取りこみ直しで消えない・まとめるとまとめ先が空なら元の値・ほかの人のマーカーは 404）
- [ ] T022 [US3] `routes.ts` に `GET /questions`。`repository.ts` の `updateMarker` に `learned`、`mergeBooks` の ON CONFLICT に `learned`・`researched_at`（まとめ先が空なら元）を足す
- [ ] T023 [P] [US3] 画面のテストを先に書く：`QuestionsPage.test.tsx`（並び・調べる先の選び方を端末に覚える〈localStorage が使えなくても動く〉・「調べる」のリンクの URL と新しいタブ・長いときはコピー・URL に入る知らせ・分かったことを書いて「調べた」・閉じた「調べ終えたもの」）
- [ ] T024 [US3] 画面：`QuestionsPage.tsx`（見本の5）と道 `/reading/questions`・`nav-items.ts` に「あとで調べる」（アイコン `search`）。`BookPage.tsx` のマーカーに分かったことを出す

## Phase 6: User Story 4 - どの章を読んだか (Priority: P3)

- [ ] T025 [US4] `BookPage.tsx` の上に「マーカーのある章 N」と章ごとの数（押すとその章の見出しへ）。テストを `BookPage.test.tsx` に足す

## Phase 7: 仕上げ

- [ ] T026 [P] ログのテスト：`logging.test.ts` に、探す言葉と分かったことを足す
- [ ] T027 [P] E2E：`e2e/tests/reading.spec.ts` に、Kindle の見本の HTML を取りこむ・探す・あとで調べるの流れと axe を足す
- [ ] T028 [P] 文書：`docs/apps/reading.md` に窓口・画面・Kindle の読み方・調べる先を足す
- [ ] T029 `pnpm check` を流し、結果を PR に書く
- [ ] T030 持ち主の iPhone で、Kindle の書き出しの取りこみと、3つの調べる先が文の入った状態で開くかを確かめる

## Dependencies & Execution Order

- Phase 0 → Phase 1（pr1）→ Phase 2 → Phase 3〜6 → Phase 7。pr1 は reading-001 のあと、pr2 は pr1 のあと。
- US1（Kindle）は T002（実物）のあとに見本を固める。それまでは英語の見本で読み方を作ってよい。US2・US3・US4 は互いに関係しない。

## Implementation Strategy

1. MVP：Phase 1〜3（Kindle の取りこみ）。持ち主が Kindle と GoodNotes の両方を取りこめる（SC-005）。
2. US2（探す）・US3（あとで調べる）を足す。
3. US4 と仕上げのあと、pr2 を出す。
