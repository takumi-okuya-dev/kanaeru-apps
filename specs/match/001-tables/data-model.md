# Data Model: 試合表の表（match-001）

2026-11-22 作成。DB の変更 `apps/api/drizzle/0021_match.sql`（表を足すだけ）。表の今の形の正本は [docs/apps/match.md](../../../docs/apps/match.md)。

## match_table（試合表）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | 主キー（`uuidv7()`） |
| `owner_account_id` | uuid | NOT NULL・`account` を指す・CASCADE |
| `name` | text | NOT NULL・1〜60文字（`match_table_name_check`） |
| `play_date` | date | NOT NULL（日本時間の日付。90日の期限と札の期限の元） |
| `content` | jsonb | NOT NULL・既定 `{}`・object（`match_table_content_check`）。形は match-002 の約束 |
| `version` | integer | NOT NULL・既定1・1以上（`match_table_version_check`） |
| `editor_device_id` | text | 空を許す・1〜64文字（`match_table_editor_device_id_check`） |
| `last_change_id` | uuid | 空を許す（最後に受けた変更の ID） |
| `seed` | integer | NOT NULL・既定0（くじの種） |
| `view_token_hash` | text | 空を許す・空でなければ一意（`match_table_view_token_hash_unique`） |
| `view_token_expires_at` | timestamptz | 空を許す |
| `join_token_hash` | text | 空を許す・空でなければ一意（`match_table_join_token_hash_unique`） |
| `join_token_expires_at` | timestamptz | 空を許す |
| `join_closed_at` | timestamptz | 空を許す |
| `event_id` | uuid | 空を許す・`event` を指す・SET NULL |
| `created_at`・`updated_at` | timestamptz | NOT NULL・既定 `now()` |

索引：`match_table_owner_account_id_play_date_idx`（持ち主ごとに90日を過ぎた試合表を消す）・`match_table_event_id_idx`（外部キーの SET NULL）。

## match_table_organization（試合表を組織に入れる）

| 列 | 型 | 決まり |
|---|---|---|
| `match_table_id` | uuid | 主キー・`match_table` を指す・CASCADE |
| `organization_id` | uuid | NOT NULL |
| `owner_account_id` | uuid | NOT NULL（試合表の持ち主と同じ値） |
| `placed_at` | timestamptz | NOT NULL・既定 `now()` |

`(organization_id, owner_account_id)` → `organization_member(organization_id, account_id)`・CASCADE（`match_table_organization_member_fk`）。索引 `match_table_organization_organization_id_idx`。

## match_level_memory（前に入れたレベル）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | 主キー |
| `owner_account_id` | uuid | 空を許す・`account` を指す・CASCADE |
| `organization_id` | uuid | 空を許す・`organization` を指す・CASCADE |
| `account_id` | uuid | NOT NULL・`account` を指す・CASCADE |
| `level` | text | NOT NULL・`advanced`・`intermediate`・`beginner`・`novice`（`match_level_memory_level_check`） |
| `created_at`・`updated_at` | timestamptz | NOT NULL |

`num_nonnulls(owner_account_id, organization_id) = 1`（`match_level_memory_holder_check`）。一意：`(owner_account_id, account_id)` と `(organization_id, account_id)`（それぞれ空でない行）。索引 `account_id`。

## match_join（QR の受付）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | 主キー |
| `match_table_id` | uuid | NOT NULL・`match_table` を指す・CASCADE |
| `nickname` | text | NOT NULL・1〜20文字（`match_join_nickname_check`） |
| `level` | text | NOT NULL・レベルの CHECK（`match_join_level_check`） |
| `created_at`・`updated_at` | timestamptz | NOT NULL |

索引 `match_join_match_table_id_created_at_idx`。
