# Implementation Plan: ログインなしで読める道の読む要求にも、IP ごとの回数の制限をかける（core-016）

**Branch**: `feature/core-016-public-get-rate-limit` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・[research.md](./research.md)・構成の決めごと AD-26・AD-30

## Summary

組み立て（`apps/api/src/app.ts`）の IP ごとの回数の制限は、`/api/v1` の書く操作（GET・HEAD・OPTIONS のほか）だけを数える。ログインなしで読める道を持つ領域は、その道の頭を `index.ts` の `publicReadPaths` で出し、組み立てが集めて、その頭の道の読む要求を別の上限で IP ごとに数える。

## Technical Context

**Language/Version**: TypeScript 6.0・Hono＋@hono/zod-openapi。新しい依存はない

**Storage**: なし（数はメモリー。今の `platform/rate-limit` の `createRateLimiter` をそのまま使う）

**Testing**: Vitest（`apps/api/test/app.test.ts`）

**Constraints**: 組み立てに領域の名前・業務の言葉を書かない。ほかの読む要求（ログインした画面の5秒おきの読み直し）は数えない

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 新しく持つ情報はない（IP のまとまりごとの数だけをメモリーに持つ。今の制限と同じ） |
| III. 気軽さ | 体育館の1つの IP の後ろの30人が見ても止まらない数にした（R2） |
| V. 運用費 | 部品・費用は増えない。DB を引く前に止める |
| 技術の制約 | 共通の変更（`app.ts`）だけの小さな PR。領域のフォルダは触らない |

違反なし。

## 形

| 場所 | 中身 |
|---|---|
| `apps/api/src/app.ts` | `DomainModule.publicReadPaths`・`collectPublicReadPaths`・`isPublicReadPath`・`PUBLIC_READ_RATE_LIMIT`・3つ目の `createRateLimiter` |
| `apps/api/test/app.test.ts` | 単体と結合のテスト |
| `docs/architecture.md`・`docs/rules/coding.md` | 今の形と、領域が出せるもの |
