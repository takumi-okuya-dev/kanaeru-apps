# Data Model: 改善点（suite-004）

| 表 | 列 | 決まり |
|---|---|---|
| `feedback` | `id`（uuid・uuidv7）・`account_id`（uuid・空可）・`app_key`（text・空可）・`body`（text）・`done_at`（timestamptz・空可）・`created_at`・`updated_at` | `body` は1〜2000文字（CHECK）。`app_key` は空か1〜40文字（CHECK。台帳のアプリの key かは窓口で確かめる）。`account_id` → `account.id` は `ON DELETE SET NULL`。索引 `feedback_created_at_idx`・`feedback_account_id_created_at_idx`（1人の1日の数） |

DB の変更は `apps/api/drizzle/0024_suite_feedback.sql`（表を足すだけ。前の版のアプリでも壊れない。coding.md 3）。
