# 読書記録（reading）の地図

2026-11-28 作成（reading-001 pr1：表とアプリの登録。pr2：窓口・画面・取りこみ。決めた理由は [specs/reading/001-bookshelf-import/research.md](../../specs/reading/001-bookshelf-import/research.md)）。

読書記録（key `reading`）の1つの領域（構成の決めごと AD-32〜AD-34）。

- **何をするか**：使う人が Kindle と GoodNotes で引いたマーカーとコメントを1か所に集め、人に話す・やってみる・書く材料にする（[PRD](../../_bmad-output/prd-kanaeru-reading/prd-kanaeru-reading.md)）。
- **持ち主**：本とマーカーは使う人の account の記録。組織には入れない（AD-19・AD-32）。
- **本のファイルを持たない**：取りこむファイル（GoodNotes の PDF など）は端末の中で読み、マーカーとコメントだけを送る（AD-34）。

この版（reading-001）で入っているのは、本棚・本を足す（書誌の検索）・GoodNotes の PDF と貼り付けの取りこみ・取りこみ直し・本の画面・本棚を整えること。Kindle の書き出しの取りこみ・探す・あとで調べるは reading-002、説明の材料から先は reading-003 以降。

## 1. アプリの登録

| 項目 | 値 |
|---|---|
| key・道の頭 | `reading`・`/reading`（画面）・`/api/v1/reading/…`（窓口） |
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

## 3. 窓口

どれもログインが要る。ほかの人の本・マーカーは `404 READING_NOT_FOUND`（あると知らせない）。入力の誤りは `400`。

| 方法 | 道 | 中身 |
|---|---|---|
| POST | `/api/v1/reading/catalog/search` | 書誌を探す（本文 `{ q }`。書名は国立国会図書館サーチの OpenSearch〈`dpid=iss-ndl-opac`〉、ISBN は openBD → なければ NDL。候補の書影は openBD にまとめて問い合わせる。5秒で打ち切り、失敗は `502 READING_CATALOG_UNAVAILABLE`。出口は `deps.fetch`） |
| GET・POST | `/api/v1/reading/books` | 本棚（読んでいる本が上・最後に取りこんだ順）・本を足す |
| GET・PATCH・DELETE | `/api/v1/reading/books/{bookId}` | 本（消していないマーカーを `position` の順に）・直す・消す |
| POST | `/api/v1/reading/books/{bookId}/merge` | 本をまとめる（`{ intoBookId }`。同じ本どうしは `422 READING_SAME_BOOK`） |
| GET | `/api/v1/reading/books/{bookId}/marker-keys` | マーカーの鍵の一覧（消したものも含む） |
| POST | `/api/v1/reading/books/{bookId}/markers/import` | マーカーの束を取りこむ（1〜500件。本文 100KB まで） |
| PATCH・DELETE | `/api/v1/reading/markers/{markerId}` | マーカーを直す（コメント・? の印・章）・消す（`deleted_at`） |

**取りこみの決まり**（research R3・R4）
- 鍵は、そろえたマーカーの文（NFKC・空白と改行を1つに・日本語の字どうしの間の空白を除く）とページと位置の SHA-256。文のないものはコメントで作る。API が作り直す（`@workspace/contracts/reading` の `markerKey`。画面も同じ関数で「新しいマーカー」を数える）。
- `INSERT … ON CONFLICT (book_id, dedupe_key) DO UPDATE`：読書記録で直したコメント（`comment_edited`）と付け外した印（`question_edited`）は変えない。章は空のときだけ埋める。消したマーカーは変えない。束の中の同じ鍵は先のものだけ。
- 束ごとに `last_imported_at` を今にし、`sources` に読む場所を足す（貼り付けは `other`）。

**ログ**：書名・分かりたいこと・マーカーの文・コメント・検索の言葉は、ログとエラーの文に出さない。DB のエラーは `guardDbErrors` で SQLSTATE と制約の名前だけのエラーに読みかえる（`logging.test.ts`）。

## 4. 画面

| 道 | 画面 |
|---|---|
| `/reading` | 本棚（読んでいる本・閉じた「読み終えた本」「やめた本」・主のボタン「取りこむ」） |
| `/reading/books/new` | 本を足す（書名か ISBN で探す・候補を選ぶ・手で書く・分かりたいこと・読む場所。書誌の出どころを書く） |
| `/reading/import` | 取りこむ（GoodNotes の PDF を選ぶ・貼り付ける） |
| `/reading/import/confirm` | 確かめてから入れる（件数・新しいマーカーの数・入れる本〈ファイルの名前に近い本を選んでおく・新しく登録〉・章の名前とコメントの付け先を直す・束で送る） |
| `/reading/books/$bookId` | 本の画面（分かりたいこと・章ごとのマーカー・コメントを直す・? の印・消す・本の設定〈状態・読む場所・まとめる・消す〉） |

- 外枠のナビは、読書記録の画面の中でだけ「本棚」を出す（アイコンは `list`。本のアイコンは外枠の共通の変更なので、別の共通の PR で足す）。
- 書影は openBD にあるときだけ配信元から出し、なければ書名の頭の文字で仮の表紙（`Cover.tsx`）。
- 読み取った中身は画面の中の置き場（`import-session.ts`）だけに持つ（道・保存場所に入れない。読み直したら消える）。

## 5. GoodNotes の PDF の読み方（端末の中。AD-34）

- `apps/web/src/features/reading/import/pdf.ts`：`pdfjs-dist` 4.10.38 の legacy の束を、「ファイルを選ぶ」で動的に読みこむ。worker（`?url`）と日本語の CMap（`import.meta.glob` の `?url&no-inline`）は画面の静かなファイルとして自分のドメインから出し、CSP を変えない。`isEvalSupported: false`・`disableFontFace: true`・`maxImageSize: 0`（画像は読まない）。300MB まで。
- `import/goodnotes.ts`：pdf.js に依存しない読み方。不透明度 < 1 かつ幅 8pt 以上の線をマーカーとみなし、線の下の字を拾う。`HiraginoSans` の書体の字（なければ本文と違う書体の字）をテキストボックスとみなし、100pt 以内のいちばん近いマーカーのコメントにする。ページの上の柱から章とページを取る。
- 見本：`import/__fixtures__/goodnotes-sample.pdf`（架空の文・作り方は `make-sample.ts` と `README.md`）。本物の本の PDF は置かない。

## 6. テスト

- 約束：`packages/contracts/src/reading/*.test.ts`（上限・鍵・貼り付け・ISBN）。
- 表：`apps/api/src/modules/reading/schema.test.ts`（CHECK・一意・複合の外部キー・消し方を、表に直に書いて確かめる）。
- 窓口：`routes.test.ts`（本・取りこみ・取りこみ直し・マーカー・まとめる・退会）・`catalog.test.ts`（出口を差しかえる）・`logging.test.ts`。
- 画面：`apps/web/src/features/reading/*.test.tsx`・`import/*.test.ts`（見本の PDF を Node の pdf.js で読む）。
- E2E：`e2e/tests/reading.spec.ts`（見本の PDF をブラウザで読んで入れる・貼り付け・取りこみ直し・axe・CSP）。
