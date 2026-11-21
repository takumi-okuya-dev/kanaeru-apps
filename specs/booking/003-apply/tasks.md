# Tasks: 自前の申込みページ（booking-003）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/booking-apply.md](./contracts/booking-apply.md)

テストを先に書き、落ちるのを見てから作る。[P] はほかと同時に進められるもの。

## Phase 1: DB の変更（1つ目の PR `feature/booking-003-apply`）

- [x] T001 約束の選択肢を先に置く：`packages/contracts/src/booking/options.ts`（`BOOKING_MODES` に `self_page`・`ENTRY_KINDS` に `self_page`・`VISIBILITIES`・`PAGE_STATES` と言葉・`usesRoster`）・`index.ts`。単体のテスト `options.test.ts`（言葉がそろう・`usesRoster`）
- [x] T002 結合のテストを先に書く（`apps/api/src/modules/booking/apply-schema.test.ts`）：使い方 `self_page` が入る・既定は閉じる・誰でも・見せる範囲の CHECK・入口 `self_page`・連絡のメールの長さ・札の一意・`(event_id, contact_email)` の一意・同意の相手はどちらか1つ・同意の一意（組織・持ち主ごと）・組織・持ち主・本人を消すと同意が消える・交流会を消すと確認の待ちが消える・確認の待ちの札の一意。`schema.test.ts` の CHECK の値の見張りに新しい値を足す
- [x] T003 `apps/api/src/modules/booking/schema.ts`：列・CHECK・一意と、`booking_consent`・`booking_email_request`
- [x] T004 `pnpm db:generate --name booking_apply` → `apps/api/drizzle/0018_booking_apply.sql` を読む（足す・CHECK を広げるだけで、消す・名前を変える・NOT NULL で既定値なしがないこと）→ `pnpm db:migrate`
- [x] T005 `pnpm check` を流し、コミットする

## Phase 2: 共通（2つ目の PR `feature/booking-003-pr2-apply` の1つ目のコミット）

- [ ] T006 参加者の道：`packages/contracts/src/core/participant-paths.ts` に `apply`・`entry`・`myBookings` と単体のテスト。`pnpm check` を流し、共通だけのコミットにする

## Phase 3: 基礎（約束・札・event の関数）

- [ ] T007 [P] 約束：`apply.ts`（`ApplyInput`・`EmailApplyInput`・`SelfPageInput`・`ApplyPage`・`MyEntry`・`ApplyResult`・`EntryTokenView`・`MyEntryList`・`MyEntryItem`・`MySchedule`・`ConsentList`）・`roster.ts`（`BookingSetting` の欄）・`errors.ts`・`calendar.ts`（`googleCalendarUrl`・`EVENT_DEFAULT_DURATION_MINUTES`）と単体のテスト
- [ ] T008 [P] `tokens.ts`（札を作る・SHA-256・形）を作り、`line-link.ts` をそれで書きかえる
- [ ] T009 event の `repository.ts`・`index.ts` に `listOrganizationEvents` を出す（結合のテストを event に足す）

## Phase 4: US2 主催者が自前を選び、受付を開く（P1）

- [ ] T010 結合のテストを先に書く（`apps/api/src/modules/booking/self-page.test.ts`）：使い方 `self_page` に変えられる・`setting` に受付・見せる範囲・始まり・組織の欄・`self-page` で開く・閉じる・部員だけ（組織なしは 400）・自前でないと 409・受付係と部員は 403・自前でも名簿の窓口が動く
- [ ] T011 `apply-repository.ts`（設定の列）・`routes.ts`（`self-page`・`setting`・名簿の確かめを `usesRoster` に）

## Phase 5: US1 LINE で申し込む（P1）

- [ ] T012 単体のテストを先に書く（`calendar-ics.test.ts`・`calendar.test.ts`）：`.ics` の形（CRLF・折り返し・escape・UID・終わりは2時間後）・Google のリンクの値
- [ ] T013 結合のテストを先に書く（`apps/api/src/modules/booking/apply.test.ts`）：ログインなしのページ（中身・受付の状態・席の欄がない・自前でないと 404）・ログインしたページ（名前の初めの値・自分の申込み・同意・紐づけ）・申し込む（入口 自前・媒体 直接・確定・201）・2回目は同じ答えで1行・取り消しから申し込み直し・閉じている・始まりのあとは 409・案内の同意（作る・すでにある・false では消さない・組織と持ち主）・確定の知らせ（偽の送り手・記録・リンク）・`.ics`（添付・中身）・名前の誤りは 400・LINE のチェックインが同じアカウントの自前の申込みに自動で当たる（FR-015）
- [ ] T014 `apply.ts`（ページ・申し込む）・`calendar-ics.ts`・`routes-apply.ts`（ページ・申し込む・`.ics`）・`index.ts`
- [ ] T015 `notify.ts`・`notify-repository.ts`：行の連絡のメールを送り先に足す（`send-notice.test.ts` に足す）

## Phase 6: US3 自分の申込み・取り消し・部の予定・同意（P2）

- [ ] T016 結合のテストを先に書く（`apps/api/src/modules/booking/my-bookings.test.ts`）：自分の申込み（始まりの日が終わっていない会だけ・近い順・取り消せるか）・取り消す（名簿でも取り消し・始まりのあとは 409・ほかの人の行は 404・2回目は同じ答え）・部の予定（自分の組織の自前の会だけ・部員だけの回を含む・ほかの組織と個人の会は出ない・自分の状態）・同意の一覧と外す（ほかの人のものは 404）
- [ ] T017 `apply.ts`・`routes-apply.ts`（自分の申込み・取り消す・部の予定・同意）

## Phase 7: US4 部員だけの回（P2）

- [ ] T018 結合のテストを先に書く（`apply.test.ts` に足す）：部員と主催者はページ・申込み・`.ics` に答える・受付係・外の人・ログインなしは 403 で中身がない・部員が抜けたら見られない・抜けた人も自分の申込みを取り消せる
- [ ] T019 `apply.ts`（見せる範囲の確かめ）

## Phase 8: US5 メールで申し込む（P2）

- [ ] T020 結合のテストを先に書く（`apps/api/src/modules/booking/email-apply.test.ts`）：確認の待ち（202・偽の送り手にリンク・DB は SHA-256 だけ）・札の中身（`pending`・期限切れ 410・知らない 404）・GET では確定しない・確定（行・アカウントなし・連絡のメール・確定の知らせのメール・同じ札で `entry`）・2回押しても1行・取り消す（始まりのあとは 409）・10分以内の2回目は送らない（答えは同じ）・すでに申込みがあるアドレスも同じ答え・新しい札で確定すると前の札は使えない・交流会ごとの200件で 429・部員だけ 403・閉じている 409・名簿と CSV にアドレスがない・ログにアドレスと札がない
- [ ] T021 `apply.ts`（確認の待ち・札）・`routes-apply.ts`（メールで申し込む・札）・`notice-templates.ts`（確認のメールの文面）

## Phase 9: 名簿・まとめる・退会

- [ ] T022 結合のテストを先に書く：名簿の入口「自前」と CSV（`roster.test.ts` に足す）・まとめるで連絡のメールと札を移す・退会の確かめの中身（申込みと同意の数）と退会で申込みと同意が消える（`withdrawal.test.ts` に足す）
- [ ] T023 `routes.ts`（まとめる）・`withdrawal.ts`

## Phase 10: 画面

- [ ] T024 [P] 画面の単体のテストを先に書く（`apply-pages.test.tsx`）：申込みページ（ログインなし・閉じている・始まりのあと・部員だけ・ログインしたあとの名前と同意・申し込んだあとの完了の画面・メールの切り替え・送ったあとの文）・札のページ（確定の前・確定のあと・取り消し・期限切れ・使えない）・自分の申込み（一覧・取り消しの確かめ・部の予定のタブ・同意を外す・メールアドレス）・使い方の3つ目のカードと申込みページの節（開く・閉じる・部員だけを選べない・URL）
- [ ] T025 `apply-api.ts`・`links.ts`・`ApplyPage.tsx`・`EntryTokenPage.tsx`・`MyBookingsPage.tsx`・`SelfPageSection.tsx`・`ModeSection.tsx`・`routes.ts`・`index.ts`
- [ ] T026 自前でも名簿：`nav-items.ts`・`ReceptionRosterSection.tsx`・`RosterGate.tsx` を `usesRoster` に（`nav-items.test.tsx`・`pages.test.tsx` に足す）。名簿の入口「自前」
- [ ] T027 E2E（`e2e/tests/booking-apply.spec.ts`）：主催者が自前を選ぶ → 受付を開く → ログインなしでページ → 参加者が手元のログインで申し込む → 完了の画面 → 名簿に「自前」→ 自分の申込みで取り消す → メールで申し込む（偽の送り手のリンク）→ 確定 → 取り消す・部員だけの回の「見られません」。アクセシビリティ（1440px・375px）と CSP の違反がないこと

## Phase 11: 守りと仕上げ

- [ ] T028 今の形の文書：`docs/apps/booking.md`（表・窓口・画面・知らせ）・`docs/apps/event.md`（`listOrganizationEvents`）・構成の決めごと AD-3（`booking_email_request`）・AD-14（`/my-bookings`）の注
- [ ] T040 守りの確かめ（research S1〜S16）：表の各行がテストか読み合わせで確かめられたかを見直し、足りないテストを足す。`pnpm security:check`
- [ ] T041 `pnpm check` と関わる E2E を流し、コミットする。spec.md の Status を直す

## Analyze（2026-11-20）

spec・plan・tasks・research・data-model・contracts を突き合わせた（`/speckit-analyze` の観点：重なり・あいまい・書き漏れ・Constitution・取りこぼし・食い違い）。

| 観点 | 見つけたこと | 直したこと |
|---|---|---|
| 取りこぼし | FR-015（チェックインに自動で当たる）を確かめる作業がなかった | T013 に足した |
| 食い違い | contracts の `ApplyInput` に任意のメールアドレスがあり、spec の US1-10（完了の画面で入れる）と二重だった | `ApplyInput` から外し、完了の画面の `/me/contact` だけにした |
| Constitution | II（メールアドレスは予約の知らせのためだけ）と案内の同意：メールの申込みに同意を出さないことを research R5 に書いた | — |
| 書き漏れ | 構成の決めごと AD-3 の booking の表の一覧に `booking_email_request` がない | T028 で AD-3 に日付つきの注を足す |
| 範囲 | 定員・席の残りの欄を答えに置かない（R18）。booking-004 で足す | — |

FR-001〜FR-017 は、どれも1つ以上の作業（テストと作り）に当たる。CRITICAL の食い違いはない。
