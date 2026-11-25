# Implementation Plan: 割引・紹介割（reception-002）

**Branch**: `feature/reception-002-discounts` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口と形は [contracts/discounts.md](./contracts/discounts.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

event に割引の表（`event_discount`）と、交流会の入力・答え・要約の `discounts`、A2 の割引の節を足す。reception は `checkin` に割引の写しと紹介者の名前の列を足し、金額の決まりを「参加費 − 割引（0で止める）」に広げ、P1・手でのチェックイン・直す枠に割引のチップと紹介者の欄、主催者の内訳と CSV に割引と紹介者を足す。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26.13

**Primary Dependencies**: 今のまま（Hono・@hono/zod-openapi・zod 4・Drizzle 0.45・React 19・TanStack Router/Query）。新しい依存はない

**Storage**: PostgreSQL 18（表を1つ足す変更と、空を許す列を4つ足す変更の2つ）

**Testing**: Vitest（約束の単体・API の結合は本物の PostgreSQL・画面の単体）・Playwright（E2E）

**Constraints**: 金額は作るときと、支払い方法か割引が変わったときだけ決める。紹介者の名前は主催者だけが読み、ログに出さない。前の版のアプリが同じ DB で動いても壊れない。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 割引も記録するだけ。決済しない |
| II. 個人の情報は最小限 | 紹介者の名前は任意で、聞く割引を選んだときだけ欄を出す。読めるのは主催者だけ（受付係・参加者の答えに入れない）。ログに出さない。消してほしいときは主催者が空にできる。プライバシーポリシーの下書きに足すことを research R12 に書いた |
| III. 気軽さ | 割引は選ぶだけ（既定は割引なし）。紹介者は任意。割引のない交流会には何も出ない |
| IV. 小さく始める | 割引の種類は「円の額」だけ（率・期限・人数の上限は作らない）。消さずに使うのをやめるだけ。PRD を先に直す（B1 を置きかえ、FR-23〜FR-25） |
| V. 運用費ゼロに近く | 新しい資源・依存はない |
| 技術の制約 | reception は event の `findEventDiscount`・`listEventDiscounts`・`eventDiscountTable` を index.ts から使い、event の表を読まない |

違反なし。設計のあとも同じ。

## Project Structure

```text
specs/reception/002-discounts/   spec・plan・research・data-model・quickstart・tasks・contracts/discounts.md・checklists/
packages/contracts/src/event/event.ts（＋test）         # EventDiscountInput・EventDiscountView・EventInput/View/Summary の discounts
packages/contracts/src/event/errors.ts・index.ts
apps/api/src/modules/event/schema.ts                   # event_discount
apps/api/src/modules/event/discounts.ts（＋test）        # 割引の読み書き（並びを保存・探す）
apps/api/src/modules/event/summary.ts・routes.ts・index.ts
apps/api/drizzle/0006_event_discount.sql
apps/web/src/features/event/EventFormPage.tsx（＋test）・DiscountFields.tsx
packages/contracts/src/reception/checkin.ts（＋test）・errors.ts・index.ts
apps/api/src/modules/reception/schema.ts・amount.ts（＋test）・discount.ts・repository.ts・views.ts・csv.ts（＋test）・routes.ts
apps/api/src/modules/reception/discounts.test.ts        # 金額の決まり・権限・CSV の結合のテスト
apps/api/drizzle/0007_checkin_discount.sql
apps/web/src/features/reception/checkin-form.ts（＋test）・CheckinFields.tsx・CheckinPage.tsx・ManualCheckinForm.tsx・CheckinEditDialog.tsx・ParticipantsTab.tsx・TotalsTab.tsx（＋test）・format.ts
e2e/tests/discounts.spec.ts
docs/apps/event.md・docs/apps/reception.md・docs/architecture.md
_bmad-output/prd-kanaeru-reception/・architecture-kanaeru/・ux-kanaeru-reception/
```

**Structure Decision**：金額の決め方は reception の `amount.ts` の1か所。チェックインの割引を決める処理（選べるか・写すか・紹介者を残すか）は reception の `discount.ts` に集め、作る・直すの両方が使う。紹介者を答えから外すのは `views.ts` の1か所（役目を受け取る）。

## Complexity Tracking

| 増えたもの | なぜ要るか | もっと簡単な案を選ばなかった理由 |
|---|---|---|
| 複合の外部キー `(event_id, discount_id)` | 別の交流会の割引を指せないよう DB で守る | 単の外部キーだと、アプリの確かめだけになる |
| 紹介者を答えから外す役目の引数 | 受付係に第三者の名前を見せない（Constitution II） | 別の窓口に分けると、画面の状態が増える |
