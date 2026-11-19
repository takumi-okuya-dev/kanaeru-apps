# Quickstart：共通の土台（core-001）を確かめる

## 1. 手元（自動）

```bash
cp .env.example .env   # 初めてのとき。5432 がふさがっていれば .env の POSTGRES_PORT と DATABASE_URL の口を変える
pnpm install
pnpm local:setup
pnpm check
```

E2E は、API が組み立てた画面（`apps/web/dist`）を返す形で流れる。

## 2. 手元（手で）：API から画面を返す

```bash
pnpm --filter web build
WEB_DIST_DIR=../web/dist pnpm --filter api exec tsx --env-file-if-exists=../../.env src/index.ts
```

- `pnpm --filter api exec` は `apps/api` で動くので、相対の `WEB_DIST_DIR` は `apps/api` から見た道（`../web/dist`）にする（絶対の道でもよい）。

- `http://localhost:8787/` と `/e/x/checkin` で画面（今は「ページが見つかりません」）が出る。見出しの `Content-Security-Policy` に `https://static.line-scdn.net` などがある。
- `http://localhost:8787/api/v1/health` は `{"status":"ok"}`。DB の容器を止める（`docker compose stop`）と、503・`DB_UNAVAILABLE`。

## 3. 本番に出したあと（手で）

- [ ] LINE の中でミニアプリを開き、ブラウザの CSP の違反が出ないこと（`liff.init()` が済むこと）
- [ ] PC の外のブラウザで開き、CSP の違反を見る（`subWindow` は `'unsafe-eval'` がないため動かない見込み。research.md R7）
- [ ] 夜間（0時〜8時）に開き、画面が出て、API が 503・`DB_UNAVAILABLE` を返すこと。コンテナが作り直されつづけないこと（probe が DB に触らない）
