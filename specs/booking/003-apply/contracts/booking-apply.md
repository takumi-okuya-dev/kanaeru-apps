# Contracts: 自前の申込みページの窓口（booking-003）

2026-11-20 作成。入出力の形は `packages/contracts/src/booking/apply.ts`（ふつうの zod。OpenAPI の名前は API の側で付ける）。エラーは `BOOKING_ERRORS` に足す。日時は時差つきの ISO 8601。道の頭は `/api/v1/booking`（AD-23）。

## 主催者の窓口（ログイン必須。`requireSession` と event の `requireEventRole`）

| 動き | 道 | だれ | 入力 | 答え |
|---|---|---|---|---|
| GET | `/events/{eventId}/setting` | 主催者・受付係 | — | `BookingSetting`：`{ mode, entryCount, accepting, visibility, started, inOrganization }`（足したのは後ろの4つ） |
| PUT | `/events/{eventId}/setting` | 主催者 | `{ mode }`（`reception`・`roster`・`self_page`） | `BookingSetting` |
| PUT | `/events/{eventId}/self-page` | 主催者 | `SelfPageInput`：`{ accepting: boolean, visibility: "public" \| "members" }` | `BookingSetting`。使い方が自前でない → 409 `BOOKING_SELF_PAGE_OFF`。組織に入れていないのに `members` → 400 `BOOKING_VISIBILITY_NEEDS_ORGANIZATION` |

名簿の窓口（booking-001）は、使い方が `roster` か `self_page` なら動く（`reception` だけ 409 `BOOKING_ROSTER_OFF`）。名簿の行の `entryKind` に `self_page` が入る。

## 参加者の窓口

| 動き | 道 | ログイン | 答え |
|---|---|---|---|
| GET | `/events/{eventId}/page` | 任意 | `ApplyPage`（下） |
| POST | `/events/{eventId}/apply` | 必須 | 入力 `ApplyInput`：`{ name, consent?: boolean }`（任意のメールアドレスは完了の画面から `/me/contact` で入れる） → 200 `ApplyResult`：`{ entry: MyEntry, page: ApplyPage }`（初めて・申し込み直しは 201） |
| GET | `/events/{eventId}/calendar` | 任意 | `text/calendar`（`.ics`。添付） |
| POST | `/events/{eventId}/email-requests` | なし | 入力 `EmailApplyInput`：`{ name, email }` → 202 `{ accepted: true }` |
| GET | `/entry-tokens/{entryToken}` | なし | `EntryTokenView`（下） |
| POST | `/entry-tokens/{entryToken}/confirm` | なし | 200 `EntryTokenView`（`state: "entry"`） |
| POST | `/entry-tokens/{entryToken}/cancel` | なし | 200 `EntryTokenView` |
| GET | `/me/entries` | 必須 | `MyEntryList`：`{ entries: MyEntryItem[] }` |
| POST | `/me/entries/{entryId}/cancel` | 必須 | `MyEntryItem` |
| GET | `/me/schedule` | 必須 | `MySchedule`：`{ events: ScheduleItem[] }` |
| GET | `/me/consents` | 必須 | `ConsentList`：`{ consents: [{ id, holderName, holderKind: "organization" \| "personal" }] }` |
| DELETE | `/me/consents/{consentId}` | 必須 | 204（本人のものだけ。ほかは 404 `BOOKING_CONSENT_NOT_FOUND`） |

連絡のメールアドレスは booking-002 の `GET・PUT・DELETE /me/contact` をそのまま使う。

### `ApplyPage`

```ts
{
  event: { id, name, startsAt, venue: string | null, fee: number },
  hostName: string,                    // 組織の名前か持ち主の表示名（なければ空）
  state: "open" | "closed" | "started", // 受付中・閉じている・始まりを過ぎた
  visibility: "public" | "members",
  calendar: { googleUrl: string, icsPath: string },
  lineFriendUrl: string | null,        // 公式アカウントのベーシック ID があるとき
  viewer:
    | { signedIn: false }
    | {
        signedIn: true,
        defaultName: string,           // 前の申込みの名前か LINE の表示名
        myEntry: MyEntry | null,
        consented: boolean,            // 主催への案内の同意があるか
        lineLinked: boolean,           // 当てはまる公式アカウントと紐づいているか
        hasContactEmail: boolean,
      },
}
```

`MyEntry`：`{ id, name, status: "confirmed" | "cancelled", appliedAt, cancellable }`。

### `EntryTokenView`

```ts
{
  state: "pending" | "entry",
  event: { id, name, startsAt, venue, fee },
  hostName: string,
  name: string,                         // 入れた名前（本人だけが札を知る）
  entry: { status, cancellable } | null,  // state が entry のとき
  confirmable: boolean,                 // 確認の前なら、いま確定できるか（受付中・誰でもの会）
  linkSpent: boolean,                   // このリンクを使い終わったか（打診の返事の札で答えた。booking-004 R8）
  calendar: { googleUrl, icsPath },
}
```

期限切れの確認の札は 410 `BOOKING_ENTRY_TOKEN_EXPIRED`、知らない札は 404 `BOOKING_ENTRY_TOKEN_INVALID`。

### `MyEntryItem`・`ScheduleItem`

- `MyEntryItem`：`{ entryId, status, cancellable, event: { id, name, startsAt, venue }, hostName, googleCalendarUrl }`
- `ScheduleItem`：`{ event: { id, name, startsAt, venue }, hostName, state, visibility, myStatus: "confirmed" | "cancelled" | null }`

## エラー（`BOOKING_ERRORS` に足す）

| key | code | 状態 | いつ |
|---|---|---|---|
| `PAGE_NOT_FOUND` | `BOOKING_PAGE_NOT_FOUND` | 404 | 交流会がない・使い方が自前でない |
| `PAGE_MEMBERS_ONLY` | `BOOKING_PAGE_MEMBERS_ONLY` | 403 | 部員だけの回を、主催者・部員でない人が開いた |
| `PAGE_CLOSED` | `BOOKING_PAGE_CLOSED` | 409 | 受付を閉じている・始まりを過ぎた |
| `CANCEL_CLOSED` | `BOOKING_CANCEL_CLOSED` | 409 | 始まりを過ぎてから取り消そうとした |
| `ENTRY_TOKEN_INVALID` | `BOOKING_ENTRY_TOKEN_INVALID` | 404 | 知らない札・交流会が消えた |
| `ENTRY_TOKEN_EXPIRED` | `BOOKING_ENTRY_TOKEN_EXPIRED` | 410 | 確認の札の期限（24時間）が過ぎた |
| `EMAIL_REQUEST_LIMIT` | `BOOKING_EMAIL_REQUEST_LIMIT` | 429 | 交流会ごとの確認の待ちが200件に達した |
| `SELF_PAGE_OFF` | `BOOKING_SELF_PAGE_OFF` | 409 | 使い方が自前でないのに受付・見せる範囲を変えようとした |
| `VISIBILITY_NEEDS_ORGANIZATION` | `BOOKING_VISIBILITY_NEEDS_ORGANIZATION` | 400 | 組織に入れていない交流会を部員だけにしようとした |
| `CONSENT_NOT_FOUND` | `BOOKING_CONSENT_NOT_FOUND` | 404 | 本人のものでない・ない同意を外そうとした |

ほかの人の申込みの ID は `BOOKING_ENTRY_NOT_FOUND`（404）。

## 業務の関数（API の中）

- `sendNotice`（booking-002）の送り先に、行の `contact_email` を足す（LINE の紐づけ → 行の連絡のメール → 本人の連絡のメール → なし）。
- `googleCalendarUrl({ name, startsAt, venue, details })`（`packages/contracts/src/booking/calendar.ts`。画面と API が使う）・`buildIcs(...)`（API の中）。
- 名前の上限 `APPLY_NAME_MAX`（50。受付のチェックインの名前と同じ値。`apply.ts` は受付の約束を読まない。research の「作りながら決めたこと」）。
- event の `index.ts` に `listOrganizationEvents(db, organizationIds, from)`（組織の並びに入れた交流会の `{ eventId, organizationId, startsAt }`。始まりが `from` 以後）を足す。

## 画面の道（AD-14。`packages/contracts/src/core/participant-paths.ts`）

| key | 形 | 作る関数 |
|---|---|---|
| `apply` | `/e/$eventId` | `participantPaths.apply(eventId)` |
| `entry` | `/e/$eventId/entry/$entryToken` | `participantPaths.entry(eventId, entryToken)` |
| `myBookings` | `/my-bookings` | `participantPaths.myBookings()` |
