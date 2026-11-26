# Implementation Plan: 改善点を送る（suite-004）

**Branch**: `feature/suite-004-feedback`（表）・`feature/suite-004-pr2-feedback`（窓口と画面） | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md)

## Summary

suite の領域に改善点の表 `feedback` を足し（1つ目の PR。DB の変更だけを小さく先に入れる。parallel-development 4）、2つ目の PR で窓口（送る・運営者の一覧・済み）と「全体の設定」の2つの画面（利用者の「改善点を送る」・運営者の「届いた改善点」）を足す。画面は suite の `feature.settings`（差しこみの場所）に登録するので、共通のファイルは触らない。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: Hono（zod-openapi）・Drizzle・React 19・TanStack Router/Query。新しい依存はない

**Storage**: PostgreSQL に表 `feedback` を1つ足す（[data-model.md](./data-model.md)）

**Testing**: Vitest（表の結合の試験 `feedback-schema.test.ts`・窓口の `feedback.test.ts`）・Playwright（送る → 運営者が読んで済みにする。両方の幅で axe・CSP）

**Constraints**: 運営者は今の主催者（`requireOrganizer`）。本文をログに書かない。共通のファイルは触らない（suite の領域の中だけ）

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 持つのは本文・アプリの key・送った人の account だけ。本文に個人の情報を書かないよう画面で案内する。運営者だけが読む。退会すると送った人のつながりを外す。本文をログに書かない |
| IV. 小さく始める | 返事・知らせ・添付は作らない |
| V. 運用費ゼロに近く | 表1つ・外のサービスは使わない |

違反なし。

## Project Structure

```text
apps/api/src/modules/suite/
├─ schema.ts            feedback（1つ目の PR）
├─ feedback.ts          送る・一覧・済み（2つ目の PR）
└─ routes-feedback.ts   POST /api/v1/suite/feedback・GET（運営者）・PUT …/{id}/done（運営者）
packages/contracts/src/suite/feedback.ts
apps/web/src/features/suite/
├─ FeedbackPage.tsx     /settings/feedback（改善点を送る）
├─ FeedbackInboxPage.tsx /settings/feedback/inbox（届いた改善点。運営者だけ）
└─ index.ts             settings に2つ足す（personal と operator）
```
