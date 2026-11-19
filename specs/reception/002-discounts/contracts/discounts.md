# 取り決め：割引の窓口と形（reception-002）

## event（`@workspace/contracts/event`）

| 名前 | 中身 |
|---|---|
| `EventDiscountInput` | `{ id?: uuid \| null, name（1〜30文字）, amount（1〜1,000,000 の整数）, asksReferrer?: boolean（既定 false） }` |
| `EventInput.discounts` | 任意の `EventDiscountInput[]`（10まで・名前は重ねない）。送らなければ割引は変えない。送った並びにない使っている割引は使うのをやめる |
| `EventDiscountView` | `{ id, name, amount, asksReferrer }` |
| `EventView.discounts`・`EventSummary.discounts` | 使っている割引（作った順） |
| `EVENT_ERRORS.DISCOUNT_NOT_FOUND` | 400・並びの `id` がその交流会の割引でない |

窓口は今のもの（`POST /api/v1/events`・`PUT /api/v1/events/{eventId}`・`GET …`・`GET …/summary`）の形が広がるだけ。

API（`apps/api/src/modules/event/index.ts`）が出すもの：

| 名前 | 何か |
|---|---|
| `findEventDiscount(db, eventId, discountId)` | その交流会の割引（`{ id, eventId, name, amount, asksReferrer, active }`）か `null`（使うのをやめたものも返す） |
| `listEventDiscounts(db, eventId)` | その交流会の割引のすべて（使うのをやめたものも。作った順） |
| `eventDiscountTable` | 外部キーのためだけ |

## reception（`@workspace/contracts/reception`）

| 名前 | 変わる所 |
|---|---|
| `CheckinInput` | `discountId?: uuid \| null`（空なら割引なし）・`referrerName?: string \| null`（50文字まで。空の文字は null） |
| `MyCheckin` | `discountId`・`discountName`・`discountAmount`（割引なしは null）。紹介者は入れない |
| `CheckinView` | `MyCheckin` ＋ `referrerName`（主催者のときだけ値。受付係は null） |
| `CheckinBreakdown` | `discounts: { discountId \| null, name \| null, active, count, discountTotal }[]`（割引なしは最後）・`referrers: { name, count }[]`（多い順） |
| `RECEPTION_ERRORS.DISCOUNT_UNAVAILABLE` | 400・`fields: [{ path: "discountId" }]`。その交流会の使っている割引でない |

| 動き | 道 | 変わる所 |
|---|---|---|
| POST | `…/checkins/me`・`…/checkins` | 割引と紹介者を受け、金額を決める |
| PUT | `…/checkins/{checkinId}` | 割引か支払い方法が変わったときだけ金額を決め直す。`referrerName` を送らなければ、割引が同じなら残す |
| GET | `…/checkins`（一覧） | 主催者だけ `referrerName` に値 |
| GET | `…/checkins/breakdown` | 割引と紹介者の内訳（主催者だけ） |
| GET | `…/checkins/export` | 「割引」「割引の額」「紹介者」の列（主催者だけ） |
