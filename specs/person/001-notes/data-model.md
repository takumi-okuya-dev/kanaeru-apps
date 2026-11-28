# Data Model: 人物メモの最初の版（person-001）

DB の変更は `0025_person.sql` の1つ（pr1）。番号は、そのときの `develop` の次の番号を道具が振る（AD-17）。表の名前は `person_` で始める（AD-15）。列の決め方の理由は [research.md](./research.md)。

## person_note（人のメモ）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | 主キー（`uuidv7()`） |
| `owner_account_id` | uuid | 要る。`account.id` を指す。`ON DELETE CASCADE`（AD-7・AD-31） |
| `full_name` | text | 要る。1〜100字 |
| `reading` | text | 任意。100字まで |
| `line_name` | text | 任意。100字まで |
| `appearance` | text | 任意。200字まで |
| `account_x`・`account_connpass`・`account_github`・`account_linkedin`・`account_line` | text | 任意。各200字まで（アカウント名だけ） |
| `account_url` | text | 任意。200字まで。`http://`・`https://` で始まる（CHECK） |
| `tags` | text[] | 要る（既定は空）。数の上限なし・1つ30字まで（約束で確かめる） |
| `tag_keys` | text[] | 要る（既定は空）。`tags` をそろえたもの。タグで絞るときに使う |
| `talk` | text | 要る（既定は空の文字）。20,000字まで |
| `next_topic` | text | 要る（既定は空の文字）。2,000字まで |
| `search_text` | text | 要る。検索のためにそろえた文（API が保存のたびに作る） |
| `search_version` | smallint | 要る。そろえ方の版（今は 1） |
| `version` | integer | 要る。1から。書き直し・書き足しで +1 |
| `create_request_id` | uuid | 任意。人を足したときの、画面が作った ID |
| `recent_append_ids` | uuid[] | 要る（既定は空の配列）。最近受けた書き足しの ID を新しい順に最大20個（CHECK）。同じ ID の送り直しを見分ける（research R7） |
| `created_at`・`updated_at` | timestamptz | `updated_at` は保存のたびに新しくなる（一覧の並び） |

- **一意**：
  - `(id, owner_account_id)`：組の表の複合の外部キーが指すため。
  - `(owner_account_id, create_request_id) WHERE create_request_id IS NOT NULL`。
- **索引**：`(owner_account_id, updated_at desc)`。
- **CHECK**：上の長さ（`char_length`。コードポイントで数える）。`cardinality(tag_keys) = cardinality(tags)`。

## person_meeting（会った場）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | 主キー |
| `owner_account_id` | uuid | 要る。`account.id`・`ON DELETE CASCADE` |
| `source` | text | 要る。`manual`・`event`（CHECK）。作ったあと変えない。この版は `manual` だけを作る |
| `name` | text | 要る。1〜100字。`event` のときは、作ったときの交流会の名前の写し |
| `name_key` | text | 要る。`name` をそろえたもの（`normalizeMeetingName`：前後の空白を除き、間の空白を1つにしてから `normalizeForSearch`） |
| `met_on` | date | 要る。日本時間の日付。`event` のときは、作ったときの交流会の日付の写し |
| `event_id` | uuid | 任意。`event.id`・`ON DELETE SET NULL` |
| `created_at`・`updated_at` | timestamptz | |

- **一意**：
  - `(id, owner_account_id)`
  - `(owner_account_id, event_id) WHERE event_id IS NOT NULL`
  - `(owner_account_id, name_key, met_on) WHERE source = 'manual'`（AD-31。交流会が消えて `event_id` が null になっても、手で書いたものとぶつからない）
- **CHECK**：`source = 'event' OR event_id IS NULL`（手で書いたものは交流会を指さない）。

## person_note_meeting（人と会った場の組）

| 列 | 型 | 決まり |
|---|---|---|
| `note_id` | uuid | 要る |
| `meeting_id` | uuid | 要る |
| `owner_account_id` | uuid | 要る |
| `created_at` | timestamptz | |

- **主キー**：`(note_id, meeting_id)`。同じ組は1つだけ。
- **複合の外部キー**（どちらも `ON DELETE CASCADE`）：持ち主の違う人と会った場は、DB が結ばせない。
  - `(note_id, owner_account_id)` → `person_note(id, owner_account_id)`
  - `(meeting_id, owner_account_id)` → `person_meeting(id, owner_account_id)`
- **索引**：`(meeting_id)`。会った場ごとの一覧に使う。

## 消えるとき

| きっかけ | 起きること |
|---|---|
| 使う人の退会（account が消える） | 3つの表の、その人の行がすべて消える（CASCADE） |
| 人を消す | その人の組が消える。会った場は残る |
| 会った場を消す | その会った場の組が消える。人は残る |
| 交流会が消える（次の仕様から） | `event_id` が null になり、名前と日付の写しは残る |

## 約束（`packages/contracts/src/person`）

| ファイル | 中身 |
|---|---|
| `limits.ts` | 欄の長さとタグ1つの長さの上限（DB の CHECK と同じ値。`schema.test.ts` が食い違いを見る）と、字の数え方（コードポイント）の関数 |
| `options.ts` | 会った場の作り方の選択肢 `PERSON_MEETING_SOURCES` |
| `search.ts` | `normalizeForSearch`・`normalizeMeetingName`・`findMatches`（もとの文の中の位置を返す）・`escapeLike`・`SEARCH_VERSION` |
| `accounts.ts` | アカウントの種類・アカウント名から URL を組み立てる・`account_url` の確かめ・LINE ID のリンク |
| `note.ts` | 足す・直す・書き足す・検索の入力と、読む形の zod |
| `meeting.ts` | 会った場の作る入力と、読む形の zod |
| `heading.ts` | 書き足しの見出しを作る関数 |
| `errors.ts` | `PERSON_ERRORS`（`NOT_FOUND` 404・`VERSION_CONFLICT` 409） |
