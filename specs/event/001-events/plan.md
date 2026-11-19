# Implementation Plan: 交流会・要約・QR・受付係と招待・アンケートの開閉・権限（event-001）

**Branch**: `feature/event-001-events` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口とほかの領域が使う名前は [contracts/event.md](./contracts/event.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

event の領域を足す：`event`・`event_staff`・`staff_invite` の表、交流会の作成・直す・一覧・詳細・要約・アンケートの開閉・招待のリンク（作る・作り直す・読む・受ける）・受付係の一覧と外すの窓口。ほかの領域には `getEventRole`・`requireEventRole`・`currentEventRole`・`getEventSummary`・`eventTable` を出す。画面には A1・A2・A4（QR の表示と印刷・招待・受付係・アンケートの開閉）・P3 と、管理の画面の行き来の `EventAdminNav` を出す。管理の画面の道は event の約束に定数で置く。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26.13

**Primary Dependencies**: Hono 4.13・@hono/zod-openapi・zod 4・Drizzle 0.45・node:crypto・React 19・TanStack Router/Query・`uqr` 0.1.3（新しい依存。QR の点の並びを作る。依存なし）

**Storage**: PostgreSQL 18（3つの表を足す DB の変更を1つ）

**Testing**: Vitest（API の結合は本物の PostgreSQL・約束の単体・画面の単体）・Playwright（E2E。試験用のログイン・主催者は `e2e/env.ts` の決まった LINE のユーザー ID）

**Target Platform**: Cloud Run の1つのコンテナ・LINE の中の LIFF ブラウザと PC のブラウザ

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: 役目は要求のたびに引く。招待の印をログに出さない。QR に置き場所の URL を入れない（本番）。画面に HTML の文字を差しこまない（QR は React の SVG）。

**Scale/Scope**: 交流会は月に数回・受付係は1回に数人。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 参加費は金額を持つだけ（円の整数）。決済はしない |
| II. 個人の情報は最小限 | 受付係の一覧は表示名だけ（account から引く。写さない）。要約に受付係・招待の印を含めない。招待の印はログに出さない |
| III. 気軽さ | 受付QRはミニアプリの URL。受付係はリンクを開いて「受ける」だけ |
| IV. 小さく始める | 交流会を消す・受付係ごとのリンク・機能の印は作らない |
| V. 運用費ゼロに近く | 新しい資源を足さない。QR は画面で作る |
| 技術の制約 | 境界は index.ts からだけ。account の `requireSession`・`isOrganizer` を使い、クッキーとセッションの表を読まない |

違反なし。設計のあとも同じ。

## Project Structure

### Documentation (this feature)

```text
specs/event/001-events/
├── spec.md・plan.md・research.md・data-model.md・quickstart.md・tasks.md
├── contracts/event.md
└── checklists/requirements.md
```

### Source Code

```text
packages/contracts/src/event/
├── errors.ts                   # EVENT_ERRORS（FORBIDDEN・NOT_FOUND・STAFF_INVITE_INVALID・STAFF_INVITE_EXPIRED）
├── event.ts（＋test）            # EventInput・EventView・EventListItem・EventSummary・SurveyStateInput・StaffInviteView・…
├── admin-paths.ts（＋test）      # ADMIN_ROUTE_PATTERNS・adminPaths・EVENT_ROLES
└── index.ts
apps/api/src/modules/event/
├── schema.ts                   # event・event_staff・staff_invite
├── repository.ts               # 読み書き
├── access.ts                   # getEventRole・requireEventRole・currentEventRole
├── ids.ts                      # uuid と招待の印の形・印を作る
├── summary.ts                  # getEventSummary
├── routes.ts                   # 窓口
├── event.test.ts・access.test.ts # 結合のテスト
└── index.ts
apps/api/src/modules.list.ts    # 1行
apps/api/test/helpers/event.ts  # createEvent・makeStaff・call（reception・survey のテストも使う）
apps/api/drizzle/0003_event.sql
apps/web/src/features/event/
├── api.ts・queries.ts           # 窓口の呼び出しと問い合わせの鍵・useEvent
├── format.ts（＋test）           # 日本時間の日時・参加費・日付と時刻の欄
├── links.ts（＋test）            # QR と招待のリンクの中身（miniAppPermalink）
├── admin-tabs.ts・EventAdminNav.tsx（＋test）
├── QrCode.tsx（＋test）・QrPrintPage.tsx・print.css
├── EventListPage.tsx・EventFormPage.tsx（＋test）・EventSetupPage.tsx・InviteAcceptPage.tsx
├── EventAccessGate.tsx          # 交流会の読みこみと役目の確かめ（403・404・主催者だけ）
├── navigation.tsx               # 登録された道の読み方・ほかの領域の画面へのリンク
├── routes.ts・index.ts
apps/web/src/features.list.ts   # 1行
e2e/tests/event.spec.ts
e2e/env.ts・e2e/tests/{a11y,keyboard,health}.spec.ts・apps/web/src/router.tsx・apps/web/src/shell/AppShell.tsx（共通。research R9・R13）
docs/apps/event.md・docs/architecture.md・docs/README.md・docs/rules/coding.md（6-3・6-5）
```

**Structure Decision**：権限は `access.ts` に1つ（reception・survey が使う）。要約は `summary.ts`（窓口と index.ts の関数が同じものを使う）。画面のナビの項目は `admin-tabs.ts` の1か所の並び（道の定数と役目）から作る。

## Complexity Tracking

| 増えたもの | なぜ要るか | もっと簡単な案を選ばなかった理由 |
|---|---|---|
| 新しい依存 `uqr` | QR を作る | 自分で QR の符号を書くと誤りやすい。API で作ると LIFF ID の設定が要る |
| 共通のファイル（E2E の4つ・router.tsx・AppShell.tsx） | 主催者の E2E と、はじめの画面がナビへ移ること | 主催者の LINE のユーザー ID は E2E の設定の1か所で決める決まり（coding.md 6-5）。router.tsx と AppShell.tsx は領域が2つ以上で必ずぶつかる（research R13） |
