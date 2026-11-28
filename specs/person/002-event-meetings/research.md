# Research：PaletKit の交流会を会った場に選ぶ（person-002）

2026-11-28 作成。持ち主は自動で進めてよいと言った。【仮決め】は持ち主の確かめを待つ。

## R1 選べる交流会の決め方（AD-31）

- **Decision**：person の API が、次の3つを順に呼んで候補を作る。
  1. suite の `isAppVisible(db, "reception", 見る人)`：受付アプリが見えなければ、候補は空で `available: false`。
  2. reception の `listCheckedInEventIds(db, accountId)`：その人が自分のアカウントでチェックインした交流会の ID。
  3. event の `listAccountEventSummaries(db, accountId, ids)`：持ち主か受付係の交流会と、2の交流会を、名前と始まりだけでまとめて返す（同じ交流会は1行）。
- **Rationale**：条件を reception・event の関数に1か所ずつ置くと、候補の一覧と、作るときの確かめ直しが同じ条件になる（AD-31 の Prevents）。組織の役割を含む主催者の一覧（`listAccessibleEvents`）は使わない。
- **Alternatives considered**：
  - person が checkin・event_staff の表を直に読む：AD-3 に反する。
  - reception の `hasCheckedIn` を交流会ごとに呼ぶ：1件ずつ引くことになる（AD-31 は「まとめて返す」）。

## R2 候補の窓口の形

- **Decision**：`GET /api/v1/person/event-candidates` が `{ available, items: { eventId, name, metOn, meetingId }[] }` を返す。
  - `metOn` は始まりの日本時間の日付（`jstDate`）。
  - `meetingId` は、その交流会から作った会った場がもうあればその ID、なければ `null`。
- **Rationale**：画面は「もう作った」の印と「開く」を1回で出せる。受付アプリが見えないときは 404 にせず `available: false` で欄を隠す。人物メモ自体は見えているので、ページ全体を「見つからない」にしない。
- **Alternatives considered**：会った場の一覧（`GET /meetings`）に混ぜる。作っていない交流会が会った場に見え、人数の列と意味がずれる。

## R3 候補の範囲【仮決め】

- **Decision**：始まりが「今日（日本時間）の終わり」までの交流会を、始まりの新しい順に最大50件出す。絞るのは person の API（event の関数は全部を返す）。
- **Rationale**：会った場は会ったあとに作る。明日以降の会が上に並ぶと、今日の会を探しにくい。受付係を長く続けた人でも画面が長くなりすぎない。
- **Alternatives considered**：
  - 期限を付けない：一覧が長くなる。
  - 過去90日だけ：去年の会を選べなくなる。古い会は手で書けるが、50件の上限で十分に絞れる。

## R4 交流会から会った場を作る

- **Decision**：`POST /api/v1/person/meetings/from-event` の本文 `{ eventId }`。
  - R1 と同じ手順で候補を作り直し、その中に `eventId` がなければ `404 PERSON_NOT_FOUND`（受付アプリが見えないときも）。今日より後の会も 404（R3 と同じ範囲）。
  - あれば `person_meeting` に `source='event'`・`event_id`・名前の写し・`met_on`（始まりの日本時間の日付）・`name_key` を入れる。
  - `(owner_account_id, event_id) WHERE event_id IS NOT NULL` の部分の一意の索引で `onConflictDoNothing` し、ぶつかったら前の行を返す（新しく作れば 201、前のものなら 200）。同時に2回送っても1つだけできる。
- **Rationale**：作るときも候補と同じ条件で確かめ直す（AD-31）。名前と日付は写しで、あとから交流会を読み直さない（AD-25）。
- **Alternatives considered**：交流会の ID を道に置く（`POST /meetings/from-event/{eventId}`）。交流会の ID は人物メモの値ではないので、どちらでもよい。ほかの作る窓口とそろえて本文にした。

## R5 名前の長さとそろえた名前

- **Decision**：交流会の名前は最大100字（`EVENT_NAME_MAX`）なので、会った場の名前の上限（100字・コードポイント）に収まる。そろえた名前（`name_key`）が上限（400字）を超えるときだけ、400字で切る。
- **Rationale**：交流会の会った場の一意は `event_id` で決まる。`name_key` は検索のためだけなので、切っても一意は壊れない。NFKC で字が大きく増える字（ﷺ など）だけの名前は、ふつうはない。
- **Alternatives considered**：作れないとして 400 を返す。交流会の名前は使う人が変えられないので、選べなくなる。

## R6 交流会が消えた・選べなくなったとき（PRD FR-P9）

- **Decision**：person-001 の外部キー（`event_id` は `ON DELETE SET NULL`）のまま。名前・日付・付いた人は残る。受付係から外れる・チェックインが取り消されても、作った会った場は消さない。候補の一覧からは消える。
- **Rationale**：AD-25（試合表）と同じ考え。メモは使う人の記録。
- **Alternatives considered**：選べなくなったら会った場を隠す。PRD FR-P9 に反する。

## R7 チェックインした人の名前を読まない（PRD FR-P8）

- **Decision**：person が import してよいのは、reception の `listCheckedInEventIds` と、event の `eventTable`・`listAccountEventSummaries` だけ。lint の許す一覧（#170 の形）を広げる。
  - reception の `index.ts` を許し、`allowImportNames: ["listCheckedInEventIds"]`。
  - event は `allowImportNames: ["eventTable", "listAccountEventSummaries"]`。
  - 広げる直しは共通のファイル（`eslint.config.js`）なので、受付と交流会の関数の共通の PR（`feat/core-person-event-sources`）に、#170 が入ったあとで足す。
- **Rationale**：`listCheckins`・`listEventAttendees` を呼べないことを、レビューに頼らず lint で止める。
- **Alternatives considered**：person-002 の実装の PR で直す。共通のファイルは領域の PR に混ぜない決まり（並行開発の決まり 4）。

## R8 人のメモの画面からは交流会を選ばない【仮決め】

- **Decision**：人のメモの画面の「会った場を付ける」は、今のまま、すでにある会った場から選ぶ。交流会の会った場は、会った場の画面で交流会を選んで作ってから使う。
- **Rationale**：会った場の画面で交流会を選ぶと、そのまま続けて足す画面に進める（帰り道の流れ）。人のメモの画面の選択肢に、作っていない交流会を混ぜると、押したときに会った場ができる動きが見えにくい。
- **Alternatives considered**：人のメモの画面の選択肢に交流会も並べる。あとで要望があれば足す。

## R9 ログと URL

- **Decision**：候補の窓口と作る窓口は、person-001 と同じくログを書かない。DB のエラーは `guardDbErrors` で読みかえる。交流会の ID は道や本文に載ってよい（メモの値ではない）。交流会の名前は会った場の名前になるので、URL に載せない。
- **Rationale**：person-001 FR-017・FR-022 と同じ。
