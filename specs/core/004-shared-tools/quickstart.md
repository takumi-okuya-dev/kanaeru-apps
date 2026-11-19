# Quickstart: core-004 の確かめ方

リポジトリのルートで流す。

## 1. 全部の確かめ

```bash
pnpm check
```

`db:check` を含めて、すべて通る（SC-005）。参加者と困りごとの CSV のテスト（API・E2E）は、期待の値を直さずに通る（SC-003）。

## 2. 守りの処理が1か所か

```bash
git grep -n "\[=+\\\\-@\\\\t\\\\r\]" -- apps packages
```

当たるのは `packages/csv/src/index.ts` だけ（SC-001）。`formatJstDateTime`・`saveFile`・`content-disposition` を読む処理も、それぞれ1か所だけ（SC-002）。

## 3. DB の変更の確かめが落ちること（SC-004）

手元で試し、終わったら戻す。

1. **作り忘れ**：どこかの `schema.ts` に列を1つ足し、`pnpm db:check` を流す。落ちて、作り忘れの旨と変わるファイルが出る。`apps/api/drizzle` に差分が残らないことを確かめてから、`schema.ts` を戻す。
2. **順番**：`apps/api/drizzle/meta/_journal.json` の最後の `when` を、1つ前より小さくして流す。落ちて、どの記録かが出る。戻す。
3. **何も変えない**：流すと通り、`git status` に差分が出ない。
