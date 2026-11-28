# 窓口と画面の道：読書記録の Kindle の取りこみ・探す・あとで調べる（reading-002）

reading-001 の窓口（[001 の contracts](../../001-bookshelf-import/contracts/reading.md)）に足す・直すもの。どれもログインが要り、ほかの使う人の記録は `404`・入力の誤りは `400`。

## 窓口（`/api/v1/reading/…`）

| 方法 | 道 | 入力 | 答え |
|---|---|---|---|
| POST | `/search` | `{ query }`（1〜100字） | `{ books: [{ book: { id, title }, hits: [{ markerId \| null, field, before, hit, after }] }], truncated }`（本ごと。1冊20件・全体100件） |
| GET | `/questions` | — | `{ items: [{ marker, book: { id, title, want } }] }`（`?` の印のマーカー。調べていないものが先） |
| PATCH | `/markers/{markerId}`（直す） | 足す欄 `learned`（null で消す） | マーカー（`learned`・`researchedAt` つき） |

- `Marker` の形に `learned`・`researchedAt` を足す。
- 探す言葉・分かったことは、ログとエラーの文に入れない。

## 画面の道（`/reading/…`）

| 道 | 画面（見本） | 中身 |
|---|---|---|
| `/reading` | 本棚（見本の1） | 上に探す欄を足す。探すと、本ごとの結果（当たった所）。押すと本の画面のそのマーカーへ |
| `/reading/questions` | あとで調べる（見本の5） | `?` のマーカー（本・章・コメント）・「調べる」（選んだ先を新しいタブで）・「分かったことを書く」・調べる先の選び方・閉じた「調べ終えたもの」 |
| `/reading/import` | 取りこむ | 「ファイルを選ぶ」が Kindle の HTML も受ける（ファイルの種類で見分ける）。貼り付けは Web のノートブックの形も読む |
| `/reading/books/$bookId` | 本の画面 | 上に「マーカーのある章 N」と章ごとの数（押すとその章へ）。マーカーに分かったことを出す。`#marker-<id>` でそのマーカーへ移る |

- 外枠のナビに「あとで調べる」（アイコン `search`）を足す。
