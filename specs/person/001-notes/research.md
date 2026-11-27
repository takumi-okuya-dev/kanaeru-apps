# Research: 人物メモの最初の版（person-001）

持ち主が外出中のため、PRD 人物メモと構成の決めごと AD-31、今のコード（試合表 match-001・002 の作り）から AI が決めた。【仮決め】は持ち主の確かめを待つ。

## R1. PR の切り方

- **Decision**：仕様は1つ。PR は2つに分ける。
  - pr1 `feature/person-001-pr1-tables`：表3つ（`0025_person.sql`）・アプリの登録・仮の画面・約束の欄の上限と選択肢・`docs/apps/person.md`。
  - pr2 `feature/person-001-pr2-notes`：窓口・画面・検索・書き出し。
- **Rationale**：DB の変更のある PR は小さく切って先に入れる（並行開発の決まり 4章・AD-17）。試合表の match-001・002 と同じ切り方。
- **Alternatives**：仕様を表と窓口で2つに分ける形。決めごとが1つの機能にまたがるので、1つの仕様の中で PR を分けた。

## R2. 先に入れる共通の PR との順番

- **Decision**：
  1. `fix/core-unexpected-error-log`：予期しないエラーのログに SQL の値を出さない。pr1 の前に入れる。
  2. `core-NNN` の OAuth の範囲：範囲を MCP のツールを出すアプリだけから作る。pr1 の前に入れる。pr1 で `apps.list.ts` に `person` を足すと、すぐ範囲に出るため。
  3. lint の import の許す一覧：pr2 の前に入れる。
- **Rationale**：AD-31 の「外に出さない」。どれも共通のファイルなので、領域の PR に混ぜない（並行開発の決まり 3-3）。
- **Alternatives**：pr1 に混ぜる形は、決まりに反するので取らない。

## R3. 会った場の表は、交流会の列を先に持つ

- **Decision**：`person_meeting` に `source`（`manual`・`event`）と `event_id`（`ON DELETE SET NULL`）を、pr1 で先に持つ。この版で作るのは `manual` だけ。【仮決め】
- **Rationale**：AD-31 の一意の索引2つと CHECK を、最初の DB の変更で決めておく。そうすれば、交流会を選ぶ次の仕様で DB の変更が要らない（DB の変更は同時に1本だけで、待ちが生じやすい）。
- **Alternatives**：次の仕様で列を足す形。原則 IV には近いが、DB の変更がもう1本増える。

## R4. 相手のアカウントは、決まった列で持つ

- **Decision**：`account_x`・`account_connpass`・`account_github`・`account_linkedin`・`account_line`・`account_url` の6つの text の列（どれも任意・200字まで）。X・connpass・GitHub・LinkedIn はアカウント名だけを持ち、URL の組み立ては contracts の1つの関数で行う。`account_url` は `http`・`https` だけ。【仮決め】
- **Rationale**：PRD 3章のアカウントが決まっている。CHECK と CSV の列が素直に書ける。URL を組み立てる所と確かめる所を1か所にする（AD-31）。
- **Alternatives**：jsonb に持つ形。種類を足すときに DB の変更が要らない反面、CHECK と CSV が複雑になる。

## R5. LINE ID から開くリンク

- **Decision**：`https://line.me/R/ti/p/~{LINE ID}` を開く（LINE の「ID で友だちを探す」の形）【仮決め・要確認】。相手が「ID による友だち追加」を切っていると開けないので、画面に「相手が ID で見つけられる設定のときだけ開けます」と添える。
- **Rationale**：個人のトークを直接開く公式のリンクはない（PRD 10章）。
- **Alternatives**：LINE の名前で検索する画面を開く形。公式の手段がない。
- **確かめ**：pr2 の手での確かめで、実機で開けるかを見る（quickstart）。開けなければ、ID を写すボタンに替える。

## R6. 検索

- **Decision**：
  - **そろえ方**：`packages/contracts/src/person/search.ts` の `normalizeForSearch`（NFKC → カタカナをひらがなに → 小文字）と、`findMatches(original, query)` に置く。`findMatches` は、もとの文の中の当たった位置を返す。もとの文を1文字ずつそろえながら位置の対応表を作り、そろえた文で探して、もとの位置に戻す。
  - **保存**：API は保存のたびに `search_text` を作って持つ。中身は、フルネーム・よみ・LINE の名前・見た目の特徴・話したこと・次に話したいこと・タグ を改行でつないでそろえた文。あわせて `search_version`（今は 1）を持つ。
  - **探し方**：`POST /api/v1/person/notes/search`。持ち主の行だけを対象にする。
    - `search_text LIKE '%' || 逃がした言葉 || '%' ESCAPE '\'` で探す。
    - 会った場の名前は、`person_meeting.name_key` に同じ形で当て、組の表で結ぶ。
  - **結果**：人ごとに、当たった欄の名前と前後の文（前後20字ほど）と、当たった位置を返す。前後の文は API が `findMatches` で作り、画面はもう一度探さない。
  - **並びと数**：`updated_at` の新しい順に、最大100人。超えたら `truncated: true`。`query` と `tag` を両方送ると、両方に当たる人だけ（AND）。【仮決め】
  - **会った場の名前のそろえ方**：前後の空白を除き、間の空白の続きを1つにしてから `normalizeForSearch` を通す（`normalizeMeetingName`。`search.ts`）。`name_key` はこれで作る。
- **Rationale**：AD-31。NFKC は文字の数を変えるので、そろえた文の位置でもとの文を切らない。数百行なら、`owner_account_id` の索引で足りる見込み（Open Questions 12）。
- **Alternatives**：
  - 画面に全部を持ってきて画面で探す形。AD-31 の「画面はもう一度探さない」と、一覧の重さに合わない。
  - pg_bigm。数が増えてから比べる。

## R7. 二重の送りと同時の編集

- **Decision**：
  - **人を足す**：画面が作る `clientRequestId`（uuid）を送る。`(owner_account_id, create_request_id)` の部分の一意で、同じ ID の送り直しには前に作った人を返す。
  - **書き足す**：`appendId`（uuid）を送る。行に `last_append_id` を持ち、同じなら書かずに今の値を返す（試合表の `last_change_id` と同じ）。
    - **分かっている限り**：比べるのは最後の1つの ID だけなので、送り直しの間にほかの端末の書き足しが入ると、送り直しが新しい書き足しに見えて二重になる。最初は使う人が1人で1台のことが多いので、このままにする。困ったら、最近の書き足しの ID をいくつか持つ小さな DB の変更で直す（person-001 pr2 のセルフレビュー）。
  - **書き直し**：`baseVersion` を送る。違えば `409 PERSON_VERSION_CONFLICT`。書けたら `version+1`。書き足しも `version+1` にする。
- **Rationale**：PRD FR-P4・AD-31。試合表（routes.ts の版と変更の ID）と同じ形。AD-31 の「画面が作る `clientRequestId`」は、書き足しの窓口では `appendId` という名前にする（人を足す窓口は `clientRequestId`）。
- **Alternatives**：書き足しも `baseVersion` で止める形。書き足しは前の文を消さないので、版が違っても足してよい。止めると、帰り道の電波の悪い所で押し直したときに 409 が増える。

## R8. 書き足しの見出し

- **Decision**：見出しは `── 2026-12-03 ──` の形の1行。会った場を選んだときは `── 2026-12-03 12月の勉強会（2026-12-03）──`。日付は書き足した日（日本時間。`packages/contracts/src/core` の日本時間の日付の関数）。話したことが空なら、見出しから始める。【仮決め。持ち主の確かめを待つ】
- **Rationale**：PRD FR-P3。日付は API が決める（画面の時計に頼らない）。

## R9. 一覧の並びと「最後に保存した時刻」

- **Decision**：`person_note.updated_at` の新しい順。書き足し・書き直し・会った場を付けた・外したときに、`updated_at` が新しくなる（会った場を付けた・外したときは、人の行も更新する）。一覧は1回に最大500人を返し、それより多いときは「新しい500人だけを出しています。探すと全員から探せます」と出す。【仮決め】
- **Rationale**：最初の版は持ち主1人で、数百人までの見込み。ページ送りは、要るようになってから足す。

## R10. 欄の長さとタグ

- **Decision**：
  - **欄の長さ**：フルネーム 1〜100字、よみ・LINE の名前 100字、見た目の特徴 200字、アカウント 各200字、話したこと 20,000字、次に話したいこと 2,000字。
  - **タグ**：数の上限は置かない（PRD FR-P2「1人にいくつでも」。持ち主が決めた）。1つ30字まで。同じタグかどうかはそろえた形で比べ、そろえて同じものは1つにまとめる（最初に入れた書き方を残す）。DB には、書いた形の `tags` と、そろえた形の `tag_keys` の2つを持つ。【仮決め】
  - **字の数え方**：コードポイントで数える（絵文字も1字。DB の `char_length` と同じ）。約束の zod も `[...s].length` で数え、`limits.ts` に1つの関数で置く。
  - **書き足しの長さ**：書き足したあとの話したこと（見出しを含む）が 20,000字を超えるなら、書かずに `400`（`fields.talk`）を返す。
  - **会った場**：名前は1〜100字で、日付は要る。
- **Rationale**：DB の CHECK と約束の zod の両方で止める（試合表と同じ）。

## R11. 退会

- **Decision**：person の `index.ts` は `withdrawal` を出さない。持ち主の外部キーの CASCADE で、account と一緒に消える。退会の確かめの画面には、`apps.list.ts` の `accountData`「人物メモ（会った人・会った場）」が出る。
- **Rationale**：AD-31。app.ts の `DomainModule` は `withdrawal` を省ける（今の reception・survey も出していない）。

## R12. 画面の道と LIFF

- **Decision**：画面の道は、`/person`（一覧と検索）・`/person/new`・`/person/notes/$noteId`・`/person/meetings`・`/person/meetings/$meetingId`。
  - 会った場を選んで続けて足すときは、`/person/meetings/$meetingId` の画面の中で続けて足す。ID は URL に載せてよい（メモの中身ではない）。
  - 検索の言葉とタグは、画面の状態だけに持ち、`validateSearch` を使わない。
  - LIFF の扱いは、ほかのアプリの画面と同じ既定のままにする（試合表のような共通の PR は出さない。Open Questions 13）。【仮決め】
- **Rationale**：AD-31（メモの値を URL に載せない）。LIFF を始めない道にするかは、使ってみてから決める。

## R13. 書き出し

- **Decision**：`GET /api/v1/person/export` が、持ち主のメモを CSV で返す。`packages/csv` の `buildCsv` を使い、ファイル名は `csvAttachment("person-notes")` が作る `person-notes-<日本時間の日付>.csv`。
  - 列は、フルネーム・よみ・LINE の名前・見た目の特徴・X・connpass・GitHub・LinkedIn・LINE ID・URL・タグ（「、」でつなぐ）・話したこと・次に話したいこと・会った場（「名前（日付）」を「、」でつなぐ）・最後に保存した日時。
  - 画面は `fetchDownload` と `saveFile` で落とす。
- **Rationale**：PRD FR-P17・Consistency Conventions の書き出し。

## R14. ログ

- **Decision**：person の処理は、logger にメモの値を渡さない（ID と件数だけ）。起こりうる DB のエラーは `AppError` に読みかえる（一意 → 既存を返す・外部キー → 404・版 → 409）。予期しないエラーのログは、R2 の1の共通の PR が直す。テストでは、決まった言葉を入れて窓口を流し、ログの出力にその言葉がないことを見る。
- **Rationale**：AD-31・Consistency Conventions のログ。
