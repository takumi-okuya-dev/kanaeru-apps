# メモ（notes）の地図

2026-11-18 作成（TypeScript の骨組みの見本の領域）。

領域の作り方を見せるための、いちばん小さな領域。題と本文だけのメモを、一覧・追加・編集・削除する。**プロダクトを始めたら、消すか作り替える**（消すときは、下の表の所と、`modules.list.ts`・`features.list.ts` の1行、`docs/rules/specs.md` 2 の行、この文書を消し、表を消す DB の変更を足す）。

## 1. 表

| 表 | 列 | 決まり |
|---|---|---|
| `note` | `id`（uuid・`uuidv7()`）・`title`（text）・`body`（text・既定は空）・`created_at`・`updated_at`（timestamptz） | 同じ題（大文字と小文字の違いを含む）は1つだけ（`note_title_unique`：`lower(title)` の一意の索引） |

## 2. 窓口

| 動き | 道 | すること | 主なエラー |
|---|---|---|---|
| GET | `/api/v1/notes` | 一覧（新しく直した順） | — |
| POST | `/api/v1/notes` | 作る（201） | 400 `INVALID_INPUT`・409 `NOTE_TITLE_TAKEN`（題の欄の理由つき） |
| GET | `/api/v1/notes/{noteId}` | 1つ読む | 404 `NOT_FOUND`（uuid の形でない ID も） |
| PUT | `/api/v1/notes/{noteId}` | 題と本文をまるごと置きかえる | 400・404・409 |
| DELETE | `/api/v1/notes/{noteId}` | 消す（204。元に戻せない） | 404 |

入力の形（`NoteInput`：題は1〜100文字・本文は2000文字まで・前後の空白を除く・知らない欄は受け取らない）と、エラーの文言は `packages/contracts/src/notes/`。

## 3. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| `/notes` | 一覧 | 読みこみ中・失敗（もう一度）・空（最初にすることと「メモを追加」を1つ）・表。主の操作は「メモを追加」 |
| `/notes/new` | 追加 | 誤りは欄のそば。追加できたら一覧へ移り、画面の上の知らせの帯で「メモを追加しました。」 |
| `/notes/$noteId` | 編集 | 保存の結果は「保存」の近く。削除は確かめの枠（何が消えるか・元に戻せないこと）。消したら一覧へ移り、知らせの帯で「メモを削除しました。」。ないメモは「メモが見つかりません」と戻る道 |

## 4. 置き場所

| 所 | ファイル |
|---|---|
| 約束 | `packages/contracts/src/notes/`（`note.ts`・`errors.ts`・`index.ts`） |
| API | `apps/api/src/modules/notes/`（`schema.ts`・`repository.ts`・`routes.ts`・`index.ts`・`notes.test.ts`） |
| 画面 | `apps/web/src/features/notes/`（`routes.ts`・`api.ts`・`NotesListPage.tsx`・`NoteNewPage.tsx`・`NoteEditPage.tsx`・`NoteForm.tsx`・`index.ts`） |
| 見本のデータ | `apps/api/scripts/lib/seed.ts`（仮のメモ3つ） |
| 通しのテスト | `e2e/tests/notes.spec.ts`・`keyboard.spec.ts`・`a11y.spec.ts` |
