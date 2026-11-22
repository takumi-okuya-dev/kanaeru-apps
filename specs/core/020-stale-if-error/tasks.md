# Tasks: Cloud Run が落ちても案内を出す（core-020）

- [x] T001 この仕様（spec・plan・tasks）
- [x] T002 `apps/api/src/platform/web/web.ts`：HTML に Cloudflare 向けの `EDGE_HTML_CACHE`（`stale-if-error`。ブラウザ向けは `no-cache` のまま）。`apps/api/test/web.test.ts`・`e2e/tests/health.spec.ts`
- [x] T003 `apps/web/src/lib/api.ts`：エラーの本文でない 5xx と 429 を `SERVICE_UNAVAILABLE` に。`apps/web/src/lib/api.test.ts`。部品が読めなければ1回読み直す（`apps/web/src/lib/preload-error.ts`・`main.tsx`）
- [x] T004 文書：`docs/architecture.md`・`docs/hosting-cost.md`・`docs/backlog.md` C2・`docs/decisions.md`
- [ ] T005 公開して Cloudflare を前に置いたとき（C1・C2）、Cloud Run を止めて（台を0にする・壊れた版を出すなど）、画面と案内が出ることを確かめる。ブラウザが受け取る `Cache-Control` が `no-cache` のまま（Cloudflare が書きかえていない）こと、`cf-cache-status` がふだん EXPIRED・REVALIDATED・MISS（BYPASS・DYNAMIC でない）・源が落ちると STALE になることも確かめる
- [ ] T006 試合表の Service Worker の install でも、部品がそろっているかを確かめる（match の領域の別の PR。research R6）
