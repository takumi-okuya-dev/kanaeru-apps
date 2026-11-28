# 窓口の約束：PaletKit の交流会を会った場に選ぶ（person-002）

person-001 の [窓口の約束](../../001-notes/contracts/person.md) の共通の決まりのまま、窓口を2つ足す。すべて `/api/v1/person/…`。ログインが要る（`requireSession`）。

| operationId | 道 | 入力 | 出力 | おもな誤り |
|---|---|---|---|---|
| `personListEventCandidates` | `GET /event-candidates` | なし | `{ available: boolean, items: EventCandidate[] }`（始まりの新しい順・今日〈日本時間〉の終わりまでに始まるもの・最大50） | 401 |
| `personCreateMeetingFromEvent` | `POST /meetings/from-event` | `{ eventId }` | `201 Meeting`（その交流会の会った場がもうあれば `200` で前のもの） | 400（`eventId` の形）・`404 PERSON_NOT_FOUND`（選べない交流会・受付アプリが見えない） |

`EventCandidate`：

| 欄 | 型 | 中身 |
|---|---|---|
| `eventId` | uuid | 交流会の ID |
| `name` | string | 交流会の今の名前 |
| `metOn` | `YYYY-MM-DD` | 始まりの日本時間の日付 |
| `meetingId` | uuid か `null` | その交流会から作った会った場（なければ `null`） |

- `available: false` のときは `items` は空（受付アプリが見えない。research R2）。
- 候補に、チェックインした人の名前・人数を入れない（PRD FR-P8）。
- `Meeting`（person-001）はそのまま。作り方の違いを画面に出す欄は足さない。

## 約束（packages/contracts/src/person）

- `meeting.ts` に `EventCandidate`・`EventCandidateList`・`MeetingFromEventInput`（`{ eventId: uuid }`）を足す。
- 候補の上限 `PERSON_EVENT_CANDIDATE_MAX = 50` を置く。

## 画面

| 道 | 変わること |
|---|---|
| `/person/meetings` | 「会った場を作る」の上に「PaletKit の交流会」の欄。候補ごとに名前・日付と、「開く」（作っていなければ作ってから開く）。もう作った会には「作った」の札。`available: false` なら欄を出さない。候補がなければ「選べる交流会はまだありません。」 |
| `/person/meetings/$meetingId` | 変えない（交流会から作ったものも同じ画面） |
