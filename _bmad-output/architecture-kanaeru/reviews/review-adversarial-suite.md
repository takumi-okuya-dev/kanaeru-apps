# 点検（敵対的）— スイートの決めごと AD-15〜AD-21

- 対象：`architecture-kanaeru.md`（2026-11-19 版。AD-15〜AD-21 と AD-1・AD-3・AD-5・AD-9 の直し）・`.memlog.md`
- やり方：1段下の2つの単位（別々のセッションが作る2つのアプリ、アプリと suite、領域と MCP など）を組み、**どちらも AD を文字どおり守っているのに、組み合わせると食い違う**例を作る。食い違いごとに、いちばん小さい AD の足し・直しを出す。
- いまのコードで裏を取った所：`apps/api/src/app.ts`・`platform/web/web.ts`・`kernel/features.ts`・`modules/account/session.ts`・`modules/event/access.ts`・`modules/*/routes.ts`・`apps/web/src/router.tsx`・`lib/feature.ts`・`drizzle.config.ts`・`docs/rules/parallel-development.md`・`.gitattributes`

## 判定

**このままでは、並行のセッションに渡す土台として足りない（2つ目のアプリの仕様の前に直す）。** 方向（台帳・`canUseApp`・持ち主の `account_id`・AI の作業を1か所）はよい。しかし、決めごとが「誰が・どこで・何を確かめるか」を middleware の名前で書いているため、(a) middleware を通らない道（MCP・段階2・画面の道）で確かめが抜ける、(b)「使う人」と「払う人」と「持ち主」が別のアプリで食い違う、(c) 1行に1つの一覧と1つの DB が、名前のぶつかりを止めない。いまのコードと直接ぶつかる所（`/mcp` と画面の戻し、`DOMAIN_FEATURES`、ナビの源）もある。

| # | 重さ | 穴（1行） | 主な AD |
|---|---|---|---|
| 1 | 致命 | MCP・段階2の書きこみが「同じ関数」を呼ぶと、middleware にある権限を全部すり抜ける | AD-20・AD-21・AD-5・AD-16 |
| 2 | 高 | `requireApp` が今の利用者の契約を見るので、参加者・受付係が締め出されるアプリと、持ち主の契約を見るアプリに割れる | AD-16・AD-19・AD-5 |
| 3 | 高 | `/mcp`・`/oauth/*`・`/.well-known/*` は AD-8 の「`/api` 以外は index.html」に当たり、CSRF・本文の上限・回数の制限も外れる | AD-21・AD-8 |
| 4 | 高 | AD-19 の持ち主 `CASCADE` が AD-7 の `RESTRICT` とぶつかり、主催者のアカウントを消せない／他人の記録まで消える | AD-19・AD-7・AD-5 |
| 5 | 高 | アプリの key・表の名前・API の道の頭・領域の所属が、1行に1つの一覧と1つの DB でぶつかっても止まらない | AD-15・AD-3・AD-17 |
| 6 | 中 | 「公開の状態」が `DOMAIN_FEATURES`（coding.md 2）と `app_setting` の2つ、ナビの源が `features.list` と `apps.list` の2つ | AD-16・AD-15 |
| 7 | 中 | `requireApp` を付け忘れても止まらない・断るときの code・`requireSession` との順が決まっていない | AD-16 |
| 8 | 中 | `app_setting` の行を DB の変更で入れると、アプリの PR が suite の表を書く（持ち主が2人）。管理の画面の切り替えも上書きする | AD-16・AD-3・AD-17 |
| 9 | 中 | 運営者＝`isOrganizer`／`requireOrganizer` のまま公開されているので、新しいアプリが「管理者」に流用する。運営者が他のアプリの利用者のアカウントを消せる | AD-5・AD-19・AD-7 |
| 10 | 中 | `kernel/ai` は依存の向き上、`ai_credential` も領域の関数も読めない。キーの取り出しと書きこみの置き場所がセッションで割れる | AD-20・AD-3・Paradigm |
| 11 | 中 | OAuth の範囲がアプリをまたぐ。LINE の Web のログインが AD-4 の「ログインは1つだけ」と食い違う | AD-21・AD-4 |
| 12 | 中 | アプリどうしの依存の向きが決まっていない（集客アプリが event を読むか、自分で「交流会」を持つか） | AD-1・AD-3・AD-15 |
| 13 | 低 | 新しいアプリの外から開く URL と QR の置き場所が AD-14 にない | AD-14・AD-15 |
| 14 | 低 | AD-17 の「同時に1本」に、誰が開いているかを知る仕組みがない。AD-3 の PR の順が受付アプリの分だけ | AD-17・AD-3 |

---

## 1. 【致命】MCP・段階2の書きこみが、権限の確かめをすり抜ける

**組み合わせ**：受付アプリの reception（いまのコード）× MCP のツール「チェックインを直す」を足すセッション。

- いまのコードでは、権限は**道の middleware** にある：`requireSession`（account）→ `requireEventRole(deps, ["organizer"])`（event）→（AD-16 で）`requireApp("reception")`。どれも Hono の `Context` と `c.req.param("eventId")` を読む（`event/access.ts` の `requireEventRole`）。領域の中の関数（repository・views）は権限を見ない。
- AD-20 は「どの段階も、書くときは画面と同じ**領域の関数**を通す」、AD-21 は「ツールは、その領域の窓口と同じ**関数と権限**を通る」。MCP のツールの処理には Hono の道の文脈も `{eventId}` の道の値もないので、文字どおり「同じ関数」を呼ぶと middleware が1つも走らない。セッション A は repository を直接呼び（権限が抜ける）、セッション B は権限を書き直す（AD-20 の「別に作らない」に反する）。どちらも AD に沿っていると言える。
- 同じ穴が段階2（`kernel/ai` が答えを書く）にもある。

**直し（AD-20 の最後の文と AD-21 の「ツールは…」を差しかえ）**：

> どの段階も、書くときと読むときは、画面と**同じ HTTP の窓口**を通す。MCP のツールと段階2は、その窓口を API の中から呼ぶ（`app.request`。道の middleware がそのまま走る）。account の `requireSession` は、セッションのクッキーに加えて OAuth のアクセストークン（`Authorization: Bearer`）も受け、`currentAccount(c)` に範囲を載せる。書く窓口は `requireScope` で書く範囲を確かめる（クッキーのセッションはすべての範囲を持つ）。権限を領域の関数の中に移すまで、領域の関数を MCP から直接呼ばない。

（もう1つの案は「書く処理をすべて `(db, actor, input)` の関数にして、権限を関数の中で確かめる」。いまのコードの作り（middleware）を大きく直すので、上の案を勧める。）

## 2. 【高】「使う人」と「払う人」が別のとき、`canUseApp` の答えがアプリで割れる

**組み合わせ**：受付アプリ（参加者・受付係・主催者の3人が使う）× 2つ目のアプリ「レシピ」（持ち主だけが使う）。

- AD-16：`canUseApp(db, accountId, appKey)` は「公開の状態」と「売り方と契約」。契約の持ち主は `account`（使いたい人が払う）。`requireApp` は参加者が外から開く道にも付ける。
- 売り始めると、受付アプリの参加者のチェックイン（`POST …/checkins/me`）は、**参加者の** account の契約を見て断られる。払うのは主催者なのに。受付係も同じ。
- 受付アプリのセッションは「交流会の持ち主（AD-5 の将来の `event.account_id`）の契約を見る」別の確かめを作り（AD-16 の「各アプリは契約を読まない」に反する）、レシピのセッションは今の利用者で見る。どちらも AD-16・AD-19 の文に合う。
- さらに、`accountId` が必須なので、ログイン前に開く道（集客アプリ B1 の公開のページなど）では呼べない。そのセッションは `requireApp` を付けないか、空の id を渡す。

**直し（AD-16 の3つ目の点を差しかえ）**：

> 「使えるか」は2つに分ける。(1) **見えるか**＝公開の状態（`public`、運営者は `operator_only` でも可）。今の利用者で決め、ログインしていなければ `public` のときだけ通す。`requireApp(appKey)` はこれだけを見て、すべての道（参加者の道とログイン前の道も）に付ける。(2) **契約が通るか**＝売り方と、**払う人**（AD-19 の最上位の記録の持ち主。受付アプリは交流会の主催者）の契約。suite の `index.ts` が `hasEntitlement(db, payerAccountId, appKey)` として出し、持ち主の記録に触る窓口が、その記録の持ち主で呼ぶ（売り始める前は通す）。`canUseApp(db, accountId | null, appKey)` は (1)。

## 3. 【高】`/mcp`・`/oauth/*`・`/.well-known/*` が画面の戻しと守りの外に落ちる

**組み合わせ**：AD-21 を作るセッション × AD-8（いまの `app.ts`・`platform/web`）。

- AD-8：「`/api` 以外は `index.html` に戻す」「`/api` の下は API の CSP、ほかは画面の CSP」。コードは `isApiPath()`＝`/api` だけ（`platform/web/web.ts:58`）。`serveWeb` は領域の道より**先に** `app.use("*")` で入り、GET・HEAD で `/api` 以外ならファイルか `index.html` を返す（`web.ts:96-117`）。
- AD-21 の道の頭は `/mcp`・`/oauth/*`・`/.well-known/*`（Consistency Conventions）。Streamable HTTP の `GET /mcp`（流れを開く）、`GET /.well-known/oauth-protected-resource`、`GET /oauth/authorize` は、**どれも `index.html` が返る**。
- さらに `csrf`・Origin の確かめ・`bodyLimit`・回数の制限は `/api/v1/*` だけ（`app.ts`）、`assertDocumentedRoutes` も `/api` だけ。`/mcp` と `/oauth/token` は守りの外に出る。どちらのセッションも AD どおり。

**直し（AD-8 の1つ目の点と Conventions の道の頭）**：

> 画面に戻さない道の頭は `/api` と `/.well-known` の2つだけで、`platform/web` の1つの関数（`isServerPath`）が持つ。MCP の窓口は `/api/mcp`、認可は `/api/oauth/*`（同意の画面は画面の道 `/oauth/consent` に置き、`/api/oauth/authorize` がそこへ移す）。`/.well-known/*` は platform の道として領域の道より先につなぐ。CSRF・本文の上限・回数の制限は、MCP と OAuth の窓口に合わせて `/api/*` の単位で決め直す（Bearer で受ける窓口は Origin の確かめから外し、回数の制限はトークンごとにする）。

（あわせて AD-15 の予約語に `api`・`.well-known`・`oauth`・`assets` を入れる。5 を見よ。）

## 4. 【高】持ち主の `CASCADE`（AD-19）が、`RESTRICT`（AD-7）と共有の記録にぶつかる

**組み合わせ A**：受付アプリをほかの主催者に開くセッション × AD-7。

- AD-5（仮決め）と Deferred：開くときは `event` に持ち主の `account_id` を足し、「AD-19 の形にそろえる」。AD-19：最上位の記録の持ち主の `account_id` は `ON DELETE CASCADE`。
- AD-7：`event` を指す外部キーは `RESTRICT`（`checkin.event_id` など）。
- 主催者がアカウントを消す（FR-16）→ `event` が CASCADE で消えようとする → チェックインが `RESTRICT` で止める → **`deleteAccount` が DB のエラーで落ちる**。逆に `RESTRICT` を緩めると、他人（参加者）のチェックインと回答が主催者と一緒に消える。AD-7 が防ごうとしたこと（「その人が手で入れたほかの参加者のチェックインまで消える」）そのもの。

**組み合わせ B**：グループを持つ2つ目のアプリ（AD-19 の「人を共有する形はアプリの仕様で」）。持ち主が消えると、メンバーが書いた記録も CASCADE で消える。

- 領域をまたぐトランザクションは作らない（Conventions）ので、account の削除は他のアプリの片付けを順に呼べない。外部キーだけで決まる。

**直し（AD-19 の Rule に足す）**：

> 持ち主の `account_id` を `CASCADE` にしてよいのは、その記録の下に**持ち主のほかの人のデータがない**ときだけ。ほかの人が書く（参加者・メンバー）最上位の記録は `RESTRICT` にし、account の削除がその制約で止まったら `409 ACCOUNT_OWNS_SHARED_RECORDS` を返す（読みかえは account の中。持ち主はアプリの画面で記録を消すか譲ってから、もう一度消す）。受付アプリの `event.account_id` もこの形。

## 5. 【高】1行に1つの一覧と1つの DB が、名前のぶつかりを止めない

**組み合わせ**：2つ目と3つ目のアプリを、別々のセッションが同じ日に始める（例：「グループで割り勘」と「チーム練習の試合表」）。

| ぶつかる物 | AD の文 | どちらも守ったまま起きること |
|---|---|---|
| アプリの key | AD-15「英語の小文字・単数」・`merge=union` | 2人が同じ key（`team`）を足すと、union で**2行とも残る**（`export * as` の形でなければ型エラーにならない）。`e`・`admin`・`invite`・`api`・`assets`（Vite の出力）・`oauth` を key にしても止まらない（画面の道 `/<key>/…` が受付アプリ・API・静的ファイルとぶつかる） |
| 表の名前 | Conventions「表は単数の snake_case」 | 両方が `group`・`member`・`setting` を作る。1つの DB・1つの `public` スキーマなので、後に当てた変更が `already exists` で落ちる（`drizzle-kit check` は1本の journal の中しか見ない） |
| API の道の頭 | Conventions は今の領域の分だけ列挙 | 両方が `/api/v1/groups/*` を取る。Hono は先に登録した道を使い、黙って片方が隠れる |
| 領域の所属 | AD-15「属する領域」 | 共通に使いたい領域（例：`group`）を2つのアプリの行に書ける。どちらの `requireApp` を付けるかが決まらない |
| 画面の feature の id | なし | `features.list` の id が同じでもナビが重なるだけで止まらない |

**直し（AD-15 に足す。Conventions の名前・道の頭も同じ）**：

> key は一意で、予約語（`api`・`admin`・`e`・`invite`・`apps`・`oauth`・`assets`・`.well-known`・`account`・`suite`）を使わない。`apps.list.ts` を読むテストが、key の一意・予約語・「`modules.list` の領域は account と suite のほかは、**ちょうど1つ**のアプリに属する」・画面の道がそのアプリの道の頭の下にあること、を確かめる。新しい領域の表は名前を `<領域>_` で始める（領域と同じ名前の最上位の表は除く）。新しい領域の API の道の頭は `/api/v1/<領域>/…`。

## 6. 【中】「公開の状態」とナビに、源が2つずつある

**組み合わせ A**：新しいアプリのセッションが coding.md 2 に従う × AD-16 に従う。

- `docs/rules/coding.md` 151行目と `kernel/features.ts`：「大きな機能は設定 `DOMAIN_FEATURES` の印（`<領域>.<名前>`）で止められるように作る」。セッション A はアプリ全体を `recipe.app` で止め、セッション B は `app_setting` で止める。Conventions の「公開の状態は設定にしない」は coding.md と食い違ったまま。

**組み合わせ B**：新しいアプリの画面 × AD-15 のナビ。

- いまのナビは `features.list.ts` の各 feature の `nav`／`useNavItems` から作る（`router.tsx`。はじめの画面 `/` は最初の `nav` に移す）。AD-15 は「`apps.list` のうち `canUseApp` が通るアプリを並べるだけ」。セッションが今の作り（coding.md 6-6）で `nav` を出せば、`off` のアプリもナビに出る。
- AD-16「`off` なら参加者の画面も閉じる」は、API の middleware しか決めていない。画面は外枠が出て、データの読みこみで 403 になるだけ。

**直し**：

> AD-16 に足す：アプリ全体の入・切は `app_setting` だけで持ち、`DOMAIN_FEATURES` はアプリの中の機能の印にだけ使う（coding.md 2 を同じ PR で直す）。suite は `GET /api/v1/apps`（今の利用者に見えるアプリ）を出し、画面の外枠は、今の道が属するアプリ（`apps.list` の道の頭で引く）が見えなければ「使えません」の画面を出す。AD-15 に足す：feature の `nav` は、そのアプリが見えるときだけ外枠が出す（feature が自分で `canUseApp` を見ない）。受付アプリの道の頭は `/admin/events`・`/e`・`/invite` の並びで登録する。

## 7. 【中】`requireApp` の付け忘れ・断り方・順が決まっていない

**組み合わせ**：新しいアプリ A（`requireApp` を `requireSession` の後に付け、`off` で `404`）× アプリ B（先に付け、`403 FORBIDDEN`）。画面の共通のエラーの出し方がアプリで変わる。付け忘れた道は、`off` の間も本番で動く（AD-16 が防ぐと書いたこと）。

- 合成の場所で一律に付けるのは、Hono の `route()` の `use("*")` がほかの領域の道にも効くので、そのままでは使えない。

**直し（AD-16 に足す。Conventions のエラーにも）**：

> 見えないアプリの窓口は `403 APP_UNAVAILABLE`。`requireApp` は `requireSession` より前に付け、ログインしていなくても判定できる（2 の (1)）。組み立ては、アプリの領域ごとに key を束ねた `requireApp` を `DomainRouteDeps` で渡す。テストが、窓口の文書の道を領域（tag）ごとに回し、アプリを `off` にして全部が `APP_UNAVAILABLE` になることを確かめる（道の数を書かない）。

## 8. 【中】`app_setting` に書く人が2人いる

**組み合わせ**：suite のセッション（`app_setting` の持ち主）× 受付アプリと新しいアプリのセッション。

- AD-16：「受付アプリは `public` の行を DB の変更で入れる」。新しいアプリのセッションが同じ形で自分の行を入れると、アプリの PR が suite の表を書く（AD-3 の「表は作った領域だけが読み書き」に反する）うえ、DB の変更の PR が1本増える（AD-17 の列に並ぶ）。
- `INSERT … ON CONFLICT DO UPDATE` で書けば、運営者が管理の画面で `off` にした後のデプロイで `public` に戻る。

**直し（AD-16 の1つ目の点を差しかえ）**：

> `app_setting` の行を書くのは suite の窓口（運営者の画面）だけ。DB の変更で行を入れるのは、suite が表を作る変更で受付アプリの `public` の1行だけ（`ON CONFLICT DO NOTHING`）。新しいアプリは行を入れず（＝`operator_only`）、出すときに運営者が画面で切り替える。key を `apps.list` から消しても行は残し、suite は一覧にない key を無視する。

## 9. 【中】運営者と主催者が、コードの上で同じ関数のまま

**組み合わせ A**：新しいアプリのセッションが「アプリの管理者だけの窓口」（例：レシピの公式の見本を直す）を作る × AD-19。

- account の `index.ts` は `isOrganizer`・`requireOrganizer` を出している（`session.ts:189-206`）。event は `requireOrganizer` で交流会の作成を守り、`lookupRole` は運営者に**すべての交流会**で organizer を返す（`access.ts`）。新しいセッションはこの見本をまねて `requireOrganizer` を付ける。AD-19 は「運営者だけに許すのは台帳の操作だけ」と言うが、import を止める物がない。

**組み合わせ B**：account の `DELETE /api/v1/accounts/{accountId}`（`requireOrganizer`。`account/routes.ts:129-133`）× 2つ目のアプリ。運営者が、受付アプリと関係のない人のアカウントを消すと、その人のレシピも CASCADE で消える。AD-19 の「台帳の操作だけ」と食い違う。

**直し（AD-5 の仮決めの文と AD-19）**：

> account は運営者の確かめを `isOperator`・`requireOperator` の名前で出し、使ってよいのは suite と account と受付アプリの event だけ（受付アプリが AD-5 の持ち主の形に移るまで）。lint の境界の規則で、ほかの領域からの import を止める。運営者がほかの人のアカウントを消す窓口は、受付アプリの FR-16 の代行として残すか、本人だけに絞るかを決めて、この AD に書く。

## 10. 【中】`kernel/ai` は、キーも領域も読めない

**組み合わせ**：段階2を作るセッション A × セッション B。

- Paradigm：依存は「組み立て → 領域 → 共通 → 土台」。`kernel` は共通なので、account の `ai_credential` も、領域の contracts の AI の作業の書きこみ先も読めない。
- AD-20 は「API の `kernel/ai` が同じ作業を流す」とだけ書く。A は `kernel/ai` から `ai_credential` を直接読み（AD-3 に反する）、B は領域の窓口から `kernel/ai` を呼んでキーを account から受け取る。暗号の鍵（Secret Manager）をどこが読むかも割れる。

**直し（AD-20 の段階2に足す）**：

> AI の作業を流すのは、その作業の持ち主の領域の窓口。窓口は account の `index.ts` の `withAiCredential(db, accountId, fn)` で本人のキーを平文のまま受け取り（復号するのは account だけ。鍵は `kernel/config.ts` が読む）、`kernel/ai` の `runAiTask(task, input, key)` に渡す。`kernel/ai` は DB と領域を読まない。答えを書くのは 1 の窓口で、書く人は今の利用者（AI の代わりの人を作らない）。

## 11. 【中】OAuth の範囲がアプリをまたぐ。ログインの入り口が2つになる

- AD-21：「読むだけの範囲が既定で、書くツールは別の範囲」。範囲がスイート全体なので、レシピのために書く範囲を許したトークンで、受付アプリのチェックインも消せる。セッションごとに `write` か `recipe:write` かが割れる。
- AD-4：「ログイン…の処理は `lib/liff.ts` に1つだけ」「`POST /api/v1/auth/line` はログインだけ」。AD-21 は LINE ログインの Web のチャネル（コードの流れ）を足す。AD-4 を文字どおり守るセッションは、認可の画面でも LIFF を使おうとして外のブラウザで止まる（Open Questions 3・9）。

**直し**：

> AD-21 に足す：範囲は `<appKey>:read`・`<appKey>:write`。ツールの一覧は、トークンの範囲と `canUseApp` が通るアプリのものだけを出す。AD-4 に足す：OAuth の認可（AD-21）のときだけ、account が LINE ログインの Web のコードの流れをサーバーで行い、同じ `/oauth2/v2.1/verify` で確かめる（`LINE_CHANNEL_IDS` に Web のチャネルを足す）。画面の LIFF のログインは `lib/liff.ts` の1つのまま。

## 12. 【中】アプリどうしの依存の向きがない

**組み合わせ**：集客アプリ B1（台帳で `individual`。Open Questions 8 の仮決めで中のアプリ）× 受付アプリ。

- 集客アプリは交流会を扱う。セッション A は受付アプリの event の `index.ts` を読む（Paradigm の「領域どうしは相手の `index.ts` から」に合う）。すると、集客アプリだけを契約した人の窓口が、受付アプリの `requireApp` を通らずに event を読み書きする。セッション B は自分の領域に「交流会」の表を作る（AD-3 に合う）。すると同じ「交流会」に持ち主が2人いる。

**直し（AD-15 に足す）**：

> アプリの領域が読んでよいのは、account・suite・同じアプリの領域だけ。ほかのアプリの領域を読むときは、`apps.list` の行に `uses: ["<appKey>"]` と書き、一方向だけ（循環を lint で止める）。読まれる側は、その関数で契約も公開の状態も確かめない（確かめるのは呼ぶ側の `requireApp`）。同じものを2つのアプリが持たない（持ち主のアプリを決めて `uses` する）。

## 13. 【低】新しいアプリの外から開く URL

- AD-14 は受付アプリの3つの道と、ミニアプリの URL にする関数を `packages/contracts/src/core` に「1つだけ」置く。新しいアプリが共有のリンクや QR を作るとき、core を直す（1行に1つの一覧でないので並行の決まりに反する）か、自分の contracts でミニアプリの URL を組み立て直す（関数が2つになる）か、で割れる。

**直し（AD-14 に足す）**：

> core が出すのは、道からミニアプリの URL を作る関数 `toMiniAppUrl(path)` だけで、受付アプリの3つの道はそのまま core に置く。新しいアプリの外から開く道は `/<key>/…` で、そのアプリの contracts に置き、`toMiniAppUrl` で URL にする。

## 14. 【低】DB の変更の「同時に1本」と PR の順

- AD-17 は「同時に1本だけ開く」が、別のセッションが開いているかを知る方法がない（parallel-development.md 4 は「ユーザーに伝える」だけ）。2つのセッションが同じ時間に「先に開く」。
- AD-3 の「表を作る PR は account → event → reception → survey の順」は受付アプリの分だけで、suite（`app_setting`）と新しいアプリの順がない。2 の (2) の契約は suite の表を使うので、suite が先。

**直し**：AD-17 に「DB の変更のある PR は `db-migration` のラベルを付けて開き、開く前に `gh pr list --label db-migration --base develop` で0本かを見る」。AD-3 の順を「account → suite → 各アプリ（アプリの中は依存の順）」にする。

---

## 古い AD との組み合わせで、ほかに気づいたこと（直しは小さい）

- **AD-7 × `entitlement`**：契約の行を account の削除で `CASCADE` にするか残すかが決まっていない（支払いの会社との記録の照合に要るなら `SET NULL`）。売り始めるときに AD-7 の一覧へ足す。
- **AD-8 × MCP の回数の制限**：MCP の接続する側（Claude・ChatGPT）は AI の会社の IP から来るので、IP ごとの制限では、ほかの利用者の分まで止まる。Deferred の「AI に許す操作の回数の制限」を決めるとき、トークンごとにする（3 の直しと同じ）。
- **AD-12 × ログイン前の道**：`requireSession` が必須の作りなので、2 の (1)（ログインしていなくても判定する）には、account が「あれば読む」`optionalSession` を出す必要がある。
- **AD-15 × `merge=union` の書き方**：`apps.list.ts` を配列の1行ずつ（`{ key: …, … },`）にすると、同じ key の2行が型で止まらない。`export const <key> = defineApp({…});` の形にすれば、同じ key は TypeScript が二重の宣言として止める（5 のテストの補い）。
