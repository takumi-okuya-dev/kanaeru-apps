# 交流会（event）の地図

2026-11-19 作成（event-001。決めた理由は [specs/event/001-events/research.md](../../specs/event/001-events/research.md)）。

交流会・受付係・招待のリンク・アンケートの開閉を持ち、交流会ごとの権限（主催者・受付係）と、参加者に見せてよい交流会の要約を、ほかの領域に1つの仕組みで出す（構成の決めごと AD-3・AD-5・AD-7・AD-13・AD-14）。

## 1. 表

| 表 | 列 | 決まり |
|---|---|---|
| `event` | `id`・`name`・`starts_at`（始まりの日時）・`venue`・`fee`（円の整数）・`google_form_url`（任意）・`line_group_url`（任意）・`survey_open`（既定 false）・`created_at`・`updated_at` | `fee >= 0`（`event_fee_check`）。索引 `event_starts_at_idx`。消さない（この版は消す機能がない） |
| `event_staff` | `id`・`event_id`・`account_id`・`created_at`（受付係になった時刻） | 組は一意（`event_staff_event_id_account_id_unique`）。`event_id` は `RESTRICT`、`account_id` は `ON DELETE CASCADE`（`event_staff_account_id_idx`） |
| `staff_invite` | `id`・`event_id`・`token`・`created_at` | 交流会ごとに1行（`staff_invite_event_id_unique`）。`token` は 32 バイトの base64url で一意。作り直すと同じ行の印と時刻が替わる。期限は列に持たず、受けるときに `endOfJstDate(starts_at)` で決める |

ほかの領域は `event.id` を外部キーで参照するだけ（`eventTable` を `.references(() => eventTable.id, { onDelete: "restrict" })` にだけ使う。AD-7）。

## 2. 窓口（どれもログイン必須）

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `/api/v1/events` | ログインした人 | 一覧（主催者はすべて・受付係は自分の交流会・ほかは空。日時の新しい順。行ごとに `myRole`） |
| POST | `/api/v1/events` | 主催者 | 作る（201） |
| GET | `/api/v1/events/{eventId}` | 主催者・その受付係 | 交流会（`myRole` つき） |
| PUT | `/api/v1/events/{eventId}` | 主催者 | 直す |
| GET | `/api/v1/events/{eventId}/summary` | ログインした人 | 要約（名前・日時・会場・参加費・開いているか・GoogleフォームのURL・LINEグループの招待リンク・オープンチャットの URL） |
| PUT | `/api/v1/events/{eventId}/survey` | 主催者 | アンケートを開く・閉じる（`{ open }`） |
| GET・POST | `/api/v1/events/{eventId}/staff-invite` | 主催者 | 今の招待のリンクを読む（なければ `null`）・作る／作り直す |
| GET | `/api/v1/events/{eventId}/staff` | 主催者 | 受付係の一覧（表示名は account の `findAccountById`） |
| DELETE | `/api/v1/events/{eventId}/staff/{accountId}` | 主催者 | 受付係を外す（204） |
| GET | `/api/v1/staff-invites/{inviteToken}` | ログインした人 | 招待の中身（交流会の名前・日時・期限・期限切れか・自分の役目） |
| POST | `/api/v1/staff-invites/{inviteToken}/accept` | ログインした人 | 受けて受付係になる（すでに主催者・受付係なら何もしない）。知らない印は 404 `STAFF_INVITE_INVALID`、期限切れは 410 `STAFF_INVITE_EXPIRED` |

- 権限の誤りは 403（code `FORBIDDEN`・「この交流会の管理の画面は使えません。…」）、ない交流会・形の違う ID は 404（code `NOT_FOUND`）。
- 招待の印はログに出さない（要求の1行は道の形 `:inviteToken` だけ）。
- 入力の形・エラーの文言・役目・管理の画面の道は `packages/contracts/src/event/`。

## 3. ほかの領域が使うもの

API（`apps/api/src/modules/event/index.ts`）：

```ts
import { requireSession, unauthenticatedResponse } from "../account/index.ts";
import {
  currentEventRole,
  eventForbiddenResponse,
  eventNotFoundResponse,
  getEventSummary,
  requireEventRole,
} from "../event/index.ts";

const route = createRoute({
  method: "get",
  path: "/api/v1/events/{eventId}/checkins",
  middleware: [requireSession(deps), requireEventRole(deps, ["organizer", "staff"])] as const,
  request: { params: z.object({ eventId: uuidParam("eventId", "交流会の ID") }) },
  responses: { 200: …, 401: unauthenticatedResponse, 403: eventForbiddenResponse, 404: eventNotFoundResponse },
});
// 処理の中で
const role = currentEventRole(c); // "organizer" | "staff"
const summary = await getEventSummary(deps.db, deps.config, eventId); // 参加費・開いているか（なければ null）
```

| 名前 | 何か |
|---|---|
| `requireEventRole(deps, roles)` | `requireSession` のあとに付ける。道の `{eventId}` を読み、形の違う ID・ない交流会は 404、役目が `roles` になければ 403。要求のたびに DB を引く |
| `currentEventRole(c)` | `requireEventRole` が通した役目 |
| `getEventRole(db, config, eventId, account)` | `"organizer"`・`"staff"`・`null`（交流会がなくても `null`）。`account` は `currentAccount(c)` |
| `getEventSummary(db, config, eventId)` | 要約（`EventSummary`）か `null`。survey は回答のたびに開閉を読む（AD-13）、reception は参加費を読む（AD-6） |
| `eventTable` | 外部キーのためだけ |
| `eventForbiddenResponse`・`eventNotFoundResponse` | `createRoute` の 403・404 の応答 |

約束（`@workspace/contracts/event`）：`EventSummary`・`EventView`・`EventRole`・`EVENT_ERRORS`、管理の画面の道 `ADMIN_ROUTE_PATTERNS`（path の形）と `adminPaths`（値を入れた道）：

| 名前 | 道 | 持ち主 |
|---|---|---|
| `eventList` | `/admin/events` | event（A1） |
| `eventNew`・`eventEdit` | `/admin/events/new`・`/admin/events/$eventId/edit` | event（A2） |
| `eventSetup`・`eventQrPrint` | `/admin/events/$eventId/setup`・`…/setup/qr/$kind` | event（A4・印刷） |
| `eventReception` | `/admin/events/$eventId` | reception（A3 の参加者・合計） |
| `eventConcerns` | `/admin/events/$eventId/concerns` | survey（A3 の困りごと） |
| `eventData` | `/admin/events/$eventId/data` | reception（A5） |

画面（`apps/web/src/features/event/index.ts`）：

| 名前 | 何か |
|---|---|
| `EventAdminNav` | `<EventAdminNav eventId={id} role={event.myRole} />`。「参加者・合計」（受付係も）・「困りごと」（主催者）・「準備」（主催者）。**道が道の木に登録されている項目だけ**出す（reception・survey が `ADMIN_ROUTE_PATTERNS` の道を足すと自然に出る）。項目が1つ以下なら何も出さない |
| `EventAccessGate` | `<EventAccessGate eventId={id} roles={["organizer", "staff"]}>{(event) => …}</EventAccessGate>`。交流会を読み、読みこみ中・403（「この交流会の一覧画面は使えません」）・404・夜間の停止・役目が合わない（「この画面は主催者だけが使えます」）を出す。`SessionGate` の中に置く |
| `useEvent(eventId)`・`useEventSummary(eventId)`・`EVENT_QUERY_KEYS` | 交流会（`myRole` つき）と要約の問い合わせ・鍵 |
| `formatEventDateTime`・`formatJstDate`・`formatFee` | 日本時間の日時（2026年11月25日（水）19:00）・参加費（1,000円） |
| `InternalLink` | 道の木にまだない道（ほかの領域の画面）へのリンク |

テスト：API は `apps/api/test/helpers/event.ts` の `createEvent(app, organizerCookie, input?)`・`makeStaff(app, organizerCookie, eventId)`（招待のリンクで受付係を作る）・`call(app, cookie, path, method?, body?)`。E2E の主催者は `e2e/env.ts` の `E2E_ORGANIZER_LINE_USER_ID`。

## 4. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| `/admin/events` | A1 交流会の一覧 | 主催者はすべて、受付係は自分の交流会だけ。主催者には「交流会を追加」と行ごとの「準備」「直す」。名前は、その役目の最初の管理の画面へのリンク（なければ文字だけ）。ナビの「交流会」・はじめの画面（`/`）から来る |
| `/admin/events/new`・`/admin/events/$eventId/edit` | A2 作成・編集（主催者だけ） | 名前・日付と時刻（日本時間）・会場・参加費・GoogleフォームのURL（任意）・LINEグループの招待リンク（任意）。直すときは「参加費を直しても、すでにあるチェックインの金額は変わりません」。作ったら準備へ、直したら一覧へ |
| `/admin/events/$eventId/setup` | A4 準備（主催者だけ） | 受付QR・アンケートQR（並べる。中身の URL も出す）と印刷の画面への入口・アンケートの開閉・招待のリンク（写す・作り直す〈確かめ〉・期限）・受付係の一覧（外す〈確かめ〉） |
| `/admin/events/$eventId/setup/qr/$kind` | QR の印刷（主催者だけ） | 「受付QR」「アンケートQR」の見出し・交流会の名前・大きな QR。「印刷する」。印刷では外枠と操作を隠す（`print.css`） |
| `/invite/$inviteToken` | P3 受付係の招待 | 交流会の名前と「受ける」。受けたら一覧画面（なければ交流会の一覧）へ。すでに受付係・主催者ならそのまま移る。使えないリンクは「この招待のリンクは使えません。主催者に新しいリンクをもらってください」 |

- QR の中身は `miniAppPermalink(LIFF ID, participantPaths.checkin|survey(eventId))`。LIFF ID のない手元・E2E だけ、画面の源＋道（画面にその旨を書く）。

## 5. 置き場所

| 所 | ファイル |
|---|---|
| 約束 | `packages/contracts/src/event/`（`event.ts`・`roles.ts`・`admin-paths.ts`・`errors.ts`・`index.ts`） |
| API | `apps/api/src/modules/event/`（`schema.ts`・`repository.ts`・`access.ts`・`summary.ts`・`ids.ts`・`routes.ts`・`index.ts`・テスト） |
| DB の変更 | `apps/api/drizzle/0003_event.sql` |
| 画面 | `apps/web/src/features/event/`（`api.ts`・`queries.ts`・`format.ts`・`links.ts`・`admin-tabs.ts`・`navigation.tsx`・`EventAdminNav.tsx`・`EventAccessGate.tsx`・`QrCode.tsx`・`EventListPage.tsx`・`EventFormPage.tsx`・`EventSetupPage.tsx`・`QrPrintPage.tsx`・`print.css`・`InviteAcceptPage.tsx`・`routes.ts`・`index.ts`） |
| テストの手伝い | `apps/api/test/helpers/event.ts` |
| 通しのテスト | `e2e/tests/event.spec.ts` |
