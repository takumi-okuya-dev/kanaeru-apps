# Tasks: 予約の名簿（booking-001）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/booking.md](./contracts/booking.md)

テストを先に書き、落ちるのを見てから作る。[P] はほかと同時に進められるもの。

## Phase 1: DB の変更（1つ目の PR `feature/booking-001-roster`）

- [x] T001 約束の選択肢を先に置く：`packages/contracts/src/booking/options.ts`（`BOOKING_MODES`・`ENTRY_KINDS`・`ENTRY_STATUSES`・`ATTENDANCES` と言葉）・`index.ts`。単体のテスト `options.test.ts`（言葉がそろう）
- [x] T002 結合のテストを先に書く（`apps/api/src/modules/booking/schema.test.ts`）：選択肢の code はどれも DB に入る・ほかの値は CHECK で止まる・`checkin_id` の一意・交流会を消すと名簿が消える（CASCADE）・チェックインを消すと `checkin_id` が空になる・入れた人を消すと空になる
- [x] T003 `apps/api/src/modules/booking/schema.ts` に4つの表を書く
- [x] T004 `pnpm db:generate --name booking` → `apps/api/drizzle/0016_booking.sql` を読む（表を足すだけで、消す・名前を変えるがないこと）→ `pnpm db:migrate`
- [x] T005 `pnpm check` を流し、コミットする

## Phase 2: 土台（2つ目の PR `feature/booking-001-pr2-roster`）

- [x] T006 reception の結合のテストを先に書く（`apps/api/src/modules/reception/attendees.test.ts`）：`listEventAttendees` はその交流会だけ・古い順・`hasCheckedIn`・`createManualCheckin` は手でのチェックインの窓口と同じ金額と割引
- [x] T007 reception：`manual.ts`（`createManualCheckin`。窓口の手でのチェックインもこれを使う）・`repository.ts`（`listEventAttendees`・`hasCheckedIn`）・`index.ts` から出す
- [x] T008 [P] 約束：`roster.ts`（入出力の形）・`errors.ts`・`paths.ts` と単体のテスト（上限・選べる使い方）
- [x] T009 領域の登録：`apps.list.ts` の受付の行（`domains` に booking・`accountData`）・`modules.list.ts`・`features.list.ts` に1行ずつ。`booking/index.ts`（API・画面）
- [x] T010 [P] 純粋な関数の単体のテストを先に書く：`importing.test.ts`（入る・すでにある〈数で比べる・取り消しも数える・媒体ごと〉・名前が空・同じ名前）・`matching.test.ts`（手・自動・候補が1つだけ・2つなら出ない・ちがう人・取り消しは当てない・来なかった）
- [x] T011 `importing.ts`・`matching.ts`

## Phase 3: US1 使い方と取り込み（P1）

- [x] T012 結合のテストを先に書く（`apps/api/src/modules/booking/roster.test.ts`）：使い方の読み書き（受付係は読めて変えられない）・受付だけなら 409・見積もりと取り込み・2回目は増えない・列の対応を覚えて持ち主ごとに返す・上限を超える行は 400・ほかの人の交流会は 403
- [x] T013 `repository.ts`・`views.ts`・`routes.ts`（使い方・名簿・取り込み・列の対応）
- [x] T014 テストの手伝い `apps/api/test/helpers/booking.ts`（使い方を名簿にする・取り込む）

## Phase 4: US2 当て・飛び入り・来なかった（P1）

- [x] T015 結合のテストを先に書く（`apps/api/src/modules/booking/match-routes.test.ts`）：LINE のチェックインが候補に出る・当てると来た・ちがう人で出なくなる・同じアカウントは自動・名簿から選ぶ・飛び入りにする・名簿から選んで手でチェックイン・飛び入りの手でのチェックイン・当てを外す（自動は 409）・2つの行に同じチェックインは 409・ほかの交流会のチェックインは 404・チェックインを取り消すと外れる・日が終わると来なかった
- [x] T016 `routes.ts`（当ての窓口）

## Phase 5: US3 手で直す（P2）

- [x] T017 結合のテストを先に書く：1人足す（受付係も）・取り消しと戻す（受付係は 403）・同じ名前の印・まとめる（名前が違えば 400・当ては残る）・書き出し（受付係は 403・式の守り）
- [x] T018 `routes.ts`・`csv.ts`

## Phase 6: 退会

- [x] T019 結合のテストを先に書く（`withdrawal.test.ts`）：個人の交流会の持ち主が退会すると名簿も消える・確かめの中身に名簿の人数・組織の交流会の名簿は残る
- [x] T020 `withdrawal.ts` と `index.ts` の `withdrawal`

## Phase 7: 画面

- [x] T021 差しこみの場所：event `setup-slots.ts`（`registerSetupSection`）と準備の画面・reception `slots.ts` の `registerReceptionSection` と一覧画面・reception の画面の `index.ts` から欄と読み直しの決め方を出す。単体のテスト
- [x] T022 [P] 画面の単体のテストを先に書く：`csv-read.test.ts`（UTF-8・BOM・Shift_JIS・囲み・改行・見出し）・使い方の節（確かめの枠）・ナビ（名簿を使う交流会だけ）・名簿（絞りこみ・人数・同じ名前・手で足した・受付係にはボタンを出さない）・入れる（見積もり・N人を取り込む）・名簿に当てる（候補・ちがう人・名簿から選ぶ・飛び入り）
- [x] T023 `api.ts`・`queries.ts`・`nav-items.ts`・`ModeSection.tsx`・`ReceptionRosterSection.tsx`・`RosterPage.tsx`・`ImportPage.tsx`・`csv-read.ts`・`MatchPage.tsx`・`routes.ts`
- [x] T024 E2E（`e2e/tests/booking.spec.ts`）：使い方を名簿にする → CSV を取り込む（もう一度で増えない）→ LINE でチェックイン → 受付係が候補を当てる → 来た。日の過ぎた交流会で来なかった。アクセシビリティ（1440px・375px）

## Phase 8: 仕上げ

- [x] T025 今の形の文書：`docs/apps/booking.md`（新）・`docs/README.md` 2章に1行・`docs/apps/reception.md`（index の関数・差しこみの場所）・`docs/apps/event.md`（準備の画面の差しこみの場所）
- [ ] T026 `pnpm check` と関わる E2E を流し、コミットする

## セルフレビューの直し（2026-11-21）

- [x] T030 まとめた行を消さずに残す（`booking_entry.merged_into_id`。0015 に足す）。名簿・人数・当てから隠し、取り込みの「すでにある」には数える。結合のテスト「まとめたあとに同じ CSV を取り込み直しても増えない」
- [x] T031 2つともチェックインに当たっている行はまとめず 409 `BOOKING_MERGE_BOTH_MATCHED`。片方だけなら当てが残す行へ移るテスト
- [x] T032 列が多い・見出しが長い CSV は、画面が `mapping` を送らずに名前だけで取り込む（`importMappingFits`）
- [x] T033 名前がそろう当たっていないチェックインが2つ以上なら候補を出さない（`matching.ts`）
- [x] T034 名簿の人数の「来た」は確定の行だけ数える（`views.ts`）
