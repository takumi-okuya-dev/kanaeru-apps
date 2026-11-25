# Contracts: 定員・キャンセル待ち・繰り上げの窓口（booking-004）

2026-11-20 作成。入出力の形は `packages/contracts/src/booking/waitlist.ts`（ふつうの zod。OpenAPI の名前は API の側で付ける）と、`roster.ts`・`apply.ts` に足す欄。エラーは `BOOKING_ERRORS` に足す。日時は時差つきの ISO 8601。道の頭は `/api/v1/booking`（AD-23）。

## 主催者の窓口（ログイン必須。`requireSession` と event の `requireEventRole`）

| 動き | 道 | だれ | 入力 | 答え |
|---|---|---|---|---|
| GET | `/events/{eventId}/setting` | 主催者・受付係 | — | `BookingSetting` に `capacity`・`quotas`・`seats`・`cancelled`・`change` を足す（下） |
| PUT | `/events/{eventId}/capacity` | 主催者 | `CapacityInput`：`{ capacity: number \| null, quotas: [{ applicationSource, seats, manageUrl: string \| null }] }` | `BookingSetting`。使い方が受付だけ → 409 `BOOKING_ROSTER_OFF`。枠の合計が定員を超える・定員なしで枠 → 400 `BOOKING_QUOTA_OVER_CAPACITY` |
| POST | `/events/{eventId}/entries/{entryId}/offer` | 主催者 | — | `RosterEntry`。自前で定員がない → 409 `BOOKING_WAITLIST_OFF`。キャンセル待ちでない → 409 `BOOKING_ENTRY_NOT_WAITLISTED`。期限が1時間取れない → 409 `BOOKING_OFFER_WINDOW_SHORT` |
| PUT | `/events/{eventId}/entries/{entryId}/status` | 主催者 | `{ status: "confirmed" \| "cancelled" }`（今のまま。`waitlisted`・`offered` は 400） | `RosterEntry`。キャンセル待ち・打診中を確定にすると確定の知らせ。取り消すと片付け |
| POST | `/events/{eventId}/entries` | 主催者・受付係 | `RosterEntryInput` に `waitlist?: boolean` を足す | `RosterEntry`。`waitlist: true` で自前で定員がない → 409 `BOOKING_WAITLIST_OFF` |
| GET | `/events/{eventId}/entries/{entryId}/notices` | 主催者 | — | `NoticeLog`：`{ notices: [{ kind, method, result, createdAt }] }`（新しい順・200件まで） |
| POST | `/events/{eventId}/change-notice` | 主催者 | `ChangeNoticeInput`：`{ notify: boolean }` | `BookingSetting`。自前でない → 409 `BOOKING_SELF_PAGE_OFF`。変更がない → 409 `BOOKING_NO_CHANGE` |
| POST | `/events/{eventId}/cancel-booking` | 主催者 | — | `BookingSetting`（もう中止なら同じ答え）。自前でない → 409 `BOOKING_SELF_PAGE_OFF` |

`PUT /events/{eventId}/self-page` は、中止のあと 409 `BOOKING_EVENT_CANCELLED`。

### `BookingSetting`（足す欄）

```ts
{
  ...booking-003 の欄,
  capacity: number | null,
  quotas: { applicationSource: "connpass" | "peatix" | "other", seats: number, manageUrl: string | null }[],
  seats: SeatSummary | null,        // 定員があるとき
  cancelled: boolean,               // 予約を中止したか
  change: {                         // 最後に知らせた日時・場所と今が違うとき（自前のとき）
    previousStartsAt: string, previousVenue: string | null,
    startsAt: string, venue: string | null,
    autoNoticeAt: string | null,    // 定期の仕事が知らせる予定の時刻（気づいていれば）
  } | null,
}
```

`SeatSummary`：`{ capacity, filled, confirmed, offered, waitlisted, selfRemaining, over, full, quotasReleased, sameDay, quotas: [{ applicationSource, seats, filled, remaining, manageUrl }], stopSources: [{ applicationSource, manageUrl }] }`。

### `RosterEntry`・`Roster`（足す欄）

- `RosterEntry`：`waitlistPosition: number | null`（キャンセル待ちの何番目か）・`offer: { deadline: string, expired: boolean, manual: boolean } | null`（打診中のとき）。`status` に `waitlisted`・`offered`。
- `Roster.counts`：`waitlisted`・`offered` を足す（`confirmed`・`cancelled` は今のまま）。

## 参加者の窓口

| 動き | 道 | ログイン | 入力 | 答え |
|---|---|---|---|---|
| POST | `/me/entries/{entryId}/respond` | 必須（本人の行だけ） | `OfferAnswerInput`：`{ answer: "accept" \| "decline" }` | `MyEntryItem`。打診中でもキャンセル待ちでもない → 409 `BOOKING_OFFER_NOT_PENDING`。期限の後 → 410 `BOOKING_OFFER_EXPIRED`。当日の空きが埋まった → 409 `BOOKING_NO_SEAT`。ほかの人の行 → 404 |
| POST | `/entry-tokens/{entryToken}/respond` | なし（札を知る本人。申込みの札か返事の札） | 同じ | `EntryTokenView`。エラーは同じ・知らない札 404 |

### `ApplyPage`（足す欄）

```ts
{
  ...,
  state: "open" | "closed" | "started" | "cancelled",
  seats: { capacity: number, remaining: number, waitlist: number, sameDay: boolean } | null,  // 定員があるとき
}
```

`MyEntry`（`viewer.myEntry`・`ApplyResult.entry`）・`MyEntryItem`・`EntryTokenView.entry` に：`waitlistPosition: number | null`・`offerDeadline: string | null`・`canAccept: boolean`（打診中で期限の前、か、キャンセル待ちで当日の空きがある）・`offerExpired: boolean`。`status` に `waitlisted`・`offered`。`cancellable` は確定・キャンセル待ち・打診中で始まりの前。

## 定期の窓口

| 動き | 道 | 認証 | 答え |
|---|---|---|---|
| POST | `/jobs/tick` | `Authorization: Bearer <JOB_TRIGGER_SECRET>`（合わなければ 404） | `WaitlistJobSummary`：`{ events, expired, offered, sameDay, changed }`（数だけ） |

## エラー（`BOOKING_ERRORS` に足す）

| キー | code | 状態 | いつ |
|---|---|---|---|
| `QUOTA_OVER_CAPACITY` | `BOOKING_QUOTA_OVER_CAPACITY` | 400 | 枠の合計が定員を超える・定員なしで枠 |
| `WAITLIST_OFF` | `BOOKING_WAITLIST_OFF` | 409 | 自前で定員がないのにキャンセル待ち・打診 |
| `ENTRY_NOT_WAITLISTED` | `BOOKING_ENTRY_NOT_WAITLISTED` | 409 | 手で打診する行がキャンセル待ちでない |
| `OFFER_WINDOW_SHORT` | `BOOKING_OFFER_WINDOW_SHORT` | 409 | 期限が1時間取れない |
| `OFFER_NOT_PENDING` | `BOOKING_OFFER_NOT_PENDING` | 409 | 返事する打診がない |
| `OFFER_EXPIRED` | `BOOKING_OFFER_EXPIRED` | 410 | 返事の期限が過ぎた |
| `NO_SEAT` | `BOOKING_NO_SEAT` | 409 | 当日の空きが埋まった |
| `EVENT_CANCELLED` | `BOOKING_EVENT_CANCELLED` | 409 | 中止した会に申し込む・受付を開く |
| `NO_CHANGE` | `BOOKING_NO_CHANGE` | 409 | 知らせる変更がない |
