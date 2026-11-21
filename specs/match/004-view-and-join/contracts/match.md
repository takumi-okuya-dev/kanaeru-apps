# Contracts: 見せる・受け付ける窓口（match-004）

2026-11-22 作成。形の正本は `packages/contracts/src/match/public.ts`。match-002 の [contracts/match.md](../../002-roster/contracts/match.md) に足す。アプリが見えなければ 404（組み立ての `requireApp`）。

## 運営（ログインと試合表の権限が要る）

| 道 | 何をするか | 答え |
|---|---|---|
| `PUT /api/v1/match/tables/{tableId}/view-link` | 見るだけの札を作り直す（前の札は 404 に） | 200 `MatchLinkIssued`（札はこのときだけ）／401／403／404 |
| `PUT /api/v1/match/tables/{tableId}/join-link` | 受付の札を作り直して受付を開く（締めた印を外す） | 200 `MatchLinkIssued` |
| `POST /api/v1/match/tables/{tableId}/join-link/close` | 受付を締める | 200 `MatchJoinList` |
| `GET /api/v1/match/tables/{tableId}/joins` | 受付の一覧（受け付けた順・同じ名前の印・札の期限と締めた時刻） | 200 `MatchJoinList` |
| `DELETE /api/v1/match/tables/{tableId}/joins/{joinId}` | 受付の行を消す | 204／404 |

`GET /api/v1/match/tables/{tableId}` の答え（`MatchTable`）に `links`（`viewExpiresAt`・`joinExpiresAt`・`joinClosedAt`。期限を過ぎていれば null）を足した。

## 参加者（ログインなし。答えは `Cache-Control: no-store`・`X-Robots-Tag: noindex, nofollow`）

| 道 | 何をするか | 答え |
|---|---|---|
| `GET /api/v1/match/views/{viewToken}` | 見るだけのページ（名前・日付・版・1試合の長さ・組〈key・言葉〉ごとの試合〈呼び名の並び・終わったか〉・期限） | 200 `MatchView`／404 `MATCH_VIEW_NOT_FOUND` |
| `GET /api/v1/match/views/{viewToken}/version` | 版の番号 | 200 `MatchViewVersion`／404 |
| `GET /api/v1/match/joins/{joinToken}` | 受付のページ（名前・日付・選べるレベル） | 200 `MatchJoinInfo`／404 `MATCH_JOIN_NOT_FOUND` |
| `POST /api/v1/match/joins/{joinToken}` | 受け付ける（strict：`nickname` 1〜20文字・`level`） | 201 `MatchJoinAccepted`／400／404／409 `MATCH_JOIN_FULL`（100人） |

札は base64url の32文字（192ビット）。形が違えば DB を引かずに 404。期限切れ・締めた・作り直した・ない札は、どれも同じ 404。

画面の道（`apps/web/src/features/match/paths.ts`）：`/match/view/$viewToken`（見るだけ）・`/match/join/$joinToken`（受付）・`/match/tables/$tableId/view-link`（見るだけのリンクと QR）・`/match/tables/$tableId/join`（M7）。
