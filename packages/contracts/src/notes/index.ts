// メモ（notes）の約束の入口。ほかからは @workspace/contracts/notes として読む。
// メモは、領域の作り方を見せる見本の領域（docs/apps/notes.md）。プロダクトを始めたら、消すか作り替える。
export { NOTES_ERRORS } from "./errors.ts";
export type { NotesErrorCode } from "./errors.ts";
export { NOTE_BODY_MAX, NOTE_TITLE_MAX, Note, NoteInput, NoteList } from "./note.ts";
