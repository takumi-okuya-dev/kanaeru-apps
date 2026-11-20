# Implementation Plan: Threads の運用（threads-001）

**Branch**: `feature/threads-001-core-port` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## 移し方

| めぐる | kanaeru |
|---|---|
| Cloudflare Workers・Neon・Clerk | Cloud Run・Cloud SQL・LINE ログイン（account の `requireSession`・`currentAccount`） |
| `apps/api/src/apps/threads/`（Hono の `.get` など） | `apps/api/src/modules/threads/`（`createRoute` と `@hono/zod-openapi`） |
| `packages/shared/src/*.ts`（業務の計算と zod） | 計算は `packages/contracts/src/threads/` に写し、窓口の形は `schemas.ts` に書き直す（日本語の誤りの文） |
| `threads` スキーマの表・列挙型 | `public` の `threads_*` の表・`text` と CHECK |
| `authorizeAccount`（持ち主・担当・見る人） | 持ち主だけ（`findOwnedAccount`。チームは移さない） |
| react-router・Radix・sonner | TanStack Router・`@workspace/ui`・`showNotice`（上の帯）と `ResponseMessage` |

## 作ったもの

- 約束：`packages/contracts/src/threads/`（`schemas.ts`・`errors.ts`・`index.ts` と、めぐるから写した `drafts`・`similarity`・`prompt`・`strategy`・`review`・`ng-words`・`policy`・`normalize`・`text`・`threads-text`・`limits`・`performance`・`promotion-event`・`research`・`schedule` とそのテスト）
- 表：`apps/api/src/modules/threads/schema.ts`・`apps/api/drizzle/0008_threads.sql`（表を足すだけ）
- API：`repository.ts`・`routes.ts`・`views.ts`・`index.ts`・`threads.test.ts`、`modules.list.ts` に1行
- 画面：`apps/web/src/features/threads/`、`features.list.ts` に1行
- 通し：`e2e/tests/threads.spec.ts`、`e2e/env.ts` の `DOMAIN_FEATURES`
- 文書：PRD・この仕様・`docs/apps/threads.md`・`docs/README.md`・`docs/rules/specs.md`・`docs/decisions.md` に1行ずつ

## PR の分け方（並行開発の決まり 3-3・4）

1. 共通の PR：`e2e/env.ts` の `DOMAIN_FEATURES` に `threads.app` を足す（またはこの PR に含めてよいか主催者に確かめる）
2. 文書の PR：PRD（`_bmad-output/prd-threads/`）
3. DB の変更の PR：`schema.ts` と `0008_threads.sql`（develop に同時に1本だけ。番号がぶつかったら作り直す）
4. 機能の PR：約束・API・画面・テスト・文書

## 守り

- ほかの人の記録に届かない：どの道も `findOwnedAccount` を通り、下の表は運用アカウントの ID で絞る。
- 本文をログに出さない：threads のコードは logger を使わない。
- 外の AI に送らない：プロンプトは画面に出してコピーするだけ。
