# 読書記録（reading）の地図

2026-11-28 作成（reading-001 pr1：表とアプリの登録。決めた理由は [specs/reading/001-bookshelf-import/research.md](../../specs/reading/001-bookshelf-import/research.md)）。

読書記録（key `reading`）の1つの領域（構成の決めごと AD-32〜AD-34）。

- **何をするか**：使う人が Kindle と GoodNotes で引いたマーカーとコメントを1か所に集め、人に話す・やってみる・書く材料にする（[PRD](../../_bmad-output/prd-kanaeru-reading/prd-kanaeru-reading.md)）。
- **持ち主**：本とマーカーは使う人の account の記録。組織には入れない（AD-19・AD-32）。
- **本のファイルを持たない**：取りこむファイル（GoodNotes の PDF など）は端末の中で読み、マーカーとコメントだけを送る（AD-34）。

この版（reading-001 pr1）で入っているのは、表とアプリの登録と、`/reading` の仮の画面だけ。窓口と画面は pr2 で足す。

## 1. アプリの登録

| 項目 | 値 |
|---|---|
| key・道の頭 | `reading`・`/reading`（画面）・`/api/v1/reading/…`（窓口。pr2） |
| 領域 | `reading` の1つ |
| 使ってよいほかのアプリ | なし（`uses: []`） |
| 公開 | 台帳に行がない間は運営者だけに見える（AD-16） |
| 退会 | 退会の前の手順（`withdrawal`）は出さない。持ち主を指す外部キーの CASCADE で、account と一緒に消える。退会の確かめの画面には `accountData`「本・マーカーとコメント」が出る |

## 2. 表

| 表 | 列 | 決まり |
|---|---|---|
| `reading_book` | `id`・`owner_account_id`・`title`・`author`・`isbn`・`cover_url`・`catalog_source`・`want`・`status`・`sources`・`last_imported_at`・`created_at`・`updated_at` | 本（最上位の記録）。長さの CHECK は約束の `READING_BOOK_LIMITS` と同じ（`char_length`。コードポイントで数える）。`isbn` は13桁の数字。`cover_url` は `https://cover.openbd.jp/` で始まるものだけ（AD-33）。`catalog_source` は `ndl`・`openbd`・`manual`（作ったあと変えない）。`status` は `reading`・`finished`・`dropped`。`sources` は `kindle`・`goodnotes`・`other` の中で3つまで（重なりは約束で止める）。一意 `(id, owner_account_id)`（マーカーの複合の外部キーが指す）。索引 `(owner_account_id, status, last_imported_at desc nulls last, created_at desc)`（本棚の並び） |
| `reading_marker` | `id`・`book_id`・`owner_account_id`・`source`・`chapter`・`page`・`location`・`position`・`text`・`comment`・`comment_edited`・`question`・`question_edited`・`dedupe_key`・`deleted_at`・`created_at`・`updated_at` | マーカー（コメントだけのものもある。`text` が空なら `comment` が要る）。`source` は `goodnotes`・`kindle`・`paste`。`position` は本の中の並びの番号。`dedupe_key` は重なりを見分ける鍵（そろえた文とページか位置の SHA-256 の16進64字。API が作る）で、一意 `(book_id, dedupe_key)`。`comment_edited`・`question_edited` は、読書記録で直したものを取りこみ直しで上書きしないための印。消したマーカーは `deleted_at` を入れて残す（取りこみ直しで戻さない）。`(book_id, owner_account_id)` の複合の外部キーで、持ち主の違う本にマーカーを付けさせない。索引 `(book_id, deleted_at, position)`・`owner_account_id` |

消し方：

| 外部キー | 消し方 |
|---|---|
| `reading_book.owner_account_id`・`reading_marker.owner_account_id` | `CASCADE`（使う人のデータ。退会で消える） |
| `reading_marker` の本への複合の外部キー | `CASCADE`（本を消すと、マーカーも消える） |

## 3. 画面

| 道 | 画面 |
|---|---|
| `/reading` | 本棚（pr1 は準備中の案内だけ） |

## 4. テスト

- 約束：`packages/contracts/src/reading/limits.test.ts`（字の数え方と上限）。
- 表：`apps/api/src/modules/reading/schema.test.ts`（CHECK・一意・複合の外部キー・消し方を、表に直に書いて確かめる）。
