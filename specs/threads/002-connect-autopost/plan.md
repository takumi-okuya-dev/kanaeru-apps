# Implementation Plan: Threads への接続と自動投稿（threads-002）

**Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| `adapters/threads-api/threads-client.ts`（Workers の env） | `modules/threads/threads-client.ts`（宛先は設定 `THREADS_API_BASE_URL`、出口は `deps.fetch`。OAuth の部分は入れない） |
| `kernel/crypto.ts`（TokenCipher） | `packages/secret-box`（業務を知らない AES-256-GCM の道具）と `deps.secretBox` |
| `connection/*`（token-connect・connection-service・credentials・recheck・refresh・check） | `modules/threads/connection.ts` |
| `publish/posting-schedule-service.ts`・`auto-post-status.ts`・`publish-claim.ts`・`publish-executor.ts`・`auto-post-runner.ts`・`publish-cleanup.ts` | `posting-schedule.ts`・`auto-post-status.ts`・`publish-claim.ts`・`publish-executor.ts`・`job-runner.ts` |
| Workers の Cron（5分）と KV の関所 | Cloud Scheduler（5分・8時〜23時台）→ `POST /api/v1/threads/jobs/tick`（合言葉）。関所なし |
| `db.batch` | `db.transaction` |
| チーム・料金・テスター・メンション・操作の記録 | 入れない（メンションと操作の記録は threads-005） |
| `test/fake-threads/server.ts` | `modules/threads/fake-threads.ts`（結合のテストは fetch として、E2E は `fake-threads-serve.ts` で口を開ける） |

## 作ったもの

- 共通：`packages/secret-box`・`kernel/config.ts`（`TOKEN_ENCRYPTION_KEYS`・`TOKEN_ENCRYPTION_KEY_VERSION`・`JOB_TRIGGER_SECRET`・`THREADS_API_BASE_URL`）・`kernel/http.ts`（`DomainRouteDeps.secretBox`・`isJobRequest`、`DomainConfig.threadsApiBaseUrl`）・`kernel/job-auth.ts`・`app.ts`・`.env.example`・`e2e/env.ts`・`e2e/playwright.config.ts`・`infra/threads.tf`・`infra/cloud_run.tf`・`infra/variables.tf`・`infra/README.md`
- 約束：`packages/contracts/src/threads/autopost.ts`・`token.ts`・`username.ts`・`queue.ts`（めぐるから写したもの）・`schedule.ts`（選べる幅を足した）・`schemas.ts`（状態を広げた）・`errors.ts`・`limits.ts`
- 表：`schema.ts`・`apps/api/drizzle/0009_threads_autopost.sql`（表と列を足す。案の状態の CHECK は名前を `_v2` にして広げる）
- API：`threads-client.ts`・`connection.ts`・`posting-schedule.ts`・`auto-post-status.ts`・`publish-claim.ts`・`publish-executor.ts`・`job-runner.ts`・`routes-autopost.ts`・`route-helpers.ts`・`locks.ts`・`pg.ts`・`fake-threads.ts`・`fake-threads-serve.ts`、`repository.ts`・`routes.ts`・`views.ts` を直した
- 画面：`AutoPostSettings.tsx`（接続・自動投稿の節）・`AutoPostPanel.tsx`（次の投稿と知らせ）、`StockPage.tsx`・`SettingsPage.tsx`・`api.ts`・`queries.ts` を直した
- テスト：`autopost.test.ts`（結合）・`secret-box.test.ts`・`job-auth.test.ts`・`config.test.ts`・`app.test.ts`・`token`・`queue`・`username`・`schedule` の単体・`e2e/tests/threads.spec.ts`

## PR の分け方

1. 共通の PR：`packages/secret-box`・`kernel/*`・`app.ts`・`.env.example`・`apps/api/test/{config,app}.test.ts`
2. 共通の PR：`infra/*`（Cloud Scheduler の仕事と Secret Manager）
3. DB の変更の PR：`schema.ts` と `0009_threads_autopost.sql`
4. 機能の PR：約束・API・画面・テスト・文書、`e2e/env.ts`・`e2e/playwright.config.ts`（偽の Threads の口）

## 守り

- トークンの平文は `connection.ts` の変数の中だけ。DB には暗号文・IV・鍵の版。ひもづけが運用アカウントの ID なので、別の行に写しても開けない。
- 定期の仕事の窓口は合言葉（時間の差が出ない比べ方）。合わなければ 404。
- 書きこみは接続の世代・持ち時間の札を条件にし、つなぎ直し・ほかの処理の引き継ぎと食い違わない。
