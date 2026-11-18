# Implementation Plan: 共通の土台（core-001）

**Branch**: `feature/core-001-foundation` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)、ほかの領域が使う名前は [contracts/core.md](./contracts/core.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

テンプレートの骨組みから見本の領域 `notes` を消し、kanaeru の領域（account・event・reception・survey）が並行して始められるよう、構成の決めごとの「最初に入れる共通の PR」をまとめて入れる：設定（LINE・主催者・オープンチャット・画面の場所）、DB に届かないときの `503 DB_UNAVAILABLE`（土台の1か所）、API が組み立てた画面を返すことと画面の CSP（LIFF の源）、`lib/liff.ts`（LIFF の始め方の1か所・LIFF ID がなければ仮の形）、`contracts/src/core` の参加者の道・パーマリンク・日本時間の関数、見た目の値の墨。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26.13

**Primary Dependencies**: Hono 4.13・@hono/node-server 2.1（`serveStatic`）・@hono/zod-openapi・zod 4・Drizzle 0.45・Vite 8・React 19・TanStack Router・**@line/liff 2.32（足す）**

**Storage**: PostgreSQL 18（`note` の表を消す DB の変更を1つ足す）

**Testing**: Vitest（API の結合は本物の PostgreSQL）・Playwright（E2E は API が組み立てた画面を返す形で流す）

**Target Platform**: Cloud Run の1つのコンテナ（置き場所そのものは別のセッション）・LINE の中の LIFF ブラウザと外のブラウザ

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: 依存は 組み立て → 領域 → 共通 → 土台（lint）。画面のコードは `import.meta.env` を読まない（`define` で埋める）。CSP に `unsafe-inline`・`unsafe-eval` を入れない。

**Scale/Scope**: 共通のファイルだけ（領域のフォルダは作らない）

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関係しない |
| II. 個人の情報は最小限 | 主催者の LINE のユーザー ID は秘密でない設定（AD-5）。ID トークンを API に送る処理は account-001。ログに新しい値を出さない |
| III. 気軽さ | LIFF の始め方を1か所にし、LINE の中では init だけでログインが済む形を保つ |
| IV. 小さく始める | 領域の機能は作らない。仮の LIFF は手元とテストを動かすのに要る分だけ |
| V. 運用費ゼロに近く | 画面と API を1つのコンテナで返す（ロードバランサ・2つ目のサービスを足さない）。DB を起こす・叩く処理を作らない |
| 技術の制約 | `@line/liff` 2.31.1 以上（2.32 を入れる）。境界は lint のまま |

違反なし。設計のあとも同じ。

## Project Structure

### Documentation (this feature)

```text
specs/core/001-foundation/
├── spec.md
├── plan.md
├── research.md        # 決めたこと・仮決め・出典
├── contracts/core.md  # ほかの領域が使う名前（設定・code・関数）
├── quickstart.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
apps/api/
├── drizzle/0001_*.sql                 # note を消す（新しく足す。0000 は書き換えない）
├── scripts/lib/seed.ts・scripts/seed.ts  # 見本の領域がないので、何も足さない形に
├── src/app.ts                          # 守りの見出しを /api と画面で分け、platform/web をつなぐ。エラーの読みかえは kernel へ
├── src/kernel/config.ts                # LINE_CHANNEL_IDS・ORGANIZER_LINE_USER_ID・OPEN_CHAT_URL・WEB_DIST_DIR
├── src/kernel/errors.ts                # toAppError：AppError・HTTPException・DB に届かない → AppError（1か所）
├── src/kernel/pg-errors.ts             # isDbUnavailable
├── src/platform/health/routes.ts       # 503 は DB_UNAVAILABLE
├── src/platform/web/                   # 画面のファイル・SPA の戻り・画面の CSP（新しい共通）
├── src/modules/notes/                  # 消す
└── test/                               # config・app・web・pg-errors のテスト
apps/web/
├── package.json                        # @line/liff 2.32
├── vite.config.ts・vitest.config.ts・src/env.d.ts  # __LIFF_ID__ を define で埋める。preview の CSP は API に一本化
├── src/lib/liff.ts（＋liff.test.ts）    # LIFF の始め方の1か所
├── src/main.tsx                        # ルーターより先に initLiff
└── src/features/notes/                 # 消す
packages/contracts/src/core/
├── participant-paths.ts（＋test）       # 参加者の道・パーマリンク
├── jst.ts（＋test）                     # 日本時間の日付・その日の終わり
└── messages.ts                         # UNAVAILABLE → DB_UNAVAILABLE
packages/ui/src/styles/tokens.css・tokens.test.ts  # 墨・プロダクトの DESIGN.md を読む
e2e/                                    # notes の E2E を消し、API が画面を返す形で流す
docs/・CLAUDE.md・README.md・docs/rules/  # notes の参照・今の形
```

**Structure Decision**: 画面のファイルを返す処理は、組み立て（`app.ts`）に直接書かず、共通の `platform/web/` に置く（`health`・`rate-limit` と同じ並び）。組み立ては設定を見てつなぐだけ。DB に届かないことの見分けは土台の `kernel/pg-errors.ts`、エラーから応答への読みかえは `kernel/errors.ts` の1つの関数にまとめ、組み立ての `onError` はそれを呼ぶだけにする（AD-10「土台のエラーの処理に1か所」）。

## Complexity Tracking

なし。
