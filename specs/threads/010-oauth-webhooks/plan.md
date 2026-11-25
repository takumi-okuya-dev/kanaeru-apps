# Implementation Plan: OAuth の接続と Meta の Webhook（threads-010）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `threads.oauth_states`・`threads_deletion_requests` | `threads_oauth_state`・`threads_deletion_request` |
| `connection/threads-oauth.ts`・`threads-connect-routes.ts`（connect・callback・complete） | `modules/threads/oauth.ts`（`startOauth`・`completeOauth`）・`routes-oauth.ts` |
| `revocation.ts`・`data-deletion.ts`・`threads-webhook-routes.ts`・`data-deletion-routes.ts` | `oauth.ts`（`handleUninstall`・`receiveDeletion`・`attemptDeletion`・`runOauthMaintenance`・`deletionStatus`）・`routes-oauth.ts` |
| `adapters/threads-api/signed-request.ts`・`THREADS_APP_SECRET` | `kernel/meta-app.ts`（共通。秘密の値を渡さない道具） |
| 偽の Threads の OAuth | `fake-threads.ts`（認可の画面・code の交換・長期への交換） |
| `threads-complete.tsx`・`data-deletion.tsx`・接続の方法の画面 | `OauthCompletePage.tsx`・`DataDeletionPage.tsx`・`OauthConnect.tsx`（設定の接続の節） |

## 作ったもの

- 約束：`oauth.ts`
- 表：`apps/api/drizzle/0016_threads_oauth.sql`（足すだけ）
- API：`oauth.ts`・`routes-oauth.ts`、`fake-threads.ts`・`job-runner.ts`（片付けで、止まった削除のやり直しと切れた state）・`index.ts`
- 共通：`kernel/config.ts`（`THREADS_APP_ID`・`THREADS_APP_SECRET`）・`kernel/meta-app.ts`・`kernel/meta-app.test.ts`・`kernel/http.ts`（`metaApp`）・`app.ts`（道具を渡す・Webhook の道は csrf を通さない）・`test/app.test.ts`・`test/config.test.ts`・`.env.example`・`e2e/env.ts`
- 画面：`OauthConnect.tsx`・`OauthCompletePage.tsx`・`DataDeletionPage.tsx`、`AutoPostSettings.tsx`・`paths.ts`・`routes.ts`・`index.ts`・`api.ts`
- テスト：`apps/api/src/modules/threads/oauth.test.ts`・`apps/api/src/kernel/meta-app.test.ts`・`e2e/tests/threads.spec.ts`（偽の認可の画面を通る通しの接続と、削除の状況の画面）

## PR の分け方

1. 共通の変更の PR（設定・`kernel/meta-app.ts`・`DomainRouteDeps.metaApp`・組み立ての csrf・`.env.example`）
2. DB の変更の PR：`schema.ts` と `0016_threads_oauth.sql`
3. 機能の PR：ほか全部
