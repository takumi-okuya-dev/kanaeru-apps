// 人物メモの窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["person"] から import type で読む）。
// 読み書きは lib/api.ts の request を通す（エラーの読み方をそろえる）。探す言葉とタグは POST の本文で送り、URL に載せない（AD-31）。
import type {
  MeetingCreateInput,
  MeetingFromEventInput,
  NoteAppendInput,
  NoteCreateInput,
  NoteSearchInput,
  NoteUpdateInput,
} from "@workspace/contracts/person";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";
import { fetchDownload } from "../../lib/download.ts";
import type { DownloadedFile } from "../../lib/download.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["person"]>> | undefined;

/**
 * 人物メモの窓口の呼び出しの道具。
 * @returns 呼び出しの道具の person の部分
 */
function personApi() {
  client ??= createApiClient<ModuleRoutes["person"]>();
  return client.api.v1.person;
}

/**
 * 人の一覧（最後に保存した順。最大500人）。
 * @returns 一覧
 */
export function fetchNotes() {
  return request(() => personApi().notes.$get());
}

/**
 * 人を足す（同じ clientRequestId の送り直しは、前に足した人が返る）。
 * @param input 足す入力
 * @returns 足した人
 */
export function createNote(input: NoteCreateInput) {
  return request(() => personApi().notes.$post({ json: input }));
}

/**
 * 人を読む。
 * @param noteId 人の ID
 * @returns 人のメモ
 */
export function fetchNote(noteId: string) {
  return request(() => personApi().notes[":noteId"].$get({ param: { noteId } }));
}

/**
 * 人を直す（もとの版が今の版と違えば 409）。
 * @param noteId 人の ID
 * @param input 直す入力
 * @returns 直した人
 */
export function updateNote(noteId: string, input: NoteUpdateInput) {
  return request(() => personApi().notes[":noteId"].$patch({ param: { noteId }, json: input }));
}

/**
 * 話したことに書き足す（同じ appendId の送り直しは、書かずに今の値が返る）。
 * @param noteId 人の ID
 * @param input 書き足す入力
 * @returns 書き足した人
 */
export function appendTalk(noteId: string, input: NoteAppendInput) {
  return request(() =>
    personApi().notes[":noteId"].appends.$post({ param: { noteId }, json: input }),
  );
}

/**
 * 人を消す。
 * @param noteId 人の ID
 * @returns 終わり
 */
export function deleteNote(noteId: string) {
  return request(() => personApi().notes[":noteId"].$delete({ param: { noteId } }));
}

/**
 * 探す（言葉とタグは本文で送る）。
 * @param input 探す言葉とタグ
 * @returns 当たった人と、当たった所
 */
export function searchNotes(input: NoteSearchInput) {
  return request(() => personApi().notes.search.$post({ json: input }));
}

/**
 * 人に会った場を付ける。
 * @param noteId 人の ID
 * @param meetingId 会った場の ID
 * @returns 付けた人
 */
export function attachMeeting(noteId: string, meetingId: string) {
  return request(() =>
    personApi().notes[":noteId"].meetings[":meetingId"].$put({ param: { noteId, meetingId } }),
  );
}

/**
 * 人から会った場を外す。
 * @param noteId 人の ID
 * @param meetingId 会った場の ID
 * @returns 外した人
 */
export function detachMeeting(noteId: string, meetingId: string) {
  return request(() =>
    personApi().notes[":noteId"].meetings[":meetingId"].$delete({ param: { noteId, meetingId } }),
  );
}

/**
 * 会った場の一覧（日付の新しい順）。
 * @returns 一覧
 */
export function fetchMeetings() {
  return request(() => personApi().meetings.$get());
}

/**
 * 会った場を作る（そろえて同じ名前と日付のものがあれば、前のものが返る）。
 * @param input 名前と日付
 * @returns 会った場
 */
export function createMeeting(input: MeetingCreateInput) {
  return request(() => personApi().meetings.$post({ json: input }));
}

/**
 * 会った場に選べる PaletKit の交流会（受付アプリが見えなければ available が false）。
 * @returns 一覧
 */
export function fetchEventCandidates() {
  return request(() => personApi()["event-candidates"].$get());
}

/**
 * 交流会から会った場を作る（その交流会の会った場がもうあれば、前のものが返る）。
 * @param input 交流会の ID
 * @returns 会った場
 */
export function createMeetingFromEvent(input: MeetingFromEventInput) {
  return request(() => personApi().meetings["from-event"].$post({ json: input }));
}

/**
 * 会った場を読む。
 * @param meetingId 会った場の ID
 * @returns 会った場（そこで会った人の一覧つき）
 */
export function fetchMeeting(meetingId: string) {
  return request(() => personApi().meetings[":meetingId"].$get({ param: { meetingId } }));
}

/**
 * 会った場を消す。
 * @param meetingId 会った場の ID
 * @returns 終わり
 */
export function deleteMeeting(meetingId: string) {
  return request(() => personApi().meetings[":meetingId"].$delete({ param: { meetingId } }));
}

/**
 * 自分のメモの CSV を受け取る。
 * @returns 中身とファイルの名前
 */
export function downloadExport(): Promise<DownloadedFile> {
  return fetchDownload(() => personApi().export.$get(), "person-notes.csv");
}
