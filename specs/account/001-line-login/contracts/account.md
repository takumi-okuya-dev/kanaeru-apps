# 取り決め：account の窓口とほかの領域が使う名前（account-001）

## 窓口（`/api/v1`。`operationId` は `account` で始める）

| 動き | 道 | 入力 | 成功 | 主なエラー |
|---|---|---|---|---|
| POST | `/api/v1/auth/line` | `{ idToken }`（知らない欄は 400） | 200 `CurrentAccountView`・`Set-Cookie` | 400 `INVALID_INPUT`・401 `LINE_LOGIN_FAILED`・502 `LINE_UNREACHABLE`・503 `DB_UNAVAILABLE` |
| POST | `/api/v1/auth/test-login` | `{ lineUserId, displayName }` | 200 `CurrentAccountView`・`Set-Cookie` | 404（`TEST_LOGIN_ENABLED` が切）・400 |
| POST | `/api/v1/auth/logout` | なし | 204・クッキーを消す（セッションがなくても 204） | — |
| GET | `/api/v1/accounts/me` | クッキー | 200 `CurrentAccountView` | 401 `UNAUTHENTICATED` |
| DELETE | `/api/v1/accounts/{accountId}` | クッキー（主催者） | 204 | 401・403 `FORBIDDEN`・404 |

`CurrentAccountView`：`{ id: uuid, displayName: string, isOrganizer: boolean, registeredAt: ISO 8601 }`

## エラー（`@workspace/contracts/account` の `ACCOUNT_ERRORS`）

| code | 状態 | 文言 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | ログインしていません。LINEでログインし直してください。 |
| `LINE_LOGIN_FAILED` | 401 | LINEのログインを確かめられませんでした。LINEで開き直してください。 |
| `LINE_UNREACHABLE` | 502 | LINEにつながりませんでした。電波の良い所で、もう一度試してください。 |

## API の入口（`apps/api/src/modules/account/index.ts`）

| 名前 | 形 | 使い方 |
|---|---|---|
| `requireSession(deps)` | `(deps: { db }) => MiddlewareHandler` | 道の `createRoute({ middleware: [requireSession(deps)] as const })`。未ログインは 401 `UNAUTHENTICATED` |
| `currentAccount(c)` | `(c: Context) => { accountId: string; lineUserId: string }` | `requireSession` のあとの処理で読む |
| `isOrganizer(config, account)` | `(config: { organizerLineUserId }, account: { lineUserId }) => boolean` | `config` は道の `deps.config` |
| `requireOrganizer(deps)` | `(deps: { config }) => MiddlewareHandler` | `requireSession` のあとに付ける。主催者でなければ 403 |
| `findAccountById(db, id)` | `Promise<{ id, lineUserId, displayName, registeredAt: Date } \| null>` | 表示名の初期値など |
| `deleteAccount(db, id)` | `Promise<boolean>` | FR-16（セッションは CASCADE） |
| `accountTable` | Drizzle の表 | `.references(() => accountTable.id, { onDelete: "cascade" })` にだけ使う（AD-3） |
| `unauthenticatedResponse`・`forbiddenResponse` | OpenAPI の応答の定義 | `createRoute` の `responses` の 401・403 |
| `SessionAccount` | 型 | `currentAccount` の戻り値 |

## 土台の変更（`apps/api/src/kernel/http.ts` の `DomainRouteDeps`）

| 欄 | 形 | 何か |
|---|---|---|
| `config` | `DomainConfig`（`webUrl`・`lineChannelIds`・`organizerLineUserId`・`openChatUrl`・`testLoginEnabled`） | 領域が読んでよい秘密でない設定 |
| `fetch` | `typeof fetch` | 外のサービスへの出口（テストの `buildApp` は既定で投げる出口） |

設定 `TEST_LOGIN_ENABLED`（`Config.testLoginEnabled`）：既定 `false`。staging・production で `true` なら起動しない。

## テストの手伝い（`apps/api/test/helpers/`）

| 名前 | 形 |
|---|---|
| `loginAs(app, { lineUserId?, displayName? })` | 試験用のログインでセッションを作り、`{ cookie, account }` を返す（`cookie` は `Cookie` の見出しの値） |
| `withCookie(cookie, init?)` | 要求の中身に `Cookie` と画面の源の `Origin` を足す |
| `ORGANIZER_LINE_USER_ID_FOR_TEST` | テストの主催者の LINE のユーザー ID（`testConfig({ organizerLineUserId })` に渡す） |

## 画面の入口（`apps/web/src/features/account/index.ts`）

| 名前 | 形 |
|---|---|
| `feature` | `/dev/login`（手元のログイン。LIFF ID のない画面だけで使える） |
| `useSession()` | `{ status: "loading" } \| { status: "authenticated"; account: CurrentAccountView } \| { status: "unauthenticated" } \| { status: "error"; error; retry }` |
| `SessionGate` | `props.children` をログイン済みのときだけ出す。読みこみ中・未ログイン（「LINEでログインし直す」・手元のログインへ）・失敗（夜間の停止を含む）の状態を出す |
| `requestFriendship()` | `Promise<boolean>`（`getLiff().requestFriendship()`） |
| `SESSION_QUERY_KEY` | `["account", "session"]`（ログインしたあとに読み直させるとき） |

## 共通の画面の変更（`apps/web/src/lib/api.ts`）

- `onUnauthenticated(listener): () => void`：`request()` が 401 を受けたら呼ばれる（account が使う。ほかの領域は使わなくてよい）。
