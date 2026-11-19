# 取り決め：ほかの領域が使う土台の名前（core-001）

account・event・reception・survey の領域は、ここの名前を使い、同じものを自分で作らない。

## 設定（`apps/api/src/kernel/config.ts` の `Config`）

| 環境の変数 | `Config` の欄 | 形 | staging・production | local・test |
|---|---|---|---|---|
| `LINE_CHANNEL_IDS` | `lineChannelIds: string[]` | 数字のチャネル ID をカンマで並べる | 1つ以上要る | 空でよい |
| `ORGANIZER_LINE_USER_ID` | `organizerLineUserId: string \| undefined` | `U` ＋16進32文字 | 要る | なくてよい |
| `OPEN_CHAT_URL` | `openChatUrl: string \| undefined` | `https://` の URL | 任意 | 任意 |
| `WEB_DIST_DIR` | `webDistDir: string \| undefined`（絶対の道に直したもの） | 組み立てた画面のフォルダ | 要る | 任意（E2E は使う） |
| `VITE_LIFF_ID`（画面の組み立てだけ） | 画面の `__LIFF_ID__` | LIFF ID | 本番の組み立てで入れる | 空なら仮の LIFF |

領域の道は `deps`（`db`・`logger`・`features`）しか受け取らない。設定の値が要る領域（account の `lineChannelIds`・`organizerLineUserId`）は、組み立てが渡す形を account-001 で決める。

## エラー

| code | 状態 | 文言（`coreErrorMessage(code, now)`） | いつ |
|---|---|---|---|
| `DB_UNAVAILABLE` | 503 | 日本時間 0時〜8時：夜間（0時〜8時）は止まっています。8時からもう一度開いてください。／ほか：一時的につながりません。少し待ってから、もう一度開いてください。 | DB の層（Drizzle の命令・pg の接続）から来た、DB に届かないエラー（土台が読みかえる。領域は何もしなくてよい） |

（`UNAVAILABLE` は無くなった。）

- `kernel/pg-errors.ts`：`isDbUnavailable(error: unknown): boolean`
- `kernel/errors.ts`：`toAppError(error: unknown): AppError | undefined`（組み立ての `onError` だけが呼ぶ）

## 約束の土台（`@workspace/contracts/core`）

| 名前 | 形 |
|---|---|
| `participantPaths.checkin(eventId)`・`.survey(eventId)`・`.invite(inviteToken)` | `/e/{eventId}/checkin`・`/e/{eventId}/survey`・`/invite/{inviteToken}`（値は `encodeURIComponent`） |
| `PARTICIPANT_ROUTE_PATTERNS` | `{ checkin: "/e/$eventId/checkin", survey: "/e/$eventId/survey", invite: "/invite/$inviteToken" }`（TanStack Router の `createRoute` の `path`） |
| `MINI_APP_URL_BASE` | `"https://miniapp.line.me"` |
| `miniAppPermalink(liffId, path)` | `https://miniapp.line.me/{liffId}{path}`。形が違えば `RangeError` |
| `jstDate(instant)` | `"YYYY-MM-DD"`（日本時間） |
| `endOfJstDate(instant)` | `Date`（翌日の日本時間 0時。`now < endOfJstDate(x)` ならその日のうち） |
| `isNightStopWindow(now?)` | `boolean`（日本時間 0時〜8時の夜間の停止の時間帯なら true。8時ちょうどは false）。画面が問い合わせのくり返しを止めるかを決めるのに使う |
| `NIGHT_STOP_END_HOUR_JST` | `8` |
| `dbUnavailableMessage(now?)` | `DB_UNAVAILABLE` の文（夜間の停止の時間帯なら夜間の文、ほかは一時的な文） |
| `coreErrorMessage(code, now?)` | 土台の code の、その時刻に出す文（`DB_UNAVAILABLE` だけ時刻で変わる） |
| `DB_UNAVAILABLE_MESSAGES` | `{ nightStop, temporary }`（2つの文）。`CORE_ERROR_MESSAGES.DB_UNAVAILABLE` は時刻によらない `temporary`（窓口の文書の例など） |

## 画面の LIFF（`apps/web/src/lib/liff.ts`）

| 名前 | 形 |
|---|---|
| `initLiff(options?)` | `Promise<LiffClient>`。`main.tsx` がルーターより先に1度だけ呼ぶ。`options.withLoginOnExternalBrowser` を渡せる |
| `getLiff()` | `LiffClient`（`initLiff` の前に呼ぶと投げる） |
| `LiffClient` | `mode: "line" \| "fake"`・`isLoggedIn()`・`login(redirectUri?)`・`getIDToken(): string \| null`・`isInClient()`・`requestFriendship(): Promise<boolean>` |
| `createFakeLiff(state?)` | 仮の LIFF（`loggedIn`・`idToken`・`inClient` を変えられる。テスト用） |

## 画面のファイルと CSP（`apps/api/src/platform/web/`）

- `/api`・`/api/…` は API の CSP（`default-src 'none'`）。それ以外は画面の CSP（[research.md](../research.md) R7 の源）。
- 画面の道を足しても、API は直さない（`/assets/` の下でないファイルのない道は、`.` を含んでも `index.html`）。
