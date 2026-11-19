# 受付（reception）の地図

2026-11-19 作成（reception-001。決めた理由は [specs/reception/001-checkin/research.md](../../specs/reception/001-checkin/research.md)）。

チェックインを持ち、参加者のチェックイン（受付QR → P1）・主催者と受付係の一覧画面（手でのチェックイン・直す・取り消す・合計）・主催者の内訳と参加者の CSV と削除を出す。survey には、チェックインと名前を1つの仕組みで出す（構成の決めごと AD-3・AD-5・AD-6・AD-7）。

## 1. 表

| 表 | 列 | 決まり |
|---|---|---|
| `checkin` | `id`・`event_id`・`account_id`（LINE のとき）・`entered_by`（手のときの入れた人）・`name`・`application_source`・`referral`・`payment_method`・`amount`（円の整数）・`created_at`（チェックインの時刻）・`updated_at` | `event_id` は `RESTRICT`、`account_id` は `ON DELETE CASCADE`、`entered_by` は `ON DELETE SET NULL`。`(event_id, account_id) WHERE account_id IS NOT NULL` で一意（`checkin_event_id_account_id_unique`）。選択肢の3つの列は `text` と CHECK、`amount >= 0`。索引 `checkin_event_id_created_at_idx`・`checkin_account_id_created_at_idx`・`checkin_entered_by_idx` |

- 手で入れたか ＝ `account_id IS NULL`。入れた人の名前は写さず、読むときに account の `findAccountById` で引く。
- 名前と金額はチェックインのときに写す。金額を決めるのは作るときと支払い方法を直すときだけ（無料は0円、ほかは event の `getEventSummary` のその時の参加費。`amount.ts`）。合計は `amount` の和。
- 取り消しは行を消す（`DELETE`）。

## 2. 窓口（どれもログイン必須。道の頭は `/api/v1/events/{eventId}/checkins`）

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `…/checkins/me` | ログインした人 | 自分のチェックイン（なければ `null`）と初期値（名前：前回のチェックインの名前・なければ表示名／知ったきっかけ：前回の答え・なければ `null`） |
| POST | `…/checkins/me` | ログインした人 | 自分でチェックインする（201）。すでにあれば記録を増やさず 200 と `alreadyCheckedIn: true` |
| GET | `…/checkins` | 主催者・受付係 | 一覧（新しい順。`method`・`accountId`・`enteredByName`・`sameName` つき） |
| POST | `…/checkins` | 主催者・受付係 | 手でチェックインする（201。入れた人を記録） |
| PUT | `…/checkins/{checkinId}` | 主催者・受付係 | 直す（支払い方法が変わったときだけ金額を決め直す） |
| DELETE | `…/checkins/{checkinId}` | 主催者・受付係 | 取り消す（204。行を消す） |
| GET | `…/checkins/totals` | 主催者・受付係 | 支払い方法ごとの人数と金額（PayPay・現金・無料の順。0人も出す）と全体 |
| GET | `…/checkins/breakdown` | 主催者 | 申し込みの媒体・知ったきっかけの人数の内訳 |
| GET | `…/checkins/export` | 主催者 | 参加者の CSV（UTF-8 の BOM・CRLF・古い順。`=`・`+`・`-`・`@` で始まる欄は先頭に `'`） |

- 交流会がない・形の違う ID は 404（event の `NOT_FOUND`）、権限の誤りは 403（event の `FORBIDDEN`）。直す・取り消す相手がその交流会にないと 404 `CHECKIN_NOT_FOUND`。
- 同じ名前の印：約束の `normalizeCheckinName`（NFKC・空白をすべて消す）でそろえた名前が同じ行が2つ以上あり、その中に手でのチェックインがあるとき、その全部に `sameName: true`（LINE どうしだけなら付けない）。
- 名前はログに出さない。
- 入力の形・選択肢（code・言葉・並び）・エラーの文言は `packages/contracts/src/reception/`。

## 3. ほかの領域が使うもの

API（`apps/api/src/modules/reception/index.ts`）：

```ts
import { checkinTable, findCheckin, getCheckin, listCheckins } from "../reception/index.ts";
import type { CheckinRecord } from "../reception/index.ts";

// survey の表：回答はチェックインを指し、チェックインを取り消すと一緒に消える（AD-7）
checkinId: uuid("checkin_id").notNull().references(() => checkinTable.id, { onDelete: "cascade" }),
// 回答を受けるとき（その人がその交流会にチェックインしているか）
const checkin = await findCheckin(deps.db, eventId, currentAccount(c).accountId); // なければ null
```

| 名前 | 何か |
|---|---|
| `findCheckin(db, eventId, accountId)` | その人のその交流会のチェックイン（`CheckinRecord`）か `null` |
| `getCheckin(db, checkinId)` | チェックインを ID で（`CheckinRecord` か `null`）。手でのチェックインの回答を代わりに入れるとき |
| `listCheckins(db, eventId)` | その交流会のチェックイン（新しい順）。困りごとの一覧と CSV の名前は、いつもここの `name`（AD-6） |
| `checkinTable` | 外部キーのためだけ |
| `CheckinRecord` | `{ id, eventId, accountId, enteredBy, name, applicationSource, referral, paymentMethod, amount, createdAt, updatedAt }` |

約束（`@workspace/contracts/reception`）：`CheckinInput`・`CheckinView`・`MyCheckinState`・`CheckinTotals`・`CheckinBreakdown`・選択肢（`APPLICATION_SOURCES`・`REFERRALS`・`PAYMENT_METHODS` と `*_LABELS`・`CHECKIN_QUESTION_LABELS`）・`normalizeCheckinName`・`RECEPTION_ERRORS`。テストのファイルで約束の値を `@hono/zod-openapi` より先に読むときは、先頭で `import "@hono/zod-openapi";` を読む（zod の形の `.openapi()` は、読んだあとに作られた形だけが持つ）。

画面（`apps/web/src/features/reception/index.ts`）：

| 名前 | 何か |
|---|---|
| `registerEventDataSection({ id, Component })` | A5（書き出しと削除）に節を足す。`Component` は `{ event: EventView }` を受け取り、見出し h2 から始める（survey の「困りごとをCSVで書き出す」）。CSV の書き出しの節と、参加者のデータを消す節の間に、登録した順に出る |
| `registerCheckinPanelSection({ id, Component })` | A3 の直す枠に節を足す。主催者が**手でのチェックイン**を開いたときだけ、保存のボタンの下・取り消すの上に出る。`Component` は `{ event: EventView; checkin: CheckinView }` を受け取る（survey の「アンケートの回答を入れる」）。枠を重ねず、節の中で欄を開く |
| `RECEPTION_QUERY_KEYS` | 問い合わせの鍵（どれも `"reception"` で始まる） |

登録は、その領域の入口（`index.ts`）で1度だけ呼ぶ。選択肢のチップは `@workspace/ui/components/choice-chips` の `ChoiceChips`（と、誤りの設問へ動く `focusChoiceGroup`）。

テスト：API は `apps/api/test/helpers/reception.ts` の `SAMPLE_CHECKIN`・`checkIn(app, cookie, eventId, input?)`（自分のチェックイン）・`manualCheckIn(app, cookie, eventId, input?)`（手でのチェックイン）。

## 4. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| `/e/$eventId/checkin`（`PARTICIPANT_ROUTE_PATTERNS.checkin`） | P1 チェックインの画面（ログインした人。外枠のナビなし〈`staticData: { layout: "bare" }`〉） | 交流会の名前（h1）と要約 → 名前（初期値あり）→ 申し込みの媒体・知ったきっかけ・支払い方法のチップ → 何をどう使うかの1文 → 「チェックインする」。済んだらカード（「チェックインしました」・交流会の名前・「受付で紙の名札に名前を書いて、お入りください。」）に変え、見出しへフォーカス。読み直すと「チェックイン済み」。アンケートが開いていれば「アンケートに答える」（`participantPaths.survey`。survey の画面）と、招待リンクがあれば「交流会のLINEグループに参加する」。オープンチャットの URL があれば「コミュニティのオープンチャットに参加する」。友だち追加は出さない |
| `/admin/events/$eventId`（`eventReception`） | A3 一覧画面の参加者・合計（主催者・受付係） | 交流会の中の行き来は外枠のナビ（event）。タブ「参加者」（「手でチェックイン」・広い画面は表・狭い画面はカード・名前を押すと直す・取り消すの枠）と「合計」（支払い方法ごとの合計。主催者は下に内訳）。5秒おきに読み直し（夜間の停止では止める）、書いたあとはその場で読み直す。読み直しが失敗しても前のものを出したまま「最新にできませんでした」。主催者には「書き出しと削除」 |
| `/admin/events/$eventId/data`（`eventData`） | A5 書き出しと削除（主催者だけ） | 「参加者をCSVで書き出す」・登録された節（survey）・「参加者のデータを消す」（アカウントのある人は account の `DELETE /api/v1/accounts/{accountId}`、手でのチェックインは取り消し。確かめの枠で何が消えるかを書く。主催者自身のアカウントには出さない） |

## 5. 置き場所

| 所 | ファイル |
|---|---|
| 約束 | `packages/contracts/src/reception/`（`options.ts`・`name.ts`・`errors.ts`・`checkin.ts`・`index.ts`） |
| API | `apps/api/src/modules/reception/`（`schema.ts`・`repository.ts`・`amount.ts`・`views.ts`・`csv.ts`・`routes.ts`・`index.ts`・テスト） |
| DB の変更 | `apps/api/drizzle/0004_reception.sql` |
| 画面 | `apps/web/src/features/reception/`（`api.ts`・`queries.ts`・`format.ts`・`checkin-form.ts`・`CheckinFields.tsx`・`flags.tsx`・`CheckinPage.tsx`・`ReceptionPage.tsx`・`ParticipantsTab.tsx`・`ManualCheckinForm.tsx`・`CheckinEditDialog.tsx`・`TotalsTab.tsx`・`DataPage.tsx`・`slots.ts`・`routes.ts`・`index.ts`） |
| 部品 | `packages/ui/src/components/choice-chips.tsx`（共通） |
| テストの手伝い | `apps/api/test/helpers/reception.ts` |
| 通しのテスト | `e2e/tests/reception.spec.ts` |
