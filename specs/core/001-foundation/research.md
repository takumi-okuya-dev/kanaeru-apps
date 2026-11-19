# Research: 共通の土台（core-001）

2026-11-19 作成。開発者が不在のため、AI が仮に決めたもの（【仮決め】）を含む。仮決めは、開発者が見直して変えてよい（変えるときは新しい仕様か、この PR の中で直す）。

## R1. `note` の表は1回で消す【仮決め】

- **Decision**: `0000_note.sql` は書き換えず、`0001_drop_note.sql`（`DROP TABLE "note" CASCADE;`。drizzle-kit が作ったものを読んだ）を足す。コードを消す PR と同じ PR で消す。
- **Rationale**: [coding.md](../../../docs/rules/coding.md) 3 の「表を消すのは2回に分ける」は、本番で前の版のアプリが動いているときの決まり。kanaeru はまだ本番に出していない（デプロイの流れも別のセッションが作っている途中）ので、`note` を読む前の版のアプリはない。
- **Alternatives**: 2回に分ける（コードを消す版を出してから表を消す）。守るものがないのに PR が増えるので選ばなかった。
- **Note**: 表の定義（`schema.ts`）が1つもないと `drizzle-kit generate` が「No schema files found」で止まる。account-001 が最初の `schema.ts` を足すまで、`pnpm db:generate` は使えない（`db:migrate` は動く）。この DB の変更は、一時的に空の `schema.ts` を置いて作った。

## R2. 設定の足し方（LINE・主催者・オープンチャット）

- **Decision**:
  - `LINE_CHANNEL_IDS`：数字だけのチャネル ID をカンマで並べる（空白と空の要素は除く）。staging・production では1つ以上要る。local・test は空でよい。
  - `ORGANIZER_LINE_USER_ID`：`U` と16進の32文字（LINE のユーザー ID の形）。staging・production では要る。local・test はなくてよい。
  - `OPEN_CHAT_URL`：任意。あれば `https://` の URL（ほかの環境でも http は止める）。
  - どの値も、形が違えば環境によらず起動を止め、値そのものはエラーに出さない（テンプレートの形のまま）。
- **Rationale**: AD-4（`client_id` の並び。ミニアプリの中のチャネルが3つに分かれる可能性への備え）・AD-5（主催者は設定で決め、秘密ではない）・PRD FR-17（オープンチャットは全体で1つ）。本番で空のまま出すと、ログインや主催者の画面が黙って動かないので、起動で止める。
- **Alternatives**: LINE のユーザー ID の形を確かめない。書き違いを本番で気づくのが遅れるので選ばなかった。

## R3. `UNAVAILABLE` を `DB_UNAVAILABLE` に置きかえる【仮決め】

- **Decision**: 土台の code の `UNAVAILABLE`（503）を `DB_UNAVAILABLE`（503）に名前を変える。文言は、起きた時刻の日本時間で選ぶ（code は1つ）：0時〜8時は EXPERIENCE.md の言葉「夜間（0時〜8時）は止まっています。8時からもう一度開いてください。」、ほかは「一時的につながりません。少し待ってから、もう一度開いてください。」。選ぶのは `@workspace/contracts/core` の `dbUnavailableMessage(now)`（`coreErrorMessage`）の1か所で、時間帯は `isNightStopWindow(now)`（画面も同じものを使える）。
- **Rationale**: 503 を返す理由は DB に届かないことだけ。組み立ては投げられた `HTTPException` の状態の番号から code を逆に引くので、1つの番号に code が2つあると決められない。画面はエラーの文をそのまま出すので、文言は EXPERIENCE.md の Voice and Tone（決めた言葉＋仮に決めた言葉の続き）にした。
- **Alternatives**: 両方を残す。逆引きの表に例外が要り、どちらを返すかが場所しだいになるので選ばなかった。
- **Note**: 昼に Cloud SQL が別の理由（保守の再起動など）で止まったとき、交流会の最中の人に「8時から」と出さないよう、昼は一時的な文にした。

## R4. DB に届かないことの見分けと、読みかえの1か所

- **Decision**: `kernel/pg-errors.ts` の `isDbUnavailable(error)` は、**DB の層から来たエラーだけ**を見る（LINE への fetch の `ENOTFOUND` やファイルの `ENOENT` を 503 にしないため）：
  - Drizzle の命令のエラー（`DrizzleQueryError`）なら、その `cause`・`errors`（`AggregateError`）を5段まで開き、次のどれかがあれば true
  - 包まれずに届いた pg のエラー（`db.transaction` の `pool.connect()` など）なら、pg の `DatabaseError` の SQLSTATE・pg の決まった文・ソケットのつなぐときのエラー（`syscall` が `connect`・`getaddrinfo`。`ENOENT` は道が `.s.PGSQL.` のときだけ）・それだけを束ねた `AggregateError` なら true。fetch の失敗は `TypeError`（fetch failed）に包まれるので当たらない
  - 見るもの：Node のソケットの code `ECONNREFUSED`・`ECONNRESET`・`ETIMEDOUT`・`EHOSTUNREACH`・`ENETUNREACH`・`ENOTFOUND`・`EAI_AGAIN`・`ENOENT`（Cloud SQL の Unix ソケットがない）・`EPIPE`／PostgreSQL の SQLSTATE クラス `08`（接続の例外）・`57P01`・`57P02`・`57P03`（止める途中・起動の途中）／pg の文 `Connection terminated unexpectedly`（DB に切られた）・`Connection terminated due to connection timeout`（DB の口につなぐのが時間切れ）
  - `kernel/errors.ts` の `toAppError(error)` が、`AppError`・`HTTPException`・DB に届かない、を `AppError` に読みかえる。組み立ての `onError` はこれを呼ぶだけ。
- **Rationale**: AD-10「この読みかえは土台のエラーの処理に1か所だけ」。Drizzle は pg のエラーを `cause` に包むので、包みを開いて見る。`statement_timeout`（`57014`）・制約の違反（`23xxx`）・`53300`（接続が多すぎる）・pg-pool の空き待ちの時間切れ（`timeout exceeded when trying to connect`）・答えが遅い命令（`Query read timeout`）は DB に届いている（混んでいる・遅い）ので含めない（昼の混雑を 503 にしない。500 の INTERNAL になる）。
- **Alternatives**: 動いているかの窓口だけで見分ける。領域の窓口が 500 になるので選ばなかった。

## R5. 起動の確かめ（probe）に DB に触る窓口を使わない

- **Decision**: `GET /api/v1/health` は DB に `SELECT 1` を送る窓口のまま残し、置き場所の起動の確かめには使わない。Cloud Run は、probe を書かなければ既定の TCP の起動の確かめ（コンテナの口が開いたか）だけを行う。Terraform（別のセッション）では startup・liveness の probe を書かないか、書くなら DB に触らない道にする。
- **Rationale**: AD-10。夜間（0時〜8時）は DB が止まるので、DB に触る probe だとコンテナが「動いていない」とされ、作り直しをくり返し、画面も出せなくなる。
- **出典**: https://docs.cloud.google.com/run/docs/configuring/healthchecks （“Cloud Run automatically configures a TCP startup probe”。既定の liveness の probe はなく、書いたときだけ動く）。

## R6. 画面のファイルを API が返す（`WEB_DIST_DIR`）

- **Decision**:
  - 設定 `WEB_DIST_DIR`（組み立てた画面のフォルダ。相対ならその時の作業のフォルダから）があれば、`platform/web` が `/api` 以外の GET・HEAD に、ファイル（`@hono/node-server` の `serveStatic`。`..` などは中で止まる）を返す。ファイルがなければ、`/assets/` の下は 404（壊れた JS を HTML で返さない）、ほかの道は `.` を含んでも `index.html`（起動のときに1度読む。なければ起動を止める）。
  - staging・production では `WEB_DIST_DIR` が要る（なければ起動しない）。手元の `pnpm dev` は今までどおり Vite が画面を返し、`/api` を中継する。
  - キャッシュ：`/assets/`（Vite がファイルの名前に中身の印を付ける）は `public, max-age=31536000, immutable`、`index.html` などは `no-cache`、API は今までどおり `no-store`。キャッシュの見出しは、ファイルを返せた応答（200・206）だけに付ける（範囲が合わない 416 などには付けない）。
  - `/api`・`/api/…` だけが API（`/apifoo` は画面の道）。
- **Rationale**: AD-8（1つのコンテナが画面と `/api` を同じ源で返す）。環境の名前でなく設定の値で分ける（coding.md 2）。
- **Alternatives**: 環境の名前（production）で返すかを決める。決まりに反するので選ばなかった。画面を別のサービス（Cloud Storage など）に置く。源が分かれ、クッキーが使えないので選ばなかった。
- **Dockerfile への引き継ぎ**: コンテナの中で `WEB_DIST_DIR`（例：`/app/apps/web/dist`）・`API_HOST=0.0.0.0`・`API_PORT`（Cloud Run の口）を渡す。

## R7. 画面の CSP（`@line/liff` 2.32 が要る源）

LINE Developers に LIFF の CSP の説明はない（LIFF の開発の決まり・API の説明・リリースノートを読んだ）。`@line/liff@2.32.0` の中身（`@liff/*` の `lib/index.es.js`）を読み、使う源を拾った。

| 決まり | 足す源 | 何に使うか（SDK の中身） |
|---|---|---|
| `script-src` | `https://static.line-scdn.net` | `liff.init()` が読みこむ古い拡張（`/liff/edge/2/*-extensions_2_22_0.js`。止めても init は失敗しないが、関わる API が使えなくなる）・古い Android の LINE の外のブラウザで読む `lui`（`@liff/init`） |
| `connect-src` | `https://api.line.me`・`https://access.line.me`・`https://liff.line.me`・`https://liffsdk.line-scdn.net` | トークン・`liff/v2/apps`・友だちの状態（api）、`requestFriendship` の確かめ（access）、`oaadd/rateLimit`・`permanentLink`（liff）、文言の取り寄せ `xlt/manifest.json`（liffsdk） |
| `img-src` | `https://profile.line-scdn.net` | `liff.getProfile()` の `pictureUrl`（kanaeru は今は出さない。account の画面で出すときのため） |
| `frame-src`・`form-action` | `https://liff-subwindow.line.me` | 外のブラウザでの `subWindow`（`requestFriendship` など）：`about:blank` の iframe を作り、そこから `liff-subwindow.line.me` へ POST する |

- **Decision**: 上の表を許す。`'unsafe-eval'` は入れない。`frame-ancestors 'none'`・`object-src 'none'`・`base-uri 'none'` は今のまま。ログインの移動（`access.line.me/liff/v1/authorize`）は `location.href` なので CSP は関わらない。
- **【仮決め】外のブラウザの `subWindow`**：SDK は `about:blank` の iframe の中で `contentWindow.eval` を使う。iframe は親の CSP を引き継ぐので、`'unsafe-eval'` がないと、外のブラウザ（PC の主催者など）では `requestFriendship` が動かない見込み（要確認）。参加者が使う LINE の中では `subWindow` は画面の移動で動き、iframe を使わない。友だち追加は LINE の中で出す（FR-6）ので、守りを優先して `'unsafe-eval'` を入れない。
- **要確認**：`lui-alert` の部品の style（古い Android の外のブラウザだけ）。本番に出したら、LINE の中と外のブラウザで CSP の違反が出ないかを確かめる（quickstart 3）。
- **出典**：https://developers.line.biz/en/reference/liff/ ・https://developers.line.biz/en/docs/liff/release-notes/ ・https://developers.line.biz/en/docs/liff/development-guidelines/ ・`@line/liff@2.32.0` の中身（https://unpkg.com/@line/liff@2.32.0/ と依存の `@liff/server-api`・`@liff/extensions`・`@liff/message-bus`・`@liff/i18n`）。

## R8. `lib/liff.ts` と、LIFF ID がないときの仮の形【仮決め】

- **Decision**:
  - LIFF ID は組み立てのときに `VITE_LIFF_ID` を `vite.config.ts` の `define`（`__LIFF_ID__`）で埋める（画面のコードは `import.meta.env` を読まない決まり）。
  - `initLiff()` を `main.tsx` がルーターを作る前に1度だけ呼び、`getLiff()` で同じものを返す。LIFF ID があれば `@line/liff` を開いたときに読み（別の束）、`liff.init({ liffId })` を待つ。
  - 出すもの：`mode`（`"line"`／`"fake"`）・`isLoggedIn()`・`login()`・`getIDToken()`・`isInClient()`・`requestFriendship()`（使えなければ何もせず `false`。`liff.isApiAvailable` と `try`）。
  - LIFF ID がない（手元・テスト・E2E）ときは仮の形：未ログイン・IDトークンなし・LINE の外・`login()` は何もしない・`requestFriendship()` は `false`。テストは `createFakeLiff({ loggedIn, idToken, inClient })` で状態を変えられる。手元とテストのログインは account-001 が足す試験用の窓口（AD-12）で行う。
  - `liff.init()` が失敗したら、画面は EXPERIENCE.md の「読みこめない」の文を出して止まる（ルーターを作らない。LIFF の URL を壊さないため）。
  - `withLoginOnExternalBrowser` は既定で使わない（外のブラウザで自動で LINE のログインへ移るかは account-001 が決める。`initLiff` の引数で渡せる）。
- **Rationale**: AD-4（LIFF の始め方は1か所・ルーターより先）・AD-12（手元とテストは試験用のログイン）。手元の http では本物の LIFF が動かない（[docs/study/line.md](../../../docs/study/line.md) 5）。
- **Note**: `requestFriendship` は 2.28.0 から。`isApiAvailable("requestFriendship")` は文書の一覧にないが、SDK は受け付ける（未ログインなら false）。画面の大きさが Full のときだけ使える（ミニアプリは Full だけ）。

## R9. 参加者の道とパーマリンク

- **Decision**: `packages/contracts/src/core/participant-paths.ts` に、道を作る関数（`participantPaths.checkin(eventId)` など。値は `encodeURIComponent`）・TanStack Router の道の形（`PARTICIPANT_ROUTE_PATTERNS`。`/e/$eventId/checkin` など）・`miniAppPermalink(liffId, path)` を置く。パーマリンクは `https://miniapp.line.me/{LIFF ID}` に道（問い合わせ・`#` を含めてよい）をそのまま足す。LIFF ID の形（数字-英数字）と、道が `/` で始まること（`//` は不可）を確かめ、違えば投げる。
- **Rationale**: AD-14。エンドポイントの URL は源の直下にする（line.md 2.6）ので、「パーマリンク ＝ LIFF URL ＋（ページの URL − エンドポイントの URL）」は「LIFF URL ＋ 道」になる。
- **出典**: https://developers.line.biz/en/docs/line-mini-app/develop/permanent-links/ （“LIFF URL + (LINE MINI App URL - Endpoint URL) = Permanent Link”。例：`https://miniapp.line.me/123456-abcedfg` ＋ `https://example.com/shop?search=shoes#item10` − `https://example.com` → `https://miniapp.line.me/123456-abcedfg/shop?search=shoes#item10`。“You can use raw path to your page, query parameters, and hash fragments”。古い `https://liff.line.me/{liffId}` を開いてもミニアプリが開く）。
- **Note**: Open Question 1（未認証のミニアプリをパーマリンクから開けるか）の答えしだいで、`miniAppPermalink` の中だけを直す。

## R10. 日本時間の日付と「その日の終わり」【仮決め】

- **Decision**: `jst.ts` に `jstDate(instant)`（`YYYY-MM-DD`）と `endOfJstDate(instant)`（その日の翌日の日本時間 0時の時刻）を置く。日本は夏時間がないので、UTC に9時間を足して UTC の読み方で日付を出す（`Intl` とサーバーの時刻帯に頼らない）。引数は `Date` か時差つきの ISO 8601 の文字。読めない値は `RangeError`。「その日の終わり」は含まない側の境（`now < endOfJstDate(eventAt)` なら、その日のうち）。
- **Rationale**: Consistency Conventions「ID・時刻」・AD-5（招待の期限は交流会の日本時間の日付が終わるまで）。23:59:59.999 の形より、比べ方を間違えにくい。

## R11. 見た目の値のテストは、プロダクトの DESIGN.md と土台を合わせて読む

- **Decision**: `tokens.test.ts` は `_bmad-output/ux-kanaeru-reception/DESIGN.md` を読み、先頭の YAML の `inherits` があれば、その DESIGN.md（土台の `docs/design/DESIGN.md`）を先に読んで、プロダクトの値で上書きする（入れ子は欄ごとに合わせる）。プロダクトの `components` は値でないので見ない。フォーカスの輪（`shadow.focus`）は、合わせたあとの `primary`（墨）で比べる。
- **Rationale**: プロダクトの DESIGN.md は「書いていないことは土台のとおり」で、色の4つだけを持つ。そのまま読むと文字・余白などがなく、テストが壊れる。テンプレートの README（docs/design/README.md 2）とテストの注記が、プロダクトの DESIGN.md を作ったら読む先を替えるよう書いている。
- **Alternatives**: プロダクトの DESIGN.md に土台の値を全部写す。同じ値が2か所になるので選ばなかった。

## R12. E2E は API が画面を返す形で流す

- **Decision**: E2E は `vite preview` をやめ、API を `WEB_DIST_DIR=apps/web/dist` で1つだけ立てる（本番と同じ形）。画面の CSP は API（`platform/web`）だけが持ち、`vite.config.ts` の preview の CSP は消す（2か所に書くとずれるため。守りの見出しの残りと `host: "localhost"` は残す）。
- **Note**: 見本の領域がなくなったので、E2E の画面は「はじめの画面（今は見つからない画面）」と「見つからない画面」だけ。確かめの枠などの部品のふるまいは `packages/ui` の部品のテストが見る。領域が画面を足したら、その流れを E2E に足す。
