# 点検：構成の決めごと（AD-31 人物メモ）— チェックリストに沿った点検

- 対象：[architecture-kanaeru.md](../architecture-kanaeru.md) の 2026-11-27 の変更（`git diff origin/develop`）。AD-31 を足し、AD-3（表の持ち主と作る順）・Consistency Conventions（道の頭・ログ）・Capability map・Open Questions 12〜13・Deferred（夜間の停止・メモの暗号）を直したもの
- 照らし合わせたもの：[PRD 人物メモ](../../prd-kanaeru-person/prd-kanaeru-person.md)（おもに 4〜7章）・コード（`apps/api/src/modules/{match,event,reception}/index.ts`・`kernel/logger.ts`・`kernel/withdrawal.ts`・`kernel/internal-auth.ts`・`app.ts`・`modules/account/oauth/routes.ts`・`modules/match/schema.ts`・`modules/match/access.ts`・`packages/contracts/src/core/apps.list.ts`・`eslint.config.js`）
- 見方：チェックリスト（下の位〈person の仕様を書く人・作る人と、reception・event の小さな PR を作る人〉がぶれる所をすべて押さえているか／各 Rule が守らせられて、書いたぶれを本当に止めるか／Deferred に、2つの単位がぶれうるものがないか／いまのコードとほかの AD〈AD-2・3・7・15・16・19・20・21・22・25〉を追認していて食い違わないか／PRD の機能のうち構成の決めが要るものを押さえているか）

## 判定

**直してから確かめに回す（小〜中くらい）**。AD-31 は、PRD 6章が求めた4つ（結び付けの形・会った場の形・ログに書かないもの・表を作る順）をすべて入れ、AD-2・AD-19・AD-22・AD-25 の形をそのまま追認している。退会の前の手順を持たない判断は `kernel/withdrawal.ts` の形（`withdrawal` は任意の書き出し）と、退会の確かめの画面が `apps.list.ts` の `accountData` を出す今のコードに合う。会った場の `event_id` を `SET NULL` にして写しを持つ形は、`match_table.event_id` と同じ。

ただし、次のことが残っている。

1. 「名簿を読まない」は、呼ばない関数を挙げる形（`など`）で、lint でも test でも止まらない。PRD の中心の決め（FR-P8）なのに、守らせる仕組みがない（高）
2. `person_note_meeting` が、持ち主の違うメモと会った場を結べる。AD-7・AD-22 で使っている複合の外部キーの形を使っていない（中）
3. アプリを `apps.list.ts` に足すと、OAuth の `scopes_supported` と同意の画面に `person:read`（「人物メモの記録を読む」）が自動で出る。「MCP を作らない」が文字どおりには守られない（中）
4. 検索の言葉を URL に載せない決まりが API だけで、画面の道（検索の欄の search params）に触れていない。当たった箇所を切り出す場所と、そろえ方を変えたときの作り直しが決まっていない（中）
5. 「選べる交流会」の event 側の意味（主催した＝持ち主だけか、AD-5 の主催者〈組織の管理者・編集者を含む〉か）と、作るときに API が交流会の ID を確かめ直すことが書かれていない（中）

ほかに低い指摘が5つある（AD-7 と Conventions のエラーの行の追認漏れ・二重に足さない形・ステージングの決まりの守らせ方・Open Questions 13 の扱い・アカウントの URL の形の置き場所）。

## 1. PRD 6章が求めたものと、構成の決めが要る機能の押さえ方

| PRD の求め・機能 | 入った先 | 判定 |
|---|---|---|
| AD-15：key `person`・`/person`・`person_`・`uses: ["reception"]` | AD-31「アプリと領域」・Conventions 道の頭 | 入った。予約語ともぶつからない |
| AD-16：最初は `operator_only` | 書いていない | AD-16 の「行がないアプリは `operator_only`」で足りる。問題なし |
| AD-2：人を account と結び付けない | AD-31「記録」 | 入った |
| AD-3・AD-23：reception・event に使う人の交流会の一覧を出す関数 | AD-31「選べる交流会」 | 入った。event 側の意味があいまい（F-5） |
| AD-3：表を作る順（match の後ろ） | AD-3 の順の並び | 入った |
| AD-7・AD-19：account が消えたら CASCADE・交流会が消えたら写しを残す | AD-31「消し方」「会った場」 | 入った。AD-7 本文の「`event` を指す外部キーは `RESTRICT`」を直していない（F-6） |
| AD-22：退会の前の手順を持たない | AD-31「消し方」 | 入った。コードの形（`withdrawal` は任意・確かめの画面は `accountData`）に合う |
| AD-20・AD-21：外の AI と MCP に出さない | AD-31「外に出さない」 | 入った。OAuth の範囲が自動で出る件（F-3） |
| 結び付けの形（人 ↔ 会った場は多対多） | AD-3 の表・AD-31「会った場」 | 入った。持ち主をまたぐ結び付けを止めていない（F-2） |
| 会った場の形（交流会から・手で書く・揺れを防ぐ） | AD-31「会った場」 | 入った |
| ログに書かないもの | Conventions ログ・AD-31「外に出さない」 | 入った。今の要求のログは道の定義の形だけを書き、本文を書かない（`app.ts`）ので、今のコードで守られている |
| FR-P8 名簿を候補に出さない | AD-31「名簿を読まない」 | 入った。守らせる仕組みがない（F-1） |
| FR-P10 検索（ひらがな・カタカナ・全角半角） | AD-31「検索」・Open Questions 12 | 入った。画面の道と、切り出しの場所（F-4） |
| FR-P4 保存のやり直しで二重に足さない | 書いていない | 仕様に任せてよいが、Conventions の主キーとの関係（F-7） |
| FR-P16 アカウントの URL は `http`・`https` だけ | 書いていない | 仕様でよい。置き場所だけ添える（F-10） |
| FR-P17 CSV | AD-31「書き出し」 | 入った。Capability map に `packages/csv` がない（ごく小さい） |
| 夜間の停止・暗号 | Deferred | 入った。person だけに効くので、2つの単位がぶれる余地はない |

## 2. 指摘

### F-1【高】「名簿を読まない」が、挙げた関数を呼ばないという形で、どこでも止まらない

- **いまの Rule**：「person は、交流会の参加者・申込みの名簿を出す関数（reception の `listCheckins`・`listEventAttendees`、booking の `listApplicantRoster` など）を呼ばない」。
- **コード**：`eslint.config.js` の boundaries は「ほかの領域は相手の `index.ts` だけ」を止めるだけで、`index.ts` から何を読むかは問わない。AD-15 の `uses` も `appRegistryProblems`（一覧の中の key があるか）で確かめるだけで、import とは突き合わせていない。booking は受付アプリの領域なので、`uses: ["reception"]` の person は booking の `index.ts` も読める。match は実際に `listEventAttendees` を読んでいる（`routes-reception.ts`）ので、同じ形を写した実装が入っても、lint もレビューの道具も気づかない。
- **なぜ効かないか**：挙げる形（denylist の「など」）は、reception・booking があとから名前を返す関数を足すと、黙って抜け道になる。PRD の中心の決め（FR-P8・規約の下書きの「参加者の情報は運営のためだけ」）と、AD-31 の Prevents の2つ目は、この1行だけで支えられている。
- **直し方**：許す形（allowlist）にし、lint で止める。
  - Rule を「person が reception・event から読んでよいのは、使う人の交流会の ID を返す2つの関数（名前を決める。例：reception の `listCheckedInEventIds`、event の `listRelatedEvents`）と、外部キーのための `eventTable` だけ。booking は読まない」にする。
  - `eslint.config.js` に、`apps/api/src/modules/person/**` から `../reception/index.ts`・`../event/index.ts` を読むときは上の名前だけを許し、`../booking/index.ts` を止める決まり（`no-restricted-imports` の `importNames` か、boundaries の決まり）を足す。共通のファイルなので、person の PR より先に小さな共通の PR で入れる（[並行開発の決まり](../../../docs/rules/parallel-development.md) 3-3。AD-4 の例外と同じ書き方で AD-31 に書く）。
  - reception・event 側の2つの関数は、名前を返さない（ID と、event は交流会の名前・日時の要約だけ）ことを Rule に書く。

### F-2【中】`person_note_meeting` が、持ち主の違うメモと会った場を結べる

- **いまの Rule**：「`person_note_meeting`。組は一意・どちらが消えても CASCADE」と「権限は person の1つの関数で『持ち主か』だけを見る」。
- **問題**：結ぶ操作は2つの記録（メモと会った場）にまたがる。窓口がどちらか片方の持ち主しか確かめない誤りが1つ入ると、A さんのメモに B さんの会った場（手で書いた会の名前と日付）が付き、A さんの画面に B さんの会った場が出る。Prevents の1つ目（ほかの利用者に出ること）を、関数の書き方だけで守っている。
- **コードと AD の前例**：同じ種類の食い違いを、AD-7 は `checkin(event_id, discount_id)` → `event_discount(event_id, id)` の複合の外部キーで、AD-22・AD-23・AD-25 は `organization_member(organization_id, account_id)` を指す複合の外部キーで、DB に止めさせている（`match/schema.ts` の `foreignKey`）。
- **直し方**：`person_note_meeting` に `owner_account_id` を持たせ、`(note_id, owner_account_id)` → `person_note(id, owner_account_id)`、`(meeting_id, owner_account_id)` → `person_meeting(id, owner_account_id)` の複合の外部キー（どちらも CASCADE）にする、と Rule に書く。参照される側に `(id, owner_account_id)` の一意が要ることも添える。

### F-3【中】アプリを足すと、OAuth の範囲 `person:read` が自動で出る

- **コード**：`modules/account/oauth/routes.ts` は `scopes_supported: deps.apps.map((app) => \`${app.key}:read\`)` で、`apps.list.ts` のすべてのアプリの範囲を出し、同意の画面は `「${app.name}の記録を読む」` と `accountData` を出す。MCP の道具を出していないアプリ（threads・match）も、今すでに範囲が出ている。
- **問題**：`person` を一覧に足すと、AI のつなぐ側から見たメタデータと同意の画面に「人物メモの記録を読む」が出て、利用者はそれを許せる。今は person が `mcpTools` を出さないので、許しても読めるものはない。それでも、(a) PRD 5章・AD-31 の「MCP のツールを作らない」と画面の言葉が食い違い、(b) あとで誰かが person に道具を足すと、範囲の仕組みはもう用意されていて、止める所がない。「外に出さない」の Rule は「作らない」と書くだけで、守らせる所がない。
- **直し方**：どちらかを決めて Rule に書く。
  - 範囲を「`mcpTools` を出す領域を持つアプリ」だけから作る形に、共通の PR で直す（threads・match の不要な範囲も消える）。
  - または `defineApp` に「AI に出さない」印（例：`aiAccess: false`）を足し、範囲・同意の画面・MCP の道具の集め方（`app.ts` の `routeDeps.mcpTools`）の3か所がその印を見る。person の `index.ts` が `mcpTools` を出したら組み立ての確かめで落とす（`publicReadPaths` の確かめと同じ形）。

### F-4【中】検索：画面の道が抜けている。切り出しの場所とそろえ方の作り直しが決まっていない

- **画面の道**：Rule は「検索の言葉は URL に載せず、要求の本文で送る（Cloud Run の要求のログに URL ごと残るため）」。これは API の要求だけを言っている。画面の検索の欄を TanStack Router の search params（`/person?q=…`）に入れると、読み直し・共有・ホーム画面からの起動で `index.html` の要求として Cloud Run の要求のログに URL ごと残り、ブラウザの履歴にも残る。PRD 5章の「ログ・URL・エラーの知らせに出さない」の「URL」は画面の道も含むと読める。→「画面の道にも、検索の言葉・タグのほかのメモの欄を載せない」と Rule に足す（タグで絞る FR-P12 を道に載せてよいかも、ここで決める）。
- **当たった箇所の切り出し**（FR-P10）：Prevents の5つ目は「そろえ方が API と画面で食い違い」を挙げるが、そろえ方を `packages/contracts/src/person` に置く理由（画面も使うのか）と、当たった箇所を前後の文と一緒に切り出すのが API か画面かが書かれていない。NFKC は文字数を変えるので、そろえた文の位置からもとの文の位置へは戻せない。API と画面が別々に切り出すと、当たったのに強調されない・違う所を強調する、というぶれが起きる。→「切り出しは API が行い、もとの文の断片を返す（画面はそろえ方を使わない）」か、「画面がもとの文をそろえ直して切り出す」のどちらかに決める。
- **作り直し**：「検索のためにそろえた文」は保存のたびに作るので、そろえ方の関数を直すと、前に保存した行が古いそろえ方のまま残り、当たり方が行ごとに変わる。→「そろえ方を変える PR は、すべての行を作り直す DB の変更（か、作り直しの処理）を同じ PR に入れる」と1行足す。

### F-5【中】「選べる交流会」：event 側の意味と、API の確かめ直しが決まっていない

- **意味**：Rule は「event の `index.ts`（使う人が主催した・受付係をした交流会の ID の一覧と、名前と日時の要約）」。AD-5 の「主催者」は持ち主と、入れた組織の管理者・編集者で、今の `getEventRole` もその形。一方、PRD 3章の「主催した会」は持ち主のことにも読める。event の小さな PR を作る人と、person の仕様を書く人が別々に決めると食い違う。部員（組織のメンバー）が入らないことも、明示がない。→「AD-5 の主催者か受付係（今の役割で引く。前の役割の履歴は持たない）」か「持ち主か受付係」のどちらかに決め、関数の名前と返す形（ID・名前・日時だけ）まで書く。reception 側の関数（チェックインした交流会の ID）と、名前・日時をどこから引くか（event の同じ関数に ID を渡すのか、`getEventSummary` を1件ずつか）も1つに決める。
- **確かめ直し**：画面に出す候補を絞るだけでは、窓口に別の `event_id` を送れば、関わっていない交流会の名前と日時の写しを作れる（要約はログインした誰でも読めるので害は小さいが、Rule の「選べる交流会」が画面だけの決まりになる）。→「会った場を交流会から作る窓口は、送られた `event_id` が同じ一覧にあるかを確かめ、なければ `404`」と書く。

### F-6【低】AD-7 本文と Conventions のエラーの行を追認していない

- AD-7 は「`event` を指す外部キーは `RESTRICT`」と、booking の CASCADE の例外だけを書く。`match_table.event_id` は既に `ON DELETE SET NULL`（コード）で、AD-25 も「消えたら null」と書くが、AD-7 は直っていない。AD-31 で2つ目の `SET NULL` が増える。→ AD-7 に「ほかのアプリの記録が交流会を任意に指すとき（match・person）は `SET NULL` で、名前と日付の写しを持つ」を足す。
- Conventions のエラーの行は「権限なしは `403`」。AD-31 は「ほかの人の記録の道は `404`」（PRD 5章どおり）。AD-16 の「見えないアプリは `404`」のように、エラーの行に「person の他人の記録は `404`（AD-31）」を足す。

### F-7【低】保存のやり直しで二重に足さない形（FR-P4）が、Conventions とぶつかりうる

- 電波が切れたときと夜間の停止のときにもう一度押して、同じ人が二重に足されない（FR-P4【仮決め】）。形は person の中だけのことなので仕様に任せてよいが、仕様が「画面が ID を作って送る」を選ぶと、Conventions の「主キーは `uuidv7()`」と食い違う。→「二重に足さない形は仕様で決める。主キーは DB が作るままにし、画面が作る使い切りの印を持ち主ごとに一意で持つ（AD-28 の変更の ID と同じ考え）」のように、Conventions の中で決めることだけ書く。

### F-8【低】「本物のメモをステージングに入れない」を守らせる所がない

- ステージングは同じ LINE のプロバイダーでログインでき、持ち主は運営者なので `operator_only` のアプリも見える。手で気をつけるしかない決まりになっている。→ ステージングの DB では person の `app_setting` を `off` にする（suite の DB の変更か、ステージングの手順）と書くか、決まりとしては [docs/rules/](../../../docs/rules/) 側に移す。

### F-9【低】Open Questions 13 は「仕様で決める」では足りない

- LIFF を始めない道にするなら、組み立て（`apps/web/src/main.tsx`・`lib/liff.ts`）の例外の並びに `/person/…` を足すことになり、AD-4 の例外の本文を直し、person の PR より先に小さな共通の PR を入れる要がある（AD-4 自身がそう書いている）。→「仕様で決め、始めない道にするなら AD-4 を直して共通の PR を先に入れる」と書く。

### F-10【低】アカウントの URL の形の置き場所

- FR-P16 の「そのほかの URL は `http`・`https` だけ」は、`javascript:` などで画面から動くものを防ぐ守り。AD-18 の「守りに関わる処理は写さず先に移す」の考えで、zod の形を `packages/contracts/src/person` に置き、API の保存と画面のリンクの両方がそれを通す、と1行あると、API と画面で確かめ方がぶれない。仕様で決めても足りるので、低い。

## 3. Deferred の点検

| 項目 | 2つの単位がぶれうるか |
|---|---|
| 夜間の停止（人物メモはこのまま。一般に公開する前に見直す） | ぶれない。person だけの使い勝手 |
| 人物メモの中身の暗号（サーバーの鍵か端末の鍵か。検索の形も見直す） | ぶれない。person の中だけ。ただし暗号を入れるときは F-4 の「そろえた文」も平文で残っているので、同じ時に作り直すことを、このまま書いておけばよい |

Deferred に、ほかの単位とぶれうるものはない。

## 4. ほかの AD・コードとの食い違い

| AD | 判定 |
|---|---|
| AD-2 | 合う（相手の account を持たない） |
| AD-3 | 合う（順の並び・`eventTable` は外部キーだけ）。F-1 で読む関数を絞ると、なおよい |
| AD-7 | 本文の追認漏れ（F-6） |
| AD-15 | 合う。`uses` は import と突き合わせていないので、F-1 の lint が要る |
| AD-16 | 合う（行がなければ `operator_only`・`requireApp` は組み立てが自動で付ける） |
| AD-19 | 合う（最上位の記録に持ち主・権限は1つの関数）。404 は Conventions に足す（F-6） |
| AD-20 | 合う（AD-20 は人物メモを名指しで止めている） |
| AD-21 | 範囲が自動で出る（F-3） |
| AD-22 | 合う（退会の前の手順を持たない。`kernel/withdrawal.ts` の形と、確かめの画面の `accountData` に合う） |
| AD-25 | 合う（交流会の任意の結び付けと写しは試合表と同じ） |
| `kernel/logger.ts` | 合う。redact は `name` などの決まった鍵だけだが、要求のログは本文を書かず道の定義の形だけ（`app.ts`）、予期しないエラーも名前とスタックだけなので、Conventions のログの決まりは今の作りで守られる。person の欄の鍵（`fullName` など）を redact に足すかは任意（二重目の守り） |
