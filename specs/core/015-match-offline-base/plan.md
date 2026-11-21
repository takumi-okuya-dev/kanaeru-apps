# Implementation Plan: 試合表の道だけの Service Worker の組み立てと、カメラの許可（core-015）

**Branch**: `feature/core-015-match-offline-base` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・構成の決めごと AD-27・AD-28・AD-30

## Summary

組み立ての plugin（`apps/web/scoped-service-worker.ts`）で、試合表の領域が持つ Service Worker の本文に持つファイルの一覧と版の印を埋めて `match/sw.js` に書き出す。API の画面の見出しは、試合表の道だけカメラを許す。QR を読む道具 jsQR を依存に足す。E2E で `match.offline` を入にする。

## Technical Context

**Language/Version**: TypeScript 6.0・Vite 8

**Primary Dependencies**: 足す：`jsqr` 1.4.0（画面。使うのは match-005）

**Storage**: なし（DB の変更なし）

**Testing**: Vitest（`apps/web/scoped-service-worker.test.ts`・`apps/api/test/web.test.ts`）。ほかの E2E はそのまま通す

**Constraints**: CSP は変えない。ほかのアプリの道のふるまいを変えない（Permissions-Policy はほかの道で今のまま）

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | カメラは画面の中で QR を読むだけで、映像を送らない・残さない（match-005） |
| III. 気軽さ | 電波のない体育館で試合表を開ける土台（AD-27） |
| IV. 小さく始める | 外の PWA の plugin を入れず、約100行の plugin にした |
| V. 運用費 | 費用は増えない |
| 技術の制約 | 共通のファイル（組み立て・守りの見出し・依存・E2E の設定）なので、領域の PR に混ぜず、この共通の PR で先に入れる（並行開発の決まり 3-3） |

違反なし。

## 形

| 場所 | 中身 |
|---|---|
| `apps/web/scoped-service-worker.ts`（新） | `scopedServiceWorker`・`precachePaths`・`fillServiceWorker`・`serviceWorkerVersion` |
| `apps/web/vite.config.ts` | 上の plugin で `match/sw.js` を書き出す。開発の見出しで試合表の道だけカメラを許す |
| `apps/web/src/features/match/offline/sw.js`（新） | 本文。この PR では自分を外すだけ（match-005 で書く） |
| `apps/api/src/platform/web/web.ts` | `CAMERA_PATH_PREFIXES`・`allowsCamera`。Permissions-Policy を道で分ける |
| `apps/web/package.json`・`pnpm-lock.yaml` | `jsqr` |
| `e2e/env.ts` | `DOMAIN_FEATURES` に `match.offline` |
