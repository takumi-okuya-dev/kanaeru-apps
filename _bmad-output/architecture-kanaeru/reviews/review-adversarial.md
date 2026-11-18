# 敵対的レビュー — 構成の決めごと（kanaeru）

作成：2026-11-19
対象：[architecture-kanaeru.md](../architecture-kanaeru.md)（AD-1〜AD-11・約束の表）
見方：「1つ下の単位（account・event・reception・survey・infra/deploy）を、別々のセッションで spec-kit から作る。どちらも AD を字句どおり守るのに、つなぐと合わない」組を探す。見つけた組ごとに、ぶつかる2つのふるまい・重さ・塞ぐ AD を書く。
照らした文書：[PRD](../../prd-kanaeru-reception/prd-kanaeru-reception.md)・[docs/architecture.md](../../../docs/architecture.md)・`docs/rules/coding.md` 6章・`docs/rules/parallel-development.md`・いまのコード（`apps/api/src/kernel/http.ts` の `DomainRouteDeps`・`platform/health`・`platform/rate-limit`・`apps/web/vite.config.ts` の CSP）。

## 結論

**条件つきで可**。領域の切り方・表の持ち主（AD-3）・依存の向きは筋がよい。ただし「領域と領域の継ぎ目」に決めていないことが多く、並行して作ると少なくとも7か所で、つないだときに直しが要る。とくに **今の骨組みの `deps` は `db`・`logger`・`features` だけ**で、「今の利用者は誰か」を領域が受け取る道がない（穴1）。これと、画面の LIFF の始め方（穴7）・本番で画面を返す所（穴11）は、どの領域も最初に踏むので、**並行に入る前に共通の PR と AD の追記で塞ぐ**。

| 重さ | 数 | 意味 |
|---|---|---|
| 高 | 7 | 並行に作ると、つないだときに作り直し、またはデータが消える・当日に受付が止まる |
| 中 | 10 | つなぐときに手直しが要る。または当日の一部が動かない |
| 低 | 4 | 揃えておくと楽。後で直しても安い |

6日の締め切りに合わせて、塞ぎ方はどれも「1行〜数行の AD の追記」か「最初の共通の PR」にとどめた。末尾に、足す AD の案をまとめる。

---

## 高

### 穴1 — 「今の利用者」を領域がどう受け取るかが決まっていない

- **account を作るセッション**：AD-4 どおり `session` の表とクッキーを出す。セッションを読む関数は自分の中に置き、`index.ts` からは `findAccountById` くらいしか出さない（AD はそれ以上を求めていない）。ログインのときに、主催者の印と受付係の交流会の一覧をセッションの行に写しておく（毎回引かなくてよいので速い）。
- **event・reception・survey を作るセッション**：骨組みの `routes(deps)` には `db`・`logger`・`features` しか来ない（`DomainRouteDeps`）。仕方なく、それぞれが自分でクッキーを読み、`session` の表を引く（AD-3 違反だが、ほかに道がない）か、それぞれ別の形の middleware を書く。未ログインを reception は `401 UNAUTHORIZED`、survey は `403` で返す。
- **つなぐと**：同じクッキーの読み方が3〜4通りでき、セッションの表を account 以外が読む。account が写した役割を使う領域と、event の関数を引く領域が混ざり、**外された受付係が30日間使える**（FR-21「次に画面を開いたときから使えない」に反する）。未ログインの code がばらばらで、画面の「LINE ログインへ戻す」処理が1つにできない。
- **塞ぎ方（AD-12 を足す）**：account の `index.ts` が `requireSession`（Hono の middleware）と `currentAccount(c)`（型つきで account の id を返す）を出し、ほかの領域は自分の道の前にこれを付けるだけにする。セッションの行が持つのは `account_id` と期限だけ。主催者か・受付係かは、要求のたびに AD-5 の event の関数で引く（写さない）。未ログインは `401`・code `UNAUTHENTICATED`（約束の表のエラーの行に足す）。

### 穴2 — AD-7 の「account を指す外部キーはすべて CASCADE」で、受付係を消すと、その人が手で入れたチェックインが消える

- **reception**：AD-3 の `checkin` の「入れた人」を `account.id` への外部キーにする。AD-7 は「account を参照する外部キーは `ON DELETE CASCADE`」なので、字句どおり CASCADE にする。
- **account**：FR-16 で、受付係を手伝った人が「消してほしい」と頼めば account を消す。
- **つなぐと**：その受付係が手で入れた**ほかの参加者のチェックイン（と、その回答）がまとめて消え、合計が変わる**。清算のあとなら気づけない。
- **塞ぎ方（AD-7 を直す）**：「本人のデータ」を指す外部キーだけ CASCADE（`session.account_id`・`event_staff.account_id`・`checkin.account_id`）。「誰がしたか」の記録（`checkin` の入れた人、ほかの領域で足す同じ種類の列）は `ON DELETE SET NULL`。`event` を指す外部キーは `RESTRICT`（この版は交流会を消す機能を作らない、と書く）。

### 穴3 — 回答（`survey_answer`）が「何」にひもづくかが2通りに読める

- **survey**：PRD の「回答はアカウントにひもづく」と AD-7 の「account を消せば `survey_answer` が消える」を読み、`survey_answer` に `account_id`（CASCADE）と `event_id` を持たせ、`(event_id, account_id)` を一意にする。
- **reception**：AD-7 の後半と表のつながりの図（`checkin ||--o| survey_answer`）を読み、「手でのチェックインを消すと回答も消える」ために、回答は `checkin_id` を持つ前提で取り消しを作る。
- **つなぐと**：手でのチェックイン（`account_id` が空）の人の回答（FR-10【決定A9】）が入らない、または一意の制約が効かず二重になる。チェックインを取り消しても回答が残り、困りごとの一覧に出る。
- **塞ぎ方（AD-7 と AD-3 の表を直す）**：`survey_answer` の鍵は `checkin_id`（NOT NULL・一意・`ON DELETE CASCADE`）だけ。`account_id` は持たない（account を消すと `checkin` 経由で消える）。一覧のために `event_id` を写して持ってよいが、入れるときに reception の関数で引いた値を使い、あとで変えない。参加者が自分で答えるときは「セッションの account → reception の `findCheckin(eventId, accountId)` → `checkin_id`」、主催者が代わりに入れるときは画面が `checkin_id` を送り、survey が reception の関数でその交流会のチェックインかを確かめる。

### 穴4 — 「取り消し」が、行を消すのか印を付けるのかが決まっていない

- **reception**：FR-7 の「誰が入れたか」を残したいので、取り消しは `canceled_at` を付ける（論理削除）。合計と一覧は `canceled_at is null` で絞る。一意の制約は `(event_id, account_id)` のまま。
- **survey**：AD-7 の「チェックインを消すと回答も消える」を信じ、困りごとの一覧は `survey_answer` をそのまま出す。
- **つなぐと**：取り消した人の困りごとが一覧と CSV に出る。取り消したあと、本人が受付QRを読み直すと一意の制約でチェックインできない。FR-16 の「手でのチェックインの人のデータを消す」窓口が別に要り、二重になる。
- **塞ぎ方（AD-7 に1文足す）**：この版の「取り消し」は行を消す（`DELETE`）。論理削除はしない。回答は CASCADE で一緒に消える。受付係も取り消せる（FR-3）ので、取り消しの確かめの枠に「アンケートの回答があれば一緒に消えます」と常に出す（reception は回答の有無を知れない。依存の向きのため）。FR-5 の重なりをまとめるときは **LINE のほうを残し、手のほうを消す** と運用で決める。

### 穴5 — 参加者の画面が、交流会の名前・アンケートの開閉・GoogleフォームのURLを読めない

- **event**：AD-5 どおり、交流会の窓口はすべて「主催者か・受付係か」を確かめ、どちらでもなければ `403`。
- **reception（チェックインの画面）**：FR-4「交流会の名前が表示される」・FR-9「開いている間だけ『アンケートに答える』が出る」ために、`GET /api/v1/events/{id}` を呼ぶ → 参加者なので `403`。
- **survey（アンケートの画面）**：開閉と FR-10 の Googleフォームのボタンに、同じ窓口を呼ぶ → `403`。それぞれが仕方なく、自分の窓口の応答に交流会の情報を混ぜ始める（event の表を読むなら AD-3 違反）。
- **塞ぎ方（AD-5 に足す）**：event は、ログインしていれば誰でも読める「参加者向けの交流会の要約」を1つ出す（窓口 `GET /api/v1/events/{id}/summary` と、`index.ts` の `getEventSummary(db, id)`）。中身は 名前・日時・会場・参加費・アンケートが開いているか・GoogleフォームのURL だけ。ほかの交流会の窓口は AD-5 のまま。

### 穴6 — 主催者の印を、誰が・どうやって付けるかが決まっていない

- **account**：AD-3 どおり `account` に主催者の印の列を作る。付ける画面は PRD にないので作らない（「DB で直接立てる」と思っている）。
- **infra/deploy**：AD-11 は「手元から本番の DB を直接直すこと」を防ぐ。Cloud SQL に外から入る道（公開IP・プロキシ）も Terraform に作らない。
- **つなぐと**：本番に主催者が1人もいない。交流会を作れず、当日の朝に止まる。
- **塞ぎ方（AD-5 に足す）**：主催者は設定 `ORGANIZER_LINE_USER_ID`（LINE Developers の画面に出る自分のユーザーID。秘密ではないので Cloud Run の環境変数として Terraform で渡す）で決める。account はログインのたびに `sub` と比べて印を合わせる（または印を列に持たず、要求のたびに比べる）。`kernel/config.ts` にこの値と `LINE_CHANNEL_ID` を足す共通の PR を最初に出す（`deps` に設定は来ないため）。

### 穴7 — 画面で LIFF を誰が始めるか・LIFF ID をどこで渡すかが決まっていない

- **reception（チェックインの画面）・survey（アンケートの画面）・event（招待のリンクの画面）**：どれも「LINE ログインして IDトークンを送る」が要るので、それぞれの領域の画面が `liff.init()` を呼び、ログインを済ませてから `POST /auth/line` を送る。
- **infra/deploy**：AD-8・約束の表「環境の違いは環境変数だけ」どおり、LIFF ID を Cloud Run の環境変数に入れる。
- **つなぐと**：`liff.init()` が画面によって二重に走る。QR の URL（`liff.state`）からの戻り先を、それぞれのルーターが別々に読む。Vite は組み立てのときに値を埋めるので、**Cloud Run の環境変数の LIFF ID は画面に届かない**。さらに本番の CSP（`connect-src 'self'`）が LINE への通信を止める（穴11）。
- **塞ぎ方（AD-4 に足す）**：`liff.init()`・`liff.state` の扱い・IDトークンを送ってセッションを作る処理は、画面の共通（`apps/web/src/lib/liff.ts`）に1つだけ置き、組み立てがルーターより先に呼ぶ（共通の PR を最初に出す）。領域の画面は、account の `index.ts` が出す `useSession()` で「ログイン済みか・今の account」を読むだけ。LIFF ID は公開してよい値なので、組み立てのとき（`VITE_LIFF_ID`。GitHub Actions の変数から `docker build` の引数で渡す）に埋める、と約束の表の「設定」に例外として書く。

---

## 中

### 穴8 — ほかの領域の表への外部キーが、境界の規則と DB の変更の順番にぶつかる

- **survey**：`survey_answer.checkin_id` の外部キーのために、`survey/schema.ts` で reception の `schema.ts` を直に読む → lint の境界の規則（`index.ts` からだけ）で止まる。止まらない形にしようと、reception に `index.ts` から表を出してもらい、ついでにその表で SQL を書いて名前を引く（AD-3 違反）。
- **reception と survey を同時に作ると**：survey の作業場所で `pnpm db:generate` を走らせた時点で `checkin` がまだ develop にないと、survey の DB の変更に `checkin` の CREATE TABLE まで入る。あとから reception の変更が入ると二重になる。
- **塞ぎ方（AD-3 に足す）**：外部キーのためだけに、持ち主の `index.ts` から表を出してよい（`.references()` にだけ使い、読み書きに使わない。レビューで見る）。表を作る PR は **account → event → reception → survey の順に develop へ入れ**、上の領域の表が develop に入るまで、下の領域は `db:generate` しない（並行開発の決まり4章の「DB の変更は先に」を、順番まで決める）。

### 穴9 — QR と招待のリンクの URL の形を、誰が持つかが決まっていない

- **event**：FR-2 で受付QR・アンケートQRを作る。中身の URL は、reception と survey の画面の道で決まるが、event は reception・survey より下の層なので、その道を読めない（依存の向きに逆らう）。仕方なく `/checkin/{id}` と自分で決める。
- **reception・survey**：自分の道を `/events/{eventId}/checkin`・`/survey/{eventId}` と決める。
- **つなぐと**：QRを読んでも画面が開かない。LIFF の URL（`https://miniapp.line.me/{LIFF ID}/…`）の組み立て方も、event と account（招待）で別になる。
- **塞ぎ方（約束の表に1行足す）**：参加者が外から開く道は `packages/contracts/src/core` に定数で1か所に持つ（例：`/e/{eventId}/checkin`・`/e/{eventId}/survey`・`/invite/{token}`）。LIFF の URL を作る関数も同じ所に1つ。reception・survey の画面はこの道で `createRoute` し、event はこの関数で QR を作る。

### 穴10 — 受付係の招待を受けるとき、account と event のどちらが何をするかが決まっていない

- **account**：招待のリンクから来た人のために、`POST /auth/line` の本文に `inviteToken` を足し、ログインと一緒に受付係にしようとする → event の関数を呼ぶ必要があり、account → event の向きは図にない（逆向き）。
- **event**：「account がログインのときに招待を受けてくれる」と思い、受ける窓口を作らない。
- **つなぐと**：どちらも作らない、または依存の輪ができる。
- **塞ぎ方（AD-4・AD-5 に足す）**：`POST /auth/line` はログインだけをする（用事を載せない）。招待を受けるのは event の窓口 `POST /api/v1/staff-invites/{token}/accept`（`requireSession` つき）で、`event_staff` を作る。招待のリンクは交流会ごとに1本・何人でも使える・作り直すと前のリンクは使えない。期限は「交流会の日時の、日本時間の日付が終わるまで」で、**受けるときに交流会の今の日時から計算する**（招待を作った後に日時を直しても合う）。

### 穴11 — 本番で画面を返す所と、画面の CSP を誰が作るかが決まっていない

- **infra/deploy**：AD-8 の「1つのコンテナが画面と `/api` を返す」を、Dockerfile とデプロイの設定で済ませようとする。API の側には触らない（組み立ては直さない決まり）。
- **骨組み（共通）**：守りの見出しはすべての応答に付き、API の CSP は `default-src 'none'`。画面の CSP（`connect-src 'self'` など）は `vite.config.ts` にあり、手元でしか効かない。
- **つなぐと**：API が `index.html` を返しても、API の CSP で画面が真っ白になる。または誰も静的ファイルを返さない。返せても `connect-src 'self'` が LIFF の LINE への通信を止める。
- **塞ぎ方（AD-8 に足す）**：画面のファイルを返すこと・`/api` 以外を `index.html` に戻すこと・画面の CSP（LIFF が要る LINE の源を足す。どの源かは LIFF の文書で確かめる）は、組み立て（`app.ts`）を直す**共通の PR**で、infra の仕様の最初に入れる。`/api` の下だけ API の CSP、ほかは画面の CSP。

### 穴12 — 「動いているか」の窓口が DB を叩く、と AD-10 がぶつかる

- **骨組み（共通）**：`GET /api/v1/health` は `select 1` を走らせ、DB が止まっていれば `503`・code `UNAVAILABLE`。
- **infra/deploy**：Cloud Run の起動と生存の確かめ（probe）に、この窓口を指定する（「ふつうはそうする」）。
- **つなぐと**：夜間（0時〜8時）に新しい台が起動できず、**画面そのものが開かない**（AD-10「止まっていても画面は壊れない」に反する）。code も AD-10 の `DB_UNAVAILABLE` と違う。
- **塞ぎ方（AD-10 に足す）**：Cloud Run の probe は既定（TCP）のまま、DB に触る窓口を指定しない。DB に届かないときの `503 DB_UNAVAILABLE` への読みかえは、領域ごとに書かず、土台のエラーの処理（`kernel`）に1か所で置く（共通の PR）。health の code も `DB_UNAVAILABLE` に揃える。

### 穴13 — 日時の受け渡しと「当日」の計算の仕方が決まっていない

- **event（画面）**：日時の入力（`datetime-local`）の値を、時差なしの文字列のまま送る。API は Cloud Run の時計（UTC）で読み、**9時間ずれて保存する**。
- **event（招待の期限）・reception（チェックインの時刻の表示）・survey（CSV の時刻）**：それぞれが `new Date()` と `toLocaleString` で「日本時間」を作る。サーバーは UTC なので、日付の区切りが 9時にずれる。
- **塞ぎ方（約束の表の「ID・時刻」の行を直す）**：API と画面の間の日時は、時差つきの ISO 8601（zod の `z.iso.datetime({ offset: true })`）だけ。「日本時間の日付」と「その日の終わり」を出す関数は `packages/contracts/src/core` に1つ置き、どの領域もそれを使う。サーバーの時計の時刻帯に頼らない。

### 穴14 — 回数の制限が、会場の同じ IP の参加者をまとめて止める

- **骨組み（共通）**：書く操作は IP ごとに1分100回（`RATE_LIMIT_MAX` の既定）。IP は `TRUSTED_PROXY_HOPS` の数だけ `X-Forwarded-For` の右から数える。
- **infra/deploy**：`TRUSTED_PROXY_HOPS` を既定の0のままにする → 接続の相手は Google の中継なので、**全員が1つの数え方にまとまる**。1にしても、会場の Wi-Fi の参加者は同じ IP。
- **reception・account**：受付の山で、1人あたり `POST /auth/line` と `POST /checkins` の2回、40人なら1〜2分に80回を超える。
- **つなぐと**：受付の山で `429` が出て、UJ-1 が止まる（5章「1分以内」）。
- **塞ぎ方（AD-8 に足す）**：Terraform で `TRUSTED_PROXY_HOPS=1`、`RATE_LIMIT_MAX` を参加者の数に見合う値（例：600）にする。当日の受付の山を前提に決めた、と書く。

### 穴15 — 参加者の CSV と、困りごとの一覧の「名前」を誰が持つかが2通り

- **reception**：参加者の一覧は自分の表なので、FR-15 の参加者の CSV を作る。
- **survey**：対応表（Capability Map）で FR-14・FR-15 が survey なので、参加者の CSV も作る。困りごとの一覧の「書いた参加者の名前」は、account の表示名を引く（AD-2「ほかの領域は表示名を写さない」を「account から引け」と読む）。
- **つなぐと**：参加者の CSV が2本できる。困りごとの一覧の名前（LINE の表示名）と、一覧画面の名前（チェックインで直した名前）が食い違う。手でのチェックインの人は名前が出ない。
- **塞ぎ方（対応表を直す）**：FR-15 は分ける。参加者の CSV は reception、困りごとの CSV は survey（どちらも主催者だけ）。困りごとの一覧と CSV の名前は、いつも `checkin` の名前で、survey は reception の `index.ts` の `listCheckins(db, eventId)` で引く（`checkin` の表を直に読まない）。

### 穴16 — アンケートの開閉と、回答を受け付けるかの判断がずれる

- **event**：開閉の印を持ち（AD-3）、開け閉めの窓口を作る。閉じたら「受け付けない」は survey の仕事と思う。
- **survey**：参加者の回答は閉じていれば断る。主催者が代わりに入れる回答（【決定A9】）も同じく断る。チェックインのない参加者（電波が弱く手でチェックインされた人＝UJ-1 の例外）がアンケートQRを読むと、`account_id` で引けるチェックインがないので断る。
- **つなぐと**：紙で聞き取った回答を、閉じたあとに主催者が入れられない。UJ-1 の例外の人は自分で答えられず、どこにも案内がない。
- **塞ぎ方（AD-5 か新しい AD に足す）**：開閉を確かめるのは survey で、書くたびに `getEventSummary` で読む（自分の表に写さない）。閉じていて断るのは参加者の回答だけで、**主催者の代わりの入力は閉じていても受ける**。チェックインがない人には、アンケートの画面が「チェックインの画面へ」を出す（そこで LINE のチェックインができ、FR-5 の重なりとして主催者が手のほうを消す。穴4 の運用）。

### 穴17 — 支払い方法を直したときの金額を、どこから取るかが決まっていない

- **reception**：AD-6 は「チェックインした時点の金額を写す」。無料（0円）で受けた人を FR-8 で PayPay に直すと、写した金額は0円で、参加費の元が手元にない。event の今の参加費を引くか、0円のままにするかを、作る人が決める。
- **event**：FR-1 で参加費を直せる。チェックインがあるかは、依存の向きで知れない（reception より下の層）。
- **つなぐと**：参加費を打ち間違えて直しても、合計は古い参加費のまま（FR-12「人数 × 参加費」と食い違う）。支払い方法を直したときの金額が、作る人の解釈次第になる。
- **塞ぎ方（AD-6 に足す）**：金額を決め直すのは、チェックインを作るときと支払い方法を直すときだけで、`無料なら0円、ほかは event の今の参加費`（`getEventSummary` で引く）。参加費を直しても、すでにあるチェックインの金額は変えない。event の交流会を直す画面に、その旨を常に書く。

---

## 低

### 穴18 — 選択肢の値と、置き場所の形

- **reception** は 支払い方法を日本語の文言（`'PayPay'`・`'現金'`）で DB に入れ、**survey** は 月いくらを `'1000'` のような値で入れて「高い順」を文字で並べる（`'3000以上'` と `'分からない'` の順が崩れる）。どちらも「contracts の zod の列挙で1か所」は守っている。
- **塞ぎ方（約束の表の「選択肢」の行を直す）**：値は英語の短い code（`paypay`・`cash`・`free`、`jpy0`・`jpy500`…・`unknown`）、文言と並び順（「高い順」の順番を含む）は同じ列挙の隣に持つ。列挙は持ち主の領域の contracts（申し込みの媒体・知ったきっかけ・支払い方法は `reception`、月いくら・仕事の立場は `survey`）。DB は `text` と CHECK の制約（`pgEnum` にしない。選択肢を足すときの DB の変更を軽くする）。

### 穴19 — 領域の関数の呼び方と、道の名前のぶつかり

- **event** は `getRole(eventId, accountId)`（自分で `db` を持つ形）、**reception** は `findCheckin(db, …)` で作る。**account** は FR-16 の削除の窓口で「主催者か」を確かめたいが、event の関数は account → event の逆向きで呼べない（AD-5「権限は event の1つの関数を通す」に従えない）。道も、event が `/api/v1/events/{id}/…` を広く取り、reception・survey の道や `operationId` とぶつかる。
- **塞ぎ方**：`index.ts` の関数は、いつも1つ目の引数に `db`（トランザクションも渡せる形）。この版は領域をまたぐトランザクションを作らない（外部キーと一意の制約で守る）。account だけは、主催者の印を自分で見てよい（AD-5 の例外）。道は 領域ごとに頭を決める（account：`/api/v1/auth/*`・`/api/v1/accounts/*`、event：`/api/v1/events/*`・`/api/v1/staff-invites/*`、reception：`/api/v1/events/{eventId}/checkins/*`、survey：`/api/v1/events/{eventId}/survey-answers/*`）。`operationId` は領域の名前で始める。

### 穴20 — 夜間の停止を手で止めると Terraform とずれる・夜のデプロイが失敗する

- **infra** は Cloud Scheduler の仕事を Terraform で持つ（AD-9）。主催者は AD-10 どおり「その日の停止を止める」ために画面で仕事を一時停止する → 次の `terraform apply` で戻る、または差分が出続ける。夜間に GitHub Actions が動くと `db:migrate` が DB に届かず失敗する（AD-11 は失敗なら出さないので壊れはしない）。
- **塞ぎ方（AD-10 に足す）**：Terraform の Scheduler の仕事は `paused` の変更を無視する（`lifecycle { ignore_changes = [paused] }`）。止め方は `gcloud scheduler jobs pause` の1行を手順に書く。デプロイは 8時〜24時に行う。

### 穴21 — 2回目の参加者に最初から入れる名前の出どころ

- **account** は LINE の表示名をログインのたびに直し、それを名前の初期値として画面に返す。**reception** は前回のチェックインの名前と知ったきっかけを初期値にする（FR-4【決定A4】）。どちらも AD-2・AD-6 を守る。
- **つなぐと**：前回直した名前と、LINE の表示名のどちらが入るかが画面で決まらない。FR-5 の「同じ名前」の比べ方（空白・全角半角）も、API と画面で別になりうる。
- **塞ぎ方**：初期値は reception が出す（`前回のチェックインの名前 → なければ account の表示名`）。「同じ名前」は reception の API で決め（一覧の各行に印を付けて返す）、比べ方（前後の空白を除き、NFKC で揃え、間の空白を消す）は reception の contracts に1つ置く。

---

## 足す・直す AD の案（まとめ）

並行に入る前に、上の「高」と、穴8・9・11・12 を入れる。共通の PR は3つ（`kernel/config.ts` と DB のエラーの読みかえ・`app.ts` の画面の返し方と CSP・`apps/web/src/lib/liff.ts`）にまとめ、領域より先に develop へ入れる。

| AD | 種類 | 中身（1〜2行） | 穴 |
|---|---|---|---|
| AD-12 今の利用者の受け取り方 | 新しく | account の `index.ts` が `requireSession`・`currentAccount(c)`・画面の `useSession()` を出す。セッションは `account_id` だけを持ち、役割は要求のたびに AD-5 の関数で引く。未ログインは `401 UNAUTHENTICATED` | 1・7 |
| AD-4 | 足す | `POST /auth/line` はログインだけ。LIFF の始め方は画面の共通に1つ。LIFF ID は組み立てのときに埋める | 7・10 |
| AD-5 | 足す | 参加者向けの交流会の要約（`getEventSummary`）を event が出す。主催者は `ORGANIZER_LINE_USER_ID` で決める。account だけは主催者の印を自分で見てよい。招待は event の窓口で受け、期限は受けるときに日本時間で計算 | 5・6・10・19 |
| AD-6 | 足す | 金額を決め直すのは作るときと支払い方法を直すときだけ（無料は0円、ほかは今の参加費）。参加費を直しても過去は変えない | 17 |
| AD-7 | 直す | CASCADE は本人のデータだけ。「誰がしたか」は SET NULL、event へは RESTRICT。`survey_answer` の鍵は `checkin_id` だけ。取り消しは行を消す | 2・3・4 |
| AD-3 | 足す | 外部キーのためだけに表を `index.ts` から出してよい。表を作る PR は account → event → reception → survey の順。名前はいつも `checkin` から | 8・15 |
| AD-13 アンケートの受け付け | 新しく | 開閉は survey が書くたびに event から読む。閉じて断るのは参加者の回答だけ。主催者の代わりの入力は受ける | 16 |
| AD-8 | 足す | 画面の返し方と画面の CSP は `app.ts` の共通の PR。`TRUSTED_PROXY_HOPS=1`・`RATE_LIMIT_MAX` は受付の山に合わせる | 11・14 |
| AD-10 | 足す | probe は DB に触らない。`DB_UNAVAILABLE` は土台で1か所。Scheduler の `paused` は Terraform で無視 | 12・20 |
| 約束の表 | 直す | 外から開く道と LIFF の URL は contracts の core。日時は時差つき ISO 8601 と日本時間の関数1つ。選択肢は英語の code＋文言＋並び順、DB は text＋CHECK。道の頭と `operationId` は領域ごと。関数は1つ目に `db` | 9・13・18・19 |
| 対応表 | 直す | FR-15 を分ける（参加者の CSV は reception、困りごとの CSV は survey） | 15 |
