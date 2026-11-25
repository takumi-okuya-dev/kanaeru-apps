# 取り決め：reception の窓口とほかの領域が使う名前（reception-001）

## 窓口（`/api/v1/events/{eventId}/checkins`。`operationId` は `reception` で始める。どれもログイン必須）

| 動き | 道 | だれ | 入力 | 成功 | 主なエラー |
|---|---|---|---|---|---|
| GET | `…/checkins/me` | ログインした人 | — | 200 `MyCheckinState` | 401・404 |
| POST | `…/checkins/me` | ログインした人 | `CheckinInput` | 201 `{ checkin: MyCheckin, alreadyCheckedIn: false }`・すでにあれば 200（`alreadyCheckedIn: true`。記録は増えない） | 400・401・404 |
| GET | `…/checkins` | 主催者・受付係 | — | 200 `{ checkins: CheckinView[] }`（新しい順） | 401・403・404 |
| POST | `…/checkins` | 主催者・受付係 | `CheckinInput` | 201 `CheckinView`（手でのチェックイン） | 400・401・403・404 |
| PUT | `…/checkins/{checkinId}` | 主催者・受付係 | `CheckinInput` | 200 `CheckinView`（支払い方法が変わったときだけ金額を決め直す） | 400・401・403・404 `CHECKIN_NOT_FOUND` |
| DELETE | `…/checkins/{checkinId}` | 主催者・受付係 | — | 204（行を消す） | 401・403・404 `CHECKIN_NOT_FOUND` |
| GET | `…/checkins/totals` | 主催者・受付係 | — | 200 `CheckinTotals` | 401・403・404 |
| GET | `…/checkins/breakdown` | 主催者 | — | 200 `CheckinBreakdown` | 401・403・404 |
| GET | `…/checkins/export` | 主催者 | — | 200 `text/csv; charset=utf-8`（BOM つき・`Content-Disposition: attachment`） | 401・403・404 |

## 形（`@workspace/contracts/reception`）

| 名前 | 中身 |
|---|---|
| `CheckinInput` | `{ name（前後の空白を除き1〜50文字）, applicationSource, referral, paymentMethod }`（知らない欄は 400） |
| `MyCheckin` | `{ id, name, applicationSource, referral, paymentMethod, amount, checkedInAt }` |
| `MyCheckinState` | `{ checkin: MyCheckin \| null, prefill: { name, referral: Referral \| null } }` |
| `CheckinView` | `MyCheckin` ＋ `{ method: "line" \| "manual", accountId: string \| null, enteredByName: string \| null, sameName: boolean }` |
| `CheckinTotals` | `{ byPaymentMethod: { paymentMethod, count, amount }[]（PayPay・現金・無料の順。0人も出す）, total: { count, amount } }` |
| `CheckinBreakdown` | `{ applicationSource: { value, count }[], referral: { value, count }[], total }`（選択肢の順。0人も出す） |
| 選択肢 | `APPLICATION_SOURCES`・`REFERRALS`・`PAYMENT_METHODS`（code の並び）と `*_LABELS`（画面の言葉） |
| `normalizeCheckinName(name)` | 同じ名前の比べ方（NFKC・空白をすべて消す） |
| `RECEPTION_ERRORS.CHECKIN_NOT_FOUND` | 404・「このチェックインは見つかりません。…」 |

## ほかの領域が使うもの

API（`apps/api/src/modules/reception/index.ts`）：

| 名前 | 何か |
|---|---|
| `findCheckin(db, eventId, accountId)` | その人のその交流会のチェックイン（`CheckinRecord`）か `null`。survey が回答を受けるときに使う |
| `getCheckin(db, checkinId)` | チェックインを ID で（`CheckinRecord` か `null`） |
| `listCheckins(db, eventId)` | その交流会のチェックイン（新しい順の `CheckinRecord[]`。困りごとの一覧の名前） |
| `checkinTable` | 外部キーのためだけ（`survey_answer.checkin_id` → `.references(() => checkinTable.id, { onDelete: "cascade" })`） |
| `CheckinRecord` | `{ id, eventId, accountId, enteredBy, name, applicationSource, referral, paymentMethod, amount, createdAt, updatedAt }` |

テスト（`apps/api/test/helpers/reception.ts`）：`SAMPLE_CHECKIN`・`checkIn(app, cookie, eventId, input?)`（自分）・`manualCheckIn(app, cookie, eventId, input?)`（手）。

画面（`apps/web/src/features/reception/index.ts`）：`registerEventDataSection`・`registerCheckinPanelSection`（差しこみの場所。research R10）・`RECEPTION_QUERY_KEYS`。選択肢のチップは `@workspace/ui/components/choice-chips` の `ChoiceChips`。
