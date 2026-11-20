# Implementation Plan: 予約の名簿（booking-001）

**Branch**: `feature/booking-001-roster` → `feature/booking-001-pr2-roster` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口とほかの領域が使う名前は [contracts/booking.md](./contracts/booking.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

受付アプリに4つ目の領域 booking を足し（`apps.list.ts` の受付の行の `domains`）、交流会ごとの使い方（`booking_setting`）・名簿（`booking_entry`）・ちがう人（`booking_dismissal`）・列の対応（`booking_import_mapping`）を持つ。名簿は手で足す・貼る・CSV（画面の中で読む）で作り、取り消し・同じ名前の印とまとめる・絞りこみと人数・書き出しを出す。チェックインとの当ては booking が読むときに決め（reception は booking を知らない）、受付係の「名簿に当てる」画面で、候補を当てる・ちがう人・名簿から選ぶ・飛び入り・名簿から選んで手でチェックインができる。交流会の日が終わると、当たらなかった確定の行を「来なかった」として出す。reception の `index.ts` に、チェックインした人と「チェックインしたか」と手でのチェックインを作る関数を足す（FR-B103）。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: Hono・@hono/zod-openapi・zod 4・Drizzle 0.45・React 19・TanStack Router/Query・`@workspace/csv`（新しい依存なし。CSV を読む小さな関数は booking の画面の中）

**Storage**: PostgreSQL（表を4つ足す DB の変更を1つ：`0015_booking.sql`）

**Testing**: Vitest（API の結合は本物の PostgreSQL・約束と画面の単体）・Playwright（E2E。`e2e/tests/booking.spec.ts`。axe・1440px と 375px）

**Target Platform**: Cloud Run の1つのコンテナ・PC とスマホのブラウザ（受付係はスマホ）

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: 依存は booking → reception → event の一方向（AD-23）。reception・event の表を読まない（`index.ts` だけ）。名前をログに出さない。DB の変更は表を足すだけ。

**Scale/Scope**: 1つの交流会の名簿は数十〜数百行。取り込みは1回2000行まで。当ては名簿とチェックインをまとめて読み、JavaScript で決める。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 変えない（飛び入りの手でのチェックインは、今の支払い方法と金額の記録のまま） |
| II. 個人の情報は最小限 | 名簿は名前・媒体・メモだけ。メールアドレス・電話を持たない（FR-B26）。CSV は画面の中で読み、名前の列だけを送る（ほかの列は送らない・残さない）。名簿は交流会の中に閉じ、参加者の画面に出さない。名前をログに出さない。参加者本人のアカウントを消すと、その人の申込みも消える（CASCADE） |
| III. 気軽さ | 参加者のチェックインは変えない（名簿がなくても、当たらなくても通る）。受付係は候補を「当てる」1回で済む |
| IV. 小さく始める | 自前のページ・定員・キャンセル待ち・知らせを作らない。値（使い方・入口・状態）は今使うものだけを CHECK に入れ、足すときに広げる |
| V. 運用費ゼロに近く | 新しい資源・定期の仕事を足さない |
| 技術の制約 | 境界は index.ts からだけ（event・reception・account）。画面の部品は `@workspace/ui` と reception の `index.ts` の欄 |

違反なし。設計のあとも同じ。

## セキュリティの確かめ（[開発の流れの決まり](../../../docs/rules/development-flow.md) 2）

**ファイルの受け取り**に当たる（CSV の取り込み）。結論は [research.md](./research.md) R5：サーバーはファイルを受け取らず、画面が名前の列だけを JSON で送る。守りは (1) 行の数と名前の長さの上限（約束）、(2) 書き出しで式として読まれない形（`@workspace/csv`）、(3) 名前をログに出さない、(4) 画面で読むファイルの大きさの上限（5MB）と行の数（2000行）。`docs/security/` の対応表は、サーバーがファイルを受け取らないので直さない。Webhook・決済・中で AI を呼ぶ・パスワード・MCP は当たらない。権限は結合のテストで、受付係の主催者だけの窓口は 403・部員とほかの人は 403・ほかの交流会の行とチェックインは 404・使い方が受付だけなら 409 を確かめる。

## Project Structure

### Documentation (this feature)

```text
specs/booking/001-roster/
├── spec.md
├── research.md
├── data-model.md
├── contracts/booking.md
├── quickstart.md
├── plan.md
└── tasks.md
```

### Source Code

```text
packages/contracts/src/booking/
├── options.ts        # 使い方・入口・状態・来たかの code と言葉（zod を読まない）
├── paths.ts          # 管理の画面の道（BOOKING_ROUTE_PATTERNS・bookingPaths）
├── roster.ts         # 入出力の形（zod）
├── errors.ts         # BOOKING_ERRORS
└── index.ts
apps/api/src/modules/booking/
├── schema.ts         # 4つの表
├── repository.ts     # 表の読み書き
├── matching.ts       # 当ての決め方（読むとき。純粋な関数）
├── importing.ts      # 取り込みの「入る・すでにある・名前が空」（純粋な関数）
├── views.ts          # 名簿の行・人数・受付係の画面の形
├── csv.ts            # 名簿の書き出し
├── routes.ts         # 窓口
├── withdrawal.ts     # 退会の確かめの中身
└── index.ts
apps/api/drizzle/0015_booking.sql
apps/api/src/modules/reception/（manual.ts〈新〉・repository.ts・routes.ts・index.ts：FR-B103 と手でのチェックインの関数）
apps/web/src/features/booking/
├── api.ts・queries.ts
├── nav-items.ts      # 「名簿」のナビ
├── ModeSection.tsx   # 準備の画面の「使い方」の節（event の差しこみの場所）
├── ReceptionRosterSection.tsx # 一覧画面の上の「名簿」の節（reception の差しこみの場所）
├── RosterPage.tsx    # A2 名簿
├── ImportPage.tsx    # A3 入れる（貼る・CSV）
├── csv-read.ts       # CSV を読む（文字コード・切り方）
├── MatchPage.tsx     # S1 名簿に当てる
├── routes.ts
└── index.ts
apps/web/src/features/event/setup-slots.ts（新）と EventSetupPage.tsx・index.ts
apps/web/src/features/reception/slots.ts・ReceptionPage.tsx・index.ts
packages/contracts/src/core/apps.list.ts（受付の行の domains と accountData）
apps/api/src/modules.list.ts・apps/web/src/features.list.ts（1行ずつ）
apps/api/test/helpers/booking.ts（新）
e2e/tests/booking.spec.ts
docs/apps/booking.md（新）・docs/apps/reception.md・docs/apps/event.md・docs/README.md
```

## PR の分け方

1. `feature/booking-001-roster`（DB の変更の PR）：仕様のフォルダ・`packages/contracts/src/booking/options.ts`（CHECK の値）・`apps/api/src/modules/booking/schema.ts`・`0015_booking.sql`・選択肢の値が DB に入る結合のテスト。領域の登録（一覧の行）はしない（窓口がない領域を登録しない）。
2. `feature/booking-001-pr2-roster`（1の上）：領域の登録・窓口・当て・reception の index の関数・画面・差しこみの場所・E2E・今の形の文書。

## Complexity Tracking

| 決まりから外れること | 理由 | もっと単純な案を取らない理由 |
|---|---|---|
| booking の交流会を指す外部キーを `CASCADE`（AD-7 は `RESTRICT`） | 退会の段は event が booking より先に流れ、組織に入れていない交流会を消す。名簿は持ち主のデータ（AD-19） | `RESTRICT` だと名簿のある交流会の持ち主が退会できない。booking の段を event より先に流す作りは、組み立て（共通）を変えることになる（research R11） |
| event・reception の画面に差しこみの場所を足す | 準備の画面に「使い方」、一覧画面に「名簿」の入口を出すため | 同じ受付アプリの画面で、この作業場所が持つ。差しこみの場所は並行開発の決まり 3-1 の形（research R13） |
