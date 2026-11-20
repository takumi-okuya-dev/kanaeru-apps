# Implementation Plan: 組織の上の Threads のチーム運用（threads-013）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `access/access.ts`（`authorizeAccount`・関わり）・`packages/shared/src/permissions.ts` | `modules/threads/access.ts`（関わりと7つのまとまり）・`route-helpers.ts`（`ownedAccount`・`accountAccess`）・各 `routes*.ts` のまとまりの指定 |
| `teams/team-service.ts`（組織に入れる・見せる・担当）・`account-team-routes.ts` | `team.ts`・`routes-team.ts`（`GET/PUT …/accounts/{id}/team…`・`GET …/accounts/{id}/access`・`/api/v1/threads/organizations/…`・`/api/v1/threads/team-notices`） |
| `teams/team-status.ts`（020） | `team-status.ts`（`GET /api/v1/threads/organizations/{id}/status`）・約束の `teamGrowthOf` |
| 013 の退会（チームのデータを消す） | `withdrawal.ts`（組織に入れたものは管理者に引き継ぐ。めぐるとの違い） |
| `components/team/*`・`pages/team*.tsx` | 画面の `features/threads/`（組織の一覧・組織の画面・担当の表・運用状況・見せてもらう画面・設定の組織の区分とチームのカード・知らせ・切り替えの担当の分け） |

## 表

`apps/api/drizzle/0013_threads_team.sql`（表を2つ・空を許す列を足すだけ。今の運用アカウントには行を作らない）。

## 共通のファイル

この仕様では、threads の領域のフォルダと DB の変更のファイルのほかに、`packages/contracts/src/threads/limits.ts` の運用状況の操作の名前を kanaeru の名前に直した（`drafts_added`）。組織の画面の入口と招待の説明は、`feature.organization`（suite-001 で作った仕組み）に1項目を足しただけ。

## テスト

- 結合：`modules/threads/team.test.ts`（関わり × 操作の表・任せる・役割を下げる・抜ける・外す・消す・運用状況の範囲と中身・退会の引き継ぎ・やり直し）
- 単体：約束の `teamGrowthOf`、画面のナビ・組織の画面
- 通し：`e2e/tests/threads-team.spec.ts`

## PR の分け方

1. DB の変更の PR：`schema.ts` と `0013_threads_team.sql`（suite の `0012` のあと）
2. 機能の PR：ほか全部（suite-001 の組織と退会の組み立てのあと）
