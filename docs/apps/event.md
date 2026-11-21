# 交流会（event）の地図

2026-11-19 作成（event-001。決めた理由は [specs/event/001-events/research.md](../../specs/event/001-events/research.md)）。2026-11-19 直した（reception-002：交流会ごとの割引。理由は [specs/reception/002-discounts/research.md](../../specs/reception/002-discounts/research.md)）。2026-11-20 直した（event-002：交流会の持ち主・組織に入れる・主催者の決め方〈持ち主と組織の管理者・編集者〉・部員・退会の段。理由は [specs/event/002-owner-organization/research.md](../../specs/event/002-owner-organization/research.md)）。2026-11-20 直した（booking-001：持ち主と個人の交流会を booking に出す関数・準備の画面の差しこみの場所）。2026-11-20 直した（booking-002：入れた組織を booking に出す関数）。

交流会・持ち主・組織に入れる・割引・受付係・招待のリンク・アンケートの開閉を持ち、交流会ごとの権限（主催者・受付係・部員）と、参加者に見せてよい交流会の要約を、ほかの領域に1つの仕組みで出す（構成の決めごと AD-3・AD-5・AD-7・AD-13・AD-14・AD-19・AD-23）。

役目は `access.ts` の `resolveEventAccess` の1か所で、要求のたびに決める（セッションに写さない）：

| 役目 | だれ |
|---|---|
| 主催者（`organizer`） | 交流会の持ち主（作った人）と、交流会を入れた組織の管理者・編集者（役割は suite の `findMembership` から引く） |
| 受付係（`staff`） | `event_staff`（招待のリンクで受けた人。組織と関係ない）。主催者で受付係でもある人は主催者 |
| 部員（`member`） | 交流会を入れた組織のメンバー。今は管理の画面と窓口を使えない（403。予約〈booking〉が使う） |

運営者（設定 `ORGANIZER_LINE_USER_ID`）は交流会の権限を持たない。持ち主のない今の交流会（前の版で運営者が作ったもの）だけは、運営者が一覧を開いたとき・その交流会を開いたときに運営者のものにする（`claimLegacyEvents`。埋め終えて `owner_account_id` を `NOT NULL` にしたら消す）。

## 1. 表

| 表 | 列 | 決まり |
|---|---|---|
| `event` | `id`・`name`・`starts_at`（始まりの日時）・`venue`・`fee`（円の整数）・`google_form_url`（任意）・`line_group_url`（任意）・`survey_open`（既定 false）・`owner_account_id`（持ち主。作った人）・`created_at`・`updated_at` | `fee >= 0`（`event_fee_check`）。索引 `event_starts_at_idx`・`event_owner_account_id_idx`。`owner_account_id` は account を `RESTRICT`。空を許す（空は前の版で運営者が作った交流会で、運営者が一覧を開くと運営者のものになる。埋め終えたら `NOT NULL` にする） |
| `event_staff` | `id`・`event_id`・`account_id`・`created_at`（受付係になった時刻） | 組は一意（`event_staff_event_id_account_id_unique`）。`event_id` は `RESTRICT`、`account_id` は `ON DELETE CASCADE`（`event_staff_account_id_idx`） |
| `event_discount` | `id`・`event_id`・`name`・`amount`（円の整数）・`asks_referrer`（紹介者の名前を聞くか。既定 false）・`archived_at`（使うのをやめた時刻）・`created_at`・`updated_at` | `amount > 0`（`event_discount_amount_check`）。`event_id` は `RESTRICT`。`UNIQUE (event_id, id)`（`event_discount_event_id_id_unique`。reception の `checkin` の複合の外部キーのため）。行は消さない（外すと `archived_at`） |
| `event_organization` | `event_id`（主キー）・`organization_id`・`owner_account_id`（入れた持ち主）・`placed_at` | 交流会を組織に入れる（1つの組織まで）。`(organization_id, owner_account_id)` は suite の `organization_member` を指す複合の外部キーで `ON DELETE CASCADE`（`event_organization_member_fk`。持ち主が組織を抜ける・外される・組織が消えると行が消える）。`event_id` は `RESTRICT`。索引 `event_organization_organization_id_idx` |
| `staff_invite` | `id`・`event_id`・`token`・`created_at` | 交流会ごとに1行（`staff_invite_event_id_unique`）。`token` は 32 バイトの base64url で一意。作り直す・受付係を外すと、同じ行の印と時刻が替わる。期限は列に持たず、受けるときに `endOfJstDate(starts_at)` で決める |

ほかの領域は `event.id` を外部キーで参照するだけ（`eventTable` を `.references(() => eventTable.id, { onDelete: "restrict" })` にだけ使う。AD-7）。

## 2. 窓口（どれもログイン必須）

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `/api/v1/events` | ログインした人 | 一覧（自分が主催者の交流会〈持ち主のもの・管理者と編集者の組織のもの〉と受付係の交流会。日時の新しい順。行ごとに `myRole`・`owner`・`organization`・`isOwner`） |
| POST | `/api/v1/events` | ログインした人 | 作る（201。作った人が持ち主。`discounts` があれば同じ取引で割引も作る） |
| GET | `/api/v1/events/{eventId}` | 主催者・その受付係 | 交流会（`myRole` つき） |
| PUT | `/api/v1/events/{eventId}` | 主催者 | 直す。`discounts`（`{ id?, name, amount, asksReferrer? }` の並び・10まで・名前は重ねない）を送ると、それが使う割引のすべてになる（id のある行は直す・ない行は足す・並びにない割引は使うのをやめる）。送らなければ割引は変えない。ほかの交流会の割引の id は 400 `DISCOUNT_NOT_FOUND` |
| GET | `/api/v1/events/{eventId}/summary` | ログインした人 | 要約（名前・日時・会場・参加費・開いているか・GoogleフォームのURL・LINEグループの招待リンク・オープンチャットの URL・使っている割引） |
| PUT | `/api/v1/events/{eventId}/survey` | 主催者 | アンケートを開く・閉じる（`{ open }`） |
| GET | `/api/v1/events/{eventId}/organization` | 主催者 | 持ち主と組織（`EventOrganizationState`：`owner`・`organization`・`isOwner`・`options`〈持ち主が入っている組織。持ち主のときだけ〉） |
| PUT | `/api/v1/events/{eventId}/organization` | 持ち主 | 組織に入れる・入れ替える・外す（`{ organizationId }`。null で外す。今と同じなら何もしない）。持ち主でない主催者は 403 `EVENT_OWNER_ONLY`、持ち主が入っていない組織は 404 `EVENT_ORGANIZATION_NOT_FOUND` |
| GET・POST | `/api/v1/events/{eventId}/staff-invite` | 主催者 | 今の招待のリンクを読む（なければ `null`）・作る／作り直す |
| GET | `/api/v1/events/{eventId}/staff` | 主催者 | 受付係の一覧（表示名は account の `findAccountById`） |
| DELETE | `/api/v1/events/{eventId}/staff/{accountId}` | 主催者 | 受付係を外す（204）。同じ取引で招待のリンクがあれば作り直す（外された人が前のリンクで受け直せない） |
| GET | `/api/v1/staff-invites/{inviteToken}` | ログインした人 | 招待の中身（交流会の名前・日時・期限・期限切れか・自分の役目） |
| POST | `/api/v1/staff-invites/{inviteToken}/accept` | ログインした人 | 受けて受付係になる（すでにその交流会の主催者・受付係なら何もしない。部員は受付係になる）。知らない印は 404 `STAFF_INVITE_INVALID`、期限切れは 410 `STAFF_INVITE_EXPIRED` |

- 交流会（`EventView`）・一覧・要約には、使っている割引（`discounts`：`id・name・amount・asksReferrer`。作った順）が入る。交流会と一覧には、持ち主（`owner`：`accountId`・`displayName`。持ち主のない今の交流会は null）・入れた組織（`organization`：`id`・`name`）・自分が持ち主か（`isOwner`）も入る。`myRole` は主催者か受付係。
- 持ち主が組織を抜ける・外される・組織が消えると、`event_organization` の行が外部キーで消え、交流会は持ち主の個人のものに戻る。
- 退会（`withdrawal`。suite の段のあと、account を消すトランザクションの中の `finalize`）：組織に入れた交流会は組織の今の管理者が新しい持ち主になる。組織に入れていない交流会は受付係・招待のリンク・割引ごと消す。チェックインがあれば reception の外部キーで止まり、account の窓口が 409 `ACCOUNT_OWNS_SHARED_RECORDS`（引き継ぎも元に戻る）。確かめの中身は「交流会「…」は、…さん（組織「…」の管理者）に引き継がれます。」と「組織に入れていない交流会n件（…）…を消します。…」。
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
| `requireEventRole(deps, roles)` | `requireSession` のあとに付ける。道の `{eventId}` を読み、形の違う ID・ない交流会は 404、役目が `roles`（`"organizer"`・`"staff"`・`"member"` から選ぶ）になければ 403。要求のたびに DB を引く |
| `currentEventRole(c)` | `requireEventRole` が通した役目（`EventAccessRole`） |
| `getEventRole(db, config, eventId, account)` | `"organizer"`・`"staff"`・`"member"`・`null`。`null` は「交流会がない（ID の形が違うときも）」と「役目がない」の両方で見分けられない。404 と 403 を分ける道は `requireEventRole` を付ける。`account` は `currentAccount(c)` |
| `getEventSummary(db, config, eventId)` | 要約（`EventSummary`）か `null`。survey は回答のたびに開閉を読む（AD-13）、reception は参加費を読む（AD-6） |
| `findEventDiscount(db, eventId, discountId)` | その交流会の割引（`EventDiscountRecord`：`{ id, eventId, name, amount, asksReferrer, active }`）か `null`。使うのをやめた割引も返す（reception がチェックインに写すとき） |
| `listEventDiscounts(db, eventId)` | その交流会の割引のすべて（使うのをやめたものも。作った順。reception の内訳） |
| `eventTable` | 外部キーのためだけ |
| `eventDiscountTable` | 外部キーのためだけ（reception の `checkin` の `(event_id, discount_id)`） |
| `eventForbiddenResponse`・`eventNotFoundResponse` | `createRoute` の 403・404 の応答 |
| `withdrawal` | 退会の段（組み立てが suite の段のあとに流す。上の2章） |
| `findEventOwnerAccountId(db, eventId)` | 交流会の持ち主の account の ID（ない・持ち主のない今の交流会は `null`）。booking が CSV の列の対応を持ち主ごとに覚えるのと、知らせに使う公式アカウントの設定を決めるのに使う |
| `findEventOrganizationId(db, eventId)` | 交流会を入れた組織の ID（入れていなければ `null`）。booking が知らせに使う公式アカウントの設定（組織のもの）を決めるのに使う（booking-002） |
| `listOrganizationEvents(db, organizationIds, from)` | 組織の並びに入れた交流会で、始まりが `from` 以後のもの（`{ eventId, organizationId, startsAt }`。始まりの近い順）。booking の「部の予定」が使う（booking-003） |
| `listPersonalEventIds(db, accountId)` | その人が持ち主の、組織に入れていない交流会の ID（退会で消える交流会）。booking の退会の確かめが使う |

約束（`@workspace/contracts/event`）：`EventSummary`・`EventView`・`EventRole`（答えの `myRole`：主催者・受付係）・`EventAccessRole`（判定：主催者・受付係・部員。`EVENT_ACCESS_ROLE_LABELS`）・`EventOrganizationState`・`EventOrganizationInput`・`EventDiscountInput`・`EventDiscountView`・`EVENT_ERRORS`、管理の画面の道 `ADMIN_ROUTE_PATTERNS`（path の形）と `adminPaths`（値を入れた道）：

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
| `feature.nav`・`feature.useNavItems` | 外枠のナビの項目（core-003）。交流会の外は「交流会の一覧」だけ。交流会の中（`/admin/events/$eventId…`）は「交流会の一覧」「参加者・合計」（受付係も）・「困りごと」（主催者）・「準備」（主催者。交流会を直すも含む）。**道が道の木に登録されている項目だけ**出す（reception・survey が `ADMIN_ROUTE_PATTERNS` の道を足すと自然に出る）。役目は画面が読んだ交流会から読み、ナビのために問い合わせない（読む前は一覧だけ）。`nav-items.ts`。ほかの領域の画面の上に行き来のタブを置かない |
| `EventAccessGate` | `<EventAccessGate eventId={id} roles={["organizer", "staff"]}>{(event) => …}</EventAccessGate>`。交流会を読み、読みこみ中・403（「この交流会の一覧画面は使えません」）・404・夜間の停止（DB に届かない 503 で、`isNightStopWindow()` のときだけ。昼の 503 は「読みこめませんでした」と API の文と「もう一度」）・役目が合わない（「この画面は主催者だけが使えます」）を出す。`SessionGate` の中に置く |
| `useEvent(eventId)`・`useEventSummary(eventId)`・`EVENT_QUERY_KEYS` | 交流会（`myRole` つき）と要約の問い合わせ・鍵 |
| `formatEventDateTime`・`formatJstDate`・`formatFee` | 日本時間の日時（2026年11月25日（水）19:00）・参加費（1,000円） |
| `InternalLink` | 道の木にまだない道（ほかの領域の画面）へのリンク |
| `registerSetupSection({ id, Component })` | 準備の画面（A4）の「持ち主と組織」のあとに節を足す差しこみの場所。`Component` は `{ event: EventView }` を受け取り、見出し h2 から始める（booking の「使い方」）。登録は、その領域の入口で1度だけ |

テスト：API は `apps/api/test/helpers/event.ts` の `createEvent(app, cookie, input?)`（その人が持ち主）・`makeStaff(app, organizerCookie, eventId)`（招待のリンクで受付係を作る）・`placeEvent(app, ownerCookie, eventId, organizationId)`（組織に入れる・外す）・`call(app, cookie, path, method?, body?)`。組織は `test/helpers/organization.ts`。E2E の主催者は `e2e/env.ts` の `E2E_ORGANIZER_LINE_USER_ID`。

## 4. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| `/admin/events` | A1 交流会の一覧 | 自分が主催者の交流会と受付係の交流会。行ごとに持ち主（自分なら「あなた」）と組織（なければ「個人」）。組織の交流会があれば「組織で絞る」のチップ（すべて・組織ごと・個人）。「交流会を追加」はだれにも出す。主催者には行ごとの「準備」「直す」。名前は、その役目の最初の管理の画面へのリンク（なければ文字だけ）。ナビの「交流会の一覧」・はじめの画面（`/`）から来る |
| `/admin/events/new`・`/admin/events/$eventId/edit` | A2 作成（だれでも）・編集（主催者だけ） | 名前・日付と時刻（日本時間）・会場・参加費・割引の節（行ごとに名前・額・「紹介者の名前を聞く」・「外す」、下に「割引を足す」。交流会と一緒に保存し、並び全体を送る。`DiscountFields.tsx`）・GoogleフォームのURL（任意）・LINEグループの招待リンク（任意）。直すときは「参加費を直しても、すでにあるチェックインの金額は変わりません」「割引を直しても外しても、すでにあるチェックインの割引と金額は変わりません」。作ったら準備へ、直したら一覧へ |
| `/admin/events/$eventId/setup` | A4 準備（主催者だけ） | 「持ち主と組織」（持ち主の名前・説明の文。持ち主には「入れる組織」のチップ〈入っている組織と「入れない（個人）」〉と「保存」、持ち主でない主催者には今の組織と「組織に入れる・外すのは、持ち主だけです。」。`OwnerOrganizationSection.tsx`）・登録された節（booking の「使い方」）・受付QR・アンケートQR（並べる。中身の URL も出す）と印刷の画面への入口・アンケートの開閉・招待のリンク（写す・作り直す〈確かめ〉・期限）・受付係の一覧（外す〈確かめ。招待のリンクも作り直すと伝える〉） |
| `/admin/events/$eventId/setup/qr/$kind` | QR の印刷（主催者だけ） | 「受付QR」「アンケートQR」の見出し・交流会の名前・大きな QR。「印刷する」。印刷では外枠と操作を隠す（`print.css`） |
| `/invite/$inviteToken` | P3 受付係の招待（外枠のナビなし。`staticData: { layout: "bare" }`） | 交流会の名前と「受ける」。受けたら一覧画面（なければ交流会の一覧）へ。すでに受付係・主催者ならそのまま移る。使えないリンクは「この招待のリンクは使えません。主催者に新しいリンクをもらってください」 |

- QR の中身は `miniAppPermalink(LIFF ID, participantPaths.checkin|survey(eventId))`。LIFF ID のない手元・E2E だけ、画面の源＋道（画面にその旨を書く）。

## 5. 置き場所

| 所 | ファイル |
|---|---|
| 約束 | `packages/contracts/src/event/`（`event.ts`・`roles.ts`・`admin-paths.ts`・`errors.ts`・`index.ts`） |
| API | `apps/api/src/modules/event/`（`schema.ts`・`repository.ts`・`discounts.ts`・`access.ts`〈判定の1か所〉・`organization.ts`〈組織に入れる〉・`withdrawal.ts`〈退会の段〉・`summary.ts`・`ids.ts`・`routes.ts`・`index.ts`・テスト） |
| DB の変更 | `apps/api/drizzle/0003_event.sql`・`0006_event_discount.sql`・`0015_event_owner.sql` |
| 画面 | `apps/web/src/features/event/`（`api.ts`・`queries.ts`・`format.ts`・`links.ts`・`admin-tabs.ts`・`nav-items.ts`・`navigation.tsx`・`EventAccessGate.tsx`・`QrCode.tsx`・`EventListPage.tsx`・`EventFormPage.tsx`・`DiscountFields.tsx`・`EventSetupPage.tsx`・`OwnerOrganizationSection.tsx`・`setup-slots.ts`〈準備の画面の差しこみの場所〉・`QrPrintPage.tsx`・`print.css`・`InviteAcceptPage.tsx`・`routes.ts`・`index.ts`） |
| テストの手伝い | `apps/api/test/helpers/event.ts` |
| 通しのテスト | `e2e/tests/event.spec.ts` |
