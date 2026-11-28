# 人物メモ（person）の地図

2026-11-27 作成（person-001 pr1：表とアプリの登録。決めた理由は [specs/person/001-notes/research.md](../../specs/person/001-notes/research.md)）。2026-11-27 直した（person-001 pr2：窓口・画面・検索・書き出し）。

人物メモ（key `person`）の1つの領域（構成の決めごと AD-31）。

- **何をするか**：使う人が、交流会で会った人の見た目の特徴・話したこと・次に話したいこと・アカウントを、自分だけが見られるメモに残す（[PRD](../../_bmad-output/prd-kanaeru-person/prd-kanaeru-person.md)）。
- **持ち主**：メモは使う人の account の記録。組織には入れない（AD-19・AD-31）。
- **外に出さない**：メモは外の AI・MCP・ログ・URL に出さない（AD-20・AD-21・AD-31）。

この版（person-001 pr2）で入っているのは、表とアプリの登録・14の窓口・5つの画面。kanaeru の交流会を会った場に選ぶ部分は次の仕様（この版の会った場は手で書いたものだけ）。

## 1. アプリの登録

| 項目 | 値 |
|---|---|
| key・道の頭 | `person`・`/person`（画面）・`/api/v1/person/…`（窓口） |
| 領域 | `person` の1つ |
| 使ってよいほかのアプリ | `reception`（PaletKit の交流会を会った場に選ぶとき。次の仕様。AD-31） |
| 公開 | 台帳に行がない間は運営者だけに見える（AD-16） |
| 退会 | 退会の前の手順（`withdrawal`）は出さない。持ち主を指す外部キーの CASCADE で、account と一緒に消える。退会の確かめの画面には `accountData`「人物メモ（会った人・会った場）」が出る |

## 2. 表

| 表 | 列 | 決まり |
|---|---|---|
| `person_note` | `id`・`owner_account_id`・`full_name`・`reading`・`line_name`・`appearance`・`account_x`・`account_connpass`・`account_github`・`account_linkedin`・`account_line`・`account_url`・`tags`・`tag_keys`・`talk`・`next_topic`・`search_text`・`search_version`・`version`・`create_request_id`・`last_append_id`・`created_at`・`updated_at` | 人のメモ（最上位の記録）。相手の account の ID は持たない（AD-2）。長さの CHECK は約束の `PERSON_NOTE_LIMITS` と同じ（`char_length`。コードポイントで数える）。`account_url` は `http://`・`https://` で始まるものだけ。`tag_keys` は `tags` をそろえた形で、同じ数（タグの数の上限は置かない）。`search_text` は検索のためにそろえた文で、`search_version` はそろえ方の版。`create_request_id` は人を足す送りの ID（空でなければ使う人ごとに一意）。一意 `(id, owner_account_id)`（組の表の複合の外部キーが指す）。索引 `(owner_account_id, updated_at desc)` |
| `person_meeting` | `id`・`owner_account_id`・`source`・`name`・`name_key`・`met_on`・`event_id`・`created_at`・`updated_at` | 会った場（使う人の一覧の1件）。`source` は `manual`・`event`（作ったあと変えない。この版は `manual` だけを作る）。`manual` は `event_id` を持たない（CHECK）。名前は1〜100字で、`name_key` はそろえた名前。一意は部分の索引2つ：`(owner_account_id, event_id)` と、`manual` の `(owner_account_id, name_key, met_on)`。一意 `(id, owner_account_id)` |
| `person_note_meeting` | `note_id`・`meeting_id`・`owner_account_id`・`created_at` | 人と会った場の組。主キーは `(note_id, meeting_id)`。`(note_id, owner_account_id)` と `(meeting_id, owner_account_id)` の複合の外部キーで、持ち主の違う人と会った場を結ばせない。索引 `meeting_id` |

消し方：

| 外部キー | 消し方 |
|---|---|
| `person_note.owner_account_id`・`person_meeting.owner_account_id` | `CASCADE`（使う人のデータ。退会で消える） |
| `person_meeting.event_id` | `SET NULL`（交流会が消えても、名前と日付の写しは残る。AD-25 と同じ） |
| `person_note_meeting` の2つの複合の外部キー | `CASCADE`（人か会った場を消すと、組だけが消える） |

## 3. 窓口

すべて `/api/v1/person/…`。ログインが要る（account の `requireSession`）。アプリが見えないときは組み立てが付ける `requireApp` が 404。
権限は `access.ts` の「持ち主か」だけで、ほかの使う人の人・会った場は、道の ID でも本文の ID でも `404 PERSON_NOT_FOUND`。
person が読むほかの領域は account・suite の `index.ts` と、外部キーのための event の `eventTable` だけ（AD-31）。

| operationId | 道 | すること |
|---|---|---|
| `personListNotes` | `GET /notes` | 人の一覧（最後に保存した順・最大500人・`truncated`） |
| `personCreateNote` | `POST /notes` | 人を足す（`meetingId` で会った場も付く。同じ `clientRequestId` の送り直しは 200 で前の人） |
| `personGetNote` | `GET /notes/{noteId}` | 人を読む（付いている会った場つき） |
| `personUpdateNote` | `PATCH /notes/{noteId}` | 送った欄だけ直す（`baseVersion` が違えば `409 PERSON_VERSION_CONFLICT`） |
| `personAppendTalk` | `POST /notes/{noteId}/appends` | 話したことに見出しつきで書き足す（同じ `appendId` は書かずに今の値。比べるのは最後の1つだけ〈research R7 の分かっている限り〉。超えると 400 `fields.talk`） |
| `personDeleteNote` | `DELETE /notes/{noteId}` | 人を消す（会った場は残る） |
| `personSearchNotes` | `POST /notes/search` | 言葉とタグで探す（両方なら AND・最大100人・当たった所の前後の文つき） |
| `personAttachMeeting`・`personDetachMeeting` | `PUT`・`DELETE /notes/{noteId}/meetings/{meetingId}` | 会った場を付ける・外す（人の `updated_at` が新しくなる） |
| `personListMeetings` | `GET /meetings` | 会った場の一覧（日付の新しい順・人数つき） |
| `personCreateMeeting` | `POST /meetings` | 会った場を作る（そろえて同じ名前と日付は 200 で前のもの） |
| `personGetMeeting`・`personDeleteMeeting` | `GET`・`DELETE /meetings/{meetingId}` | 会った場を読む（人の一覧つき）・消す（人は残る） |
| `personExport` | `GET /export` | CSV（`person-notes-<日本時間の日付>.csv`。research R13 の列） |

- **検索**：保存のたびに `search_text`（フルネーム・よみ・LINE の名前・見た目の特徴・話したこと・次に話したいこと・タグを、`normalizeForSearch` でそろえて改行でつないだもの）と `search_version`・`tag_keys` を作る。言葉は `LIKE … ESCAPE '\'`（`%`・`_`・`\` を逃がす）、会った場の名前は `name_key` に同じ形で当てて組の表で結ぶ。当たった所は `findMatches`（もとの文の中の位置）で切り出す。そろえ方は `packages/contracts/src/person/search.ts` の1か所。
- **ログ**：person はログを書かない。DB のエラーは `repository.ts` の `guardDbErrors` が読みかえる（外部キー → 404・CHECK → 400・ほかは SQLSTATE と制約の名前だけのエラーにし、SQL に渡したメモの値を予期しないエラーのログに出さない）。
- **約束**（`packages/contracts/src/person`）：`search.ts`（そろえ方・当たった位置・`escapeLike`・`SEARCH_VERSION`）・`accounts.ts`（アカウント名から URL・`http`・`https` だけ・LINE ID のリンク）・`heading.ts`（書き足しの見出し。日本時間）・`note.ts`・`meeting.ts`（入出力の形）・`errors.ts`（`PERSON_ERRORS`）。

## 4. 画面

どれも管理の外枠で、account の `SessionGate` で包む。送り直しの ID（`clientRequestId`・`appendId`）は、同じ中身の送り直しだけ同じものを使い、中身を変えたら新しくする（`retry-id.ts`）。直すときの版は直し始めたときの版。どの画面にも「このメモを見られるのはあなただけです。」、入力の欄には知られたくないことを書かない注意を出す。
外枠のナビには、人物メモの画面の中でだけ「人」「会った場」を出す（`nav-items.ts`）。探す言葉とタグは画面の状態だけに持ち、道・search params・sessionStorage に入れない。5秒おきの読み直しは使わない。

| 道 | 画面 |
|---|---|
| `/person` | 人の一覧（名前の横に見た目の特徴）・探す（当たった所に印。遅れて届いた前の答えは捨てる）・タグで絞る（選択肢は新しい500人のタグ）・CSV で書き出す |
| `/person/new` | 人を足す（`clientRequestId` は画面が作り、送り直しでも同じもの） |
| `/person/notes/$noteId` | 人のメモ（話したことと次に話したいことが最初）・書き足す（`appendId`）・直す（409 なら書いた内容を残す）・アカウント（新しいタブ）・会った場を付ける・外す・消す |
| `/person/meetings` | 会った場の一覧・作る |
| `/person/meetings/$meetingId` | そこで会った人を続けて足す・前に足した人を名前で探して付ける（`POST /notes/search`。一覧の500人に限らない）・人の一覧・消す |

## 5. テスト

- 約束：`packages/contracts/src/person/*.test.ts`（字の数え方と上限・そろえ方と当たった位置・アカウントの URL・見出し・入力の形）。
- 表：`apps/api/src/modules/person/schema.test.ts`（CHECK・一意・複合の外部キー・消し方を、表に直に書いて確かめる）。
- 窓口：`apps/api/src/modules/person/routes.test.ts`（14の窓口・送り直し・版・持ち主だけ・探す・会った場・書き出し・退会・アプリが見えないとき）。
- ログ：`apps/api/src/modules/person/logging.test.ts`（決まった言葉を入れてすべての窓口を流し、ログに出ないこと。DB のエラーの読みかえ）。手伝いは `apps/api/test/helpers/person.ts`。
- 画面：`apps/web/src/features/person/*.test.tsx`（一覧・人を足す・人のメモ・会った場）。
- E2E：`e2e/tests/person.spec.ts`（未ログイン・足す・書き足す・探す・会った場で続けて足す。両方の幅で axe・CSP・横のスクロール）。
