# Implementation Plan: 予約の定期の仕事を共通の窓口に移す（booking-007）

**Branch**: `feature/booking-007-scheduled-job` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・[research.md](./research.md)

## Summary

booking の `index.ts` から `scheduledJob`（10分ごと・9時〜23時台・`runWaitlistJob`）を出し、組み立てが共通の窓口（core-017）に渡す。予約の窓口は同じ関数を呼ぶ形で残す（R1）。予約だけの Cloud Scheduler の仕事は、infra の別の PR で消す。

## Technical Context

**Language/Version**: TypeScript 6.0・Hono＋@hono/zod-openapi・Terraform。新しい依存はない

**Storage**: なし（DB の変更なし）

**Testing**: Vitest（`apps/api/test/booking-scheduled-job.test.ts`・今の booking の定期の仕事のテスト）

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 新しく持つ情報はない。ログは数と交流会の ID・誤りの種類だけ（今と同じ） |
| V. 運用費 | infra の PR のあと、予約だけの Cloud Scheduler の仕事がなくなる |
| 技術の制約 | booking のフォルダと booking の文書・`infra/booking.tf` だけを触る。共通のファイルは触らない |

違反なし。
