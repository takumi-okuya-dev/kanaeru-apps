# 取り決め：event の窓口とほかの領域が使う名前（event-001）

## 窓口（`/api/v1`。`operationId` は `event` で始める。どれもログイン必須）

| 動き | 道 | だれ | 入力 | 成功 | 主なエラー |
|---|---|---|---|---|---|
| GET | `/api/v1/events` | ログインした人 | — | 200 `{ events: EventView[] }`（主催者はすべて・受付係は自分の・ほかは空。日時の新しい順） | 401 |
| POST | `/api/v1/events` | 主催者 | `EventInput` | 201 `EventView` | 400・401・403 |
| GET | `/api/v1/events/{eventId}` | 主催者・その受付係 | — | 200 `EventView` | 401・403・404 |
| PUT | `/api/v1/events/{eventId}` | 主催者 | `EventInput` | 200 `EventView` | 400・401・403・404 |
| GET | `/api/v1/events/{eventId}/summary` | ログインした人 | — | 200 `EventSummary` | 401・404 |
| PUT | `/api/v1/events/{eventId}/survey` | 主催者 | `{ open: boolean }` | 200 `{ surveyOpen }` | 400・401・403・404 |
| GET | `/api/v1/events/{eventId}/staff-invite` | 主催者 | — | 200 `{ invite: StaffInviteView \| null }` | 401・403・404 |
| POST | `/api/v1/events/{eventId}/staff-invite` | 主催者 | — | 200 `StaffInviteView`（作る・作り直す。前の印は使えない） | 401・403・404 |
| GET | `/api/v1/events/{eventId}/staff` | 主催者 | — | 200 `{ staff: StaffMember[] }`（加えた順） | 401・403・404 |
| DELETE | `/api/v1/events/{eventId}/staff/{accountId}` | 主催者 | — | 204 | 401・403・404 |
| GET | `/api/v1/staff-invites/{inviteToken}` | ログインした人 | — | 200 `InvitePreview` | 401・404 `STAFF_INVITE_INVALID` |
| POST | `/api/v1/staff-invites/{inviteToken}/accept` | ログインした人 | — | 200 `{ eventId, role }` | 401・404 `STAFF_INVITE_INVALID`・410 `STAFF_INVITE_EXPIRED` |

## 形（`@workspace/contracts/event`）

| 名前 | 中身 |
|---|---|
| `EventInput` | `{ name, startsAt（時差つき ISO 8601）, venue, fee（0〜1,000,000 の整数）, googleFormUrl?（https・null）, lineGroupUrl?（https・null） }`（知らない欄は 400） |
| `EventView` | `{ id, name, startsAt, venue, fee, googleFormUrl, lineGroupUrl, surveyOpen, createdAt, updatedAt, myRole: "organizer" \| "staff" }` |
| `EventSummary` | `{ id, name, startsAt, venue, fee, surveyOpen, googleFormUrl, lineGroupUrl, openChatUrl }`（URL はなければ `null`。`openChatUrl` は設定 `OPEN_CHAT_URL`） |
| `StaffInviteView` | `{ token, createdAt, expiresAt }`（`expiresAt` は今の交流会の日時の日本時間の日付の終わり） |
| `InvitePreview` | `{ eventId, eventName, startsAt, expiresAt, expired, myRole: "organizer" \| "staff" \| null }` |
| `StaffMember` | `{ accountId, displayName, addedAt }` |

## エラー（`EVENT_ERRORS`）

| キー | code | 状態 | 文言 |
|---|---|---|---|
| `FORBIDDEN` | `FORBIDDEN` | 403 | この交流会の管理の画面は使えません。主催者に確かめてください。 |
| `NOT_FOUND` | `NOT_FOUND` | 404 | この交流会は見つかりません。URL が違うか、消された可能性があります。 |
| `STAFF_INVITE_INVALID` | `STAFF_INVITE_INVALID` | 404 | この招待のリンクは使えません。主催者に新しいリンクをもらってください。 |
| `STAFF_INVITE_EXPIRED` | `STAFF_INVITE_EXPIRED` | 410 | この招待のリンクは使えません。交流会の日が終わりました。主催者に新しいリンクをもらってください。 |

## API の入口（`apps/api/src/modules/event/index.ts`）

| 名前 | 形 | 使い方 |
|---|---|---|
| `getEventRole(db, config, eventId, account)` | `→ Promise<"organizer" \| "staff" \| null>` | 交流会がなければ `null` |
| `requireEventRole(deps, roles)` | `(deps: { db, config }, roles: readonly EventRole[]) => MiddlewareHandler` | `middleware: [requireSession(deps), requireEventRole(deps, ["organizer", "staff"])] as const`。道に `{eventId}` が要る。404・403 |
| `currentEventRole(c)` | `(c) => "organizer" \| "staff"` | `requireEventRole` のあとの処理で読む |
| `getEventSummary(db, config, eventId)` | `→ Promise<EventSummary \| null>` | survey が回答のたびに開閉を読む（AD-13）・reception が参加費を読む（AD-6） |
| `eventTable` | 表 | `.references(() => eventTable.id, { onDelete: "restrict" })` にだけ使う |
| `eventForbiddenResponse`・`eventNotFoundResponse` | `createRoute` の応答 | 403・404 の文書 |

## 画面の入口（`apps/web/src/features/event/index.ts`）

| 名前 | 何か |
|---|---|
| `EventAdminNav` | `<EventAdminNav eventId={id} role={role} />`。管理の画面どうしの行き来（参加者・合計／困りごと〈主催者〉／準備〈主催者〉）。道が登録されている項目だけ出す |
| `useEvent(eventId)` | `GET /api/v1/events/{eventId}`（自分の役目つき）の問い合わせ |
| `useEventSummary(eventId)` | 要約の問い合わせ |
| `EVENT_QUERY_KEYS` | 問い合わせの鍵（開閉を変えたあとの読み直しなど） |
| `formatEventDateTime`・`formatFee` | 日本時間の日時・「1,000円」 |

道の定数は `@workspace/contracts/event` の `ADMIN_ROUTE_PATTERNS`・`adminPaths`（research R9 の表）。
