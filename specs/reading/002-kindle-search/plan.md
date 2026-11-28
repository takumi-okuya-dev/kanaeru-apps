# Implementation Plan: 読書記録の Kindle の取りこみ・探す・あとで調べる（reading-002）

**Branch**: `feature/reading-002-kindle-search`（仕様）・`feature/reading-002-pr1-research`（DB の変更）・`feature/reading-002-pr2-kindle-search`（窓口と画面） | **Date**: 2026-11-28 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/reading.md](./contracts/reading.md)・[quickstart.md](./quickstart.md)

## Summary

- **pr1**：`reading_marker` に分かったこと（`learned`）と調べた時刻（`researched_at`）を足す。
- **pr2**：Kindle の書き出しの HTML と Web のノートブックの貼り付けの取りこみ（端末の中）・探す（本人のすべての本）・あとで調べる（調べる文を自分の AI か検索で開く・分かったことを残す）・本の画面の章の一覧。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: 新しい依存はなし（HTML はブラウザの `DOMParser` で読む）。

**Storage**: PostgreSQL。列を2つ足す DB の変更を1つ。

**Testing**: Vitest と Playwright（reading-001 と同じ）。Kindle の読み方は jsdom の `DOMParser` で単体のテスト。

**Target Platform**: iPhone の Safari（主）と PC のブラウザ。

**Constraints**:

- 本のファイルをサーバーに送らない（AD-34）。HTML のスクリプトは動かさない。
- 探す言葉は POST の本文で送り、URL に載せない。
- 調べる文は、利用者のブラウザが開く URL に入るだけで、PaletKit から外の AI には送らない（AD-20）。
- 共通のファイルは触らない（ナビのアイコンは今ある `search` を使う）。

**Scale/Scope**: 最初は持ち主1人。数千件のマーカー。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関わらない |
| II. 個人の情報は最小限 | 足すのは分かったことと調べた時刻だけ。本人だけが見る。外の AI に送らない（URL を開くのは利用者のブラウザ） |
| III. 気軽さ | Kindle も GoodNotes と同じ確かめの画面で入れる。調べるは1回押すだけ |
| IV. 小さく始める | 意味で探す・目次を貼るは作らない。探すは DB の部分一致 |
| V. 運用費ゼロに近く | 新しい資源・有料のサービスを足さない。AI の費用は0 |
| 技術の制約 | 表は `reading_` の中だけ。ほかの領域を読まない |

違反なし。

## Project Structure

```text
packages/contracts/src/reading/   search.ts・research-prompt.ts・question.ts・search-result.ts と *.test.ts（pr2）・limits.ts に足す（pr1）
apps/api/src/modules/reading/     schema.ts に列（pr1）・search.ts・routes.ts・repository.ts に足す（pr2）
apps/api/drizzle/                 00NN_reading_research.sql（pr1）
apps/web/src/features/reading/    import/kindle.ts・import/kindle-notebook.ts と *.test.ts・__fixtures__（pr2）
                                  QuestionsPage.tsx・SearchResults.tsx・ShelfPage.tsx・BookPage.tsx・ImportPage.tsx・nav-items.ts を足す・直す（pr2）
e2e/tests/reading.spec.ts         （pr2 で足す）
docs/apps/reading.md              （pr1・pr2）
```

## Complexity Tracking

違反がないので、空。
