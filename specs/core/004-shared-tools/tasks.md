# Tasks: 共通の道具をまとめると DB の変更の確かめ（core-004）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

**Tests**: テストを先に書く（落ちることを確かめてから作る）。今の CSV のテストは期待の値を直さない。

## Phase 1: Setup

- [X] T001 包み `packages/csv` の骨組みを作る（`package.json` の名前 `@workspace/csv`・`exports`・`typecheck`、`tsconfig.json`、`vitest.config.ts`）。API と画面の `package.json` には足さない（使う API だけに足す）。`pnpm install` で workspace に入れる

## Phase 2: Foundational（共通の道具。US1）

- [X] T002 [P] [US1] `packages/csv/src/csv.test.ts`：守り（`=`・`+`・`-`・`@`・タブ・CR）・囲み（`"`・`,`・CR・LF）・途中の `=` は守らない・空の欄・BOM・CRLF・最後の行の CRLF・見出しだけ（行が0）を確かめる
- [X] T003 [US1] `packages/csv/src/index.ts`：`csvCell`・`buildCsv`（R1）。T002 を通す
- [X] T004 [P] [US1] `packages/contracts/src/core/jst.test.ts`：`jstDateTime` を足す。日本時間 0時・23:59・UTC の日付の変わり目・秒の切り捨て・ISO の文字を受ける・読めない時刻で投げる。今の Intl の書き方と同じ出力になることも確かめる
- [X] T005 [US1] `packages/contracts/src/core/jst.ts`・`index.ts`：`jstDateTime` を足して出す（R2）
- [X] T006 [P] [US1] `apps/api/src/kernel/http.test.ts`（なければ作る）：`csvAttachment` のヘッダー2つ・日付（日本時間。`now` を固定）・使えない名前で投げる
- [X] T007 [US1] `apps/api/src/kernel/http.ts`：`csvAttachment`（R3）
- [X] T008 [P] [US1] `apps/web/src/lib/download.test.ts`：`fetchDownload`（ファイル名を読む・ない時は既定の名前・エラーの応答は ApiError・通信の失敗は NetworkError）と `saveFile`（a の download・URL を後で返す）
- [X] T009 [US1] `apps/web/src/lib/download.ts`：`fetchDownload`・`saveFile`・型 `DownloadedFile`（R4）
- [X] T010 [P] [US1] `tests/lint`：`packages/csv/src` から `@workspace/contracts`・`apps/` を読むと止まることを確かめる
- [X] T011 [US1] `eslint.config.js`：`packages/csv/src/**` の `no-restricted-imports`（R6）

## Phase 3: User Story 2 — 使う側を書きかえる（出力は変えない）

- [X] T012 [US2] `apps/api/package.json` に `@workspace/csv` を足す。`apps/api/src/modules/reception/csv.ts`：`BOM`・`csvCell`・`formatJstDateTime` の写しを消し、`buildCsv`・`jstDateTime` を使う。見出しの定数と行の作り方は残す
- [X] T013 [US2] `apps/api/src/modules/survey/csv.ts`：同じ
- [X] T014 [US2] `apps/api/src/modules/reception/routes.ts`・`survey/routes.ts`：`csvAttachment("participants")`・`csvAttachment("concerns")` を使う
- [X] T015 [US2] `apps/web/src/features/reception/api.ts`・`DataPage.tsx`：`fetchDownload`・`saveFile` を使い、写しと `DownloadedCsv` を消す
- [X] T016 [US2] `apps/web/src/features/survey/api.ts`・`ConcernsCsvSection.tsx`：同じ
- [X] T017 [US2] 今の reception・survey の API と画面と E2E の CSV のテストを、期待の値を直さずに流す。写しを直接テストしていたもの（`formatJstDateTime`・`csvCell` の import）は、共通の道具のテストに移っていれば消し、残すものは import の先だけ直す

## Phase 4: User Story 3 — DB の変更の確かめ

- [X] T018 [P] [US3] `tests/db/vitest.config.ts`・`tests/db/check-migrations.test.ts`：記録の確かめ（`idx` の飛び・`when` の逆順・ない SQL・記録にない SQL・正しい記録）を、一時のフォルダの仮の記録で確かめる
- [X] T019 [US3] `scripts/db/check-migrations.ts`：記録の確かめ・`drizzle-kit check`・写しをとっての `drizzle-kit generate` と元に戻すこと（R5）。T018 を通す
- [X] T020 [US3] ルートの `package.json`：`db:check` を足し、`check` の `security:check` のあとに入れる
- [X] T021 [US3] quickstart の 3 を手で試す（作り忘れ・順番・何も変えない）。作業の木に差分が残らないことを確かめる

## Phase 5: Polish

- [X] T022 文書に1行ずつ足す：`docs/rules/coding.md`（共通の道具の置き場所と `db:check`）・`docs/rules/parallel-development.md` 4（`db:check`）・`docs/architecture.md`（`packages/csv`）・`docs/decisions.md` は足さない（構成の決めごとに書いてある）
- [X] T023 quickstart の 2（守りの処理が1か所か）を確かめる
- [X] T024 `pnpm check` を全部流す。結果を PR に書く

## Dependencies

- T001 → T002・T003。T004〜T011 は互いに独立（[P]）。
- Phase 3 は Phase 2 のあと。T012・T013 は T003・T005 のあと、T014 は T007 のあと、T015・T016 は T009 のあと。
- Phase 4 は Phase 2・3 と独立。
- Phase 5 は最後。
