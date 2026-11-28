# 窓口と画面の道：読書記録の本棚と取りこみ（reading-001）

窓口はすべてログインが要る（`requireSession`）。アプリが見えないとき（AD-16）は `404`。ほかの使う人の本・マーカーは `404 NOT_FOUND`（R11）。入力と答えの形は `packages/contracts/src/reading` の zod（strict）。エラーの形は土台の `ErrorBody`。0時〜8時は `503 DB_UNAVAILABLE`（AD-10）。

## 窓口（`/api/v1/reading/…`）

| 方法 | 道 | 入力 | 答え | 主なエラー |
|---|---|---|---|---|
| POST | `/catalog/search` | `{ q }`（1〜200字） | `{ items: [{ title, author, isbn, coverUrl, source }] }`（20件まで） | `422`（空）・`502 CATALOG_UNAVAILABLE` |
| GET | `/books` | — | `{ items: [{ id, title, author, coverUrl, status, sources, markerCount, lastImportedAt }] }`（本棚の並び。FR-007） | — |
| POST | `/books` | `{ title, author?, isbn?, coverUrl?, catalogSource, want?, sources? }` | `201` と本 | `422`（字数・ISBN・書影の URL の形） |
| GET | `/books/{bookId}` | — | 本と、マーカー（消していないもの。`position` の順） | `404` |
| PATCH | `/books/{bookId}` | `{ title?, author?, want?, status?, sources? }` | 本 | `404`・`422` |
| DELETE | `/books/{bookId}` | — | `204`（マーカーも消える） | `404` |
| POST | `/books/{bookId}/merge` | `{ intoBookId }` | まとめ先の本（`movedCount`・`duplicateCount`） | `404`（どちらか）・`422`（同じ本） |
| GET | `/books/{bookId}/marker-keys` | — | `{ keys: string[] }`（消したものも含む。R7） | `404` |
| POST | `/books/{bookId}/markers/import` | `{ source, markers: [{ text, comment?, chapter?, page?, location?, position, question }] }`（1〜500件・本文 100KB まで） | `{ inserted, updated, unchanged }` | `404`・`413`（本文が大きい）・`422`（形・字数） |
| PATCH | `/markers/{markerId}` | `{ comment?, question?, chapter? }` | マーカー（`comment` を変えたら `comment_edited`、`question` を変えたら `question_edited` を true） | `404`・`422` |
| DELETE | `/markers/{markerId}` | — | `204`（`deleted_at` を入れる） | `404` |

- 取りこみの窓口は、束ごとに本の `last_imported_at` を今にし、`sources` に読む場所を足す（`paste` は `other`）。
- マーカーの文・コメント・分かりたいこと・検索の言葉は、ログとエラーの文に入れない（FR-025）。

## 画面の道（`/reading/…`）

| 道 | 画面（見本） | 中身 |
|---|---|---|
| `/reading` | 本棚（見本の1） | 読んでいる本の一覧・閉じた「読み終えた本」「やめた本」・主のボタン「取りこむ」・「本を足す」 |
| `/reading/books/new` | 本を足す | 書名か ISBN で探す・候補・手で書く・分かりたいこと・読む場所 |
| `/reading/import` | 取りこむ（見本の2） | 主のボタン「ファイルを選ぶ」（PDF）・「貼り付ける」・書き出し方（開け閉め） |
| `/reading/import/confirm` | 確かめてから入れる（見本の3） | 件数・章ごとの数・新しいマーカーの数・入れる本（選び直す・新しく登録）・コメントの付け先と章を直す・「入れる」。読み取った中身は画面の中だけに持つ（読み直したら `/reading/import` に戻る） |
| `/reading/books/$bookId` | 本の画面（見本の4） | 分かりたいこと・章ごとのマーカーとコメント・コメントを直す・`?` の印・マーカーを消す・本の設定（読む場所・状態・まとめる・消す） |

- 外枠のナビ（`features.list`）の項目は「本棚」だけ（reading-002 で「あとで調べる」を足す）。
- 見た目は `packages/ui` の部品と `tokens.css` の値だけ（DESIGN.md。ボタンの並べ方は ButtonRow）。
