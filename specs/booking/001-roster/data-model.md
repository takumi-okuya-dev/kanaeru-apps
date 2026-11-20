# Data Model: 予約の名簿（booking-001）

2026-11-20 作成。表の持ち主は booking の領域（AD-3・AD-23）。表の名前は `booking_` で始める（AD-15）。DB の変更は表を足すだけ（前の版のアプリは表を知らないだけで壊れない。[コードの書き方](../../../docs/rules/coding.md) 3）。

## 足す表

### `booking_setting`（交流会ごとの予約の設定）

| 列 | 型 | 決まり |
|---|---|---|
| `event_id` | uuid・主キー | `event.id`。`ON DELETE CASCADE`（research R11） |
| `mode` | text | `reception`（受付だけ）・`roster`（名簿を使う）。CHECK `booking_setting_mode_check`。「自前で申込みを受ける」は、その仕様で足す（research R1） |
| `created_at`・`updated_at` | timestamptz | `timestamps()` |

行がなければ「受付だけ」。

### `booking_entry`（申込み＝名簿の1行）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `event_id` | uuid | `event.id`。`ON DELETE CASCADE` |
| `name` | text | 名前（1〜50文字・前後の空白を消したもの） |
| `application_source` | text | 媒体。受付の `APPLICATION_SOURCES`（`connpass`・`peatix`・`direct`・`other`）。CHECK `booking_entry_application_source_check` |
| `entry_kind` | text | 入口：`manual`・`import`・`walk_in`。CHECK `booking_entry_entry_kind_check` |
| `status` | text | 状態：`confirmed`・`cancelled`（既定 `confirmed`）。CHECK `booking_entry_status_check` |
| `applied_at` | timestamptz | 申し込んだ日時（既定 now） |
| `entered_by` | uuid（空を許す） | 入れた人（`account.id`）。`ON DELETE SET NULL` |
| `memo` | text（空を許す） | メモ（200文字まで） |
| `account_id` | uuid（空を許す） | 本人のアカウント（自前のページの申込み。この版では空）。`ON DELETE CASCADE` |
| `checkin_id` | uuid（空を許す） | 手で当てたチェックイン（reception の `checkin.id`）。`ON DELETE SET NULL` |
| `created_at`・`updated_at` | timestamptz | `timestamps()` |

- 索引：`booking_entry_event_id_applied_at_idx`（名簿の並び）・`booking_entry_entered_by_idx`・`booking_entry_account_id_idx`（外部キーを消すとき）。
- 一意：`booking_entry_checkin_id_unique`（`checkin_id`。空でない行だけ）・`booking_entry_event_id_account_id_unique`（`(event_id, account_id) WHERE account_id IS NOT NULL`。1つの交流会に1人1つの申込み。PRD FR-B41。この版では空なので効かない）。
- CHECK の値は約束（`@workspace/contracts/booking` と `@workspace/contracts/reception`）と同じ並びを文字で書く（受付の `checkin` と同じ形）。食い違いは結合のテスト「選択肢の code はどれも DB に入る」が見張る。

### `booking_dismissal`（「ちがう人」にした組）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `event_id` | uuid | `event.id`。`ON DELETE CASCADE` |
| `checkin_id` | uuid | `checkin.id`。`ON DELETE CASCADE` |
| `entry_id` | uuid | `booking_entry.id`。`ON DELETE CASCADE` |
| `dismissed_by` | uuid（空を許す） | した人。`ON DELETE SET NULL` |
| `created_at` | timestamptz | 既定 now |

- 一意：`booking_dismissal_checkin_id_entry_id_unique`。索引：`booking_dismissal_event_id_idx`・`booking_dismissal_entry_id_idx`・`booking_dismissal_dismissed_by_idx`。

### `booking_import_mapping`（持ち主ごとの CSV の列の対応）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `owner_account_id` | uuid | 交流会の持ち主（`account.id`）。`ON DELETE CASCADE` |
| `header_key` | text | 見出しの並び（`JSON.stringify(headers)`） |
| `name_column` | text | 名前の列の見出し |
| `application_source` | text | 選んだ媒体。CHECK（`booking_entry` と同じ値） |
| `created_at`・`updated_at` | timestamptz | `timestamps()` |

- 一意：`booking_import_mapping_owner_account_id_header_key_unique`。

## 読むときに決めるもの（保存しない）

- **来た**：その行に当たったチェックインがある（手で当てた `checkin_id`、または同じアカウントのチェックイン）。
- **来なかった**：交流会の始まりの日（日本時間）の終わりを過ぎ、確定で、来ていない。
- **同じ名前**：取り消しでない行のうち、そろえた名前が同じ行が2つ以上。
- **候補**：research R8。

## 状態の移り変わり

```text
（作る：手で足す・取り込み・飛び入り）→ 確定
確定 ⇄ 取り消し（主催者）
確定（当たっていない）→ 当たった（当てる・名簿から選ぶ・自動） → 当たっていない（当てを外す・チェックインの取り消し）
```
