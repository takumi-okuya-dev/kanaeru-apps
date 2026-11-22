# Feature Specification: Cloud Run が落ちても、画面と「ただいま使えません」の案内を出す（core-020）

**Feature Branch**: `feature/core-020-stale-if-error`（`develop` から切る。共通の PR：`apps/api/src/platform/web/`・`apps/web/src/lib/api.ts`・文書）

**Created**: 2026-11-22

**Status**: Draft（主催者の希望：今の構成のまま、Cloud Run が落ちても案内を出す工夫が欲しい）

**Input**: [決めたことの記録](../../../docs/decisions.md) 2026-11-22。静的ホスティングは外した（[置き場所の比べ](../../../docs/hosting-cost.md)）。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cloud Run が止まっていても、画面が開き、何が起きたかが分かる (Priority: P1)

1. **Given** 公開のあと（前に Cloudflare を置き、HTML を覚えさせる Cache Rule がある）・Cloud Run が 5xx を返す, **When** 利用者が画面を開く, **Then** Cloudflare が前に覚えた画面（`index.html`）を出す（1日まで）
2. **Given** 画面は開いたが API が、アプリより前（Google の入口・Cloudflare）から 5xx（502〜504・520〜530 など）か 429 を返す, **Then** 「ただいま使えません。…しばらくしてから、もう一度お試しください。」と出る
3. **Given** 夜間の停止（API が返す 503 `DB_UNAVAILABLE`）, **Then** 今までどおり夜間の案内が出る（「ただいま使えません」にしない）
4. **Given** 前の画面（開いたまま・Cloudflare が出した前のもの）が、新しい版にない部品を読もうとして失敗した, **Then** 1回だけ読み直す（1分に1回まで）
5. **Given** デプロイのあと, **Then** ブラウザは毎回新しい画面を確かめる（ブラウザ向けのキャッシュは今までどおり `no-cache`）

## Requirements *(mandatory)*

- **FR-001**: `index.html` と画面の道（HTML）は、ブラウザ向けに今のまま `Cache-Control: no-cache`、Cloudflare 向けに `Cloudflare-CDN-Cache-Control: max-age=0, stale-if-error=86400`（Cloudflare は読んだあと外す）。`/assets/` は今のまま1年、`sw.js` などほかのファイルは今のまま `no-cache`（Cloudflare 向けの見出しは付けない）。
- **FR-002**: 画面の API の呼び出し（`apps/web/src/lib/api.ts`）は、エラーの本文でない 5xx と 429 を `SERVICE_UNAVAILABLE`（「ただいま使えません」の文。画面だけの印）の `ApiError` にする。エラーの本文がある応答（夜間の停止など。アプリの 5xx はいつも本文を持つ）は今までどおり。
- **FR-002a**: 部品が読めない（Vite の `vite:preloadError`）ときは1回だけ読み直す（1分に1回まで。`apps/web/src/lib/preload-error.ts`）。
- **FR-003**: 文書：構成の説明（`docs/architecture.md`）・置き場所の比べ（キャッシュの範囲）・バックログ C2（HTML の Cache Rule・Always Online は入れない）・決めたことの記録。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` が通る。
- **SC-002**: 公開して Cloudflare を前に置いたとき（バックログ C1・C2）、Cloud Run を止めて、画面と案内が出ることを確かめる（tasks T005）。
