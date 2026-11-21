# Data Model: 予約の知らせの仕組み（booking-002）

2026-11-20 作成。表の持ち主は booking の領域（AD-3・AD-23・AD-24）。表の名前は `booking_` で始める（AD-15）。DB の変更は表を足すだけ（前の版のアプリは表を知らないだけで壊れない。[コードの書き方](../../../docs/rules/coding.md) 3）。`0016_booking.sql` の次（`0017_booking_notify.sql`）。

## 足す表

### `booking_line_channel`（公式アカウントの設定。持ち主ごとに0か1行）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()`。Webhook の道の `{channelId}`・秘密の箱のひもづけに使う |
| `holder_account_id` | uuid（空を許す） | 個人の持ち主（`account.id`）。`ON DELETE CASCADE` |
| `holder_organization_id` | uuid（空を許す） | 組織の持ち主（`organization.id`）。`ON DELETE CASCADE` |
| `line_channel_id` | text（空を許す） | Messaging API のチャネル ID（数字） |
| `channel_secret_ciphertext`・`channel_secret_iv` | bytea（空を許す） | チャネルシークレットの暗号文と IV（ひもづけ `<id>:secret`） |
| `channel_secret_key_version` | smallint（空を許す） | 包んだ鍵の版 |
| `channel_secret_tail` | text（空を許す） | 末尾4文字（画面に出す。research R9） |
| `access_token_ciphertext`・`access_token_iv` | bytea（空を許す） | チャネルアクセストークンの暗号文と IV（ひもづけ `<id>:token`） |
| `access_token_key_version` | smallint（空を許す） | 包んだ鍵の版 |
| `access_token_tail` | text（空を許す） | 末尾4文字 |
| `basic_id` | text（空を許す） | ボット情報のベーシック ID（`@xxxx`。友だち追加のリンク。research R10） |
| `bot_user_id` | text（空を許す） | ボット情報の `userId`（公式アカウントそのものの ID。Webhook の `destination` と同じ）。アクセストークンだけを入れ直して別の公式アカウントに替わったことを見つける（research R10） |
| `reply_to_email` | text（空を許す） | メールの返信先（research R8） |
| `created_at`・`updated_at` | timestamptz | `timestamps()` |

- CHECK `booking_line_channel_holder_check`：`num_nonnulls(holder_account_id, holder_organization_id) = 1`（持ち主はどちらか1つ。AD-24）。
- CHECK `booking_line_channel_line_check`：LINE の値の9つの列（`line_channel_id`〜`access_token_tail`）が、そろって空か、そろって入っているか（返信先だけの行を許す）。
- 一意：`booking_line_channel_holder_account_id_unique`（`holder_account_id` が空でない行）・`booking_line_channel_holder_organization_id_unique`（`holder_organization_id` が空でない行）・`booking_line_channel_line_channel_id_unique`（`line_channel_id` が空でない行。同じ公式アカウントを2つの設定に入れない）。

### `booking_line_link`（紐づけ）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `channel_id` | uuid | `booking_line_channel.id`。`ON DELETE CASCADE` |
| `line_user_id` | text | 公式アカウントから見える LINE のユーザー ID（送り先。CHECK `^U[0-9a-f]{32}$`） |
| `account_id` | uuid | 参加者の `account.id`。`ON DELETE CASCADE` |
| `created_at`・`updated_at` | timestamptz | `timestamps()` |

- 一意：`booking_line_link_channel_id_account_id_unique`・`booking_line_link_channel_id_line_user_id_unique`。索引：`booking_line_link_account_id_idx`（外部キーを消すとき）。

### `booking_line_link_token`（紐づけの札）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `channel_id` | uuid | `booking_line_channel.id`。`ON DELETE CASCADE` |
| `line_user_id` | text | 友だち追加した人（CHECK は `booking_line_link` と同じ） |
| `token_hash` | text | 札の SHA-256（16進の64文字）。一意 `booking_line_link_token_token_hash_unique` |
| `expires_at` | timestamptz | 期限（作ってから7日） |
| `used_at` | timestamptz（空を許す） | 使った時刻 |
| `used_by_account_id` | uuid（空を許す） | 使った人。`ON DELETE SET NULL` |
| `created_at` | timestamptz | 既定 now |

- 索引：`booking_line_link_token_channel_id_line_user_id_idx`・`booking_line_link_token_used_by_account_id_idx`。

### `booking_contact`（参加者の連絡のメールアドレス）

| 列 | 型 | 決まり |
|---|---|---|
| `account_id` | uuid・主キー | `account.id`。`ON DELETE CASCADE` |
| `email` | text | メールアドレス（小文字にそろえる。254文字まで。CHECK `booking_contact_email_check`） |
| `created_at`・`updated_at` | timestamptz | `timestamps()` |

### `booking_notice`（知らせの記録）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | `primaryId()` |
| `entry_id` | uuid（空を許す） | 相手の申込み（`booking_entry.id`）。`ON DELETE CASCADE`。確かめのメッセージは空 |
| `channel_id` | uuid（空を許す） | 使った公式アカウントの設定。`ON DELETE SET NULL` |
| `kind` | text | 種類：`confirmed`・`waitlisted`・`offered`・`offer_expired`・`changed`・`cancelled_event`・`test`。CHECK |
| `method` | text | 手段：`line`・`email`・`none`。CHECK |
| `result` | text | 結果：`sent`・`off`・`not_allowed`・`no_destination`・`failed`・`unavailable`。CHECK |
| `created_at` | timestamptz | 既定 now（送った・決めた時刻） |

- CHECK `booking_notice_entry_check`：`(kind = 'test') = (entry_id is null)`。
- 索引：`booking_notice_entry_id_idx`・`booking_notice_channel_id_created_at_idx`（今月の数）。
- 本文・宛先・トークン・札は持たない（AD-24・FR-B87）。

CHECK の値は約束（`@workspace/contracts/booking` の `notify-options.ts`）と同じ並びを文字で書く（1つ目の仕様と同じ形）。食い違いは結合のテスト「選択肢の code はどれも DB に入る」が見張る。

## 状態の移り変わり

```text
公式アカウントの設定：（なし）→ 返信先だけ ⇄ LINE の値あり（入れる・入れ直す・LINE の値を消す）
                      チャネル ID を変える・LINE の値を消す → 紐づけと札を消す
札：（友だち追加）→ 使える →（紐づける）→ 使った
                       └→（7日）→ 期限切れ
                       └→（友だち追加し直す・ブロック・設定のチャネル ID が変わる）→ 消える
紐づけ：（札で紐づける）→ あり →（ブロック・設定のチャネル ID が変わる・LINE の値を消す）→ 消える
知らせの記録：作るだけ（直さない）
```

## 読むときに決めるもの（保存しない）

- **当てはまる設定**：交流会を入れた組織の設定、なければ持ち主の個人の設定（research R5）。
- **紐づいた人数**：その設定の `booking_line_link` の数。
- **今月送った数**：その設定の `booking_notice` のうち、手段 `line`・結果 `sent`・日本時間の今月（research R12）。
