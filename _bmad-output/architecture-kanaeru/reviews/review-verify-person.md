# 点検：AD-31（人物メモ）の決めごとは確かめてから書いたか

- 点検した変更：`git diff origin/develop -- _bmad-output/architecture-kanaeru/architecture-kanaeru.md`（ブランチ `docs/core-person-ad`。AD-31 を足し、AD-3・Consistency Conventions・Capability map・Open Questions・Deferred を直したもの）
- 見たコード：`/Users/takumi/Documents/my-repositories/kanaeru-apps/person/` の作業ツリー（2026-11-27 時点）
- 点検の日：2026-11-27

## 結論

今のコードについての主張は、ほぼすべて当たっている。ただし、ログの約束（「人物メモのすべての欄はログに書かない」）には、**今のコードのままでは守れない道が1つある**（下の 1）。外の技術の主張は3つとも裏が取れた。ただし pg_trgm は日本語の1〜2文字の検索で索引が効かないので、Open Questions 12 の逃げ道に書き足しが要る（下の 3）。

## 指摘（重い順）

### 1. 【高】DB の予期しないエラーで、メモの中身がログに出る（今のコード）

- **事実**：
  - `apps/api/src/app.ts:629` の `onError` は、予期しないエラーを `logger.error({ requestId, errorName, stack: error.stack })` と書く。
  - drizzle-orm 0.45.4 の `DrizzleQueryError` は、メッセージを `Failed query: ${query}\nparams: ${params}` で作る（`node_modules/.pnpm/drizzle-orm@0.45.4_…/drizzle-orm/errors.js` の 11〜13行）。V8 の `stack` の1行目は `名前: メッセージ` なので、`stack` に**SQL に渡した値がそのまま入る**。
  - `kernel/errors.ts` の `toAppError` が読みかえるのは `AppError`・`HTTPException`・DB に届かないとき（`isDbUnavailable`）だけ。ほかの DB のエラー（CHECK の違反・長すぎる値・デッドロック・一意の違反を領域が拾い損ねたときなど）は、すべてこの `stack` の道でログに出る。
- **AD-31 への影響**：`person_note` を足す・直す要求で予期しない DB のエラーが起きると、フルネーム・よみ・話したこと・検索のためにそろえた文が Cloud Logging に残る。AD-31 の Prevents（「ログに出ること」）と、Consistency Conventions のログの行は、この道を考えずに書かれている。
- **補足**：この穴は人物メモだけのものではない（困りごとの本文・メールアドレスでも同じ）。今の PR の目的とは別なので、**小さな共通の PR**（例：`onError` で `DrizzleQueryError` のときはメッセージを捨て、`errorName` と `cause.code`〈SQLSTATE〉と制約の名前だけを書く）に分けて、人物メモの表を作る PR より先に入れるのがよい（CLAUDE.md の並行開発 4）。AD-31 か Consistency Conventions のログの行に「DB のエラーは値を落として書く」を足すか、Open Questions に挙げる。
- **二重目の守り**：`kernel/logger.ts` の redact は欄の名前で消す形（`email`・`name`・`password`・`token`・`accessToken`・`refreshToken`・`idToken` の上の段と1段下）。人物メモの新しい欄（よみ・LINE の名前・見た目・話したこと・検索の文など）の名前は入っていない。本文はもともとログに出さない作りなので、これは低い。足すなら同じ共通の PR で足す。

### 2. 【中】「選べる交流会」の関数は「今はない」が正しいが、ほぼ同じものが event の中にある

- **確かめた**：
  - reception の `index.ts` が出すのは `findCheckin`・`getCheckin`・`hasCheckedIn`・`listCheckins`・`listEventAttendees`・`createManualCheckin` だけ。どれも交流会ごとの関数で、「この account がチェックインした交流会の一覧」はない。`repository.ts` の中にも、`findLatestOfAccount`（いちばん新しい1件だけ）のほかに account で引く関数はない。→ 主張は正しい。`checkin_account_id_created_at_idx`（`schema.ts:63`）があるので、足す関数は軽い。
  - event の `index.ts` にも「主催した・受付係をした交流会の一覧」は出ていない（`listPersonalEventIds` は「持ち主で、組織に入れていない交流会」なので別物）。→ 主張は正しい。
- **書き足すとよいこと**：
  - `apps/api/src/modules/event/repository.ts:147` の `listAccessibleEvents(db, accountId, managedOrganizationIds)` が、すでに「持ち主か、受付係か、管理者・編集者の組織に入れた交流会」を返している（交流会の一覧の道 `routes.ts:494` が使う。event-002 research R9）。event の小さな PR は、新しい問い合わせを書くより、これ（か、ID・名前・日時だけを返す薄い包み）を `index.ts` から出す形にすると、判定が1か所のままになる。
  - この関数は suite から「管理者・編集者の組織」を受け取る。AD-31 の Binds に「suite（読むだけ）」があるのは、これと合っている。
  - 「主催した」は、この関数の意味では「組織の管理者・編集者として見られる交流会」も含む。PRD 人物メモ FR-P8 の「使う人自身がその会に関わったか」と同じ意味でよいか、仕様で決める。
  - チェックインした交流会の名前と日時は、今の `getEventSummary` が1件ずつなので、一覧で使うと N+1 になる。event の関数は ID の並びを受け取る形にする。

### 3. 【中】pg_trgm は部分一致に使えるが、日本語の1〜2文字の検索では索引が効かない

- **確かめた**：pg_trgm の GIN・GiST の索引は `LIKE`・`ILIKE`・`~`・`~*` を支える（PostgreSQL の文書）。→ 主張は正しい。Cloud SQL for PostgreSQL でも使える（14 以降は 1.6）。
- **抜けていること**：
  - pg_trgm は3文字の組（trigram）で索引を作るので、検索の言葉から trigram が取れないと「全部の索引を読む」形に落ちる（PostgreSQL の文書：*A pattern with no extractable trigrams will degenerate to a full-index scan*）。日本語では2文字で探すことが多く（人の名字の多くは2文字）、pg_trgm では索引がほぼ効かない（PostgreSQL のメーリングリスト、Fujii Masao 2012）。
  - 日本語では2文字の組で索引を作る pg_bigm がふつうの選び方。Cloud SQL は pg_bigm に対応し、フラグ `cloudsql.enable_pg_bigm` を `on` にして使う。手元の PostgreSQL（公式の Docker イメージ）には入っていないので、手元の環境を作り直す手間がかかる。
  - そもそも、1人の使う人が数百人までなら、`owner_account_id` の B-tree の索引で持ち主の行に絞ってから読むだけで足りる見込みが高い（trigram の索引は持ち主で絞る前の表全体にかかるので、この形ではあまり効かない）。
- **直し方の案**：Open Questions 12 を「遅ければ、まず `owner_account_id` の索引で足りるかを見る。足りなければ pg_bigm（Cloud SQL はフラグ `cloudsql.enable_pg_bigm`）か pg_trgm。pg_trgm は1〜2文字で効かない」と直す。

### 4. 【低】検索の言葉を URL に載せない決まりは、画面の道にもかかることを書くとよい

- **確かめた**：Cloud Logging の `HttpRequest.request_url` は「要求された URL の scheme・ホスト名・道・**query の部分**」（Google の文書）。Cloud Run の要求のログ（`run.googleapis.com/requests`）はこの標準の `httpRequest` を使う。→ 主張は正しい。Cloud Run の文書そのものは、欄の中身を1つずつは書いていないので、ステージングで一度、要求のログの `requestUrl` を見て確かめるとよい。
- **今のコード**：アプリ自身の要求のログ（`app.ts:530`）は、道の定義の形（`routePath`）だけを書き、実際の URL も query も書かない。だから残るのは Cloud Run の要求のログだけ、という見立ても正しい。
- **書き足すとよいこと**：画面（`/person/…`）も同じ Cloud Run から出している（`app.ts` の `serveWeb`。`infra/` に Load Balancer はない）。画面の道に `?q=田中` のような形で検索の言葉を持つと、読み直しや開き直しのときに Cloud Run の要求のログに残る。AD-31 の文は「URL に載せず」なので含んでいるが、「API の道も画面の道も」と書くと読み違えがない。検索を本文で送るなら POST になるが、今の CSRF の確かめ（Origin を見る形）は画面からの fetch を通すので問題はない。

### 5. 【低】退会：前の手順を持たない形はコードが許している。確かめの画面は `accountData` で出る

- **確かめた**：
  - `kernel/withdrawal.ts` の `WithdrawalStep` では `prepare` と `preview` が要るが、領域が出す `withdrawal` そのものは任意（`app.ts:95` の `withdrawal?: WithdrawalStep`。`orderWithdrawalSteps`〈`app.ts:267〜291`〉は、出していない領域を飛ばす）。今も reception と survey は出していない。→ 「持たない」はできる。
  - `prepare` は account を消すトランザクションの外で、`finalize` だけが中（`kernel/withdrawal.ts` の注）。だから `prepare` で消すと、account の削除が `409` で止まったときにメモだけが消える、という理由は正しい。
  - 退会の確かめの画面（`apps/web/src/features/suite/AccountSettingsPage.tsx:207〜211`）は、登録されたすべてのアプリの `accountData` を並べて「消える記録」を出す。`withdrawal` を出さなくても、`apps.list.ts` の `accountData` に「人物メモ（人と会った場）」と書けば、確かめの画面に出る。
- **書き足すとよいこと**：AD-31 の「アプリと領域」に、`apps.list.ts` の `accountData` に人物メモを書くことを足す（AD-22 の「確かめの画面に消える記録を出す」を満たす道がこれだけになるため）。件数まで出したいなら、`prepare` を何もしない形にして `preview` だけを出す（match と同じ形）。

### 6. 【低】ひらがなとカタカナのそろえ方を自前で書くときの端の文字

- **確かめた**：NFKC は半角のカタカナを全角のカタカナにし、全角の英数字を半角にするが、ひらがなとカタカナは入れかえない。大文字と小文字もそろえない（UAX #15。手元の Node で `"あいう"`・`"アイウ"` はそのまま、`"ｱｲｳ"` → `"アイウ"`、`"ｶﾞ"` → `"ガ"`、`"ＡＢＣ"` → `"ABC"`〈大文字のまま〉を確かめた）。→ 「別にそろえる関数が要る」「大文字と小文字は別」は正しい。今の `packages/contracts/src/threads/normalize.ts` も「ひらがなとカタカナは変えない」と書いてあり、使い回せるものはない。
- **仕様で決めること**：カタカナ → ひらがなを符号の差（0x60）で変えるとき、`ヷ`〜`ヺ`（U+30F7〜30FA）には対になるひらがながない。`ヴ`（U+30F4）は `ゔ`（U+3094）、`ヵ`・`ヶ` は `ゕ`・`ゖ` に対がある。長音の `ー` はそのまま。どちらに寄せるかと、この端の扱いを `packages/contracts/src/person` の関数のテストに書く。DB の `normalize()` と JavaScript の版のずれを避けるため、そろえた文を API で作って保存する形（AD-31 の書き方）は、reception の `listSameNameCandidates` の注と同じ考えで正しい。

## 確かめた主張の一覧

| 主張 | 結果 | 根拠 |
|---|---|---|
| reception の `index.ts` に「使う人がチェックインした交流会の一覧」はない | 正しい | `modules/reception/index.ts`・`repository.ts`（account で引くのは `findLatestOfAccount` の1件だけ） |
| event の `index.ts` に「主催した・受付係をした交流会の一覧」はない | 正しい（ただし中に `listAccessibleEvents` がある。指摘 2） | `modules/event/index.ts`・`repository.ts:147` |
| `listCheckins`・`listEventAttendees` がある | 正しい（reception の `index.ts` から出ている） | `modules/reception/index.ts:13〜19` |
| `listApplicantRoster` がある | 正しい（booking の `index.ts` から出ている。match が使う） | `modules/booking/index.ts:19`・`modules/match/routes-reception.ts:19` |
| `packages/csv` がある（式として読まれない守り） | 正しい | `packages/csv/src/index.ts`（`= + - @` タブ CR・全角の ＝ ＋ － ＠ に `'` を足す） |
| `packages/secret-box` がある | 正しい | `packages/secret-box/src/index.ts` |
| `packages/contracts/src/<領域>` の形 | 正しい（`person` はまだない。作る） | `packages/contracts/src/` に account・booking・core・event・match・reception・suite・survey・threads |
| `uses: ["reception"]` の仕組み | 正しい（match が同じ形。`apps.ts` が登録を確かめる） | `packages/contracts/src/core/apps.list.ts:9`・`apps.ts:96〜101` |
| ログは本文を出さず、redact で消す | 正しい。ただし DB のエラーの道で値が出る（指摘 1） | `kernel/logger.ts`・`app.ts:530・629` |
| AD-25 の match は `event_id` を SET NULL で持ち、写しを出す | 正しい（列は SET NULL、名前と日時の写しは中身の `receptionEvent`） | `modules/match/schema.ts:68`・`packages/contracts/src/match/table.ts:371〜379` |
| `event_id` を SET NULL にする必要 | 正しい。AD-7 は「event を指す外部キーは RESTRICT」だが、退会で event が交流会を消す段（`deletePersonalEvents`）があるので、RESTRICT だと持ち主の退会が止まる | `modules/event/withdrawal.ts` |
| `(owner_account_id, event_id)` の一意 | 問題なし（PostgreSQL の一意は既定で NULL どうしをぶつけないので、SET NULL になった行が何件あってもよい） | PostgreSQL の既定の動き |
| 退会の前の手順は領域が出さなくてよい | 正しい（指摘 5） | `app.ts:95・267〜291`・`kernel/withdrawal.ts` |
| 退会の手順は `modules.list` から集める | 正しい（`modules.list.ts` の領域を `orderWithdrawalSteps` が並べる） | `apps/api/src/modules.list.ts`・`app.ts:663` |
| Cloud Run の要求のログに URL が query ごと残る | 正しい（欄の定義で確かめた。Cloud Run の画面で一度見るとよい。指摘 4） | Cloud Logging `HttpRequest.request_url` |
| pg_trgm で部分一致の索引が作れる | 正しい。ただし日本語の1〜2文字では効かない（指摘 3） | PostgreSQL の pg_trgm の文書・メーリングリスト |
| NFKC はひらがなとカタカナを入れかえない | 正しい（指摘 6） | UAX #15・手元の Node で確かめた |

## 出典

- [Cloud Logging — Package google.logging.type（HttpRequest.request_url）](https://docs.cloud.google.com/logging/docs/reference/v2/rpc/google.logging.type)：「The scheme (http, https), the host name, the path and the query portion of the URL that was requested.」
- [Cloud Run — Logging and viewing logs](https://docs.cloud.google.com/run/docs/logging)：要求のログは標準の `httpRequest` を使う（欄の中身は LogEntry の文書を見るように書いてある）
- [PostgreSQL — pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)：GIN・GiST で `LIKE`・`ILIKE`・`~`・`~*`。trigram が取れない言葉は全部の索引を読む形に落ちる
- [pgsql-hackers — Fujii Masao（2012-05-10）](https://www.postgresql.org/message-id/CAHGQGwFDzxn2z3VPMi39pWUf%2BCd3ZF-s7tMyPiiKYvZPftiF5Q%40mail.gmail.com)：日本語の2文字の検索では pg_trgm の索引がほぼ使えない
- [NEC — pg_bigm](https://jpn.nec.com/postgresql/oss_tool/pg_bigm.html)：2文字の組の索引で、2文字の検索にも効く
- [Cloud SQL — Configure PostgreSQL extensions](https://docs.cloud.google.com/sql/docs/postgres/extensions)：pg_trgm（14 以降は 1.6）と pg_bigm（フラグ `cloudsql.enable_pg_bigm`）
- [Unicode — UAX #15 Unicode Normalization Forms](https://unicode.org/reports/tr15/)：NFKC で半角と全角のカタカナは同じ文字列になる（ひらがなとの入れかえはない）
