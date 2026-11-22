# Tasks: Cloud Run が落ちても案内を出す（core-020）

- [x] T001 この仕様（spec・plan・tasks）
- [x] T002 `apps/api/src/platform/web/web.ts`：HTML に `HTML_CACHE`（`stale-if-error`）。`apps/api/test/web.test.ts`
- [x] T003 `apps/web/src/lib/api.ts`：エラーの本文でない 502・503・504 を `SERVICE_UNAVAILABLE` に。`apps/web/src/lib/api.test.ts`
- [x] T004 文書：`docs/architecture.md`・`docs/hosting-cost.md`・`docs/backlog.md` C2・`docs/decisions.md`
- [ ] T005 公開して Cloudflare を前に置いたとき（C1・C2）、Cloud Run を止めて（台を0にする・壊れた版を出すなど）、画面と案内が出ることを確かめる
