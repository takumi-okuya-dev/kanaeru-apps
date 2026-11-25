# Contracts: 試合表の窓口（match-002）

2026-11-22 作成。形の正本は `packages/contracts/src/match/`。どの道もログインが要る（`requireSession`）。アプリが見えなければ 404（組み立ての `requireApp`）。

| 道 | 何をするか | 答え |
|---|---|---|
| `GET /api/v1/match/tables` | 開ける試合表の一覧（自分のものと、管理者・編集者の組織に入れたもの。試合の日の新しい順）。先に自分の90日を過ぎた試合表を消す | 200 `MatchTableList` |
| `POST /api/v1/match/tables` | 作る（`name`・`playDate`・任意の `organizationId`・`deviceId`）。作った端末が担当。くじの種はサーバーの乱数 | 201 `MatchTable`／400（入っていない組織は `MATCH_ORGANIZATION_NOT_FOUND`） |
| `GET /api/v1/match/organization-options` | 入れられる組織（自分が入っている組織） | 200 `MatchOrganizationOptions` |
| `GET /api/v1/match/tables/{tableId}` | 読む | 200 `MatchTable`／403 `MATCH_FORBIDDEN`／404 `MATCH_NOT_FOUND` |
| `PUT /api/v1/match/tables/{tableId}` | 直す（`deviceId`・`baseVersion`・`changeId`・`seed`・`content`）。同じ `changeId` は書かずに今の試合表 | 200 `MatchTable`（版 +1）／400／409 `MATCH_NOT_EDITOR`・`MATCH_VERSION_CONFLICT` |
| `PUT /api/v1/match/tables/{tableId}/editor` | この端末を担当にする（`deviceId`）。版は上げない | 200 `MatchTable` |
| `DELETE /api/v1/match/tables/{tableId}` | 消す | 204 |

権限：持ち主と、入れた組織の管理者・編集者（`apps/api/src/modules/match/access.ts` の `requireTableAccess`）。

退会の手順（`withdrawal`）：組織に入れた試合表を組織の今の管理者に引き継ぐ。確かめの中身は「試合表「…」は、…さん（組織「…」の管理者）に引き継がれます。」と「組織に入れていない試合表n件（…）を消します。」。

画面の道（`apps/web/src/features/match/paths.ts`）：`/match`（一覧）・`/match/new`（作る）・`/match/tables/$tableId`（名簿と設定）・`/match/tables/$tableId/board`（試合表）・`/match/tables/$tableId/print`（印刷）。
