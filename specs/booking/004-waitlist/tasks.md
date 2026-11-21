# Tasks: 定員・キャンセル待ち・期限つきの繰り上げ・変更と中止の知らせ（booking-004）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/booking-waitlist.md](./contracts/booking-waitlist.md)

テストを先に書き、落ちるのを見てから作る。[P] はほかと同時に進められるもの。

## Phase 1: DB の変更（1つ目の PR `feature/booking-004-waitlist`）

- [x] T001 約束の選択肢を先に置く：`packages/contracts/src/booking/options.ts`（`ENTRY_STATUSES` に `waitlisted`・`offered`・`OFFER_STATUSES`・`QUOTA_SOURCES`・`PAGE_STATES` に `cancelled` と言葉・`SEAT_STATUSES`）・`notify-options.ts`（`same_day`）・`index.ts`。単体のテスト（言葉がそろう・`QUOTA_SOURCES` は受付の媒体から直接を除いたもの）
- [x] T002 結合のテストを先に書く（`apps/api/src/modules/booking/waitlist-schema.test.ts`）：定員の CHECK（0・1001 は落ちる・空は通る）・状態 `waitlisted`・`offered`・枠の媒体の CHECK（直接は落ちる）・席の CHECK・URL の CHECK・枠の一意・打診の状態の CHECK・待っている打診は申込みごとに1つ（終わった打診は何個でも）・返事の札の一意・知らせの種類 `same_day`・交流会を消すと枠と打診が消える・申込みを消すと打診が消える・主催者を消すと `offered_by` が空になる。`schema.test.ts` の CHECK の値の見張りに新しい値を足す
- [x] T003 `apps/api/src/modules/booking/schema.ts`：列・CHECK・索引と、`booking_quota`・`booking_offer`
- [x] T004 `pnpm db:generate --name booking_waitlist` → `apps/api/drizzle/0019_booking_waitlist.sql` を読む（足す・CHECK を広げるだけで、消す・名前を変える・NOT NULL で既定値なしがないこと）→ `pnpm db:migrate`
- [x] T005 `pnpm check` を流し、コミットする

## Phase 2: 基礎（2つ目の PR `feature/booking-004-pr2-waitlist`）

- [ ] T006 [P] 単体のテストを先に書く（`deadline.test.ts`）：24時間・夜（0時ちょうどはそのまま・0時より後は9時・8:59:59.999 は9時・9時ちょうどはそのまま）・始まりの2時間前（ちょうどはそのまま・過ぎたら2時間前）・2時間前が夜なら0時・1時間ちょうどは打診する・1時間に1ミリ秒足りなければ null・サーバーの時刻帯に頼らない（`TZ` を変えても同じ）
- [ ] T007 [P] `deadline.ts`（`offerDeadline`）
- [ ] T008 [P] 単体のテストを先に書く（`seats.test.ts`）：埋まった席・枠の未充足・押さえをやめたあと・自前の残り・満員・超えた人数・止める媒体・期限を過ぎた打診中を数えない・新しい申込みの行き先（確定・キャンセル待ち・当日の空き）・何番目か
- [ ] T009 [P] `seats.ts`
- [ ] T010 [P] 約束：`waitlist.ts`（`CapacityInput`・`SeatSummary`・`OfferAnswerInput`・`ChangeNoticeInput`・`NoticeLog`・`WaitlistJobSummary`・値）・`roster.ts`（`BookingSetting`・`RosterEntry`・`Roster.counts`・`RosterEntryInput.waitlist`・`RosterStatusInput` を確定と取り消しに）・`apply.ts`（`ApplyPage.seats`・`MyEntry`・`MyEntryItem`・`EntryTokenView` の欄）・`errors.ts` と単体のテスト（枠の合計・URL・同じ媒体）
- [ ] T011 `waitlist-repository.ts`（枠・打診・設定の列・席を数える行）

## Phase 3: US1 定員と枠・満員（P1）

- [ ] T012 結合のテストを先に書く（`capacity.test.ts`）：定員と枠を保存・設定の答えの `seats`（埋まった席・自前の残り・枠の残り・満員・止める媒体〈URL〉・超えた人数）・満員で押さえをやめる・400（合計・直接・同じ媒体・URL）・403（受付係・部員）・409（受付だけ）・名簿を使う交流会は目安だけ
- [ ] T013 `routes-waitlist.ts`（`PUT capacity`）・`routes.ts`（設定の欄）

## Phase 4: US2・US3 キャンセル待ちと打診（P1）

- [ ] T014 結合のテストを先に書く（`waitlist.test.ts`）：残り0で申し込むとキャンセル待ち（LINE・メール）と何番目か・`waitlisted` の知らせ・ページの席の欄・取り消しで先頭に打診（期限・知らせ・返事のリンク）・定員を増やすと打診・参加で確定（確定の知らせ）・辞退で次へ・期限の後の返事は 410・期限切れで取り消しと `offer_expired` と次へ・待ちを飛びこさない・最後の1席に同時に2人・片付けを同時に2回（打診は1つ・知らせは1回）・キャンセル待ちの取り消しで何番目かが繰り上がる・ほかの人の行への返事は 404・札（申込みの札・返事の札）での返事・GET で状態が変わらない
- [ ] T015 `waitlist.ts`（片付け・知らせの送り・返事）・`apply.ts`（定員つきの申込みと確定・取り消しのあとの片付け・何番目か・席の欄）・`apply-repository.ts`・`routes-waitlist.ts`（返事）
- [ ] T016 結合のテストを先に書く（`waitlist-job.test.ts`）：合言葉なし・違う → 404 で何も変わらない・合う → 期限切れを片付けて次へ・答えは数だけ・ログに名前とアドレスがない
- [ ] T017 `routes-waitlist.ts`（`POST /jobs/tick`）・`waitlist.ts`（`runWaitlistJob`）

## Phase 5: US4 当日の空き（P2）

- [ ] T018 結合のテストを先に書く（`waitlist.test.ts` に足す）：3時間を切って空くと打診しない・ページは当日の空き・`same_day` は1回だけ・キャンセル待ちの「参加する」で先着に確定・埋まったら 409・新しい申込みは確定
- [ ] T019 `waitlist.ts`・`apply.ts`

## Phase 6: US5 主催者の手の操作と送った知らせ（P2）

- [ ] T020 結合のテストを先に書く（`waitlist-admin.test.ts`）：名簿の欄（何番目か・打診の期限・人数）・手で打診（席がなくても・1時間取れなければ 409・キャンセル待ちでなければ 409）・確定にする（確定の知らせ・打診を取り下げ）・取り消す（次へ）・手で足すときキャンセル待ちに入れる・送った知らせの一覧（新しい順・アドレスと本文がない・受付係は 403）
- [ ] T021 `routes.ts`（状態・手で足す・名簿の欄）・`views.ts`・`routes-waitlist.ts`（手で打診・送った知らせ）

## Phase 7: US6 変更と中止（P2）

- [ ] T022 結合のテストを先に書く（`change-cancel.test.ts`）：自前にすると知らせた日時と場所を持つ・日時を直すと設定の答えに `change`・変更を知らせる（確定・打診中・キャンセル待ちに `changed`、取り消しには送らない・前の日時と場所）・知らせずに済ませる・変更がなければ 409・定期の仕事は気づいて30分のあと1回だけ送る・戻ったら消す・中止（取り消し・`cancelled_event`・ページは中止・申込みと受付を開くは 409・2回目は同じ答え）・403（受付係・部員）
- [ ] T023 `waitlist.ts`（変更・中止）・`routes-waitlist.ts`・`routes.ts`（使い方を自前にしたとき知らせた日時と場所を持つ）・`notice-templates.ts`（`same_day`・状態の言葉）

## Phase 8: 画面

- [ ] T024 [P] 画面の単体のテストを先に書く（`waitlist-pages.test.tsx`）：定員の節（保存・枠を足す・外す・内訳・満員と止める媒体のリンク・超えた人数・変更の帯の2つのボタン・中止の確かめの枠）・申込みページ（残り・満員・当日の空き・中止・キャンセル待ちの完了の画面・打診中）・自分の申込み（何番目か・打診中の参加と辞退・当日の空きの参加・期限切れ）・札のページ（返事）・名簿（キャンセル待ちの絞り込み・何番目か・期限・手で打診・確定・送った知らせ・満員で手で足すときの選び）
- [ ] T025 `waitlist-api.ts`・`SeatSummary.tsx`・`CapacitySection.tsx`・`NoticeLog.tsx`・`ModeSection.tsx`・`RosterPage.tsx`・`ApplyPage.tsx`・`MyBookingsPage.tsx`・`EntryTokenPage.tsx`・`apply-parts.tsx`
- [ ] T026 E2E（`e2e/tests/booking-waitlist.spec.ts`）：主催者が定員1にする → 参加者 B が申し込む（確定）→ C が申し込む（キャンセル待ち1番目）→ 主催者の画面に満員 → B が取り消す → C の自分の申込みに打診中 → 参加する → 確定 → 名簿の送った知らせ → 変更の帯で知らせる → 予約を中止する → ページは中止。アクセシビリティ（1440px・375px）と CSP の違反がないこと

## Phase 9: 守りと仕上げ

- [ ] T027 今の形の文書：`docs/apps/booking.md`（表・窓口・画面・知らせ・定期の仕事）・構成の決めごと AD-24 の注（定時の処理の時間を9時〜23時台に・変更は比べる形）・AD-3 の注（`booking_setting` の列）
- [ ] T050 守りの確かめ（research S1〜S15）：表の各行がテストか読み合わせで確かめられたかを見直し、足りないテストを足す。`pnpm security:check`
- [ ] T051 `pnpm check` と関わる E2E を流し、コミットする。spec.md の Status を直す

## Analyze（2026-11-20）

spec・plan・tasks・research・data-model・contracts を突き合わせた（`/speckit-analyze` の観点：重なり・あいまい・書き漏れ・Constitution・取りこぼし・食い違い）。

| 観点 | 見つけたこと | 直したこと |
|---|---|---|
| 食い違い | contracts で `BOOKING_WAITLIST_OFF` を手で足すときだけ 400 にしていた | どちらも 409 にそろえた |
| 取りこぼし | FR-016（参加者の画面にほかの人の名前を出さない）を確かめる作業がなかった | T014 に「ページの答えに名前がない」を足す（S13） |
| あいまい | 「始まりを過ぎた打診中」の扱い（期限は始まりの2時間前までだが、日時の変更で始まりが早まると期限より前に始まる） | research R6 に「返事は始まりの前までしか受けない」と書いた |
| Constitution | V（運用費）：Cloud Scheduler の4つ目の仕事が無料の枠を超える | plan の Constitution Check と quickstart に費用（月0.1米ドル）と、仕事なしでも動く形を書いた |
| 書き漏れ | AD-24 は定時の処理を「8時〜24時」と書いているが、この仕様は9時〜23時台（8時台は DB の起動を待つ） | T027 で AD-24 に日付つきの注を足す |
| 範囲 | `same_day` は PRD FR-B80 の6つの外 | plan の Complexity Tracking と research R7 に理由を書いた |

FR-001〜FR-016 は、どれも1つ以上の作業（テストと作り）に当たる。CRITICAL の食い違いはない。
