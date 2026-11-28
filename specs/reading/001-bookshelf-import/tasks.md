# Tasks: 読書記録の本棚と取りこみ（reading-001）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/reading.md](./contracts/reading.md)・[quickstart.md](./quickstart.md)

テストを先に書き、落ちるのを見てから作る。`[P]` は、ほかと違うファイルで、同時に進められる作業。

## Phase 0: 先に入れる共通の PR（この仕様の外。前提）

どれも共通のファイルを直すので、領域の PR に混ぜない（[並行開発の決まり](../../../docs/rules/parallel-development.md) 3-3）。

- [ ] T001 #167（予期しない DB のエラーのログに SQL の値を書かない）と #169（OAuth の範囲を MCP のツールを出すアプリだけから作る）が `develop` に入ったことを確かめる（`gh pr view 167 --json state`・`gh pr view 169 --json state`）。pr1 の前（research R12）
- [ ] T002 人物メモの #168（DB の変更）が `develop` に入ったことを確かめる。入るまで pr1 を開かない（AD-17）
- [ ] T003 #176（画面の CSP の `imgSrc` に `https://cover.openbd.jp`）が `develop` に入ったことを確かめる。pr2 の前（research R9）

## Phase 1: 表とアプリの登録（PR `feature/reading-001-pr1-tables`）

- [X] T004 [P] 約束の上限を置く：`packages/contracts/src/reading/limits.ts` と `limits.test.ts`。値は data-model のとおり：書名 1〜300字・著者 300字・分かりたいこと 1〜500字・章 1〜200字・マーカーの文 0〜4,000字・コメント 1〜4,000字・1回の取りこみ 5,000件・1束 500件・束の本文 90KB・ファイル 300MB。字はコードポイントで数える（数える関数を1つ置く）
- [X] T005 [P] 選択肢を置く：`packages/contracts/src/reading/options.ts`・`index.ts`（名前を挙げて再エクスポート）。`READING_BOOK_STATUSES = ["reading", "finished", "dropped"]`・`READING_SOURCES = ["kindle", "goodnotes", "other"]`（本の読む場所）・`READING_MARKER_SOURCES = ["goodnotes", "kindle", "paste"]`・`READING_CATALOG_SOURCES = ["ndl", "openbd", "manual"]` と、画面の言葉（読んでいる・読み終えた・やめた など）
- [X] T006 結合のテストを先に書く：`apps/api/src/modules/reading/schema.test.ts`（本物の PostgreSQL）。確かめること：
  - **長さ**：長さの CHECK が約束の上限と同じ。
  - **選択肢**：`status`・`catalog_source`・`source` は選択肢だけ。`sources` は選択肢の重ならない組だけ。
  - **形**：`isbn` は null か13桁の数字。`cover_url` は null か `https://cover.openbd.jp/` で始まる。`page`・`location` は null か1以上。`text <> '' OR comment IS NOT NULL`。
  - **一意**：`reading_marker` の（`book_id`, `dedupe_key`）。
  - **持ち主**：持ち主の違う本にマーカーを付けられない（（`book_id`, `owner_account_id`）の複合の外部キー）。
  - **消したとき**：本を消すとマーカーが消える。持ち主の account を消すと、両方の表の行が消える。
- [X] T007 `apps/api/src/modules/reading/schema.ts` に2つの表を書く（`reading_book`・`reading_marker`。data-model のとおり。索引も）
  - 共通の列は `kernel/columns.ts`。`accountTable` は account の `index.ts` から読む。
  - 先頭で `import "@hono/zod-openapi";` を読む。
  - CHECK の値は約束から読まず、文字で書く（食い違いは T006 が見る）。
- [X] T008 `pnpm db:generate --name reading` を流し、できた `apps/api/drizzle/00NN_reading.sql` を読む（表を足すだけであること）。そのあと `pnpm db:migrate` と `pnpm db:check`
- [X] T009 アプリの登録。
  - `packages/contracts/src/core/apps.list.ts` に1行：`export const reading = defineApp({ key: "reading", name: "読書", summary: "マーカーを集めて話す・書く材料に", description: "Kindle と GoodNotes で引いたマーカーとコメントを1か所に集め、人に話す・やってみる・書く材料にします。", icon: "book", domains: ["reading"], basePath: "/reading", uses: [], accountData: "本・マーカーとコメント" });`
  - `apps/api/src/modules.list.ts`・`apps/web/src/features.list.ts` に1行ずつ。
- [X] T010 [P] `apps/api/src/modules/reading/index.ts`（表の再エクスポートはしない。中身は `export {};` と「窓口は pr2 で足す」の説明）
- [X] T011 [P] 画面の仮の道：`apps/web/src/features/reading/{index.ts, routes.ts, paths.ts, PlaceholderPage.tsx}`。`/reading` に `<Page title="読書" lead="読書記録は準備中です。" />`。ナビの項目は「本棚」の1つ
- [X] T012 [P] 文書：`docs/apps/reading.md`（アプリの登録・表）・`docs/README.md` 2章の一覧の行（`docs/rules/specs.md` の領域の一覧の `reading` の行は、仕様の PR で足し済み）
- [ ] T013 `pnpm check` を流し、結果を PR に書く。DB の変更の PR なので、ラベル `run-ci` を付ける（開発の流れの決まり 3章）

## Phase 2: 窓口と画面の土台（PR `feature/reading-001-pr2-import`。すべての話の前に要る）

- [X] T014 [P] 約束：`packages/contracts/src/reading/marker-key.ts` と `marker-key.test.ts`（research R3）
  - `normalizeMarkerText`：NFKC → 空白と改行の続きを1つの空白に → 前後の空白を取る。
  - `markerKey({ text, comment, page, location })`：`crypto.subtle` の SHA-256 で64字の16進。文が空なら「comment:」＋そろえたコメント。ページか位置を `|` でつなぐ。
  - テスト：空白と改行の違いだけは同じ鍵・ページが違えば別の鍵・全角の空白・コメントだけのもの。
- [X] T015 [P] 約束：`packages/contracts/src/reading/errors.ts`（`READING_ERRORS`：`NOT_FOUND` 404・`CATALOG_UNAVAILABLE` 502・`SAME_BOOK` 422。文言に利用者の値と URL を入れない）
- [X] T016 [P] 約束：`packages/contracts/src/reading/book.ts`・`marker.ts`・`catalog.ts` と `*.test.ts`（`z.strictObject`・日本語の誤りの文。contracts/reading.md の形）
  - `BookCreateInput`（`isbn` は10桁を13桁に直す・`coverUrl` は `https://cover.openbd.jp/` で始まるものだけ）・`BookUpdateInput`・`BookMergeInput`・`Book`・`BookSummary`
  - `MarkerImportInput`（`source`・`markers` 1〜500件。各 `text`・`comment?`・`chapter?`・`page?`・`location?`・`position`・`question`）・`MarkerImportResult`・`MarkerUpdateInput`・`Marker`
  - `CatalogSearchInput`（`q` 1〜200字）・`CatalogItem`・`isIsbnQuery`（ハイフンと空白を除いて10桁か13桁）
- [X] T017 `apps/api/test/helpers/reading.ts`：アプリを見えるようにする（`upsertVisibility(db, "reading", "public")`）・本とマーカーを作る手伝い
- [X] T018 `apps/api/src/modules/reading/access.ts`：持ち主だけを通す1つの関数。ほかの人の本・マーカーは `READING_ERRORS.NOT_FOUND`（research R11）
- [X] T019 `apps/api/src/modules/reading/repository.ts`：読み書き。マーカーの鍵は API が `markerKey` で作り直す（画面の鍵を信じない）。起こりうる DB のエラーは `AppError` に読みかえる（`kernel/pg-errors.ts`）。logger に本文を渡さない
- [X] T020 `apps/api/src/modules/reading/index.ts` に `routes(deps)` を出し、`routes.ts` の骨組みを置く（`OpenAPIHono`・`requireSession`・tags `["reading"]`・operationId は `reading` で始める）
- [X] T021 [P] 画面の土台：`apps/web/src/features/reading/api.ts`（hono の client）・`queries.ts`（TanStack Query の鍵と取り方）・`paths.ts` に contracts/reading.md の画面の道

## Phase 3: User Story 1 - 本を本棚に足す (Priority: P1) 🎯 MVP

**Goal**: 書名か ISBN で書誌を探して本を足す。見つからなければ手で書く。書影がなければ仮の表紙。

**Independent Test**: 書名で探して1冊足し、もう1冊を手で書いて足すと、本棚に2冊が並ぶ。

- [X] T022 [P] [US1] 書誌のテストを先に書く：`apps/api/src/modules/reading/catalog.test.ts`（`deps.fetch` を差しかえる）。openBD の答え（見本の JSON）から ISBN の候補を作る・openBD になければ NDL に問い合わせる・NDL の RSS（見本の XML。`dc:title`・`dc:creator`・`dc:identifier xsi:type="dcndl:ISBN"`）から候補を作り、同じ ISBN を1つにまとめる・候補の書影を openBD にまとめて問い合わせる・打ち切り（5秒）・500・形の違う XML は `CATALOG_UNAVAILABLE`・エラーの文に URL と検索の言葉が入らない
- [X] T023 [US1] `apps/api/src/modules/reading/catalog.ts`：openBD（`https://api.openbd.jp/v1/get?isbn=…`）と NDL サーチ（`https://ndlsearch.ndl.go.jp/api/opensearch?…&dpid=iss-ndl-opac`）を呼ぶ1つの部品（research R9）。`fast-xml-parser` を `apps/api/package.json` に足す。出口は `deps.fetch`・`AbortSignal.timeout(5000)`
- [X] T024 [P] [US1] 窓口のテストを先に書く：`apps/api/src/modules/reading/routes.test.ts`「本」。`POST /catalog/search`（ログインが要る・空は 422）・`POST /books`（手で書く・書誌から・書影の URL の形が違えば 422）・`GET /books`（本棚の並び：読んでいる本が上・最後に取りこんだ順）・`GET /books/{id}`・ほかの人の本は 404・台帳で「切」なら 404
- [X] T025 [US1] `routes.ts` に `POST /catalog/search`・`GET /books`・`POST /books`・`GET /books/{bookId}` を足す
- [X] T026 [P] [US1] 画面のテストを先に書く：`AddBookPage.test.tsx`・`ShelfPage.test.tsx`・`Cover.test.tsx`（探す・候補を選ぶ・手で書く・「今は探せません」から手で書く・国立国会図書館サーチの表示・書影がなければ仮の表紙・書影が読めなければ仮の表紙に切りかえる）
- [X] T027 [US1] 画面：`apps/web/src/features/reading/AddBookPage.tsx`（書名か ISBN・候補の一覧・手で書く・分かりたいこと・読む場所）・`ShelfPage.tsx`（本棚。見本の1の形：探す欄は reading-002 なので置かない・主のボタン「取りこむ」・二番「本を足す」）・`Cover.tsx`（research R10。`tokens.css` の値だけ）。`routes.ts` の `/reading` を本棚に置きかえる

## Phase 4: User Story 2 - GoodNotes で引いたマーカーとコメントを取りこむ (Priority: P1)

**Goal**: GoodNotes の PDF を端末で読み、確かめて、束で送って本に入れる。本の PDF は送らない。

**Independent Test**: マーカー3か所とテキストボックス1つのある見本の PDF を選び、「入れる」を押すと、本の画面に3つのマーカーが章ごとに並び、1つにコメントが付いている。

- [X] T028 [P] [US2] 架空の見本の PDF を作る：`apps/web/src/features/reading/import/__fixtures__/goodnotes-sample.pdf`（数 KB。架空の文・2ページ・ページの上に柱「1.2 見本の節」とページ番号・半透明（0.5）の黄色の太い線（幅 12pt）3本・HiraginoSans の文のテキストボックス1つ）と、作り方の説明 `README.md`（作るスクリプトは `__fixtures__/make-sample.ts`。`pdf-lib` を dev の依存に足すか、手で書いた PDF の文で作る。research R14）。本物の本の PDF は置かない
- [X] T029 [P] [US2] 読み方のテストを先に書く：`apps/web/src/features/reading/import/goodnotes.test.ts`。pdf.js を通さない入力（線の四角・文の項目・書体の名前）で、同じ高さの線を1行に・22pt より狭い行を1つのマーカーに・四角に半分以上入る文字だけ・テキストボックスはいちばん近いマーカーに（上にも下にも）・近くにマーカーがなければコメントだけのもの・柱から章とページ・柱のないページは前の章を引き継ぐ・`?`・`？` で始まるコメントに印・`position` の作り方（ページ × 100,000 ＋ 上からの順）
- [X] T030 [US2] `apps/web/src/features/reading/import/goodnotes.ts`：状態を持たない読み方の関数（research R5）
- [X] T031 [US2] `apps/web/src/features/reading/import/pdf.ts`：`pdfjs-dist` 4.10.38 の legacy の束を動的 import し、worker（`?url`）と CMap（`import.meta.glob` ＋ `CMapReaderFactory`）を自分のドメインから読む（research R6）。`isEvalSupported: false`・`disableFontFace: true`。ページごとに `getOperatorList`（CTM・色・不透明度・線の幅・`constructPath` の範囲を追う）と `getTextContent` と書体の名前を取り出して `goodnotes.ts` に渡し、`page.cleanup()`。読んだページの数を知らせる。300MB をこえるファイルは読まない。`pdfjs-dist` を `apps/web/package.json` に足す
- [X] T032 [P] [US2] pdf.js を通すテスト：`apps/web/src/features/reading/import/pdf.test.ts`（見本の PDF から、マーカー3つ・コメント1つ・章・ページが取れる。Node の pdf.js で CMap を読める）
- [X] T033 [P] [US2] 束に分けるテストを先に書く：`apps/web/src/features/reading/import/batches.test.ts`（JSON で 90KB・500件を超えない・順を保つ・1件で 90KB を超えるものは上限の字数で先に止まる）
- [X] T034 [US2] `apps/web/src/features/reading/import/batches.ts`
- [X] T035 [P] [US2] 窓口のテストを先に書く：`routes.test.ts`「取りこみ」。`GET /books/{id}/marker-keys`・`POST /books/{id}/markers/import`（入る・`last_imported_at` と `sources` が新しくなる・501件は 422・100KB をこえる本文は 413・ほかの人の本は 404・字数をこえる行は 422）
- [X] T036 [US2] `routes.ts` に `GET /books/{bookId}/marker-keys`・`POST /books/{bookId}/markers/import` を足す（`INSERT … ON CONFLICT (book_id, dedupe_key) DO UPDATE`。research R4 の決まり）
- [X] T037 [P] [US2] 画面のテストを先に書く：`ImportPage.test.tsx`・`ConfirmImportPage.test.tsx`（ファイルを選ぶ・読み取り中のページの数・件数と章ごとの数と新しい数・入れる本の候補（PDF の名前に近い本）・選び直す・新しく登録・コメントの付け先と章を直す・「入れる」で束を順に送る・途中で失敗したら「もう一度入れる」・読めない PDF と上限をこえる PDF と5,000件をこえる PDF で貼り付けの道を出す・送った本文に PDF のバイトとマーカーのない文が入らない（SC-004））
- [X] T038 [US2] 画面：`apps/web/src/features/reading/ImportPage.tsx`（見本の2：主のボタン「ファイルを選ぶ」・二番「貼り付ける」・書き出し方の開け閉め・「ファイルはこの端末の中で読みます」）・`ConfirmImportPage.tsx`（見本の3。読み取った中身は画面の中だけに持ち、読み直したら `/reading/import` へ戻す）

## Phase 5: User Story 3 - 同じ本を取りこみ直す (Priority: P1)

**Goal**: 取りこみ直しで重ならず、読書記録で直したものを壊さない。

**Independent Test**: マーカー3つの PDF を入れたあと、マーカー5つ（前の3つを含む）の PDF を入れると、マーカーは5つになる。

- [X] T039 [US3] 窓口のテストを足す：`routes.test.ts`「取りこみ直し」。同じ束を2回送ると `inserted` が0・空白だけ違う文は同じマーカー・読書記録で直したコメントは変わらない・直していないコメントは新しくなる・付け外した `?` は変わらない・消したマーカーは戻らない・確かめの画面で直した章は空でない限り変わらない（research R4）
- [X] T040 [US3] T036 の取りこみの SQL を、T039 が通るように直す（`comment_edited`・`question_edited`・`deleted_at`・章は空のときだけ埋める）
- [X] T041 [US3] 確かめの画面の「新しいマーカー」の数：`ConfirmImportPage.tsx` で `marker-keys` と `markerKey` を使って数える。テストを `ConfirmImportPage.test.tsx` に足す（「新しいマーカー 9」）

## Phase 6: User Story 4 - ほかの読む場所のマーカーを貼って取りこむ (Priority: P2)

**Goal**: 1行に1つずつ貼った文を、マーカーとして取りこむ。

**Independent Test**: 3行（うち1行はページつき）を貼って入れると、本の画面に3つのマーカーが並ぶ。

- [X] T042 [P] [US4] 約束のテストを先に書く：`packages/contracts/src/reading/paste.test.ts`（空の行を飛ばす・`p.38`・`P38`・`p38`・`38:`・`38 ` をページに・`//` の後ろをコメントに・`?`・`？` で始まるコメントに印・字数をこえる行は誤りとして返す）
- [X] T043 [US4] `packages/contracts/src/reading/paste.ts`（research R8）
- [X] T044 [US4] 画面：`ImportPage.tsx` の「貼り付ける」から、本を選んで貼る欄を出し、確かめの画面（`ConfirmImportPage.tsx`）に同じ形で渡す。テストを `ImportPage.test.tsx` に足す

## Phase 7: User Story 5 - 本の画面で読み返し、コメントを直す (Priority: P2)

**Goal**: 章ごとに本の中の順で並べ、コメントを直す・`?` を付け外す・マーカーを消す。

**Independent Test**: 2つの章にマーカーのある本を開くと、章ごとに本の中の順で並ぶ。1つのコメントを直すと、開き直しても直したまま。

- [X] T045 [P] [US5] 窓口のテストを先に書く：`routes.test.ts`「マーカー」。`PATCH /markers/{id}`（コメントを直すと `comment_edited` が真・`question` を変えると `question_edited` が真・章を直す）・`DELETE /markers/{id}`（`deleted_at` が入り、本の画面に出ない）・ほかの人のマーカーは 404
- [X] T046 [US5] `routes.ts` に `PATCH /markers/{markerId}`・`DELETE /markers/{markerId}` を足す。`GET /books/{bookId}` は消していないマーカーを `position` の順に返す
- [X] T047 [P] [US5] 画面のテストを先に書く：`BookPage.test.tsx`（章ごとの見出しとマーカーの数・章の中は `position` の順・章のないマーカーはページの順・コメントを直す・`?` で始めると印・印の付け外し・消す前に確かめる・分かりたいことを上に出して直せる）
- [X] T048 [US5] 画面：`apps/web/src/features/reading/BookPage.tsx`（見本の4の形。主のボタンは置かない〈説明の材料は reading-003〉。分かりたいこと・章ごとのマーカーとコメント・本の設定の入口）

## Phase 8: User Story 6 - 本棚を整える (Priority: P3)

**Goal**: 読む場所と状態・本棚の並び・まとめる・消す。

**Independent Test**: 3冊のうち1冊を「読み終えた」にすると、本棚の上は読んでいる2冊になる。

- [X] T049 [P] [US6] 窓口のテストを先に書く：`routes.test.ts`「本棚を整える」。`PATCH /books/{id}`（状態・読む場所・分かりたいこと）・`DELETE /books/{id}`（マーカーも消える）・`POST /books/{id}/merge`（マーカーが寄る・同じマーカーは1つ・`movedCount` と `duplicateCount`・元の本は消える・まとめ先の `sources` に足す・同じ本は 422・どちらかがほかの人の本なら 404・1つのトランザクション）
- [X] T050 [US6] `routes.ts` に `PATCH /books/{bookId}`・`DELETE /books/{bookId}`・`POST /books/{bookId}/merge` を足す（data-model の「本をまとめる」）
- [X] T051 [P] [US6] 画面のテストを先に書く：`ShelfPage.test.tsx`・`BookPage.test.tsx` に足す（読み終えた本・やめた本は閉じた開け閉めの中・状態と読む場所を変える・まとめる先を選ぶ・消す前に消えるマーカーの数を出して確かめる）
- [X] T052 [US6] 画面：`BookPage.tsx` に本の設定（状態・読む場所・まとめる・消す）を足し、`ShelfPage.tsx` に閉じた「読み終えた本」「やめた本」を足す

## Phase 9: 仕上げ（PR `feature/reading-001-pr2-import` の中）

- [X] T053 [P] ログのテスト：`apps/api/src/modules/reading/logging.test.ts`（マーカーの文・コメント・分かりたいこと・検索の言葉に決まった言葉を入れ、窓口の誤りと予期しない DB のエラーを起こしても、ログにその言葉が出ない。FR-025）
- [X] T054 [P] 退会のテスト：`routes.test.ts`（本とマーカーを持つ使う人を消すと、両方の表に行が残らない・退会の確かめの画面に「読書記録（本・マーカーとコメント）」が出る。FR-026）
- [X] T055 [P] E2E：`e2e/tests/reading.spec.ts`（本を足す〈書誌は偽の答え〉・貼り付けで取りこむ・本の画面・取りこみ直しで重ならない・各画面の axe。GoodNotes の PDF は見本の PDF を選ぶ）
- [X] T056 [P] 文書：`docs/apps/reading.md` に窓口・画面・取りこみの決まり（端末の中で読む・束・重なりの鍵・取りこみ直し）・書誌の出どころと帰属を足す
- [X] T057 `pnpm check` を流し、結果を PR に書く（依存を足したので、`pnpm audit` の結果も見る）
- [ ] T058 持ち主の iPhone で quickstart の「手で確かめること」を流す（Safari で持ち主の PDF を取りこむ・1分以内・LINE の中のブラウザでファイルを選べるか・大きな PDF）。結果を `spec.md` の Status と PR に書く。LINE の中で選べなければ、Safari で開く案内を `ImportPage.tsx` に足す（research R13）

## Dependencies & Execution Order

- **Phase 0 → Phase 1（pr1）→ Phase 2 → Phase 3〜8 → Phase 9**。pr1 は #167・#169・#168 のあと、pr2 は pr1 と #176 のあと。
- 話どうし：US1（本を足す）と US2（取りこむ）は、取りこむ先の本が要るので US1 が先。US3 は US2 の取りこみの窓口を直す。US4 は US2 の確かめの画面を使う。US5 は US2 で入ったマーカーを使う。US6 は US1 のあとならいつでも。
- 同じ `routes.ts`・`routes.test.ts` を触る作業は、同時に進めない。

### Parallel Opportunities

- Phase 1：T004・T005・T010・T011・T012 は同時に。
- Phase 2：T014・T015・T016・T021 は同時に。
- US2：T028・T029・T033 は同時に（見本の PDF・読み方・束）。
- Phase 9：T053・T054・T055・T056 は同時に。

## Implementation Strategy

1. **MVP**：Phase 1〜4（本を足し、GoodNotes の PDF を取りこみ、本の画面で見る。本の画面は T048 の最小の形を US2 と一緒に作ってもよい）。持ち主が自分の本で試し、SC-001・SC-002 を確かめる。
2. US3（取りこみ直し）を足して、区切りごとに取りこめるようにする。
3. US4（貼り付け）・US5（直す・消す）・US6（整える）を足す。
4. 仕上げのあと、pr2 を出す。持ち主の iPhone での確かめ（T058）の結果で、上限や案内を直す。
