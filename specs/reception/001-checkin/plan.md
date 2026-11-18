# Implementation Plan: チェックイン・合計・内訳・参加者の書き出し（reception-001）

**Branch**: `feature/reception-001-checkin` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口とほかの領域が使う名前は [contracts/reception.md](./contracts/reception.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

reception の領域を足す：`checkin` の表、自分のチェックイン（読む・作る）・一覧（同じ名前の印つき）・手でのチェックイン・直す・取り消す・合計・内訳・参加者の CSV の窓口。survey には `findCheckin`・`getCheckin`・`listCheckins`・`checkinTable` を出す。画面には P1（チェックインの画面）・A3（一覧画面の参加者・合計）・A5（書き出しと削除）と、survey が節を足す差しこみの場所を出す。選択肢のチップは `@workspace/ui` に足す（共通）。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26.13

**Primary Dependencies**: Hono 4.13・@hono/zod-openapi・zod 4・Drizzle 0.45・React 19・TanStack Router/Query・Base UI（`RadioGroup`・`Radio`。既にある依存）。新しい依存はない

**Storage**: PostgreSQL 18（1つの表を足す DB の変更を1つ）

**Testing**: Vitest（API の結合は本物の PostgreSQL・約束の単体・画面の単体）・Playwright（E2E。試験用のログイン・主催者は `e2e/env.ts` の `E2E_ORGANIZER_LINE_USER_ID`）

**Target Platform**: Cloud Run の1つのコンテナ・LINE の中の LIFF ブラウザと PC のブラウザ

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: 金額は作るときと支払い方法を直すときだけ決める。権限は要求のたびに引く。名前をログに出さない。CSV は式の差しこみを防ぐ。一覧は5秒おきに読み直す（つなぎっぱなしにしない）。

**Scale/Scope**: 1回の交流会で数十人・受付係は数人。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 支払い方法と金額を記録するだけ。決済しない |
| II. 個人の情報は最小限 | 持つのは名前と3つの選択肢と金額だけ。入れた人の名前は写さない（R2）。名前をログに出さない。本人のアカウントを消すとチェックインも消える（CASCADE）。内訳・CSV・削除は主催者だけ |
| III. 気軽さ | P1 は選ぶだけで済み、名前は初期値あり。二重に押してもエラーにしない（R3）。手でのチェックインで受付を止めない |
| IV. 小さく始める | 名簿の取り込み・機能の印・参加者が自分で直す機能は作らない |
| V. 運用費ゼロに近く | 新しい資源・依存を足さない。読み直しは5秒おきの問い合わせ |
| 技術の制約 | event の `requireEventRole`・`getEventSummary`、account の `requireSession`・`currentAccount`・`findAccountById` を index.ts から使い、ほかの領域の表を読まない |

違反なし。設計のあとも同じ。

## Project Structure

### Documentation (this feature)

```text
specs/reception/001-checkin/
├── spec.md・plan.md・research.md・data-model.md・quickstart.md・tasks.md
├── contracts/reception.md
└── checklists/requirements.md
```

### Source Code

```text
packages/contracts/src/reception/
├── options.ts                 # 選択肢の code・言葉・並び（zod を読まない）
├── name.ts                    # normalizeCheckinName（同じ名前の比べ方）
├── errors.ts                  # RECEPTION_ERRORS（CHECKIN_NOT_FOUND）
├── checkin.ts（＋test）         # CheckinInput・CheckinView・MyCheckinState・Totals・Breakdown …
└── index.ts
apps/api/src/modules/reception/
├── schema.ts                  # checkin
├── repository.ts              # 読み書き（findCheckin・getCheckin・listCheckins も）
├── amount.ts                  # 金額の決め方
├── views.ts                   # 一覧の形（同じ名前の印・入れた人の名前）
├── csv.ts（＋test）             # CSV
├── routes.ts                  # 窓口
├── reception.test.ts・exports.test.ts # 結合のテスト
└── index.ts
apps/api/src/modules.list.ts   # 1行
apps/api/test/helpers/reception.ts # checkIn・manualCheckIn（survey のテストも使う）
apps/api/drizzle/0004_reception.sql
packages/ui/src/components/choice-chips.tsx（＋test）  # 共通（R14）
apps/web/src/features/reception/
├── api.ts・queries.ts           # 窓口の呼び出し・問い合わせの鍵（["reception", …]）
├── format.ts（＋test）           # 選択肢の言葉・時刻・円
├── checkin-form.ts（＋test）     # 入力の確かめ（約束で確かめ、欄ごとの誤りにする）
├── CheckinFields.tsx           # 名前と3つのチップ（P1・手でのチェックイン・直す枠）
├── CheckinPage.tsx（＋test）     # P1
├── ReceptionPage.tsx・ParticipantsTab.tsx・TotalsTab.tsx・CheckinEditDialog.tsx・ManualCheckinForm.tsx # A3
├── DataPage.tsx                # A5
├── slots.ts（＋test）            # 差しこみの場所（R10）
├── routes.ts・index.ts
apps/web/src/features.list.ts  # 1行
e2e/tests/reception.spec.ts
docs/apps/reception.md・docs/architecture.md・docs/README.md・docs/rules/coding.md（6-3・6-5）
```

**Structure Decision**：金額の決め方は `amount.ts` の1か所（作る・直すの両方が使う）。同じ名前の印は約束の `normalizeCheckinName` で比べ、`views.ts` が付ける。画面の入力の欄は `CheckinFields` の1つを P1・手・直すで使う。

## Complexity Tracking

| 増えたもの | なぜ要るか | もっと簡単な案を選ばなかった理由 |
|---|---|---|
| 共通のファイル `packages/ui/src/components/choice-chips.tsx` | P1・A3・P2 のチップ（DESIGN の choice-chip） | 部品は `@workspace/ui` に置く決まり。survey も使う（R14） |
| 差しこみの場所（`slots.ts`） | survey が A5 と A3 の枠に節を足す | reception のフォルダを survey が直さないため（R10） |
