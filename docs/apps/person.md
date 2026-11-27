# 人物メモ（person）の地図

2026-11-27 作成（person-001 pr1：表とアプリの登録。決めた理由は [specs/person/001-notes/research.md](../../specs/person/001-notes/research.md)）。

人物メモ（key `person`）の1つの領域（構成の決めごと AD-31）。

- **何をするか**：使う人が、交流会で会った人の見た目の特徴・話したこと・次に話したいこと・アカウントを、自分だけが見られるメモに残す（[PRD](../../_bmad-output/prd-kanaeru-person/prd-kanaeru-person.md)）。
- **持ち主**：メモは使う人の account の記録。組織には入れない（AD-19・AD-31）。
- **外に出さない**：メモは外の AI・MCP・ログ・URL に出さない（AD-20・AD-21・AD-31）。

この版（person-001 pr1）で入っているのは、表とアプリの登録と、`/person` の仮の画面だけ。窓口と画面は pr2 で足す。

## 1. アプリの登録

| 項目 | 値 |
|---|---|
| key・道の頭 | `person`・`/person`（画面）・`/api/v1/person/…`（窓口。pr2） |
| 領域 | `person` の1つ |
| 使ってよいほかのアプリ | `reception`（kanaeru の交流会を会った場に選ぶとき。次の仕様。AD-31） |
| 公開 | 台帳に行がない間は運営者だけに見える（AD-16） |
| 退会 | 退会の前の手順（`withdrawal`）は出さない。持ち主を指す外部キーの CASCADE で、account と一緒に消える。退会の確かめの画面には `accountData`「人物メモ（会った人・会った場）」が出る |

## 2. 表

| 表 | 列 | 決まり |
|---|---|---|
| `person_note` | `id`・`owner_account_id`・`full_name`・`reading`・`line_name`・`appearance`・`account_x`・`account_connpass`・`account_github`・`account_linkedin`・`account_line`・`account_url`・`tags`・`tag_keys`・`talk`・`next_topic`・`search_text`・`search_version`・`version`・`create_request_id`・`last_append_id`・`created_at`・`updated_at` | 人のメモ（最上位の記録）。相手の account の ID は持たない（AD-2）。長さの CHECK は約束の `PERSON_NOTE_LIMITS` と同じ（`char_length`。コードポイントで数える）。`account_url` は `http://`・`https://` で始まるものだけ。`tag_keys` は `tags` をそろえた形で、同じ数（タグの数の上限は置かない）。`search_text` は検索のためにそろえた文で、`search_version` はそろえ方の版。`create_request_id` は人を足す送りの ID（空でなければ使う人ごとに一意）。一意 `(id, owner_account_id)`（組の表の複合の外部キーが指す）。索引 `(owner_account_id, updated_at desc)` |
| `person_meeting` | `id`・`owner_account_id`・`source`・`name`・`name_key`・`met_on`・`event_id`・`created_at`・`updated_at` | 会った場（使う人の一覧の1件）。`source` は `manual`・`event`（作ったあと変えない。この版は `manual` だけを作る）。`manual` は `event_id` を持たない（CHECK）。名前は1〜100字で、`name_key` はそろえた名前。一意は部分の索引2つ：`(owner_account_id, event_id)` と、`manual` の `(owner_account_id, name_key, met_on)`。一意 `(id, owner_account_id)` |
| `person_note_meeting` | `note_id`・`meeting_id`・`owner_account_id`・`created_at` | 人と会った場の組。主キーは `(note_id, meeting_id)`。`(note_id, owner_account_id)` と `(meeting_id, owner_account_id)` の複合の外部キーで、持ち主の違う人と会った場を結ばせない。索引 `meeting_id` |

消し方：

| 外部キー | 消し方 |
|---|---|
| `person_note.owner_account_id`・`person_meeting.owner_account_id` | `CASCADE`（使う人のデータ。退会で消える） |
| `person_meeting.event_id` | `SET NULL`（交流会が消えても、名前と日付の写しは残る。AD-25 と同じ） |
| `person_note_meeting` の2つの複合の外部キー | `CASCADE`（人か会った場を消すと、組だけが消える） |

## 3. 画面

| 道 | 画面 |
|---|---|
| `/person` | 人の一覧（pr1 は準備中の案内だけ） |

## 4. テスト

- 約束：`packages/contracts/src/person/limits.test.ts`（字の数え方と上限）。
- 表：`apps/api/src/modules/person/schema.test.ts`（CHECK・一意・複合の外部キー・消し方を、表に直に書いて確かめる）。
