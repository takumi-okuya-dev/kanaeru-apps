# Implementation Plan: 定期の仕事を1つの窓口にまとめる（core-017）

**Branch**: `feature/core-017-shared-job-tick` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・[research.md](./research.md)

## Summary

組み立て（`apps/api/src/app.ts`）が、領域の `scheduledJob` を集めて共通の窓口 `POST /api/v1/jobs/tick`（`apps/api/src/platform/jobs`）に渡す。窓口は日本時間でその回に当たる領域の仕事を同時に動かす。Cloud Scheduler は共通の窓口だけを5分ごとに呼ぶ。

## Technical Context

**Language/Version**: TypeScript 6.0・Hono＋@hono/zod-openapi・Terraform。新しい依存はない

**Storage**: なし

**Testing**: Vitest（`apps/api/src/kernel/scheduled-job.test.ts`・`apps/api/test/app.test.ts`）

**Constraints**: 組み立てに領域の名前・業務の言葉を書かない。Cloud Run の1回の要求の上限（60秒）に収める

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 新しく持つ情報はない。答えとログは領域の名前・状態・時間だけ |
| V. 運用費 | Cloud Scheduler の仕事を3つに収め、月0.10ドルをなくす。部品は増えない |
| 技術の制約 | 共通の変更だけの小さな PR。領域のフォルダは触らない |

違反なし。
