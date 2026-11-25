# Data Model: 見せる・受け付ける（match-004）

2026-11-22 作成。DB の変更はない。match-001 の [data-model.md](../001-tables/data-model.md) の列を次のように使う。

| 列 | 使い方 |
|---|---|
| `match_table.view_token_hash`・`view_token_expires_at` | 見るだけの札の SHA-256（16進）と期限（試合の日と作った日の遅いほうの、日本時間の終わり）。作り直すと上書き |
| `match_table.join_token_hash`・`join_token_expires_at` | 受付の札の SHA-256 と期限。作り直すと上書きし、`join_closed_at` を空にする |
| `match_table.join_closed_at` | 受付を締めた時刻（空でなければ受付のページは 404） |
| `match_join` | 受付の1行（呼び名・レベル・受け付けた時刻）。名簿に入れても残す（名簿の人の ID は `joinPlayerId(match_join.id)`）。100行まで受ける |

中身（`match_table.content`）の形は変えない。受付から入れた名簿の人は ID が `j` で始まる16文字（名簿の人の ID の形のまま）。
