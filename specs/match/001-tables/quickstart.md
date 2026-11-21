# Quickstart: 試合表の表とアプリの登録（match-001）

2026-11-22 作成。手元（`pnpm dev`・試験用のログイン）で確かめる手順。

1. `pnpm db:migrate` で `0021_match.sql` が当たる。`psql` で `\d match_table` を見ると、data-model.md の列と CHECK がある。
2. 手元のログイン（`/dev/login`）で運営者（`ORGANIZER_LINE_USER_ID`）としてログインし、「すべてのアプリ」を開くと「試合表」が出る（台帳に行がない間は運営者だけ）。開くと `/match` に「試合表を作る画面は準備中です。」が出る。
3. 運営者でない人でログインすると、「すべてのアプリ」に試合表は出ない。
