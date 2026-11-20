# Data Model: 自前の申込みページ（booking-003）

2026-11-20 作成。表の持ち主は booking の領域（AD-3・AD-23）。表の名前は `booking_` で始める（AD-15）。DB の変更は、表を足す・空を許すか既定値つきの列を足す・今の行がどれも通る CHECK に広げる・索引を足すだけ（前の版のアプリは新しい列と表を知らないだけで壊れない。[コードの書き方](../../../docs/rules/coding.md) 3）。`0016_booking_notify.sql` の次（`0017_booking_apply.sql`）。

## 直す表

### `booking_setting`（交流会ごとの予約の設定）

| 列 | 型 | 決まり |
|---|---|---|
| `mode` | text | CHECK `booking_setting_mode_check` を `in ('reception', 'roster', 'self_page')` に広げる（今の行はどれも通る。research R1） |
| `accepting`（足す） | boolean | `NOT NULL DEFAULT false`。受付を開いているか（既定は閉じる。始まりを過ぎたら読むときに閉じたものとして扱う） |
| `visibility`（足す） | text | `NOT NULL DEFAULT 'public'`。CHECK `booking_setting_visibility_check`：`in ('public', 'members')`（誰でも・部員だけ。research R8） |

### `booking_entry`（申込み＝名簿の1行）

| 列 | 型 | 決まり |
|---|---|---|
| `entry_kind` | text | CHECK `booking_entry_entry_kind_check` を `in ('manual', 'import', 'walk_in', 'self_page')` に広げる（今の行はどれも通る） |
| `contact_email`（足す） | text（空を許す） | メールで申し込んだ人の連絡のメールアドレス（小文字にそろえる）。主催者に見せない・ログに出さない（Constitution II）。CHECK `booking_entry_contact_email_check`：`contact_email is null or char_length(contact_email) <= 254` |
| `entry_token_hash`（足す） | text（空を許す） | メールで申し込んだ人の札の SHA-256（16進。research R10） |

- 一意（足す）：`booking_entry_entry_token_hash_unique`（`entry_token_hash` が空でない行）・`booking_entry_event_id_contact_email_unique`（`(event_id, contact_email)`。`contact_email` が空でない行。メールの申込みも1交流会1つ）。
- 今の一意 `booking_entry_event_id_account_id_unique`（`account_id` が空でない行）で、LINE の申込みは1交流会1人1つ。

## 足す表

### `booking_consent`（案内の同意）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `account_id` | uuid | 同意した人（`account.id`）。`ON DELETE CASCADE`（本人のデータ） |
| `organization_id` | uuid（空を許す） | 相手が組織のとき（`organization.id`）。`ON DELETE CASCADE` |
| `owner_account_id` | uuid（空を許す） | 相手が個人の持ち主のとき（`account.id`）。`ON DELETE CASCADE` |
| `created_at` | timestamptz | 同意した時刻 |

- CHECK `booking_consent_holder_check`：`num_nonnulls(organization_id, owner_account_id) = 1`（相手はどちらか1つ。AD-23）。
- 一意：`booking_consent_account_id_organization_id_unique`（`organization_id` が空でない行）・`booking_consent_account_id_owner_account_id_unique`（`owner_account_id` が空でない行）。
- 索引：`booking_consent_organization_id_idx`・`booking_consent_owner_account_id_idx`（外部キーを消すとき）。

### `booking_email_request`（メールで申し込む確認の待ち）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `event_id` | uuid | `event.id`。`ON DELETE CASCADE`（booking の表が交流会を指すときの決まり。AD-7 の注） |
| `name` | text | 入れた名前（前後の空白を消したもの） |
| `email` | text | 入れたメールアドレス（小文字にそろえる）。CHECK `booking_email_request_email_check`：`char_length(email) <= 254` |
| `token_hash` | text | 確認の札の SHA-256（16進）。一意 `booking_email_request_token_hash_unique` |
| `expires_at` | timestamptz | 期限（作ってから24時間） |
| `created_at` | timestamptz | 作った時刻（同じアドレスの10分の縛りに使う） |

- 索引：`booking_email_request_event_id_email_idx`（同じ交流会・同じアドレスの待ちを探す・数える）。
- 確定すると消す。期限切れは、その交流会に新しい待ちを作るときに消す。

## 消し方（足したもの）

| 外部キー | 消し方 | 理由 |
|---|---|---|
| `booking_consent.account_id` | `CASCADE` | 本人の同意（AD-7） |
| `booking_consent.organization_id` | `CASCADE` | 組織が消えれば相手がいない（AD-22 の後始末は外部キーで） |
| `booking_consent.owner_account_id` | `CASCADE` | 持ち主が退会すれば相手がいない |
| `booking_email_request.event_id` | `CASCADE` | 交流会と一緒に消える |

## 状態の動き（この版）

```text
（なし）──申し込む・確定する──▶ 確定（confirmed）
確定 ──参加者が取り消す（始まりまで）・主催者が取り消す──▶ 取り消し（cancelled）
取り消し ──参加者が申し込み直す（受付中）・主催者が戻す──▶ 確定
```

キャンセル待ち・打診中は booking-004 で CHECK を広げて足す。
