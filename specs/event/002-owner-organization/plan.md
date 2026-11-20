# Implementation Plan: 交流会の持ち主と組織（event-002）

**Branch**: `feature/event-002-owner-organization` → `feature/event-002-pr2-roles` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口とほかの領域が使う名前は [contracts/event.md](./contracts/event.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

交流会に持ち主（`event.owner_account_id`）と「組織に入れる」（`event_organization`）を足し、交流会ごとの権限を「運営者の設定」から「持ち主と、入れた組織の管理者・編集者」に替える。判定は event の `access.ts` の1つの関数（`resolveEventAccess`）にまとめ、`requireEventRole`・`getEventRole` と一覧がそれを通る（reception・survey の API は今のまま `requireEventRole` を使うので直さない。reception の画面は A5 の削除だけを直す。research R11）。組織に入れる・外す窓口、退会の段（組織の交流会は管理者に引き継ぎ・個人の交流会は消す・チェックインがあれば 409）、一覧と準備の画面の「持ち主と組織」を足す。今の交流会は、運営者が一覧を開いたときに運営者のものにする（research R1）。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: Hono・@hono/zod-openapi・zod 4・Drizzle 0.45・React 19・TanStack Router/Query（新しい依存なし）

**Storage**: PostgreSQL（列を1つ・表を1つ足す DB の変更を1つ）

**Testing**: Vitest（API の結合は本物の PostgreSQL・約束と画面の単体）・Playwright（E2E。`e2e/tests/event.spec.ts`）

**Target Platform**: Cloud Run の1つのコンテナ・LIFF ブラウザと PC のブラウザ

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: 役目は要求のたびに引く（AD-5）。suite の表を読まず suite の `index.ts` を使う（AD-22）。reception の表を読まない（チェックインがあるかは外部キーに止めさせる。research R2）。DB の変更は前の版のアプリで壊れない形（coding.md 3）。

**Scale/Scope**: 主催者ごとに交流会は月に数回・組織は数人〜数十人。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 変えない |
| II. 個人の情報は最小限 | 持ち主は表示名だけを答えに入れる（account から引き、写さない）。組織の名前は suite から引く。ほかの人の交流会は運営者にも見せない（FR-B7） |
| III. 気軽さ | 参加者・受付係の画面は変えない。持ち主のない今の交流会でも、受付と要約は止まらない |
| IV. 小さく始める | 部員の画面・交流会を消す窓口・絞りこみの窓口は作らない。契約は売り始めるときに足す |
| V. 運用費ゼロに近く | 新しい資源・定期の仕事を足さない |
| 技術の制約 | 境界は index.ts からだけ（account・suite）。`isOrganizer` は運営者の account を知るため（今のデータを埋める）だけに使い、権限に使わない |

違反なし。設計のあとも同じ。

## セキュリティの確かめ（[開発の流れの決まり](../../../docs/rules/development-flow.md) 2）

ファイルの受け取り・外からの知らせ（Webhook）・決済・中で AI を呼ぶ・パスワードのログイン・MCP は、どれも当たらない（対応表を直す作業はない）。権限の範囲が広がる（だれでも作れる・組織の人が主催者）ので、結合のテストで次を確かめる：ほかの人の交流会の主催者の窓口は運営者でも 403（event・reception・survey）・部員は 403・組織から外れたら次の要求から 403・組織に入れる・外すのは持ち主だけ。

## Project Structure

### Documentation (this feature)

```text
specs/event/002-owner-organization/
├── spec.md
├── research.md
├── data-model.md
├── contracts/event.md
├── quickstart.md
├── plan.md
└── tasks.md
```

### Source Code

```text
apps/api/src/modules/event/
├── schema.ts          # owner_account_id・event_organization
├── repository.ts      # 作るときの持ち主・主催者と受付係の一覧・持ち主の埋め・組織に入れる
├── access.ts          # resolveEventAccess（判定の1か所）・requireEventRole・getEventRole
├── organization.ts    # 組織に入れる・外す・状態（新）
├── withdrawal.ts      # 退会の段（新）
├── summary.ts         # EventView に持ち主・組織
├── routes.ts          # 作る（だれでも）・一覧・組織の窓口
└── index.ts           # withdrawal を出す
apps/api/drizzle/0014_event_owner.sql
packages/contracts/src/event/（roles.ts・event.ts・errors.ts・index.ts）
apps/web/src/features/event/（EventListPage・EventSetupPage・OwnerOrganizationSection〈新〉・EventFormPage・api・queries）
apps/web/src/features/reception/DataPage.tsx（運営者でない主催者の削除。research R11）
apps/api/test/helpers/event.ts（組織に入れる手伝い）
e2e/tests/event.spec.ts
docs/apps/event.md ほか今の形の文書
```

## PR の分け方

1. `feature/event-002-owner-organization`（DB の変更の PR）：仕様のフォルダ・`schema.ts`・`0014_event_owner.sql`・作るときに持ち主を書く・運営者が一覧を開くと持ち主を埋める（権限は前のまま）。
2. `feature/event-002-pr2-roles`（1の上）：判定・窓口・退会の段・画面・今の形の文書。

## Complexity Tracking

なし。
