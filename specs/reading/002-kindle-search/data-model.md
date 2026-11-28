# Data Model: 読書記録の Kindle の取りこみ・探す・あとで調べる（reading-002）

DB の変更は1つ（pr1）。`reading_marker` に列を2つ足すだけ（前の版のアプリでも壊れない形。docs/rules/coding.md 3）。表は [reading-001 の data-model](../001-bookshelf-import/data-model.md)。

## reading_marker（足す列）

| 列 | 型 | 決まり |
|---|---|---|
| `learned` | text | 分かったこと。null か 1〜2,000字（R6） |
| `researched_at` | timestamptz | 調べた時刻。`learned` を入れたら今、消したら null |

- 確かめ（CHECK）：`learned` は null か 1〜2,000字。`learned IS NULL` と `researched_at IS NULL` は同じ（どちらかだけは入らない）。
- 索引：`(owner_account_id, question, researched_at)`（あとで調べるの並び）。
- 取りこみ（reading-001 の ON CONFLICT）は、この2つを変えない。本をまとめるときは、まとめ先が空なら元の値を使う。

## 約束（packages/contracts/src/reading・足すもの）

- `limits.ts`：`READING_MARKER_LIMITS.learned = 2_000`・探す言葉 100字。
- `search.ts`：そろえ方・当たった所（もとの文の中の位置）・`LIKE` の逃がし。
- `research-prompt.ts`：調べる文と、調べる先の URL（3つの先・2,000字の上限）。
- `question.ts`・`search-result.ts`：窓口の入力と答えの形（[contracts/reading.md](./contracts/reading.md)）。
