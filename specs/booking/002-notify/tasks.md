# Tasks: 予約の知らせの仕組み（booking-002）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/booking-notify.md](./contracts/booking-notify.md)

テストを先に書き、落ちるのを見てから作る。[P] はほかと同時に進められるもの。

## Phase 1: DB の変更（1つ目の PR `feature/booking-002-notify`）

- [x] T001 約束の選択肢を先に置く：`packages/contracts/src/booking/notify-options.ts`（`NOTIFY_MODES`・`NOTICE_KINDS`・`NOTICE_METHODS`・`NOTICE_RESULTS` と言葉）・`index.ts`。単体のテスト `notify-options.test.ts`（言葉がそろう）
- [x] T002 結合のテストを先に書く（`apps/api/src/modules/booking/notify-schema.test.ts`）：持ち主はどちらか1つ（CHECK）・持ち主ごとに1行・LINE の値はそろって空かそろって入る・LINE のユーザー ID の形・紐づけの一意（設定×アカウント・設定×LINE の友だち）・札の一意・知らせの種類・手段・結果の code はどれも入りほかは止まる・確かめのメッセージだけ申込みが空・組織を消すと設定と紐づけと札が消える・アカウントを消すと個人の設定と紐づけと連絡が消える・申込みを消すと記録が消え、設定を消すと記録の設定が空になる
- [x] T003 `apps/api/src/modules/booking/schema.ts` に5つの表を書く
- [x] T004 `pnpm db:generate --name booking_notify` → `apps/api/drizzle/0017_booking_notify.sql` を読む（表を足すだけで、消す・名前を変えるがないこと）→ `pnpm db:migrate`
- [x] T005 `pnpm check` を流し、コミットする

## Phase 2: 共通（2つ目の PR `feature/booking-002-pr2-notify` の1つ目のコミット）

- [ ] T006 設定のテストを先に書く（`apps/api/test/config.test.ts` に足す）：既定は `off`・許可リストの形（LINE のユーザー ID とメールアドレス。ほかは止まる）・メールは小文字・`local`・`test` は `fakeOnly`・`staging`・`production` は本物
- [ ] T007 `kernel/config.ts`（`NOTIFY_MODE`・`NOTIFY_ALLOWLIST`・`Config.notify`）・`.env.example`
- [ ] T008 [P] 送る道具の単体のテストを先に書く（`apps/api/src/platform/notify/notify.test.ts`）：守り（`off`・`allowlist`〈ある・ない・メールの大小〉・`on`）・`fakeOnly` では fetch を呼ばない・本物の push・reply・ボット情報の要求の形（宛先・ヘッダー・本文・`X-Line-Retry-Key`）・401・429・5xx・時間切れ・reply は `off` だけで止まる・メールは送り手がなければ `unavailable`・偽の送り手は50件まで・ログに宛先と本文が出ない・署名の確かめ（合う・違う・長さ違い・なし）
- [ ] T009 `kernel/notifier.ts`（型）・`platform/notify/`（`guard.ts`・`line-client.ts`・`signature.ts`・`email.ts`・`fake.ts`・`notifier.ts`・`index.ts`）・`kernel/http.ts`（`DomainRouteDeps.notifier`）・`app.ts`（組み立て）
- [ ] T010 紐づけの道：`packages/contracts/src/core/participant-paths.ts` に `lineLink` と単体のテスト。`pnpm check` を流し、共通だけのコミットにする

## Phase 3: US1 公式アカウントの設定と確かめのメッセージ（P1）

- [ ] T011 約束：`notify.ts`（`LineChannelInput`・`MailSettingInput`・`NotifySettings`・`TestMessageResult`・`LineLinkPreview`・`LineLinkResult`・`ContactInput`・`ContactView`・`FakeOutbox`）・`errors.ts`・`paths.ts` と単体のテスト（形・上限）
- [ ] T012 結合のテストを先に書く（`apps/api/src/modules/booking/notify-settings.test.ts`）：管理者が保存すると末尾だけ・答えとログに値がない・入れ直し（トークンだけ）・チャネル ID を変えると紐づけが消える・初めに足りない値は 400・使えないトークンは 400・届かないと 502・秘密の箱がないと 503・編集者・メンバー・外の人は 403・個人の設定は本人だけ・返信先の読み書き・LINE の値を消す・確かめのメッセージ（紐づいていない・送った・止めている・許可リストにない〈本人の ID〉・送れなかった）と今月の数・`off` では外への出口を呼ばない
- [ ] T013 event の `index.ts` に `findEventOrganizationId` を出す（1行）
- [ ] T014 `notify-repository.ts`・`notify-settings.ts`・`notice-templates.ts`（あいさつ）・`routes-notify.ts`（設定・確かめ）・`routes.ts`

## Phase 4: US2 Webhook と紐づけ（P1）

- [ ] T015 結合のテストを先に書く（`apps/api/src/modules/booking/line-webhook.test.ts`）：署名の合う友だち追加であいさつ（偽の送り手に札つきのリンク・DB は SHA-256 だけ）・署名なし・違う・別の設定のシークレットは 400・大きな本文は 400・知らない設定は 404・`off` では送らず札も作らない・ブロックで紐づけと札が消える・ほかの種類は 200 で何もしない・再送で前の札が消える・ログに本文・署名・ユーザー ID・札がない
- [ ] T016 結合のテストを先に書く（`apps/api/src/modules/booking/line-link.test.ts`）：札の中身（使える・使った・期限切れ・知らない）・紐づける・同じ札を2回は 409・期限切れは 410・前の紐づけを置きかえる（同じアカウント・同じ LINE の友だち）・本人が開き直すと「もう紐づいています」
- [ ] T017 `line-link.ts`・`routes-webhook.ts`・`routes-notify.ts`（紐づけ）

## Phase 5: US3 知らせを送る業務の関数（P1）

- [ ] T018 単体のテストを先に書く（`notice-templates.test.ts`）：6つの種類の文面に名前・日時（日本時間）・場所・状態・リンクが入る・期限・何番目か・リンクがないときは出さない・5000文字を超えない
- [ ] T019 結合のテストを先に書く（`apps/api/src/modules/booking/send-notice.test.ts`）：組織の交流会は組織の設定・個人の交流会は持ち主の設定・紐づいていれば LINE・ほかでメールアドレスがあればメール（送り主の名前・返信先）・どちらもなければ送り先がない・`off`・許可リスト（ある・ない）・LINE が送れなかったときメールに切り替えない・本番でメールの送り手がなければ準備がない・記録に本文と宛先がない
- [ ] T020 `notice-templates.ts`・`notify.ts`（`sendNotice`）

## Phase 6: US4 返信先と参加者のメールアドレス（P3）

- [ ] T021 結合のテストを先に書く（`apps/api/src/modules/booking/contact.test.ts`）：本人が入れる・読む・消す・形の誤りは 400・ほかの人の答え（設定・名簿）に出ない・開発の窓口（試験用のログインと偽のときだけ・ほかは 404）
- [ ] T022 `routes-notify.ts`（連絡・開発の窓口）

## Phase 7: 退会

- [ ] T023 結合のテストを先に書く（`withdrawal.test.ts` に足す）：個人の設定があれば確かめの中身に出る・退会で個人の設定・紐づけ・連絡が消える
- [ ] T024 `withdrawal.ts`

## Phase 8: 画面

- [ ] T025 [P] 画面の単体のテストを先に書く：設定の画面（末尾・Webhook の URL のコピー・入れ直す・送り方の帯・確かめの結果・メールの節・管理者でないときの文・個人の画面の組織の一覧）・紐づけの画面（使える・使った・期限切れ・紐づける）・`feature.settings` と `feature.organization`
- [ ] T026 `notify-api.ts`・`notify-queries.ts`・`NotifySettingsPage.tsx`・`LineLinkPage.tsx`・`routes.ts`・`index.ts`
- [ ] T027 E2E（`e2e/tests/booking-notify.spec.ts`）：組織を作る → 設定を入れる → 偽の Webhook（署名つき）→ 開発の窓口からリンク → 紐づける → 紐づいた人数 1 → 確かめのメッセージ → 送った。アクセシビリティ（1440px・375px）。E2E の設定に `NOTIFY_MODE=on` と鍵の束

## Phase 9: 守りと仕上げ

- [ ] T028 今の形の文書：`docs/apps/booking.md`（表・窓口・画面・知らせ）・`docs/architecture.md`（`platform/notify` の1行と地図）・構成の決めごと AD-14・AD-24（道を直した注）・`docs/apps/event.md`（index の関数）
- [ ] T029 `docs/rules/coding.md` 6-2・6-6 の `platform` と `DomainRouteDeps` の説明に、送る道具を足す（決まりの文の更新）
- [ ] T030 守りの確かめ（research S1〜S14）：表の各行がテストか読み合わせで確かめられたかを見直し、足りないテストを足す。`pnpm security:check`
- [ ] T031 `pnpm check` と関わる E2E を流し、コミットする
