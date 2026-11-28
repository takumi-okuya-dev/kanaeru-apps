# 窓口の約束：人物メモ（person-001 pr2）

すべて `/api/v1/person/…`。ログインが要る（`requireSession`）。アプリが見えないときは、組み立てが付ける `requireApp` が 404 を返す（AD-16）。

**共通の決まり**：

- ほかの使う人の記録は、道の ID でも本文の ID でも `404 PERSON_NOT_FOUND`。
- 形の違う ID は 404（`uuidParam`）。
- 入力の誤りは `400 INVALID_INPUT`（`fields` つき）。
- エラーの文言に、利用者の値を入れない。
- 検索の言葉・タグ・メモの値は、URL に載せない（AD-31）。
- operationId は `person` で始める。tags は `["person"]`。

| operationId | 道 | 入力 | 出力 | おもな誤り |
|---|---|---|---|---|
| `personListNotes` | `GET /notes` | なし | `{ items: NoteSummary[], truncated: boolean }`（`updated_at` の新しい順・最大500） | 401 |
| `personCreateNote` | `POST /notes` | `NoteCreateInput`（`clientRequestId`・`fullName`・任意の欄・`meetingId?`） | `201 Note`（同じ `clientRequestId` の送り直しは `200` で前の人） | 400・404（`meetingId`） |
| `personGetNote` | `GET /notes/{noteId}` | なし | `Note`（会った場の一覧つき） | 404 |
| `personUpdateNote` | `PATCH /notes/{noteId}` | `NoteUpdateInput`（`baseVersion`・直す欄。`talk` も書き直せる） | `Note` | 400・404・`409 PERSON_VERSION_CONFLICT` |
| `personAppendTalk` | `POST /notes/{noteId}/appends` | `{ appendId, text, meetingId? }` | `Note`（同じ `appendId` は書かずに今の値） | 400（書き足すと話したことが上限を超える：`fields.talk`）・404 |
| `personDeleteNote` | `DELETE /notes/{noteId}` | なし | `204` | 404 |
| `personSearchNotes` | `POST /notes/search` | `{ query?: string, tag?: string }`（どちらか要る。両方なら AND） | `{ items: { note: NoteSummary, matches: { field, before, hit, after }[] }[], truncated: boolean }`（`updated_at` の新しい順・最大100） | 400 |
| `personListMeetings` | `GET /meetings` | なし | `{ items: MeetingSummary[] }`（日付の新しい順・人数つき） | 401 |
| `personCreateMeeting` | `POST /meetings` | `{ name, metOn }` | `201 Meeting`（そろえて同じ名前と日付は `200` で前の会った場） | 400 |
| `personGetMeeting` | `GET /meetings/{meetingId}` | なし | `Meeting`（そこで会った人の一覧つき） | 404 |
| `personDeleteMeeting` | `DELETE /meetings/{meetingId}` | なし | `204` | 404 |
| `personAttachMeeting` | `PUT /notes/{noteId}/meetings/{meetingId}` | なし | `Note`（付いていても同じ答え） | 404 |
| `personDetachMeeting` | `DELETE /notes/{noteId}/meetings/{meetingId}` | なし | `Note` | 404 |
| `personExport` | `GET /export` | なし | `text/csv`（`person-notes-<日本時間の日付>.csv`） | 401 |

## 形（`packages/contracts/src/person`）

- **NoteSummary**：`id`・`fullName`・`reading`・`lineName`・`appearance`・`tags`・`updatedAt`
- **Note**：NoteSummary に次を足す。
  - `accounts`（`x`・`connpass`・`github`・`linkedin`・`line`・`url`）
  - `talk`・`nextTopic`・`version`
  - `meetings: MeetingSummary[]`
- **MeetingSummary**：`id`・`name`・`metOn`（`YYYY-MM-DD`）・`noteCount`
- **Meeting**：MeetingSummary と `notes: NoteSummary[]`
- **matches の `field`**：`fullName`・`reading`・`lineName`・`appearance`・`talk`・`nextTopic`・`tags`・`meeting`。`hit` はもとの文の当たった所で、`before`・`after` は前後20字ほど。

## 画面の道（apps/web/src/features/person）

| 道 | 画面 |
|---|---|
| `/person` | 一覧・検索・タグで絞る（検索の言葉とタグは画面の状態だけ） |
| `/person/new` | 人を足す |
| `/person/notes/$noteId` | 人のメモ（話したことと次に話したいことが最初・書き足す・直す・会った場を付ける・消す） |
| `/person/meetings` | 会った場の一覧・作る |
| `/person/meetings/$meetingId` | そこで会った人・続けて足す・前に足した人を付ける・消す |

仮の画面（pr1）は `/person` に「人物メモは準備中です。」だけを出す。
