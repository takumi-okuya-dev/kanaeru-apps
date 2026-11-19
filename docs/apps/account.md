# アカウント（account）の地図

2026-11-19 作成（account-001。決めた理由は [specs/account/001-line-login/research.md](../../specs/account/001-line-login/research.md)）。2026-11-20 直した（core-005：退会の窓口・ログインの前でも今の利用者を読む `findSessionViewer`・画面の `signOut`・`withdrawAccount`・`useKnownAccount`）。

LINE の利用者のアカウントとセッションを持ち、LINE の ID トークンを API が確かめて自前のセッションを出す。ほかの領域は、今の利用者をここの1つの仕組みで受け取る（構成の決めごと AD-2・AD-3・AD-4・AD-5・AD-12）。

## 1. 表

| 表 | 列 | 決まり |
|---|---|---|
| `account` | `id`（uuid・`uuidv7()`）・`line_user_id`（text）・`display_name`（text・既定は空）・`created_at`（登録日）・`updated_at` | `line_user_id` は一意（`account_line_user_id_unique`）。表示名は LINE でログインするたびに確かめた `name` で上書き |
| `session` | `id`（uuid）・`token_hash`（text）・`account_id`（uuid）・`expires_at`・`created_at` | `token_hash` は札の SHA-256 で一意（札そのものは持たない）。`account_id` は `ON DELETE CASCADE`（`session_account_id_idx`）。期限は作ってから30日（延ばさない）。期限切れの行は、その人の次のログインで消す |

ほかの領域は `account.id` を外部キーで参照するだけ（`accountTable` を `.references()` にだけ使う）。本人のデータは `ON DELETE CASCADE`（AD-7）。

## 2. 窓口

| 動き | 道 | すること | 主なエラー |
|---|---|---|---|
| POST | `/api/v1/auth/line` | ID トークン（`{ idToken }` だけ）を LINE の verify で確かめ、アカウントを作るか探し、セッションのクッキーを出す（ブラウザの前のセッションは消す） | 400・401 `LINE_LOGIN_FAILED`・502 `LINE_UNREACHABLE` |
| POST | `/api/v1/auth/test-login` | 試験用のログイン（`{ lineUserId, displayName }`）。設定 `TEST_LOGIN_ENABLED` のときだけ道を登録する（切なら窓口の文書にも出ない） | 404（切）・400 |
| POST | `/api/v1/auth/logout` | セッションとクッキーを消す（204） | — |
| GET | `/api/v1/accounts/me` | 今の利用者（`id`・`displayName`・`isOrganizer`・`registeredAt`） | 401 `UNAUTHENTICATED` |
| DELETE | `/api/v1/accounts/me` | 退会（自分のアカウントを消す。本人のデータはすべての領域の CASCADE で消える。クッキーも消す。204）。ほかの人が書きこむ記録（RESTRICT の外部キー）を持っていれば消さない（AD-19） | 401・409 `ACCOUNT_OWNS_SHARED_RECORDS` |
| DELETE | `/api/v1/accounts/{accountId}` | アカウントを消す（主催者だけ。204） | 401・403 `FORBIDDEN`・404 |

- LINE の verify：ID トークンの `aud` が `LINE_CHANNEL_IDS` にあるときだけ、その値を `client_id` にして1度だけ呼ぶ（5秒で打ち切る。`line-verifier.ts`）。外への出口は土台の `deps.fetch`（テストでは差しかえ）。
- クッキー：`HttpOnly`・`SameSite=Lax`・`Path=/`・30日。画面の源（`WEB_URL`）が https なら `Secure` と名前 `__Host-kanaeru_session`、http（手元・E2E）なら `kanaeru_session`。
- 主催者：設定 `ORGANIZER_LINE_USER_ID` と LINE のユーザー ID が同じ人（表に印を持たない）。
- ID トークン・クッキー・札・表示名はログに出さない。

入力の形とエラーの文言は `packages/contracts/src/account/`。

## 3. ほかの領域が使うもの

API（`apps/api/src/modules/account/index.ts`）：

```ts
import { currentAccount, isOrganizer, requireSession, unauthenticatedResponse } from "../account/index.ts";

const route = createRoute({
  method: "get",
  path: "/api/v1/events",
  middleware: [requireSession(deps)] as const, // 道の deps をそのまま渡す
  responses: { 200: …, 401: unauthenticatedResponse },
});
// 処理の中で
const me = currentAccount(c); // { accountId, lineUserId }
if (isOrganizer(deps.config, me)) { … }
```

| 名前 | 何か |
|---|---|
| `requireSession(deps)` | 未ログインなら 401 `UNAUTHENTICATED`。`createRoute` の `middleware` に付ける（`app.use("/api/v1/…/*")` は、同じ道の頭のほかの領域の道にも効くので使わない） |
| `currentAccount(c)` | 今の利用者（`accountId`・`lineUserId`）。`requireSession` のあとだけ |
| `isOrganizer(deps.config, account)`・`requireOrganizer(deps)` | 主催者か・主催者だけ通す（403） |
| `findSessionViewer(deps, c)` | ログインしていれば今の利用者、していなければ `null`（401 にしない。suite の見えるアプリの一覧と `requireApp` が使う） |
| `findAccountById(db, id)`・`deleteAccount(db, id)` | アカウントを読む（表示名の初期値など）・消す（FR-16） |
| `accountTable` | 外部キーのためだけ |
| `unauthenticatedResponse`・`forbiddenResponse` | `createRoute` の 401・403 の応答 |

テスト（`apps/api/test/helpers/account.ts`）：`loginAs(app, { lineUserId?, displayName? })` → `{ cookie, account }`、`withCookie(cookie, init?)`、主催者は `testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST })` で組み立てて `loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST })`。

画面（`apps/web/src/features/account/index.ts`）：

| 名前 | 何か |
|---|---|
| `SessionGate` | ログインが要るページを包む。読みこみ中・未ログイン（LINE の中は自動でログインし直し、だめなら「LINEでログインし直す」。手元は手元のログインへ）・夜間の停止（503 `DB_UNAVAILABLE` で日本時間 0時〜8時のとき）・失敗を出す |
| `useSession()` | `loading`・`authenticated`（`account`）・`unauthenticated`・`error`（`retry`）。自動では読み直さない（ID トークンを送るのは1度だけ）。ほかの API の 401 で読み直すのは30秒に1度まで |
| `SESSION_QUERY_KEY` | 今の利用者の問い合わせの鍵 |
| `useKnownAccount()` | 今わかっている利用者（セッションの問い合わせを新しく始めない。未ログイン・読む前は `null`） |
| `signOut(queryClient)`・`withdrawAccount(queryClient)` | ログアウト・退会して、ログアウトした状態にする（ほかの読みこみの値も消す）。設定 › アカウント（suite の画面）が使う |
| `requestFriendship()` | 公式 LINE の友だち追加の小さな画面（友だち追加はチャネルの設定で勧めるので、ふだんは使わない） |

E2E は、`/dev/login` で試験用のログインをするか、`page.request.post("/api/v1/auth/test-login", { data: { lineUserId, displayName } })` でクッキーを作ってから画面を開く。

## 4. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| `/dev/login` | 手元のログイン（外枠のナビなし。`staticData: { layout: "bare" }`） | LIFF ID のない画面だけ。LINE のユーザー ID と表示名で試験用のログイン。ログイン済みなら「ログインしています：{表示名}」とログアウト（ほかの領域の読みこみの値も消す）。`?redirect=/…`（同じ源の道だけ。`//`・`\` を含むものは使わない）があれば、ログインのあとに戻る |

## 5. 置き場所

| 所 | ファイル |
|---|---|
| 約束 | `packages/contracts/src/account/`（`account.ts`・`errors.ts`・`index.ts`） |
| API | `apps/api/src/modules/account/`（`schema.ts`・`repository.ts`・`line-verifier.ts`・`session.ts`・`routes.ts`・`index.ts`・テスト） |
| DB の変更 | `apps/api/drizzle/0002_account.sql` |
| 画面 | `apps/web/src/features/account/`（`api.ts`・`session.ts`・`SessionGate.tsx`・`DevLoginPage.tsx`・`DevLoginRoute.tsx`・`friendship.ts`・`routes.ts`・`index.ts`） |
| テストの手伝い | `apps/api/test/helpers/account.ts` |
| 通しのテスト | `e2e/tests/account.spec.ts` |
