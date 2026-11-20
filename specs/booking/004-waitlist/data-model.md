# Data Model: 定員・キャンセル待ち・繰り上げ（booking-004）

2026-11-20 作成。表の持ち主は booking の領域（AD-3・AD-23）。表の名前は `booking_` で始める（AD-15）。DB の変更は、表を足す・空を許す列を足す・今の行がどれも通る CHECK に広げる・索引を足すだけ（前の版のアプリは新しい列と表を知らないだけで壊れない。前の版のアプリは状態に `waitlisted`・`offered` を書かない。[コードの書き方](../../../docs/rules/coding.md) 3）。`0017_booking_apply.sql` の次（`0018_booking_waitlist.sql`）。

## 直す表

### `booking_setting`（交流会ごとの予約の設定）

| 列（足す） | 型 | 決まり |
|---|---|---|
| `capacity` | integer（空を許す） | 定員（空＝定員なし）。CHECK `booking_setting_capacity_check`：`capacity is null or capacity between 1 and 1000`（research R1） |
| `quota_released_at` | timestamptz（空を許す） | 一度満員になって、媒体の枠を押さえるのをやめた時刻（R2） |
| `cancelled_at` | timestamptz（空を許す） | 予約を中止した時刻（R11）。入ったら申込みページは中止 |
| `notified_starts_at` | timestamptz（空を許す） | 最後に知らせた（か使い始めた）交流会の日時（R10）。空なら比べない |
| `notified_venue` | text（空を許す） | 同じく場所（`notified_starts_at` が空でないときだけ意味を持つ。場所のない会は空） |
| `change_detected_at` | timestamptz（空を許す） | 定期の仕事が変更に初めて気づいた時刻（30分たったら知らせる。R10） |
| `same_day_notified_at` | timestamptz（空を許す） | 当日の空きを知らせた時刻（交流会ごとに1回。R7） |

### `booking_entry`（申込み＝名簿の1行）

| 列 | 型 | 決まり |
|---|---|---|
| `status` | text | CHECK `booking_entry_status_check` を `in ('confirmed', 'waitlisted', 'offered', 'cancelled')` に広げる（今の行はどれも通る。R4） |

- 索引（足す）：`booking_entry_event_id_status_idx`（`(event_id, status)`。席を数える・キャンセル待ちを並べる・定期の仕事が対象を探す）。

### `booking_notice`（知らせの記録）

| 列 | 型 | 決まり |
|---|---|---|
| `kind` | text | CHECK `booking_notice_kind_check` に `same_day`（当日の空き）を足す（今の行はどれも通る。R7） |

## 足す表

### `booking_quota`（媒体の枠）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `event_id` | uuid | `event.id`。`ON DELETE CASCADE`（AD-7 の注） |
| `application_source` | text | CHECK `booking_quota_application_source_check`：`in ('connpass', 'peatix', 'other')`（直接を除く受付の媒体。R1） |
| `seats` | integer | CHECK `booking_quota_seats_check`：`seats between 1 and 1000` |
| `manage_url` | text（空を許す） | 媒体の管理ページの URL。CHECK `booking_quota_manage_url_check`：`manage_url is null or (char_length(manage_url) <= 500 and manage_url ~ '^https?://')` |
| `created_at`・`updated_at` | timestamptz | `timestamps()` |

- 一意：`booking_quota_event_id_application_source_unique`（`(event_id, application_source)`）。

### `booking_offer`（打診と返事の期限）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `event_id` | uuid | `event.id`。`ON DELETE CASCADE` |
| `entry_id` | uuid | `booking_entry.id`。`ON DELETE CASCADE`（まとめるで行が消えたら打診も消える） |
| `status` | text | `NOT NULL DEFAULT 'pending'`。CHECK `booking_offer_status_check`：`in ('pending', 'accepted', 'declined', 'expired', 'withdrawn')`（R5） |
| `deadline` | timestamptz | 返事の期限（R6） |
| `token_hash` | text（空を許す） | メールの人の返事の札の SHA-256（16進。R8） |
| `offered_by` | uuid（空を許す） | 手で打診した主催者（`account.id`。自動は空）。`ON DELETE SET NULL` |
| `responded_at` | timestamptz（空を許す） | 参加・辞退・期限切れ・取り下げの時刻 |
| `created_at`・`updated_at` | timestamptz | `timestamps()`（`created_at` が打診の時刻） |

- 一意：`booking_offer_entry_id_pending_unique`（`entry_id`。`status = 'pending'` の行だけ。待っている打診は申込みごとに1つ）・`booking_offer_token_hash_unique`（`token_hash` が空でない行）。
- 索引：`booking_offer_status_deadline_idx`（`(status, deadline)`。定期の仕事が期限切れを探す）・`booking_offer_event_id_idx`・`booking_offer_offered_by_idx`（外部キーを消すとき）。

## 消し方（足したもの）

| 外部キー | 消し方 | 理由 |
|---|---|---|
| `booking_quota.event_id` | `CASCADE` | 交流会と一緒に消える（AD-7 の注） |
| `booking_offer.event_id`・`booking_offer.entry_id` | `CASCADE` | 交流会・申込みと一緒に消える |
| `booking_offer.offered_by` | `SET NULL` | 誰がしたか（AD-7） |

## 状態の動き

```text
（なし）──申し込む（自前の残りあり・待ちなしか当日の空き）──▶ 確定（confirmed）
（なし）──申し込む（残りなし）・主催者がキャンセル待ちに入れる──▶ キャンセル待ち（waitlisted）
キャンセル待ち ──片付け（席が空いた・期限が1時間取れる）・主催者が打診する──▶ 打診中（offered）＋打診（pending）
打診中 ──参加する──▶ 確定（打診 accepted）
打診中 ──辞退する・取り消す──▶ 取り消し（打診 declined）──▶ 片付けで次の人へ
打診中 ──期限が過ぎた（定期の仕事・書く窓口の片付け）──▶ 取り消し（打診 expired）──▶ 次の人へ
キャンセル待ち ──当日の空きで「参加する」・申し込む──▶ 確定
キャンセル待ち・打診中 ──主催者が確定にする──▶ 確定（打診 withdrawn）
確定・キャンセル待ち・打診中 ──取り消す（始まりまで）・主催者が取り消す・中止──▶ 取り消し（打診 withdrawn）
取り消し ──申し込み直す（残りで確定かキャンセル待ち）・主催者が戻す（確定）──▶ 確定／キャンセル待ち
```

## 席の数え方（`seats.ts`。読むときと書くときで同じ関数）

```text
埋まった席      = 確定 + 打診中（期限を過ぎた打診中は、読むときは数えない）
枠の未充足      = Σ max(枠の席 − その媒体の確定+打診中, 0)   ※ quota_released_at があれば 0
自前の残り      = 定員 − 埋まった席 − 枠の未充足
満員            = 埋まった席 ≥ 定員
超えた人数      = max(埋まった席 − 定員, 0)
新しい申込み    = 自前の残り ≥ 1 かつ（キャンセル待ちがいない か 当日の空き）なら確定、ほかはキャンセル待ち
```
