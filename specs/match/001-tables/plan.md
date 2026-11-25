# Implementation Plan: 試合表の表とアプリの登録（match-001）

**Branch**: `feature/match-001-tables` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)、表は [data-model.md](./data-model.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

試合表アプリ（key `match`・領域 `match`・`uses: ["reception"]`）を1行の一覧に登録し、試合表・組織に入れる・前に入れたレベル・QR の受付の4つの表を足す（`0021_match.sql`）。`/match` には準備中の案内だけを置く。窓口・画面・組み方は match-002。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: Drizzle 0.45（新しい依存なし）

**Storage**: PostgreSQL（表を4つ足す DB の変更を1つ：`0021_match.sql`）

**Testing**: Vitest（表の結合は本物の PostgreSQL・約束の単体・アプリの登録のテスト）

**Constraints**: 表を足すだけ（前の版のアプリでも壊れない）。共通のファイルは1行の一覧（`apps.list.ts`・`modules.list.ts`・`features.list.ts`）と、文書の一覧の行（`docs/README.md`・`docs/rules/specs.md`）だけ。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関わらない |
| II. 個人の情報は最小限 | 試合表の中身は呼び名・レベルだけで、氏名・メールアドレスの列を持たない。受付の行も呼び名とレベルだけ。札は SHA-256 だけ |
| III. 気軽さ | 関わらない（参加者の画面はまだない） |
| IV. 小さく始める | PRD 6章・AD-25〜AD-30 で決めた表だけ。中身の形は約束で持ち、DB に先回りの列を足さない |
| V. 運用費ゼロに近く | 新しい資源・定期の仕事を足さない（90日の消すは、一覧を開いたときなどに行う。match-002） |
| 技術の制約 | 表の名前は `match_`。ほかの領域の表は外部キーにだけ使う（`accountTable`・`eventTable`・`organizationTable`・`organizationMemberTable`） |

違反なし。

## Project Structure

```text
packages/contracts/src/match/   options.ts（レベル）・index.ts・options.test.ts
apps/api/src/modules/match/     schema.ts・schema.test.ts・index.ts
apps/api/drizzle/               0021_match.sql・meta
apps/web/src/features/match/    index.ts・routes.ts・paths.ts・ListPlaceholderPage.tsx
docs/apps/match.md
```
