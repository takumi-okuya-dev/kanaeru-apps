# Implementation Plan: アカウント・LINE ログイン・今の利用者（account-001）

**Branch**: `feature/account-001-line-login` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口とほかの領域が使う名前は [contracts/account.md](./contracts/account.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

account の領域を足す：`account`・`session` の表、LINE の ID トークンを verify で確かめて自前のセッション（札の SHA-256 を DB に、札をクッキーに）を出す窓口、ログアウト・今の利用者・主催者だけのアカウントの削除・試験用のログインの窓口。ほかの領域には `requireSession`・`currentAccount(c)`・`isOrganizer`・`findAccountById`・`deleteAccount`・`accountTable` を出す。画面には `useSession()`・`SessionGate`（401 で1度だけ自動でログインし直す）・手元のログインの画面を出す。土台には、領域が読んでよい設定と外への出口（`fetch`）を渡す形と、`TEST_LOGIN_ENABLED` を足す。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26.13

**Primary Dependencies**: Hono 4.13（`hono/cookie`・`hono/factory`）・@hono/zod-openapi・zod 4・Drizzle 0.45・node:crypto・React 19・TanStack Router/Query・`@line/liff` 2.32（`lib/liff.ts` 経由）。新しい依存は足さない。

**Storage**: PostgreSQL 18（`account`・`session` を足す DB の変更を1つ）

**Testing**: Vitest（API の結合は本物の PostgreSQL。LINE の確かめは `fetch` の差しかえ）・Testing Library（画面）・Playwright（E2E。試験用のログイン）

**Target Platform**: Cloud Run の1つのコンテナ・LINE の中の LIFF ブラウザと外のブラウザ

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: LINE への要求は5秒で打ち切る。ID トークン・クッキー・札をログに出さない。画面は `liff.init()` を書かない（`getLiff()`）。

**Scale/Scope**: 参加者は1回の交流会で数十人。セッションの引きは一意の索引で1回。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関係しない |
| II. 個人の情報は最小限 | 持つのは LINE のユーザー ID・表示名・登録日だけ。本人は ID トークンを API が verify で確かめて決め、画面のプロフィールを受け取らない（入力は `idToken` だけの strict な形）。LINE のトークンを保存しない。札は hash だけを DB に。ID トークン・クッキーをログに出さない。消す関数と窓口を出す（FR-16） |
| III. 気軽さ | LINE の中では文字を打たずにログインが済み、セッションが切れても自動でやり直す |
| IV. 小さく始める | 消す画面・受付係の権限は作らない（event・reception）。セッションの延長・定期の掃除は作らない |
| V. 運用費ゼロに近く | 新しい資源を足さない（定期の仕事なし） |
| 技術の制約 | Better Auth を使わない。クッキーは `HttpOnly; Secure; SameSite=Lax`（http の手元だけ `Secure` なし） |

違反なし。設計のあとも同じ。

## Project Structure

### Documentation (this feature)

```text
specs/account/001-line-login/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/account.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
packages/contracts/src/account/
├── errors.ts                 # ACCOUNT_ERRORS（UNAUTHENTICATED・LINE_LOGIN_FAILED・LINE_UNREACHABLE）
├── account.ts（＋test）        # LineLoginInput・TestLoginInput・CurrentAccountView・LINE_USER_ID_FORMAT
└── index.ts
apps/api/src/kernel/
├── http.ts                   # DomainRouteDeps に config（DomainConfig）・fetch（共通の変更）
└── config.ts                 # TEST_LOGIN_ENABLED（共通の変更）
apps/api/src/app.ts           # routeDeps に config・fetch、AppDeps.fetch（共通の変更）
apps/api/src/modules/account/
├── schema.ts                 # account・session
├── repository.ts             # upsert・セッションを作る/引く/消す・findAccountById・deleteAccount
├── line-verifier.ts（＋test）  # LineIdTokenVerifier と fetch で作る形（aud で client_id を選ぶ・5秒）
├── session.ts                # 札・hash・クッキー・requireSession・currentAccount・requireOrganizer・isOrganizer
├── routes.ts                 # 5つの窓口
├── account.test.ts           # 結合のテスト
└── index.ts
apps/api/src/modules.list.ts  # 1行
apps/api/drizzle/0002_account.sql
apps/api/test/helpers/        # app.ts（既定の出口）・account.ts（loginAs・withCookie）
apps/web/src/lib/api.ts       # onUnauthenticated（共通の変更）
apps/web/src/features/account/
├── api.ts                    # createApiClient<ModuleRoutes["account"]>()
├── session.ts                # useSession・自動のログイン・401 の受け取り
├── SessionGate.tsx（＋test）
├── DevLoginPage.tsx（＋test）
├── routes.ts・index.ts
apps/web/src/features.list.ts # 1行
e2e/tests/account.spec.ts     # 手元のログイン → 今の利用者・axe
docs/apps/account.md・docs/architecture.md・docs/README.md・docs/rules/coding.md（6-1 の設定の一覧・6-5 のテストの手伝い）・.env.example・e2e/env.ts・apps/api/vitest.config.ts
```

**Structure Decision**: 本人の決め方（LINE の確かめ）は `line-verifier.ts` に閉じ、道は `LineIdTokenVerifier` の形だけを使う（テストは `fetch` の差しかえで LINE の答えを作る）。セッションの札とクッキーと middleware は `session.ts` に1つ。共通の変更は「領域に設定と外への出口を渡す」一般の形にとどめ、別のコミットにする（research R1）。

## Complexity Tracking

| 増えたもの | なぜ要るか | もっと簡単な案を選ばなかった理由 |
|---|---|---|
| 土台の `DomainRouteDeps` に2つの欄 | account が設定（チャネル ID・主催者・画面の源・試験用の印）と LINE への出口を要る | 設定をまるごと渡すと秘密が領域に渡る。account の型を土台に足すと境界が逆になる |
