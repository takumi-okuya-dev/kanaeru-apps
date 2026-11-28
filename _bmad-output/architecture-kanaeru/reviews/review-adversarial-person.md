# 点検（敵対的）— 人物メモ AD-31

- 対象：`architecture-kanaeru.md`（2026-11-27 版。AD-31 を足し、AD-3・Consistency Conventions・Capability map・Open Questions・Deferred を直したもの）と、[PRD 人物メモ](../../prd-kanaeru-person/prd-kanaeru-person.md)
- やり方：1段下の2つの単位（person の領域と、交流会の一覧を足す event・reception の小さな PR、API と画面、土台〈kernel〉と領域など）を組み、**どちらも AD を文字どおり守っているのに、組み合わせると食い違う**例を作る。食い違いごとに、足す・直す決まりの案文を出す。
- いまのコードで裏を取った所：`apps/api/src/app.ts`（要求のログ・`onError`・CSRF・回数の制限）・`kernel/logger.ts`（redact の欄）・`kernel/errors.ts`・`kernel/withdrawal.ts`・`modules/event/index.ts`・`event/repository.ts`（`listAccessibleEvents`）・`event/withdrawal.ts`（個人の交流会を消す）・`modules/reception/index.ts`・`reception/repository.ts`（`hasCheckedIn`）・`packages/contracts/src/core/jst.ts`・`packages/csv`・`apps/web/src/features/*/routes.ts`（`validateSearch`）・drizzle-orm 0.45.4 の `DrizzleQueryError`

## 判定

**方向（自分だけ・組織に入れない・名簿を読まない・CASCADE で消す・ログに出さない）は正しいが、このままでは event・reception の PR と person の PR、API と画面が別々に作ると、他人の退会を止める・メモの中身がログに出る・検索の当たり方と見せ方が割れる。仕様（`specs/person/`）の前に、下の 1〜5 を AD-31 に足す。**

| # | 重さ | 穴（1行） | 主な AD |
|---|---|---|---|
| 1 | 高 | 予期しない DB のエラーで、`onError` が積み重ね（stack）を書き、Drizzle の文に入った**メモの中身と検索の言葉がそのままログに出る** | AD-31・Conventions のログ・AD-10 |
| 2 | 高 | 「選べる交流会」を出す関数の形と条件が決まっておらず、event の PR と person の PR で割れる。作るときに交流会を確かめ直す決まりがない | AD-31・AD-3・AD-5・AD-23 |
| 3 | 高 | 手で書いた会った場を DB で一意にすると、交流会が消えたときの `SET NULL` で一意がぶつかり、**ほかの人（交流会の持ち主）の退会が落ちる** | AD-31・AD-7・AD-22・AD-23 |
| 4 | 高 | 「本文で送る」と GET・画面の URL の慣わし（`validateSearch`）がぶつかる。タグで絞る値も URL に出る | AD-31・Conventions の一覧画面の更新・AD-8 |
| 5 | 高 | 検索のそろえ方は1つでも、当たった箇所の位置・`LIKE` の記号・会った場の名前の扱い・そろえ方を変えたときの作り直しが、API と画面で割れる | AD-31・AD-17 |
| 6 | 中 | 書き足しの見出し（FR-P3）を誰が・どの日付で入れるかと、送り直し（FR-P4）・同時の編集で、見出しが2つ入る・前の書き足しが消える | AD-31・FR-P3・FR-P4 |
| 7 | 中 | 「他人の記録は 404」が、本文に入った ID・交流会の ID・表の外部キーに広がっていない（既定の「権限なしは 403」と混ざる） | AD-31・Conventions のエラー・AD-19 |
| 8 | 中 | 「退会の前の手順を持たない」を「`withdrawal` を出さない」と読むと、退会の確かめの画面にメモが消えることが出ない | AD-31・AD-22・FR-P18 |
| 9 | 中 | アカウントの欄の URL を、どこで確かめ・どこで組み立てるかがない（`javascript:` のリンク・CSV） | AD-31・FR-P16・AD-18 |
| 10 | 低 | CSV の列・複数の値の並べ方・出さない列、一覧の並びの時刻が決まっていない | AD-31・Conventions の書き出し・FR-P11・FR-P17 |

---

## 1. 【高】予期しない DB のエラーで、メモの中身がログに出る

**組み合わせ**：土台（`app.ts` の `onError`）× person の領域。

- AD-31 と Conventions の「ログ」は「人物メモのすべての欄と検索の言葉はログに書かない」。person の作り手は、自分ではメモをログに渡さない（守っている）。
- しかし土台の `onError` は、予期しないエラーで `{ requestId, errorName, stack }` を書く（`app.ts` 629行）。drizzle-orm 0.45 の `DrizzleQueryError` は、`message` が `Failed query: <SQL>\nparams: <値の並び>` で、`stack` の1行目にそのまま入る。person の保存（フルネーム・話したこと…）や検索（`ILIKE` の値）で、一意の違反・CHECK の違反・同時の削除による外部キーの違反・文の誤りが起きると、**値がまるごと Cloud Logging に残る**。
- `kernel/logger.ts` の redact は `name`・`email` などの欄の名前だけで、`fullName`・`talk`・`query` などは消さない（二重目の守りも効かない）。
- 同じ穴はチェックインの名前・困りごとにもあるが、人物メモは「他人の情報を、使う人だけが見る」約束なので重い。

**直し（Conventions の「ログ」に足す。土台を直すので、小さな共通の PR で person の領域の PR より先に入れる）**：

> 予期しないエラーのログには、エラーの名前・要求の ID と、DB のエラーなら SQLSTATE・制約の名前だけを書く。`DrizzleQueryError`（と `cause` の pg のエラー）の `message`・`stack`・`detail`・`params` は書かない（文の値に利用者の入力が入るため）。読みかえは `kernel/errors.ts` の隣に1つだけ置き、テストで「値に目印の文字を入れた失敗の DB の命令を流しても、ログに目印が出ない」を確かめる。

> （AD-31 に足す）person は、起こりうる DB のエラー（一意の違反・外部キーの違反）をすべて `AppError` に読みかえ、予期しないエラーに落とさない。person のコードは、メモの欄を持つ物（要求の本文・行）をロガーに渡さない。ログに書いてよいのは ID・件数・時間だけ。

## 2. 【高】「選べる交流会」の関数の形と条件が割れる

**組み合わせ**：event と reception の小さな PR（PRD 7.1 の4）× person の PR。

- AD-31 は「使う人がチェックインした交流会と、主催した・受付係をした交流会」を、reception の「チェックインした交流会の ID の一覧」と event の「主催した・受付係をした交流会の ID の一覧と、名前と日時の要約」から組み立てる、とだけ書く。
- event の作り手は、いまある `listAccessibleEvents`（持ち主・**管理者と編集者の組織に入れた交流会**・受付係。いまの役割で引く）を流用するのが自然。すると、組織の管理者は「出てもいない組織の交流会」まで選べる。person の作り手は「持ち主か受付係だけ」と読む。`getEventRole` を流用すれば**部員**（組織のメンバー）の交流会も入る。どれも AD に沿っている。
- ほかに決まっていないこと：これからの交流会を出すか／チェックインを取り消した（FR-8 は行を消す）・受付係を外された・組織を抜けたあと、前に作った会った場をどう扱うか／交流会が消えたとき（持ち主の退会で `event/withdrawal.ts` が個人の交流会を消す）／手で入れたチェックイン（`account_id` がない）は数えない。
- **作るときに確かめ直す決まりがない**：画面が候補の一覧を出し、API が本文の `eventId` をそのまま受けて名前と日付を写すと、使う人は**どの交流会の名前と日付でも**写せる（部員だけの交流会の名前も）。AD-31 は「選べる」を書くが、API が確かめるとは書いていない。
- event は reception を読めない（向きは reception → event）ので、「チェックインした」と「主催・受付係」を event の1つの関数で出すことはできない。組み立てる場所も決めておく。

**直し（AD-31 の「選べる交流会」を差しかえ）**：

> **選べる交流会**：次のどれかに当たる交流会で、始まりが今日（日本時間）の終わりより前のもの。(a) 使う人の account のチェックインがある（reception の `listCheckedInEventIds(db, accountId)`。手で入れた account のないチェックインは数えない）。(b) 持ち主（`event.owner_account_id`）が使う人。(c) 使う人が `event_staff` にいる。組織の役割（管理者・編集者・部員）では数えない（その会に出たことにならないため）。event は `listPersonEventChoices(db, accountId, checkedInEventIds)` を出し、(a) の ID の並びと (b)(c) を合わせて `{ eventId, name, startsAt }` を始まりの新しい順に返す（招待のリンクなど、ほかの欄は返さない）。person はこの2つを組み立てるだけで、条件を自分で書かない。
> **作るときに確かめ直す**：kanaeru の交流会から会った場を作る窓口は、本文の `eventId` を同じ条件で確かめ直し（`listPersonEventChoices` に含まれるか）、当たらなければ `404 NOT_FOUND`。名前と日付は、このときに event が返した値から写す（画面が送った名前と日付を使わない）。日付は `jstDate(startsAt)`（`packages/contracts/src/core`）。
> **あとから外れたとき**：チェックインの取り消し・受付係を外れる・組織を抜けるは、すでにある会った場に効かない（写しのまま残る）。person は作ったあと、`event_id` で event を読み直さない（一意の確かめのほかに使わない）。

## 3. 【高】手で書いた会った場の一意が、ほかの人の退会を落とす

**組み合わせ**：「会った場」の重複を防ぐ2人の作り手（API・画面）× event の退会の段。

- AD-31 は「手で書いた会った場は、前に書いたものから選べる形にして名前の揺れを防ぐ【仮決め】」とだけ書く。画面の作り手は候補を出すだけ。API の作り手は二重を確かに止めるため、`(owner_account_id, name, date) WHERE event_id IS NULL` の一意の索引を張る。どちらも AD に沿う。
- 交流会から作った会った場は、交流会が消えると `event_id` が `SET NULL` になる（AD-31）。持ち主の退会で event が個人の交流会を消す（`event/withdrawal.ts` の `deletePersonalEvents`）と、その交流会から作った**ほかの使う人の**会った場が、手で書いた会った場（同じ名前・同じ日付）と一意でぶつかり、`23505` で**交流会の持ち主の退会のトランザクションが落ちる**（500。何度押しても終わらない）。持ち主は人物メモの使う人のことを知らない。
- 一意がなくても、`SET NULL` のあとは交流会から作ったものと手で書いたものが見分けられず、「前に書いたものから選ぶ」の候補に同じ名前が2つ並び、FR-P13 の一覧が割れる。
- 同じ交流会を同時に2回選ぶと、`(owner_account_id, event_id)` の一意の違反が予期しないエラー（1の穴）になる。

**直し（AD-31 の「会った場」に足す）**：

> `person_meeting` は `source`（`event`・`manual`。作ったあと変えない）を持つ。CHECK：`source = 'manual'` なら `event_id IS NULL`。一意は2つの部分の索引：`(owner_account_id, event_id) WHERE event_id IS NOT NULL` と、`(owner_account_id, name_key, met_on) WHERE source = 'manual'`（`name_key` は 5 のそろえ方の関数を通した名前）。交流会が消えて `event_id` が null になっても `source = 'event'` のままなので、手で書いたものとぶつからない。
> 作る窓口は「なければ作り、あればそれを返す」（`ON CONFLICT DO NOTHING` のあとに読む。`200` で同じ形）。手で書いた同じ名前・同じ日付も `409` にせず、前のものを返す。
> 交流会から作った会った場の名前と日付は、作ったときの写しだけを出す（交流会があっても、あとで名前や日時が直っても読み直さない）。

## 4. 【高】「本文で送る」と GET・画面の URL の慣わしがぶつかる

**組み合わせ**：person の API × person の画面（と、いまの画面の作り方）。

- AD-31 は「検索の言葉は URL に載せず、要求の本文で送る」。REST の慣わしで検索を `GET` にした作り手は、ブラウザの `fetch` が本文つきの GET を受けない（TypeError）ので、結局クエリ文字列に戻すか、本文の要る形を自分で決める。道の名前も決まっていない。
- 画面は、いまの機能（booking・threads・account）が TanStack Router の `validateSearch` で絞り込みを URL に持つ。person の画面の作り手が同じ慣わしで `/person?q=田中` にすると、API に送る本文は守っても、**画面の URL を読み直したとき・共有したときに、Cloud Run の要求のログ（`index.html` を返す GET）と閲覧の履歴に検索の言葉が残る**。AD-31 の「URL に載せず」が API の URL だけか画面の URL も含むかが書かれていない。
- **タグで絞る値**（FR-P12）も「人物メモのすべての欄」に入るのに、`?tag=転職中` の形が止まらない。
- 検索を `POST` にすると、`app.ts` の回数の制限（状態を変える要求を IP ごとに数える）に入る。Conventions の「一覧画面の更新は5秒おき」をそのまま当てると、検索の結果を5秒ごとに POST し直して上限を食う。

**直し（AD-31 の「検索」の最後の文を差しかえ）**：

> 検索とタグで絞るのは `POST /api/v1/person/notes/search`（`operationId` は `personSearchNotes`）1つにし、本文は `{ query?, tags?, meetingId? }`。書きこまない読む窓口で、答えは `Cache-Control: no-store`（土台の既定）。メモの欄の値（検索の言葉・タグ・名前）は、API の道とクエリ文字列にも、**画面の道・`validateSearch`・ハッシュ・`sessionStorage` にも**入れない。画面の URL に入れてよいのは ID（`noteId`・`meetingId`）だけで、検索の言葉は画面の部品の中の状態に持つ。人物メモの画面は5秒おきの読み直しを使わない（書くのは使う人1人。書いたあとにその場で読み直す。Conventions の「一覧画面の更新」の例外）。

## 5. 【高】検索のそろえ方は1つでも、API と画面で当たり方と見せ方が割れる

**組み合わせ**：person の API（保存のときに「そろえた文」を作る）× person の画面（当たった箇所を前後と一緒に見せる。FR-P10）。

- そろえ方の関数（NFKC・かな・大文字小文字）は `packages/contracts/src/person` に1つ（AD-31）。しかし NFKC は文字の数を変える（半角の `ｶﾞ` 2文字 → `ガ` 1文字、`㈱` → `(株)`）。API が「そろえた文」の中の位置を返し、画面がもとの文をその位置で切ると、**ずれた箇所を光らせる**。画面が自分でもう一度探せば、API で当たったのに画面で見つからない行が出る。
- 「部分一致を DB で」（Open Questions 12）を `ILIKE '%' || $1 || '%'` で書くと、`%`・`_`・`\` を入れた検索が全部に当たる。逃がすかどうかが作り手しだい。
- PRD は会った場の名前も当たる欄に入れるが、名前は `person_meeting` にある。API の作り手 A は「そろえた文」に会った場の名前を入れ（会った場の名前を直すたびに、つながった全員の文を作り直す）、B は検索のときに結ぶ。手で書いた会った場の名前を直したとき、A だけ古い名前で当たる。
- そろえ方の関数をあとで直すと、すでにある行の「そろえた文」が古いままになり、新しい言葉で当たらない（AD-17 の DB の変更の手順に乗らない）。
- タグも同じで、`Go` と `ｇｏ` が別のタグになるかが決まっていない。

**直し（AD-31 の「検索」に足す）**：

> `packages/contracts/src/person` は、そろえる関数 `normalizeForSearch(text)` と、もとの文の中で当たった箇所を返す関数 `findMatches(original, query) → { start, end }[]`（位置は**もとの文**の中。1文字ずつそろえて位置の対応を持つ）を出す。当たった箇所と前後の文（片側40文字ほど）は API が `findMatches` で作って返し、画面はもう一度探さない。
> `person_note.search_text` は `person_note` の欄（フルネーム・よみ・LINE の名前・見た目の特徴・タグ・話したこと・次に話したいこと。アカウントは入れない）だけをそろえてつないだもの。会った場の名前は `person_meeting.name_key` で検索のときに結ぶ（会った場を直しても、人の行を作り直さない）。`LIKE` の記号（`%`・`_`・`\`）は、`ESCAPE` を付けて逃がす。
> `search_text` を作った版の番号（`search_version`）を行に持つ。そろえ方を直す PR は、版を上げ、すべての行を作り直す DB の変更を同じ PR に入れる（AD-17）。タグは `normalizeForSearch` を通した値が同じなら同じタグとして扱い、最初に書いた形で出す。

## 6. 【中】書き足しの見出しと、送り直し・同時の編集

**組み合わせ**：画面（入力の欄）× API（保存）。FR-P3「書き足すと、その頭に日付と、選んでいれば会った場が自動で入る」・FR-P4「もう一度押しても二重にならない」。

- 見出しを**画面が入力の欄に入れて全文を保存する**作り手と、**API が書き足しの窓口で付ける**作り手に割れる。前者は、電話と PC の2つで開いていると、後から保存したほうが前の書き足しを黙って消す。後者は、保存の答えが電波で届かず押し直すと、見出しと本文が2回入る。
- 見出しの「日付」が、会った場の日付か、書き足した日（帰り道に書けば翌日になる）かが決まっていない。会った場の名前は、そのときの写しを本文に固めるのか、表示のたびに引くのか（手で書いた会った場の名前を直すと変わるのか）も決まっていない。
- 人を足すときの二重の防ぎ（FR-P4）の仕組みも AD にない。主キーを画面が作る（Conventions の「`uuidv7()` は DB」と食い違う）か、別の札を持つかで割れる。FR-P7 の「続けて何人も足す」では、まとめて1回か1人ずつかでも割れる。

**直し（AD-31 に「書く」を足す）**：

> **人を足す**：`POST /api/v1/person/notes` は、画面が作った `clientRequestId`（uuid）を本文に持つ。`(owner_account_id, client_request_id)` は一意で、同じ値がもう一度来たら前に作った行を `200` で返す。続けて何人も足すとき（FR-P7）も1人ずつこの窓口を呼び、本文に `meetingId` を付ける。
> **書き足す**：`POST /api/v1/person/notes/{noteId}/talks`（本文は `{ text, meetingId?, clientRequestId }`）。見出しは API が `packages/contracts/src/person` の `formatTalkHeading({ date, meetingName })` で作って「話したこと」の末尾に足す（画面は同じ関数で見本を出すだけ）。日付は書き足した時刻の日本時間の日付（`jstDate`）【仮決め・持ち主に確かめる】、会った場の名前はそのときの `person_meeting` の名前で、本文に固めて書き直さない。`(note_id, client_request_id)` が同じなら二度足さない。`meetingId` がまだ付いていなければ、同じ処理で組を足す（一意なので二重にならない）。
> **書き直す**：ほかの欄（話したことの直しを含む）は `PATCH /api/v1/person/notes/{noteId}` に、読んだときの `updatedAt` を付けて送る。違えば `409`・code `PERSON_NOTE_STALE`（画面は書いた内容を残したまま、最新を読み直して見せる）。

## 7. 【中】「他人の記録は 404」が、本文の ID と表に広がっていない

**組み合わせ**：person の判定の関数 × person の各窓口（と、ほかの領域の慣わし）。

- Conventions の「エラー」は「権限なしは `403`」、AD-31 は「ほかの人の記録の道は `404`」。道の `noteId` は 404 にしても、本文で渡す ID（会った場に人を付けるときの `meetingId`、人に会った場を付けるときの `noteId` の並び、2 の `eventId`）を、作り手 A は `400 INVALID_INPUT`（`fields` つき）、B は `403`、C は黙って飛ばす。`400` と `403` は「その ID はある」と知らせる。
- `person_note_meeting` に、持ち主の違う人と会った場の組が入るのを止める仕組みが表にない（判定の関数を通し忘れた窓口が1つあれば入る）。
- 形の崩れた ID（uuid でない）を `400` にするか `404` にするかも割れる。

**直し（AD-31 の「組織に入れない」の最後の文を差しかえ）**：

> 人物メモの窓口は `403` を返さない。道の ID・本文の ID（`noteId`・`meetingId`・`eventId`）が、ない・形が崩れている・ほかの人のもの・選べない交流会のどれでも、同じ `404 NOT_FOUND`（同じ文言）を返す。判定は person の1つの関数（`findOwnedNote`・`findOwnedMeeting` が持ち主でなければ null を返す）だけで行う。表でも止める：`person_note_meeting` は `owner_account_id` を持ち、`(note_id, owner_account_id)` → `person_note(id, owner_account_id)`、`(meeting_id, owner_account_id)` → `person_meeting(id, owner_account_id)` の複合の外部キー（どちらも CASCADE）にする。

## 8. 【中】退会の確かめの画面に、メモが消えることが出ない

**組み合わせ**：person の領域 × 組み立て（`app.ts`）と account の退会の窓口（AD-22）。

- いまの `WithdrawalStep`（`kernel/withdrawal.ts`）は `prepare`（前の手順）・`finalize`（消すトランザクションの中・任意）・`preview`（確かめの中身）の3つ。AD-31 の「退会の前の手順（AD-22 の (2)）は持たない」を、作り手 A は「`withdrawal` を出さない」と読み、確かめの画面に人物メモが出ない（FR-P18 で全部消えるのに知らせない）。B は `preview` に「Aさん・Bさん…のメモ」と名前を並べ、メモの中身を account の画面（suite の設定）に出す。
- AD-31 の理由（「手順の中で消すと、account の削除が止まったときにメモだけが消える」）は、`prepare` には当たるが、同じトランザクションの `finalize` には当たらない（event は `finalize` で消している）。理由を読んだ作り手が `finalize` で消す形を選ぶ余地が残る。結論（CASCADE だけ）は正しいので、理由を直す。

**直し（AD-31 の「消し方」を差しかえ）**：

> 人物メモは、account の外部キーの `ON DELETE CASCADE` だけで消える。`withdrawal` は出し、`prepare` は何もしない・`finalize` は持たない（自分で消さない。`prepare` で消すと、account の削除が `409` で止まったときにメモだけが消えるため。`finalize` で消す要もない）。`preview` は件数だけを返す（例：「人物メモ（12人・会った場 5件）は消えます」）。人の名前・会った場の名前を入れない。

## 9. 【中】アカウントの欄の URL を、どこで確かめ・組み立てるか

**組み合わせ**：API（保存）× 画面（押すと開く。FR-P16）× CSV（FR-P17）。

- FR-P16 は「そのほかの URL は `http`・`https` だけ【仮決め】」。AD-31 はどこで確かめるかを書かない。画面だけで確かめる作り手と、API だけで確かめる作り手に割れると、保存された `javascript:` の値を、もう片方が `href` にそのまま入れる（自分の画面だけで動く XSS でも、CSV やあとの機能で広がる）。
- X・GitHub・LINE ID などは「ID を持って URL を組み立てる」か「URL をそのまま持つ」かで割れ、LINE のプロフィールの URL の形（10章の確かめ）が画面と CSV で違ってくる。

**直し（AD-31 に足す）**：

> アカウントは `packages/contracts/src/person` の zod の形 `{ kind: "x" | "connpass" | "github" | "linkedin" | "line" | "url", value }` で持ち、API と画面が同じ形で確かめる（`url` は `http:`・`https:` だけ。ほかは ID の文字の決まり）。開く URL は同じ場所の `accountHref(account)` だけが作り、画面は保存された文字を `href` にそのまま入れない。リンクは `rel="noopener noreferrer"`。CSV には `value` を書く（URL を組み立てない）。

## 10. 【低】CSV の列と、一覧の並びの時刻

- **CSV**：「すべての欄ごと」（FR-P17）だが、`search_text`・`search_version`・`client_request_id` を出すか、複数の値（タグ・アカウント・会った場）を1つのセルにどう並べるか、会った場が多いときに行を分けるかが決まっていない。書き出しの窓口に検索の条件を付ける作り手が出ると、4 の穴がまた開く。
  - **直し（AD-31 の「書き出し」に足す）**：列と並びは `packages/contracts/src/person` の `PERSON_CSV_COLUMNS` に1つだけ置く。1人1行。複数の値はセルの中で改行でつなぎ、会った場は「日付 名前」で並べる。内部の列（`search_text`・`search_version`・`client_request_id`・ID）は出さない。窓口は `GET /api/v1/person/notes/export.csv` で条件を受けない（全部を出す）。ファイルの名前に人の名前を入れない。
- **一覧の並び**（FR-P11）：会った場を付けた・タグを変えた・書き足したで上に来るかが、作り手ごとに割れる。
  - **直し**：`person_note.updated_at` は、その人の欄・書き足し・会った場の組のどれを変えても進める（組の変更も person の同じトランザクションで人の行を更新する）。一覧は `updated_at` の新しい順、同じなら `id` の順。
