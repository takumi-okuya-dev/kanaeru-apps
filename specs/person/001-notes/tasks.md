# Tasks: 人物メモの最初の版（person-001）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/person.md](./contracts/person.md)・[quickstart.md](./quickstart.md)

テストを先に書き、落ちるのを見てから作る。`[P]` は、ほかと違うファイルで、同時に進められる作業。

## Phase 0: 先に入れる共通の PR（この仕様の外。前提）

どれも共通のファイルを直すので、領域の PR に混ぜない（[並行開発の決まり](../../../docs/rules/parallel-development.md) 3-3）。作る前にユーザーに伝える。

- [x] T001 `fix/core-unexpected-error-log`：予期しないエラーのログに SQL の値を出さない（`apps/api/src/app.ts` の `onError`）。DB のエラーは SQLSTATE と制約の名前だけを書き、message・stack・params は書かない。結合のテストは、決まった言葉を値にした DB のエラーを起こし、ログの出力にその言葉がないことを見る（research R2 の1。pr1 の前。PR #167）
- [x] T002 OAuth の範囲を、MCP のツールを出すアプリだけから作る（`apps/api/src/modules/account/oauth/routes.ts` の `scopes_supported`・許す範囲・同意の画面）。仕様は `specs/core/NNN-…`（番号は作るときに決める。research R2 の2。pr1 の前）
- [x] T003 person の import の許す一覧を、lint の `no-restricted-imports` で止める（ESLint の設定）。許すのは account・suite の `index.ts` と `eventTable`（research R2 の3。pr2 の前。次の仕様で reception と event の関数を足す。PR #170）

## Phase 1: 表とアプリの登録（PR `feature/person-001-pr1-tables`）

- [x] T004 [P] 約束の上限を先に置く：`packages/contracts/src/person/limits.ts`。値は次のとおり（data-model の値）。単体のテストは `limits.test.ts`
  - フルネーム 1〜100字
  - よみ・LINE の名前 100字
  - 見た目の特徴 200字
  - アカウント 各200字
  - 話したこと 20,000字
  - 次に話したいこと 2,000字
  - タグ 1つ30字（数の上限は置かない。PRD FR-P2）
  - 字はコードポイントで数える（絵文字も1字）。数える関数を `limits.ts` に1つ置く
  - 会った場の名前 1〜100字
- [x] T005 [P] 会った場の作り方の選択肢 `PERSON_MEETING_SOURCES = ["manual", "event"]` を置く：`packages/contracts/src/person/options.ts`・`index.ts`（名前を挙げて再エクスポート）。`SEARCH_VERSION` は pr2 の `search.ts`
- [x] T006 結合のテストを先に書く：`apps/api/src/modules/person/schema.test.ts`（本物の PostgreSQL）。確かめることは次のとおり。
  - **長さ**：長さの CHECK が約束の上限と同じ。
  - **アカウントの URL**：`account_url` は `http://`・`https://` で始まるものだけ。
  - **タグ**：`cardinality(tag_keys) = cardinality(tags)`。
  - **作り方**：`source` は選択肢だけで、`source = 'event' OR event_id IS NULL`。
  - **一意**：
    - `(owner_account_id, create_request_id)` の部分の一意
    - `(owner_account_id, event_id)` の部分の一意
    - `(owner_account_id, name_key, met_on) WHERE source = 'manual'` の一意
  - **組の表**：同じ組は1つだけ。持ち主の違う人と会った場は、複合の外部キーで結べない。
  - **持ち主を消したとき**：3つの表の行が消える。
  - **交流会を消したとき**：`event_id` だけが null になる。そのとき、手で書いた同じ名前と日付の会った場があっても、退会（交流会の持ち主の account を消す）が落ちない。
  - **人と会った場を消したとき**：人を消すと組だけが消え、会った場は残る。会った場を消すと組だけが消え、人は残る。
- [x] T007 `apps/api/src/modules/person/schema.ts` に3つの表を書く（`person_note`・`person_meeting`・`person_note_meeting`。data-model のとおり）
  - 共通の列は `kernel/columns.ts`。`accountTable`・`eventTable` は相手の `index.ts` から読む。
  - 先頭で `import "@hono/zod-openapi";` を読む。
  - CHECK の値は約束から読まず、文字で書く（食い違いは T006 が見る）。
- [x] T008 `pnpm db:generate --name person` を流し、できた `apps/api/drizzle/00NN_person.sql` を読む（表を足すだけであること）。そのあと `pnpm db:migrate` と `pnpm db:check`
- [x] T009 アプリの登録。
  - `packages/contracts/src/core/apps.list.ts` に1行：`export const person = defineApp({ key: "person", name: "人物メモ", summary: "会った人と話したことのメモ", description: "交流会で会った人の見た目・話したこと・次に話したいことを、自分だけが見られるメモに残します。", icon: "…", domains: ["person"], basePath: "/person", uses: ["reception"], accountData: "人物メモ（会った人・会った場）" });`（icon は今ある名前から、作るときに選ぶ）
  - `apps/api/src/modules.list.ts`・`apps/web/src/features.list.ts` に1行ずつ。
- [x] T010 [P] `apps/api/src/modules/person/index.ts`（表の再エクスポートはしない。中身は `export {};` と「窓口は pr2 で足す」の説明）
- [x] T011 [P] 画面の仮の道：`apps/web/src/features/person/{index.ts, routes.ts, paths.ts, PlaceholderPage.tsx}`。`/person` に `<Page title="人物メモ" lead="人物メモは準備中です。" />`
- [x] T012 [P] 文書：`docs/apps/person.md`（アプリの登録・表）・`docs/README.md` 2章の一覧の行・`docs/rules/specs.md` の領域の一覧に `person` の1行
- [ ] T013 `pnpm check` を流し、結果を PR に書く。DB の変更の PR なので、ラベル `run-ci` を付ける（開発の流れの決まり 3章）

## Phase 2: 窓口の土台（PR `feature/person-001-pr2-notes`。すべての話の前に要る）

- [x] T014 [P] 約束を先に書く（単体のテストを先に）：`packages/contracts/src/person/search.ts` と `search.test.ts`（research R6）
  - `normalizeForSearch`：NFKC → カタカナをひらがなに → 小文字。
  - `findMatches(original, query)`：もとの文の中の位置を返す。全角の「Ｇｏ」・「タナカ」・絵文字・結合文字で、位置がずれないこと。
  - `escapeLike`：`%`・`_`・`\` を逃がす。
  - `normalizeMeetingName`：前後の空白を除き、間の空白を1つにしてから `normalizeForSearch`。
  - `SEARCH_VERSION = 1`。
- [x] T015 [P] 約束：`packages/contracts/src/person/errors.ts`（`PERSON_ERRORS`：`NOT_FOUND` 404・`VERSION_CONFLICT` 409。文言に利用者の値を入れない）
- [x] T016 [P] 約束：`packages/contracts/src/person/note.ts`・`meeting.ts` と `*.test.ts`（`z.strictObject`・日本語の誤りの文）
  - `NoteCreateInput`（`clientRequestId: uuid`・`fullName` 要る・任意の欄・`meetingId?`）
  - `NoteUpdateInput`（`baseVersion: int>=1`・直す欄）
  - `NoteAppendInput`（`appendId: uuid`・`text` 1字以上・`meetingId?`）
  - `NoteSearchInput`（`query?`・`tag?`。どちらか要る）
  - `MeetingCreateInput`（`name`・`metOn: YYYY-MM-DD`）
  - 読む形の `NoteSummary`・`Note`・`MeetingSummary`・`Meeting`・`SearchResult`
  - タグはそろえて同じものを1つにまとめる
- [x] T017 `apps/api/test/helpers/person.ts`：アプリを見えるようにする（`upsertVisibility(db, "person", "public")`）・人と会った場を作る手伝い
- [x] T018 `apps/api/src/modules/person/access.ts`：持ち主だけを通す1つの関数。ほかの人の記録は `PERSON_ERRORS.NOT_FOUND`。行ロックの引数つき
- [x] T019 `apps/api/src/modules/person/repository.ts`：読み書き。保存のたびに `search_text`・`search_version`・`tag_keys`・`updated_at` を作る。起こりうる DB のエラーは `AppError` に読みかえる（`kernel/pg-errors.ts`）。logger にメモの値を渡さない
- [x] T020 `apps/api/src/modules/person/index.ts` に `routes(deps)` を出し、`routes.ts` の骨組みを置く（`OpenAPIHono`・`requireSession`・tags `["person"]`・operationId は `person` で始める）

## Phase 3: User Story 1 - 会った人を足して書き、あとで読み返す (Priority: P1) 🎯 MVP

**Goal**: フルネームだけで人を足し、全部の欄を書き、開くと話したことと次に話したいことが最初に見える。消せる。

**Independent Test**: 人を1人足して閉じ、一覧から開き直すと、書いた欄が残り、話したことと次に話したいことが最初に見える。

- [x] T021 [P] [US1] 窓口のテストを先に書く：`apps/api/src/modules/person/routes.test.ts`「人物メモの窓口」。確かめることは次のとおり。
  - 足す入力の誤りは 400。
  - ログインしていなければ 401。ない ID・形の違う ID・ほかの人の ID は 404。
  - 同じ `clientRequestId` の送り直しは二重にならない（`200` で前の人）。
  - `baseVersion` が違えば 409。
  - 消すと 204 で、読むと 404。
  - 台帳で「切」か「運営者だけ」なら、運営者でない人には 404。
- [x] T022 [P] [US1] 約束のテストを先に書く：`packages/contracts/src/person/accounts.test.ts`。
  - X・connpass・GitHub・LinkedIn のアカウント名から URL を組み立てる（`@` を外すなど）。
  - LINE ID は `https://line.me/R/ti/p/~{ID}`（research R5）。
  - `account_url` は `http`・`https` だけ（`javascript:`・`tel:`・`data:` は誤り）。
- [x] T023 [US1] `packages/contracts/src/person/accounts.ts` を書く
- [x] T024 [US1] 窓口：`personListNotes`（`updated_at` の新しい順・最大500・`truncated`）・`personCreateNote`・`personGetNote`・`personUpdateNote`・`personDeleteNote`（`apps/api/src/modules/person/routes.ts`。contracts/person.md のとおり）
- [x] T025 [P] [US1] 画面のテストを先に書く：`apps/web/src/features/person/NotePage.test.tsx`・`NoteFormPage.test.tsx`。確かめることは次のとおり。
  - 話したことと次に話したいことが最初に出る。
  - 「このメモを見られるのはあなただけです」と、知られたくないことを書かない注意が出る。
  - フルネームが空なら保存できない。
  - 保存に失敗しても、書いた内容が残る。
  - 409 のときは「ほかで直されました。読み直してください」が出る。
- [x] T026 [US1] 画面：`apps/web/src/features/person/{api.ts, queries.ts, NoteFormPage.tsx, NotePage.tsx}` と `routes.ts`（`/person/new`・`/person/notes/$noteId`）。
  - 人を足すときは、`clientRequestId` を画面が作り、送り直しでも同じものを使う。
  - アカウントは新しいタブで開く。
  - 消すときは、確かめのダイアログを出す。

## Phase 4: User Story 2 - 名前や話したことで探す (Priority: P1)

**Goal**: 欄のどれかで探せ、当たった箇所が前後と一緒に見える。一覧は最後に保存した順で、見た目の特徴が名前の横に出る。タグで絞れる。URL に検索の言葉を載せない。

**Independent Test**: 3人を足し、それぞれの欄にしかない言葉で探すと、その人だけが当たる。

- [x] T027 [P] [US2] 窓口のテストを先に書く（`routes.test.ts`）。確かめることは次のとおり。
  - 「タナカ」でよみ「たなか」が当たる。
  - 「ｇｏ」で「Go」が当たり、`before`・`hit`・`after` が、もとの文のその所。
  - 「100%」「a_b」は文字としてだけ当たる。
  - 会った場の名前で当たる。
  - タグで絞れる。
  - ほかの人の行は当たらない。
  - `query` も `tag` もなければ 400。
  - `query` と `tag` を両方送ると、両方に当たる人だけ。
  - 結果は `updated_at` の新しい順で、100人を超えると `truncated`。
- [x] T028 [US2] 窓口：`personSearchNotes`（`POST /api/v1/person/notes/search`。`apps/api/src/modules/person/search.ts`）。
  - `search_text LIKE … ESCAPE '\'` と、`person_meeting.name_key` を組の表で結ぶ。
  - 前後の文は `findMatches` で作る。
- [x] T029 [P] [US2] 画面のテストを先に書く：`apps/web/src/features/person/ListPage.test.tsx`。確かめることは次のとおり。
  - 名前の横に見た目の特徴が出る。
  - 検索の結果に、当たった所が分かる形で出る。
  - 検索の言葉とタグを入れても、`window.location` が変わらない。
  - 500人を超えたときの案内が出る。
  - 「このメモを見られるのはあなただけです」が出る。
- [x] T030 [US2] 画面：`apps/web/src/features/person/ListPage.tsx` と `routes.ts`（`/person`）。
  - 検索の言葉とタグは画面の状態だけに持つ（`validateSearch` を使わない・sessionStorage に入れない）。
  - 5秒おきの読み直しを使わない。

## Phase 5: User Story 3 - 会った場を作り、そこで会った人を続けて足す (Priority: P2)

**Goal**: 名前と日付で会った場を作るか前のものを選び、そこで新しい人を続けて足す・前の人に付ける。会った場ごとに人が並ぶ。

**Independent Test**: 会った場を1つ作り、続けて3人（新しい2人と前の1人）を足すと、会った場の画面に3人が並ぶ。

- [x] T031 [P] [US3] 窓口のテストを先に書く（`routes.test.ts`）。確かめることは次のとおり。
  - そろえて同じ名前と日付の会った場は、作らずに前のもの（`200`）。前後の空白・間の空白の数・全角と半角の違いでも同じ。
  - 足すときに `meetingId` を付けると組ができる。
  - 付ける窓口は、付いていても同じ答え。
  - ほかの人の会った場を付けると 404。
  - 会った場を消すと組だけが消え、人は残る。
  - 会った場の一覧に人数が出る。
  - 付ける・外すと、人の `updated_at` が新しくなる。
- [x] T032 [US3] 窓口：`personListMeetings`・`personCreateMeeting`・`personGetMeeting`・`personDeleteMeeting`・`personAttachMeeting`・`personDetachMeeting`（`routes.ts`・`repository.ts`）
- [x] T033 [P] [US3] 画面のテストを先に書く：`apps/web/src/features/person/MeetingPage.test.tsx`。確かめることは次のとおり。
  - 新しい人を保存すると、会った場を選んだまま次の人を足す欄になる。
  - 前に足した人を選んで付けられる。
  - 付いている人が並ぶ。
  - 「このメモを見られるのはあなただけです」と、続けて足す欄に知られたくないことを書かない注意が出る。
- [x] T034 [US3] 画面：`apps/web/src/features/person/{MeetingsPage.tsx, MeetingPage.tsx}` と `routes.ts`（`/person/meetings`・`/person/meetings/$meetingId`）

## Phase 6: User Story 4 - また会ったら、同じ人のメモに書き足す (Priority: P2)

**Goal**: 話したことに、書き足した日と会った場の見出しつきで書き足す。押し直しても二重にならない。

**Independent Test**: 話したことを書いた人に書き足すと、前の文の後ろに見出しつきで足される。2回押しても1回分だけ。

- [x] T035 [P] [US4] 約束のテストを先に書く：`packages/contracts/src/person/heading.test.ts`。
  - 見出しは `── 2026-12-03 ──`。会った場つきは `── 2026-12-03 12月の勉強会（2026-12-03）──`。
  - 日付は日本時間（UTC の 15時は次の日）。
  - 話したことが空なら見出しから始める。
- [x] T036 [US4] `packages/contracts/src/person/heading.ts` を書く（日本時間の日付は `packages/contracts/src/core` の関数を使う）
- [x] T037 [P] [US4] 窓口のテストを先に書く（`routes.test.ts`）。確かめることは次のとおり。
  - 書き足すと見出しつきで足され、`version` が上がる。
  - 同じ `appendId` は書かずに今の値を返す。
  - `meetingId` を付けると組もできる。
  - ほかの人の人には 404。
  - 書き足すと話したことが 20,000字を超えるなら、書かずに 400（`fields.talk`）。
- [x] T038 [US4] 窓口：`personAppendTalk`（`routes.ts`・`repository.ts`。行ロックの中で `recent_append_ids` を比べる。research R7）
- [x] T039 [US4] 画面：`NotePage.tsx` に書き足しの欄。
  - `appendId` は画面が作り、送り直しでも同じものを使う。
  - 会った場を選べる。
  - 保存に失敗しても、書いた内容が残る（`NotePage.test.tsx` に足す）。

## Phase 7: User Story 5 - アカウントから相手のページや LINE を開く (Priority: P3)

**Goal**: アカウントを押すと相手のページ、LINE ID からは LINE のプロフィールが開く。

**Independent Test**: X と LINE ID を入れた人を開き、押すと、それぞれが新しいタブで開く。

- [x] T040 [US5] 画面：`NotePage.tsx` のアカウントを、`accounts.ts` の URL で `target="_blank" rel="noopener noreferrer"` のリンクにする。LINE ID に「相手が ID で見つけられる設定のときだけ開けます」を添える（`NotePage.test.tsx` に、リンクの先と `javascript:` が出ないことを足す）

## Phase 8: User Story 6 - 自分のメモを書き出す・退会で消える (Priority: P3)

**Goal**: すべての欄を CSV で書き出す。退会でぜんぶ消える。

**Independent Test**: 2人と会った場1つを持つ人が書き出すと2行。退会すると何も残らない。

- [x] T041 [P] [US6] 窓口のテストを先に書く（`routes.test.ts`）。確かめることは次のとおり。
  - CSV は BOM つきで、列は research R13 のとおり。
  - 「=1+1」は式として動かない形。
  - ほかの人の行が入らない。
  - 退会（account を消す）で、3つの表の行が消える。
- [x] T042 [US6] 窓口：`personExport`（`apps/api/src/modules/person/csv.ts`・`packages/csv` の `buildCsv`・`csvAttachment("person-notes")`）
- [x] T043 [US6] 画面：一覧の画面に「書き出す」（`apps/web/src/lib/download.ts` の `fetchDownload` と `saveFile`）

## Phase 9: 仕上げ（pr2）

- [x] T044 ログに出ないことの結合のテスト：`apps/api/src/modules/person/logging.test.ts`。決まった言葉を、名前・話したこと・検索の言葉に入れて、すべての窓口を流す。ログの出力（pino の写し）にその言葉がないことを見る（SC-005）
- [x] T045 [P] E2E：`e2e/tests/person.spec.ts`。ログインしていなければ「ログインしてください」。`test-login` でログインし、`/person`・`/person/new`・`/person/notes/$noteId`・`/person/meetings/$meetingId` を axe にかける（WCAG 2.2 AA。Constitution の技術スタック制約。スマホと PC の両方の幅。試合表の `match.spec.ts` と同じ手伝い）
- [x] T046 [P] 文書：`docs/apps/person.md` に窓口・画面・テストを足す
- [x] T047 `pnpm check` を流し、結果を PR に書く。そのあと `/code-review` でセルフレビューをし、指摘を直す
- [ ] T048 ステージングで [quickstart.md](./quickstart.md) の手での確かめを行い、印を付ける（持ち主）

## Dependencies & Execution Order

- **Phase 0**（共通の PR）：T001・T002 は pr1 より先に `develop` に入れる。T003 は pr2 の前。
- **Phase 1**（pr1）：T004・T005 → T006 → T007 → T008 → T009〜T012 → T013。DB の変更の PR は、`develop` に同時に1本だけ開く（AD-17）。
- **Phase 2**：pr1 が `develop` に入ってから。すべての話の前。
- **US1・US2**（P1）：Phase 2 のあと。US2 は、US1 の人を足す窓口があると確かめやすい。
- **US3・US4**（P2）：US1 のあと。US4 の会った場つきの書き足しは、US3 の会った場を使う。
- **US5・US6**（P3）：US1 のあと。互いに関係しない。
- **Phase 9**：すべての話のあと。

## Parallel Example

```text
Phase 2：T014・T015・T016（contracts の違うファイル）
US1：T021（API のテスト）・T022（contracts のテスト）・T025（画面のテスト）
US3：T031・T033
```

## Implementation Strategy

1. **Phase 0**：共通の PR（T001・T002）を出し、入るのを待つ。その間に pr1 のテストと表を書く（PR はまだ開かない。DB の変更の PR は同時に1本だけ）。
2. **pr1**：表とアプリの登録だけを入れる（運営者だけに見える仮の画面）。
3. **pr2 の MVP**：Phase 2 と US1・US2。持ち主が足して、読み返して、探せる。ここで持ち主に試してもらえる。
4. US3・US4（交流会の帰りに続けて足す・書き足す）→ US5・US6 → 仕上げ。
5. 次の仕様：PaletKit の交流会を会った場に選ぶ（受付と交流会の小さな PR と、T003 のあと）。
