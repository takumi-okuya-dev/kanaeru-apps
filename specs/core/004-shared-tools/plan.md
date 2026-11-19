# Implementation Plan: 共通の道具をまとめると DB の変更の確かめ（core-004）

**Branch**: `feature/core-004-shared-tools` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/core/004-shared-tools/spec.md`

## Summary

reception と survey で二重になっている技術の道具を、1か所ずつにまとめる。
- CSV の作り方：新しい包み `@workspace/csv`
- 日本時間の日時：`packages/contracts/src/core/jst.ts`
- CSV を返すヘッダー：`apps/api/src/kernel/http.ts`
- 画面のダウンロード：`apps/web/src/lib/download.ts`

あわせて、`pnpm check` に DB の変更の確かめ（`scripts/db/check-migrations.ts`）を足す。主催者から見える振る舞いは変えず、今のテストの期待の値を直さずに通す。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**:
- 新しい包み `@workspace/csv` は依存なし
- API は Hono 4.13
- 画面は React 19・TanStack Query 5
- DB の変更の確かめは drizzle-kit 0.31（`check`・`generate`）

**Storage**: なし（DB の表は変えない）

**Testing**:
- Vitest：包み・contracts・API・画面・`tests/db`
- Playwright：今の E2E の CSV の確かめ

**Target Platform**:
- API は Cloud Run（Node）
- 画面はブラウザ（LINE の中のブラウザを含む）

**Project Type**: pnpm のワークスペースの web アプリ（API・画面・共通の包み）

**Performance Goals**: 今と同じ（CSV は数百行）

**Constraints**:
- 出力を1バイトも変えない
- 包みは業務を知らず、状態を持たない（AD-18）
- DB の変更の確かめは DB に接続しない。作業の木を汚さない

**Scale/Scope**:
- 共通の道具を4つ
- 確かめを1つ
- 使う側を2つの領域で書きかえる

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 |
|---|---|
| I お金を預からない | 関係なし |
| II 個人の情報は最小限 | 守る。CSV の守り（式として読まれない）を1か所にして、直し忘れの穴をなくす。ログに値を書かない |
| III 気軽さ | 関係なし（画面の動きは変えない） |
| IV 小さく始める | 守る。範囲はバックログ A の「作る順番 1」と AD-17・AD-18 だけ。新しい機能を足さない |
| V 運用費 | 関係なし（CI を増やさず、手元の `pnpm check` に足す） |
| 技術スタック制約（モジュールの境界・AD-18） | 守る。新しい包みは workspace の包みにし、業務の領域を読まない（lint で止める） |

再確認（Phase 1 のあと）：変わらず通る。

## Project Structure

### Documentation (this feature)

```text
specs/core/004-shared-tools/
├── spec.md
├── plan.md          # この文書
├── research.md      # 決めたこと（R1〜R6）
├── quickstart.md    # 確かめ方
├── checklists/requirements.md
└── tasks.md         # /speckit-tasks が作る
```

data-model.md と contracts/ は作らない。表と API の窓口（OpenAPI）を変えないため。

### Source Code (repository root)

```text
packages/csv/                     # 新しい包み @workspace/csv（業務を知らない CSV の道具。R1）
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                  # csvCell・buildCsv
    └── csv.test.ts
packages/contracts/src/core/jst.ts        # jstDateTime を足す（R2）
apps/api/src/kernel/http.ts               # csvAttachment を足す（R3）
apps/api/src/modules/reception/csv.ts     # 写しを消し、@workspace/csv と jstDateTime を使う
apps/api/src/modules/survey/csv.ts        # 同じ
apps/api/src/modules/{reception,survey}/routes.ts  # csvAttachment を使う
apps/web/src/lib/download.ts              # fetchDownload・saveFile（R4）
apps/web/src/features/reception/{api.ts,DataPage.tsx}
apps/web/src/features/survey/{api.ts,ConcernsCsvSection.tsx}
scripts/db/check-migrations.ts            # DB の変更の確かめ（R5）
tests/db/check-migrations.test.ts         # その単体のテスト
tests/db/vitest.config.ts
eslint.config.js                          # packages/csv から @workspace/*・アプリを読ませない（R6）
package.json                              # db:check を足し、check に入れる
docs/rules/coding.md・docs/rules/parallel-development.md・docs/architecture.md  # 1行ずつ（FR-010）
```

**Structure Decision**: 包みは `packages/csv`（AD-18：技術の道具は `packages/` の小さな包み）。日本時間の関数は、構成の決めごとの約束どおり contracts の core に置く。HTTP のヘッダーは Hono に結びつくので API の kernel に、ブラウザの保存は画面の lib に置く（画面は1つのまま）。

## Complexity Tracking

なし。
