# Data Model: 読書記録の本棚と取りこみ（reading-001）

表は2つ（pr1・DB の変更1つ。番号は道具が振る。人物メモの `0025_person` のあと）。表の名前は `reading_` で始める（AD-15）。理由は [research.md](./research.md)。

## reading_book（本）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | 主キー（`gen_random_uuid()`） |
| `owner_account_id` | uuid | `account(id)` へ `ON DELETE CASCADE`（AD-19・R11） |
| `title` | text | 1〜300字 |
| `author` | text | null か 1〜300字 |
| `isbn` | text | null か 13桁の数字（10桁は13桁に直して持つ） |
| `cover_url` | text | null か `https://cover.openbd.jp/` で始まる URL（R9） |
| `catalog_source` | text | `ndl`・`openbd`・`manual` のどれか（作ったあと変えない） |
| `want` | text | 分かりたいこと。null か 1〜500字 |
| `status` | text | `reading`・`finished`・`dropped`。既定 `reading` |
| `sources` | text[] | 読む場所。`kindle`・`goodnotes`・`other` の重ならない組。既定は空 |
| `last_imported_at` | timestamptz | null。取りこみの束を受けるたびに今の時刻 |
| `created_at`・`updated_at` | timestamptz | 既定 `now()` |

- 索引：`(owner_account_id, status, last_imported_at DESC NULLS LAST, created_at DESC)`（本棚の並び。FR-007）。
- 一意：（`id`, `owner_account_id`）（マーカーの複合の外部キーの先）。
- 同じ本を2冊持ってもよい（まとめるのは使う人。FR-008）。

## reading_marker（マーカー）

| 列 | 型 | 決まり |
|---|---|---|
| `id` | uuid | 主キー |
| `book_id` | uuid | （`book_id`, `owner_account_id`）で `reading_book(id, owner_account_id)` へ `ON DELETE CASCADE`（R11） |
| `owner_account_id` | uuid | `account(id)` へ `ON DELETE CASCADE` |
| `source` | text | `goodnotes`・`kindle`・`paste` |
| `chapter` | text | null か 1〜200字 |
| `page` | integer | null か 1以上 |
| `location` | integer | null か 1以上（Kindle の位置。reading-002） |
| `position` | bigint | 本の中の並びの番号（画面が作る。ページ × 100,000 ＋ ページの中の上からの順。ページがなければ位置。どちらもなければ取りこんだ順） |
| `text` | text | マーカーの文。0〜4,000字（0字はコメントだけのもの） |
| `comment` | text | null か 1〜4,000字 |
| `comment_edited` | boolean | 既定 false。読書記録でコメントを直したら true（R4） |
| `question` | boolean | 既定 false。`?` の印 |
| `question_edited` | boolean | 既定 false。画面で印を付け外したら true（R4） |
| `dedupe_key` | char(64) | 重なりを見分ける鍵（R3。API が作る） |
| `deleted_at` | timestamptz | null。消したら時刻を入れ、一覧に出さない（R4） |
| `created_at`・`updated_at` | timestamptz | 既定 `now()` |

- 一意：（`book_id`, `dedupe_key`）（取りこみ直しで重ならない。FR-016・FR-019）。
- 索引：（`book_id`, `deleted_at`, `position`）（本の画面の並び）。
- 確かめ（CHECK）：`text <> ''` か `comment IS NOT NULL`（どちらかはある）。

## 状態の移り変わり

- 本の `status`：`reading` ⇄ `finished` ⇄ `dropped`（どれからどれへでも。使う人が選ぶ）。
- マーカー：取りこみで作られる → コメントを直す（`comment_edited` が true）→ 消す（`deleted_at`）。消したマーカーは、取りこみ直しでも戻らない（R4）。
- 本をまとめる（FR-008）：まとめる元のマーカーを、まとめ先に `INSERT … ON CONFLICT (book_id, dedupe_key) DO NOTHING` で写し、元の本を消す（CASCADE で元のマーカーも消える）。まとめ先の `sources` に元の読む場所を足す。1つのトランザクション。

## 約束（packages/contracts/src/reading）

- `limits.ts`：上の字数・件数（1回の取りこみ 5,000件・1束 500件・ファイル 300MB）。
- `options.ts`：`status`・`sources`・`source`・`catalog_source` の選択肢と画面の言葉。
- `marker-key.ts`：そろえ方と鍵（R3）。
- `book.ts`・`marker.ts`・`catalog.ts`・`errors.ts`：窓口の入力と答えの形（[contracts/reading.md](./contracts/reading.md)）。
