# Implementation Plan: スイートの組織と、退会の手順の組み立て（suite-001）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 置き場所

| 所 | ファイル |
|---|---|
| 約束 | `packages/contracts/src/suite/organization.ts`（入出力の形）・`organization-errors.ts`（役割・上限・エラー。zod を読まない）、`packages/contracts/src/account/withdrawal.ts`（退会の確かめの中身）、`packages/contracts/src/core/participant-paths.ts`（`join` の道）・`apps.ts`（予約語 `join`） |
| 表 | `apps/api/src/modules/suite/schema.ts`：`organization`・`organization_member`（主キーは組織と account の組・管理者の部分の一意の制約・`demoted_at`）・`organization_invite`（`token_hash` と包んだ写し）・`entitlement`（持ち主の CHECK） |
| API | `modules/suite/organizations.ts`（読み書き）・`routes-organization.ts`（窓口と判定の1か所）・`withdrawal.ts`（退会の段 (1) と `adminAfterWithdrawal`）・`entitlement.ts`（`hasEntitlement`）・`index.ts`（ほかの領域に出すもの） |
| 退会の組み立て | `apps/api/src/kernel/withdrawal.ts`（形）・`kernel/http.ts`（`withdrawalSteps`）・`app.ts`（`orderWithdrawalSteps`）・`modules/account/withdrawal.ts`・`routes.ts`（`GET /accounts/me/withdrawal`・退会と消す窓口で流す）・`repository.ts`（`findDisplayNames`） |
| 画面 | `apps/web/src/features/suite/`（組織の一覧・組織の画面・招待の確かめの画面・退会の枠の中身・QR）、`lib/organization.ts`・`lib/feature.ts`（`feature.organization`）・`router.tsx`（属するアプリを付けて渡す）、`features/account/api.ts`（確かめの中身を読む） |

## 窓口

| 動き | 道 | 誰 |
|---|---|---|
| GET・POST | `/api/v1/suite/organizations` | ログインした人（一覧・作る） |
| GET・PATCH・DELETE | `/api/v1/suite/organizations/{id}` | 組織の人（見る）・管理者（名前・消す） |
| GET・POST | `/api/v1/suite/organizations/{id}/invite` | 管理者（札を読む・作り直す） |
| PUT・DELETE | `/api/v1/suite/organizations/{id}/members/{accountId}` | 管理者（役割・外す） |
| POST | `/api/v1/suite/organizations/{id}/transfer`・`/leave` | 管理者（引き継ぐ）・組織の人（抜ける） |
| GET・POST | `/api/v1/suite/organization-invites/{token}` | ログインした人（確かめ・入る） |
| GET | `/api/v1/accounts/me/withdrawal` | ログインした人（退会の確かめの中身） |

## DB の変更

`apps/api/drizzle/0012_suite_organization.sql`（表を4つ足すだけ。前の版のアプリは読まない）。

## 共通の変更（PR を分ける）

この仕様は共通の領域そのもの。PR は「組織（suite と画面）」と「退会の手順の組み立て（kernel・app.ts・account）」に分けられる（`docs/apps/suite.md`・`docs/apps/account.md` を同じ PR で直す）。

## テスト

- 結合：`modules/suite/organization.test.ts`（作る・役割ごとの権限の表・招待・役割・外す・引き継ぐ・抜ける・消す・退会の段・契約の判定）、`test/app.test.ts`（手順の並び）、account の退会の手順
- 単体：約束の組織の形・退会の中身、画面の `lib/organization.test.ts` と組織の画面
- 通し：`e2e/tests/suite-organization.spec.ts`
