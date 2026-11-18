// メモの窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["notes"] から import type で読む）と、
// TanStack Query の鍵。読み書きはすべて lib/api.ts の request を通す（エラーの読み方をそろえる）。
import type { NoteInput } from "@workspace/contracts/notes";
import { queryOptions } from "@tanstack/react-query";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["notes"]>> | undefined;

/**
 * メモの窓口の呼び出しの道具（今の画面の源の /api を呼ぶ）。
 * @returns 呼び出しの道具
 */
function api() {
  client ??= createApiClient<ModuleRoutes["notes"]>();
  return client;
}

/** TanStack Query の鍵の頭。 */
const NOTES_KEY = ["notes"] as const;

/**
 * メモの一覧を読む問い合わせ。
 * @returns 問い合わせの決め方
 */
export function notesQuery() {
  return queryOptions({
    queryKey: NOTES_KEY,
    queryFn: () => request(() => api().api.v1.notes.$get()),
  });
}

/**
 * メモを1つ読む問い合わせ。
 * @param noteId メモの ID
 * @returns 問い合わせの決め方
 */
export function noteQuery(noteId: string) {
  return queryOptions({
    queryKey: [...NOTES_KEY, noteId],
    queryFn: () => request(() => api().api.v1.notes[":noteId"].$get({ param: { noteId } })),
  });
}

/**
 * メモを作る。
 * @param input 題と本文
 * @returns 作ったメモ
 */
export function createNote(input: NoteInput) {
  return request(() => api().api.v1.notes.$post({ json: input }));
}

/**
 * メモを直す。
 * @param noteId メモの ID
 * @param input 題と本文
 * @returns 直したメモ
 */
export function updateNote(noteId: string, input: NoteInput) {
  return request(() => api().api.v1.notes[":noteId"].$put({ param: { noteId }, json: input }));
}

/**
 * メモを消す。
 * @param noteId メモの ID
 * @returns 消し終わり
 */
export function deleteNote(noteId: string) {
  return request(() => api().api.v1.notes[":noteId"].$delete({ param: { noteId } }));
}

/** 一覧と1つのメモの問い合わせを、まとめて読み直させる鍵。 */
export const notesKey = NOTES_KEY;
