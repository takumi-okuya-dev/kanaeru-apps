# Research: アカウント・LINE ログイン・今の利用者（account-001）

2026-11-19 作成。開発者が不在のため、AI が仮に決めたもの（【仮決め】）を含む。仮決めは、開発者が見直して変えてよい。

## R1. 領域に設定と外への出口を渡す形（共通の変更）【仮決め】

- **Decision**: 土台の `DomainRouteDeps`（`kernel/http.ts`）に2つ足す。
  - `config: DomainConfig`：設定のうち、領域が読んでよい**秘密でない**値だけ（`webUrl`・`lineChannelIds`・`organizerLineUserId`・`openChatUrl`・`testLoginEnabled`）。`Pick<Config, …>` で作り、DB の接続先などは渡さない。`appEnv` も渡さない（環境の名前で分岐させないため。coding.md 2）。
  - `fetch: typeof fetch`：外のサービスへの HTTP の出口。組み立てが `AppDeps.fetch ?? globalThis.fetch` を渡す。テストの `buildApp` は、既定で「呼ぶと投げる」出口を渡す（テストがネットワークに出ない）。
- **Rationale**: account は `LINE_CHANNEL_IDS`・`ORGANIZER_LINE_USER_ID`・クッキーの `Secure` を決める画面の源・試験用のログインの印が要る。どれも account だけの名前の欄を土台に足すより、「領域が読んでよい設定」「外への出口」という一般の形にすれば、event（オープンチャットの URL など）も同じ形で使え、領域を足すたびに土台を直さなくてよい。LINE の確かめを差しかえる口を `fetch` にしたのは、組み立てに account の型を持ちこまないため（account の中では `LineIdTokenVerifier` の形で包む）。
- **Alternatives**: (a) `DomainRouteDeps` に `lineVerifier` を足す：土台が account の型を知ることになる。(b) 設定をまるごと渡す：DB の接続先（秘密）が領域に渡る。(c) 全域の `fetch` をテストで差しかえる（`vi.stubGlobal`）：差しかえ忘れで本物の LINE に出うる。
- **共通の変更の範囲**（[並行開発の決まり](../../../docs/rules/parallel-development.md) 3-3。このブランチでは別のコミットに分け、要れば共通の PR に切り出せる形にした）：`kernel/http.ts`（型2つ）・`kernel/config.ts`（`TEST_LOGIN_ENABLED`）・`app.ts`（`routeDeps` に2つ渡す・`AppDeps.fetch`）・`test/helpers/app.ts`（既定の出口）・`apps/web/src/lib/api.ts`（401 の知らせ。R9）。

## R2. ID トークンの確かめ方（`aud` で client_id を選ぶ）

- **Decision**: ID トークンの中身（JWT の2つ目の部分）を**確かめずに読むのは `aud` を選ぶためだけ**にし、`aud` が `LINE_CHANNEL_IDS` にあれば、その値を `client_id` にして `POST https://api.line.me/oauth2/v2.1/verify`（`application/x-www-form-urlencoded`・`id_token`・`client_id`）を1度だけ呼ぶ。`aud` がない・並びにない・形が違う（JWT でない）ときは、LINE に問い合わせずに 401 `LINE_LOGIN_FAILED`。
  - 200 の答えは zod で読み、`sub`（文字）と `aud`（送った `client_id` と同じ）を確かめる。`name` は任意。
  - 400（`Invalid IdToken.`・`IdToken expired.`・`Invalid IdToken Audience.` など）→ 401 `LINE_LOGIN_FAILED`。
  - 時間切れ（5秒。`AbortSignal.timeout`）・通信の誤り・5xx・形の違う答え → 502 `LINE_UNREACHABLE`。
  - ID トークン・答えの本文はログに出さない（失敗の種類と状態の番号だけを warn で出す）。
- **Rationale**: AD-4（`client_id` の並びで持つ）。並びの数だけ順に問い合わせると、失敗のたびに LINE への要求が増え、時間の上限も延びる。署名・`iss`・`exp`・`aud` は verify が確かめるので、手元で読むのは選ぶためだけで足りる（信じるのは verify の答え）。
- **出典**: https://developers.line.biz/en/docs/line-login/verify-id-token/ ・https://developers.line.biz/en/reference/line-login/#verify-id-token （答えの `iss`・`sub`・`aud`・`exp`・`iat`・`name`・`picture`。誤りは 400 と `error`・`error_description`）。

## R3. 試験用のログインは設定 `TEST_LOGIN_ENABLED` で入・切する【仮決め】

- **Decision**: 設定 `TEST_LOGIN_ENABLED`（`"true"`／`"false"`、既定は `false`）。staging・production で `true` なら起動しない（`SAMPLE_DATA_ENABLED` と同じ形）。`.env.example`（手元）・`apps/api/vitest.config.ts`・`e2e/env.ts` は `true`。窓口は常に道として登録し（画面の型のため）、切のときは 404 `NOT_FOUND` を返す。
- **Rationale**: AD-12 は「`APP_ENV` が local・test のときだけ使える」。coding.md 2 は環境の名前でコードを分けず設定の値で分ける決まりなので、テンプレートの形（印の設定＋本番に近い環境で入なら起動しない）にした。結果は AD-12 と同じ（staging・production では使えない）。
- **Alternatives**: `appEnv` を見て道を足すかを決める：決まりに反する。切のとき道を登録しない：画面の型（`ModuleRoutes["account"]`）から窓口が消え、手元のログインの画面が型で呼べない。

## R4. セッションの札とクッキー【仮決め】

- **Decision**:
  - 札は `crypto.randomBytes(32)` の base64url（43文字）。クッキーに入れるのは札だけ。DB の `session.token_hash` には札の SHA-256（16進64文字）だけを持つ（一意）。主キーは決まりどおり uuid（`uuidv7()`）。
  - クッキー：名前は画面の源（設定 `WEB_URL`）が https なら `__Host-kanaeru_session`、http（手元・E2E）なら `kanaeru_session`。`HttpOnly`・`SameSite=Lax`・`Path=/`・`Max-Age` 30日、https なら `Secure`（`__Host-` は `Secure` と `Path=/` とドメインなしを要るので https のときだけ）。
- **Rationale**: 構成（Constitution の認証・AD-4）。DB のバックアップや読み出しが漏れても、札がなければなりすませない。札は 256 ビットの乱数なので、遅い hash（bcrypt など）は要らず、SHA-256 で足りる（引くときに一意の索引で1回で探せる）。`Secure` を環境の名前でなく画面の源で決めるのは、HSTS と同じ形（app.ts）。
- **Alternatives**: 札をそのまま主キーに持つ：DB が漏れるとそのまま使える。署名つきのクッキー（状態を持たない）：ログアウトと消したアカウントのセッションを即座に止められない（AD-5 の「要求のたびに引く」に合わない）。

## R5. セッションの期限は延ばさない【仮決め】

- **Decision**: 作ってから30日で切れ、使っても延ばさない。期限の切れた行は、その人が次にログインしたときに消す（`account_id` が同じで `expires_at < now()` の行）。定期の掃除の仕事は作らない。
- **Rationale**: AD-4（30日）。LINE の中では、切れても自動でログインし直せる（R9）ので、延ばす処理（書きこみ）を要求のたびに足さない。定期の仕事は Cloud Scheduler などを増やすので作らない（Constitution V）。行が残っても、引くときに期限で弾く。

## R6. 表示名はログインのたびに LINE の名前で上書きする【仮決め】

- **Decision**: LINE でログインするたびに、確かめた答えの `name` があれば `display_name` を上書きする（`INSERT … ON CONFLICT (line_user_id) DO UPDATE`）。`name` がなければ、作るときは空の文字、あるときは変えない。試験用のログインは、渡された表示名で同じように上書きする。
- **Rationale**: 表示名はチェックインの名前の初期値（FR-4・AD-6）。LINE の名前が変わったら新しい方が自然。名前は確かめた ID トークンの中身だけを使い、画面から受け取らない（Constitution II）。チェックインの名前は reception が写して持つので、過去の名簿は変わらない（AD-6）。

## R7. 今の利用者の受け取り方（API）

- **Decision**:
  - `requireSession(deps)`：Hono の middleware を作る（`deps` は `{ db }` を持つもの。ふつうは道の `deps` をそのまま渡す）。クッキーの札の SHA-256 で `session` と `account` を1つの命令で引き、期限内なら文脈に今の利用者（`{ accountId, lineUserId }`）を置く。なければ 401 `UNAUTHENTICATED`。
  - `currentAccount(c)`：文脈から今の利用者を返す。`requireSession` を通していなければ投げる（作りの誤りなので 500）。
  - 道に付けるのは `createRoute({ …, middleware: [requireSession(deps)] as const })` の形を勧める。`app.use("/api/v1/…/*", …)` は、組み立てが領域の道を1つの木に足すため、同じ道の頭を持つほかの領域の道にも効く（reception の `/api/v1/events/{eventId}/checkins` に event の `use` が効くなど）。
  - `requireOrganizer(deps)`：`requireSession` のあとに付け、主催者でなければ 403 `FORBIDDEN`。`isOrganizer(config, account)` は設定の主催者の LINE のユーザー ID と比べるだけ（設定がなければ false）。
- **Rationale**: AD-12・AD-5（要求のたびに引く。セッションに権限を写さない）。文脈の値の名前（Hono の `ContextVariableMap`）を全域で広げると、ほかの領域が `c.var` を直接読めてしまうので、account の中の名前で置き、読むのは `currentAccount` だけにした。

## R8. アカウントを消す

- **Decision**: `deleteAccount(db, id)`（消したら true）と、主催者だけの `DELETE /api/v1/accounts/{accountId}`（204・ない ID は 404・主催者でなければ 403）。セッションは `ON DELETE CASCADE` で消える。ほかの表（受付係・チェックイン）は、その表を作る領域が `account_id` に CASCADE を付ける（AD-7）。主催者が自分を消すことは止めない。
- **Rationale**: FR-16 の画面と流れ（誰を選ぶか）は event・reception の画面で作る（EXPERIENCE A5）。account は関数と窓口だけを先に出す。

## R9. 画面のログインの始め方と 401 のときのログインし直し【仮決め】

- **Decision**:
  - `useSession()`（TanStack Query の `["account", "session"]`）が `GET /api/v1/accounts/me` を読む。401 で、LIFF がログイン済みで ID トークンがあり、まだ自動で試していなければ、`POST /api/v1/auth/line` に `getIDToken()` の生の値を送り、もう一度 `me` を読む。自動で試すのは、ページを開いてから（または前に成功してから）1度だけ。
  - ほかの API の 401：共通の `lib/api.ts` の `request()` が 401 を受けたら知らせる（`onUnauthenticated(listener)`）。account は、ログイン済みと思っているときだけセッションを読み直し、読み直してログインできていれば、ほかの読みこみも読み直す。
  - 自動でだめなとき：`SessionGate` が「LINEでログインし直してください」の見出しと「LINEでログインし直す」のボタンを出す。LINE の中は開き直す（`location.reload()`。LIFF の init でログインが済む）、外のブラウザは `liff.login()`（同じ道に戻る）。外のブラウザで LINE に未ログインのときも、自動で LINE のログインへ移さずボタンを出す（構成 Open Questions 3 が未確認で、移しつづける恐れを避ける）。
  - LIFF ID がない（手元・E2E）とき：「手元のログインへ」のリンク（`/dev/login?redirect=今の道`）。
  - `initLiff()` は組み立て（`main.tsx`）のまま。account は `getLiff()` を使う（`liff.init()` を書かない）。
- **Rationale**: AD-4・AD-12・EXPERIENCE の未ログインの状態。1度だけにして、LINE が ID トークンを断りつづけるときに要求をくり返さない。組み立て（`main.tsx`・`router.tsx`）を直さずに、ログインを使う画面（`SessionGate` の中）だけで始まる。
- **Note**: AD-4 は「ID トークンを送ってセッションを作る処理は `lib/liff.ts` に1つ」とも書くが、`lib` は API の account の道の型を持たず、401 のときのやり直しも account の状態に結びつくので、送る処理は account の画面の1か所（`features/account/session.ts`）に置いた。`liff.init()` と ID トークンを取り出すのは `lib/liff.ts` のまま（どちらも1か所）。

## R10. 友だち追加（FR-6）

- **Decision**: コードでは案内を出さない。ミニアプリのチャネルの「Add friend option」（On (normal)）と「Default LINE Official Account」で勧める（docs/study/line.md 4）。あとで reception の済んだ画面などで要るときのため、`features/account` から `requestFriendship()`（`getLiff().requestFriendship()` を呼ぶだけ）を出す。
- **Rationale**: PRD FR-6・B4（同意の画面で勧める。チェックインの画面に重ねない）。

## R11. DB の変更

- **Decision**: `account` と `session` を1つの DB の変更で足す（`pnpm db:generate --name account`）。表を足すだけなので1回でよい（coding.md 3）。core-001 の R1 の注のとおり、これが最初の `schema.ts` なので `db:generate` が使えるようになる。
- **索引**：`account_line_user_id_unique`・`session_token_hash_unique`・`session_account_id_idx`（消すときと、期限切れの掃除の引き）。
