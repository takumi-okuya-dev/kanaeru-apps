# Implementation Plan: 読書記録の本棚と取りこみ（reading-001）

**Branch**: `feature/reading-001-bookshelf-import`（仕様）・`feature/reading-001-pr1-tables`（DB の変更）・`feature/reading-001-pr2-import`（窓口と画面） | **Date**: 2026-11-28 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) と、次の4つ。

- 決めた理由と仮決め：[research.md](./research.md)
- 表：[data-model.md](./data-model.md)
- 窓口と画面の道：[contracts/reading.md](./contracts/reading.md)
- 確かめの手順：[quickstart.md](./quickstart.md)

## Summary

読書記録（key `reading`・領域 `reading`・`uses: []`）の最初の版を作る。

- **pr1**：1行の一覧に登録し、本とマーカーの2つの表を足す。`/reading` には準備中の案内だけを置く。
- **pr2**：本を足す（書誌の検索）・本棚・GoodNotes の PDF と貼り付けの取りこみ（端末の中で読み、束で送る）・取りこみ直し・本の画面（章ごとの並び・コメントを直す・消す）・本をまとめる・消す。
- 範囲の外：Kindle の書き出しの取りこみ・探す・あとで調べる（reading-002）、説明の材料から先（reading-003 以降）。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: 新しい依存は2つ（pr2。`pnpm-lock.yaml` が変わる）。

- 画面：`pdfjs-dist` 4.10.38（GoodNotes の PDF を端末の中で読む。research R5・R6）
- API：`fast-xml-parser`（国立国会図書館サーチの RSS を読む。research R9）
- そのほかは今のもの：API は Hono・`@hono/zod-openapi`・Drizzle 0.45、画面は React・TanStack Router と Query・`@workspace/ui`

**Storage**: PostgreSQL。表を2つ足す DB の変更を1つ（`reading_book`・`reading_marker`。番号は道具が振る。人物メモの `0025` のあと）。

**Testing**: Vitest と Playwright。

- 表と窓口の結合のテストは、本物の PostgreSQL に当てる。外の書誌の API は `deps.fetch` を差しかえる。
- 約束（鍵・貼り付けの読み方）と GoodNotes の読み方は単体のテスト。GoodNotes は架空の見本の PDF で pdf.js も通す（research R14）。
- 画面は jsdom と Testing Library。
- E2E は、本棚・本を足す（書誌は偽の答え）・貼り付けで取りこむ・本の画面の流れと、各画面の axe（WCAG 2.2 AA）。

**Target Platform**: iPhone の Safari（主）と PC のブラウザ。LINE の中のブラウザでファイルを選べるかは手で確かめる（research R13）。Cloud Run の1つのコンテナ（AD-8）。

**Project Type**: モジュラーモノリスの新しい領域（AD-1・AD-15）。

**Performance Goals**: 357ページ・11MB の PDF の読み取りから確かめの画面まで、iPhone で1分以内（SC-001）。本棚と本の画面は、数千件のマーカーでもすぐ返る。

**Constraints**:

- 本のファイルも、マーカーのない本の文も、サーバーに送らない（AD-34）。
- API の本文の上限は 100KB（`MAX_BODY_BYTES`）。束は 90KB・500件まで（research R7）。
- CSP を変えない（pdf.js の worker と CMap は自分のドメインから。書影の源は #176 で足す）。
- 夜の停止（0時〜8時）の間は `503 DB_UNAVAILABLE`。
- 共通のファイルで触るのは、1行の一覧（`apps.list.ts`・`modules.list.ts`・`features.list.ts`）と、文書の一覧の行（`docs/README.md`・`docs/rules/specs.md`）と、依存の追加に伴う `pnpm-lock.yaml` だけ。
- マーカーの文・コメント・分かりたいこと・検索の言葉を、ログ・URL に出さない（PRD 5章）。

**Scale/Scope**: 最初は持ち主1人（運営者だけに見える）。2〜5冊を並行・1冊に数百件のマーカー。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関わらない（アフィリエイトは reading-004 以降） |
| II. 個人の情報は最小限 | 持つのは PRD 5章の本とマーカーだけ。見られるのは持ち主だけで、ほかの人の記録は 404。外の AI に渡さない（この仕様では AI を使わない）。ログ・URL に本文を出さない。退会で CASCADE で消える |
| III. 気軽さ | 読む最中の習慣（マーカーとコメント）を変えさせない。1冊の取りこみは1分以内 |
| IV. 小さく始める | 表は本とマーカーの2つだけ（research R2）。Kindle・探す・説明の材料は次の仕様 |
| V. 運用費ゼロに近く | 新しい資源・定期の仕事・有料のサービスを足さない。書誌の API は無料・鍵なし。PDF は端末で読み、サーバーの計算を増やさない |
| 技術の制約 | 表の名前は `reading_`。ほかの領域の表は外部キーにだけ使う（`accountTable`）。ほかの領域は `index.ts` からだけ読む（account・suite）。外の CDN を使わない |

違反なし。設計のあとも同じ（著作権：本のファイルを持たない・本の文は利用者が引いたマーカーだけ。PRD 5章）。

## Project Structure

### Documentation (this feature)

```text
specs/reading/001-bookshelf-import/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/reading.md
├── checklists/requirements.md
└── tasks.md            （/speckit-tasks）
```

### Source Code

```text
packages/contracts/src/reading/   limits.ts・options.ts・index.ts（pr1）
                                  marker-key.ts・paste.ts・book.ts・marker.ts・catalog.ts・errors.ts（pr2。どれも *.test.ts つき）
apps/api/src/modules/reading/     schema.ts・schema.test.ts・index.ts（pr1）
                                  access.ts・repository.ts・catalog.ts・routes.ts・routes.test.ts・catalog.test.ts・logging.test.ts（pr2）
apps/api/test/helpers/reading.ts  （pr2）
apps/api/drizzle/                 00NN_reading.sql・meta（pr1）
apps/web/src/features/reading/    index.ts・routes.ts・paths.ts・PlaceholderPage.tsx（pr1）
                                  api.ts・queries.ts・ShelfPage.tsx・AddBookPage.tsx・ImportPage.tsx・ConfirmImportPage.tsx・BookPage.tsx・Cover.tsx と *.test.tsx（pr2）
                                  import/pdf.ts（pdf.js を読みこむ・worker と CMap）・import/goodnotes.ts（読み方）・import/batches.ts（束に分ける）と *.test.ts・__fixtures__（架空の PDF）（pr2）
e2e/tests/reading.spec.ts         （pr2）
docs/apps/reading.md              （pr1。pr2 で窓口と画面を足す）
一覧の1行：apps.list.ts・modules.list.ts・features.list.ts（pr1）・docs/README.md の文書の一覧（pr1）
```

**Structure Decision**: 人物メモ（person-001）と試合表（match-001・002）と同じ形。退会の手順（`withdrawal`）は出さない（research R11）。PDF を読む処理は画面の reading の領域に置き、共通にしない（AD-18・AD-34）。

## Complexity Tracking

違反がないので、空。
