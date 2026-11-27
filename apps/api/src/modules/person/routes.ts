// 人物メモの窓口（specs/person/001-notes/contracts/person.md の14の窓口）。道の頭は /api/v1/person（AD-31）。
// どの道もログインが要る（account の requireSession）。権限は access.ts の「持ち主か」だけで、ほかの人の記録は 404。
// アプリが見えないときの 404 は、組み立てが付ける suite の requireApp（AD-16）。
// 人を足す送り直しは clientRequestId、書き足しの送り直しは appendId で二重にしない。直すのはもとの版が今の版と同じときだけ（R7）。
// 探す言葉とタグは URL に載せず、POST の本文で受ける（AD-31）。メモの値はログに出さない（ここではログを書かない。R14）。
// DB のエラーは repository.ts の guardDbErrors で読みかえる（SQL に渡した値を、予期しないエラーのログに出さない）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/person";
import { PERSON_ERRORS } from "@workspace/contracts/person";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { csvAttachment, invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { isUniqueViolation } from "../../kernel/pg-errors.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import { requireOwnedMeeting, requireOwnedNote } from "./access.ts";
import { buildPersonCsv } from "./csv.ts";
import {
  appendToTalk,
  attachMeeting,
  deleteMeeting,
  deleteNote,
  detachMeeting,
  findNoteIdByRequest,
  findOrCreateMeeting,
  guardDbErrors,
  insertNote,
  listExportRows,
  listMeetings,
  listNotes,
  meetingOf,
  noteOf,
  updateNote,
} from "./repository.ts";
import { searchNotes } from "./search.ts";

/** 人の一覧。 */
const NoteList = contract.NoteList.openapi("PersonNoteList");
/** 人のメモ。 */
const Note = contract.Note.openapi("PersonNote");
/** 人を足す入力。 */
const NoteCreateInput = contract.NoteCreateInput.openapi("PersonNoteCreateInput", {
  example: { clientRequestId: "0193a1b2-0000-4000-8000-000000000001", fullName: "田中 太郎" },
});
/** 人を直す入力。 */
const NoteUpdateInput = contract.NoteUpdateInput.openapi("PersonNoteUpdateInput");
/** 話したことに書き足す入力。 */
const NoteAppendInput = contract.NoteAppendInput.openapi("PersonNoteAppendInput");
/** 探す入力。 */
const NoteSearchInput = contract.NoteSearchInput.openapi("PersonNoteSearchInput");
/** 検索の結果。 */
const SearchResult = contract.SearchResult.openapi("PersonSearchResult");
/** 会った場の一覧。 */
const MeetingList = contract.MeetingList.openapi("PersonMeetingList");
/** 会った場（そこで会った人の一覧つき）。 */
const Meeting = contract.Meeting.openapi("PersonMeeting");
/** 会った場を作る入力。 */
const MeetingCreateInput = contract.MeetingCreateInput.openapi("PersonMeetingCreateInput", {
  example: { name: "11月の AI 勉強会", metOn: "2026-11-20" },
});

/** 道の noteId。 */
const NoteParams = z.object({ noteId: uuidParam("noteId", "人の ID") });
/** 道の meetingId。 */
const MeetingParams = z.object({ meetingId: uuidParam("meetingId", "会った場の ID") });
/** 道の noteId と meetingId。 */
const NoteMeetingParams = z.object({
  noteId: uuidParam("noteId", "人の ID"),
  meetingId: uuidParam("meetingId", "会った場の ID"),
});

/** 人・会った場がない応答。 */
const notFoundResponse = domainErrorResponse(
  PERSON_ERRORS.NOT_FOUND,
  "人・会った場がない（消した・ID が違う・ほかの使う人のもの）",
);

/**
 * JSON の応答の書き方。
 * @param schema 本文の形
 * @param description いつ返すか
 * @returns OpenAPI の応答の定義
 */
function json<T>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } } as const;
}

/**
 * JSON の本文の書き方。
 * @param schema 本文の形
 * @returns OpenAPI の本文の定義
 */
function body<T>(schema: T) {
  return { required: true, content: { "application/json": { schema } } } as const;
}

/**
 * 人物メモの窓口の道の定義（middleware に deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const tags = ["person"];
  const notes = "/api/v1/person/notes";
  const meetings = "/api/v1/person/meetings";
  const ownedErrors = { 401: unauthenticatedResponse, 404: notFoundResponse } as const;
  return {
    listNotes: createRoute({
      method: "get",
      path: notes,
      tags,
      operationId: "personListNotes",
      summary: "人の一覧（最後に保存した順。最大500人。より多いときは truncated）",
      middleware: [session] as const,
      responses: { 200: json(NoteList, "一覧"), 401: unauthenticatedResponse },
    }),
    createNote: createRoute({
      method: "post",
      path: notes,
      tags,
      operationId: "personCreateNote",
      summary:
        "人を足す（フルネームだけでよい。meetingId を付けると会った場も付く。同じ clientRequestId の送り直しは 200 で前の人）",
      middleware: [session] as const,
      request: { body: body(NoteCreateInput) },
      responses: {
        201: json(Note, "足した人"),
        200: json(Note, "同じ clientRequestId で前に足した人"),
        400: invalidInputResponse,
        ...ownedErrors,
      },
    }),
    searchNotes: createRoute({
      method: "post",
      path: `${notes}/search`,
      tags,
      operationId: "personSearchNotes",
      summary:
        "探す（言葉かタグ。両方なら両方に当たる人だけ。最後に保存した順に最大100人。言葉とタグを URL に載せないため POST）",
      middleware: [session] as const,
      request: { body: body(NoteSearchInput) },
      responses: {
        200: json(SearchResult, "当たった人と、当たった所"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
      },
    }),
    getNote: createRoute({
      method: "get",
      path: `${notes}/{noteId}`,
      tags,
      operationId: "personGetNote",
      summary: "人を読む（全部の欄と、付いている会った場）",
      middleware: [session] as const,
      request: { params: NoteParams },
      responses: { 200: json(Note, "人"), ...ownedErrors },
    }),
    updateNote: createRoute({
      method: "patch",
      path: `${notes}/{noteId}`,
      tags,
      operationId: "personUpdateNote",
      summary: "人を直す（送った欄だけ。もとの版が今の版と同じときだけ受けて版を1つ上げる）",
      middleware: [session] as const,
      request: { params: NoteParams, body: body(NoteUpdateInput) },
      responses: {
        200: json(Note, "直した人"),
        400: invalidInputResponse,
        ...ownedErrors,
        409: domainErrorResponse(
          PERSON_ERRORS.VERSION_CONFLICT,
          "もとの版が今の版と違う（ほかで先に直された）",
        ),
      },
    }),
    appendTalk: createRoute({
      method: "post",
      path: `${notes}/{noteId}/appends`,
      tags,
      operationId: "personAppendTalk",
      summary:
        "話したことに書き足す（書き足した日と、選んだ会った場の見出しつき。同じ appendId は書かずに今の値）",
      middleware: [session] as const,
      request: { params: NoteParams, body: body(NoteAppendInput) },
      responses: {
        200: json(Note, "書き足した人"),
        400: {
          description: "入力の誤り・書き足すと話したことが上限を超える（fields.talk）",
          content: invalidInputResponse.content,
        },
        ...ownedErrors,
      },
    }),
    deleteNote: createRoute({
      method: "delete",
      path: `${notes}/{noteId}`,
      tags,
      operationId: "personDeleteNote",
      summary: "人を消す（戻せない。会った場は残る）",
      middleware: [session] as const,
      request: { params: NoteParams },
      responses: { 204: { description: "消した" }, ...ownedErrors },
    }),
    attachMeeting: createRoute({
      method: "put",
      path: `${notes}/{noteId}/meetings/{meetingId}`,
      tags,
      operationId: "personAttachMeeting",
      summary: "人に会った場を付ける（付いていても同じ答え）",
      middleware: [session] as const,
      request: { params: NoteMeetingParams },
      responses: { 200: json(Note, "会った場を付けた人"), ...ownedErrors },
    }),
    detachMeeting: createRoute({
      method: "delete",
      path: `${notes}/{noteId}/meetings/{meetingId}`,
      tags,
      operationId: "personDetachMeeting",
      summary: "人から会った場を外す",
      middleware: [session] as const,
      request: { params: NoteMeetingParams },
      responses: { 200: json(Note, "会った場を外した人"), ...ownedErrors },
    }),
    listMeetings: createRoute({
      method: "get",
      path: meetings,
      tags,
      operationId: "personListMeetings",
      summary: "会った場の一覧（日付の新しい順・人数つき）",
      middleware: [session] as const,
      responses: { 200: json(MeetingList, "一覧"), 401: unauthenticatedResponse },
    }),
    createMeeting: createRoute({
      method: "post",
      path: meetings,
      tags,
      operationId: "personCreateMeeting",
      summary: "会った場を作る（そろえて同じ名前と日付のものがあれば、作らずに 200 で前のもの）",
      middleware: [session] as const,
      request: { body: body(MeetingCreateInput) },
      responses: {
        201: json(Meeting, "作った会った場"),
        200: json(Meeting, "前からある、そろえて同じ名前と日付の会った場"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
      },
    }),
    getMeeting: createRoute({
      method: "get",
      path: `${meetings}/{meetingId}`,
      tags,
      operationId: "personGetMeeting",
      summary: "会った場を読む（そこで会った人の一覧つき）",
      middleware: [session] as const,
      request: { params: MeetingParams },
      responses: { 200: json(Meeting, "会った場"), ...ownedErrors },
    }),
    deleteMeeting: createRoute({
      method: "delete",
      path: `${meetings}/{meetingId}`,
      tags,
      operationId: "personDeleteMeeting",
      summary: "会った場を消す（人とのつながりだけが外れ、人は残る）",
      middleware: [session] as const,
      request: { params: MeetingParams },
      responses: { 204: { description: "消した" }, ...ownedErrors },
    }),
    exportCsv: createRoute({
      method: "get",
      path: "/api/v1/person/export",
      tags,
      operationId: "personExport",
      summary: "自分のメモを CSV で書き出す（すべての欄と会った場の名前と日付）",
      middleware: [session] as const,
      responses: {
        200: {
          description: "CSV（BOM つき・person-notes-<日本時間の日付>.csv）",
          content: { "text/csv": { schema: z.string().openapi({ format: "binary" }) } },
        },
        401: unauthenticatedResponse,
      },
    }),
  };
}

/**
 * 人物メモの窓口。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function personRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);

  /**
   * 持ち主の人を読み直して返す形にする。
   * @param ownerAccountId 持ち主
   * @param noteId 人の ID
   * @returns 人のメモ
   */
  const readNote = async (ownerAccountId: string, noteId: string) =>
    noteOf(db, await requireOwnedNote(db, ownerAccountId, noteId));

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.listNotes, async (c) => {
      const { accountId } = currentAccount(c);
      return c.json(await guardDbErrors(() => listNotes(db, accountId)), 200);
    })
    .openapi(routes.createNote, async (c) => {
      const { accountId } = currentAccount(c);
      const input = c.req.valid("json");
      const created = await guardDbErrors(async () => {
        const existing = await findNoteIdByRequest(db, accountId, input.clientRequestId);
        if (existing) return { id: existing, created: false };
        try {
          const id = await db.transaction(async (tx) => {
            if (input.meetingId) await requireOwnedMeeting(tx, accountId, input.meetingId, true);
            const noteId = await insertNote(tx, accountId, input);
            if (input.meetingId) await attachMeeting(tx, accountId, noteId, input.meetingId);
            return noteId;
          });
          return { id, created: true };
        } catch (error) {
          // 同じ送りがほとんど同時に2つ届いた：先に入ったほうを返す
          if (!isUniqueViolation(error)) throw error;
          const raced = await findNoteIdByRequest(db, accountId, input.clientRequestId);
          if (!raced) throw error;
          return { id: raced, created: false };
        }
      });
      const note = await guardDbErrors(() => readNote(accountId, created.id));
      return created.created ? c.json(note, 201) : c.json(note, 200);
    })
    .openapi(routes.searchNotes, async (c) => {
      const { accountId } = currentAccount(c);
      const input = c.req.valid("json");
      return c.json(await guardDbErrors(() => searchNotes(db, accountId, input)), 200);
    })
    .openapi(routes.getNote, async (c) => {
      const { accountId } = currentAccount(c);
      const { noteId } = c.req.valid("param");
      return c.json(await guardDbErrors(() => readNote(accountId, noteId)), 200);
    })
    .openapi(routes.updateNote, async (c) => {
      const { accountId } = currentAccount(c);
      const { noteId } = c.req.valid("param");
      const input = c.req.valid("json");
      await guardDbErrors(() =>
        db.transaction(async (tx) => {
          const current = await requireOwnedNote(tx, accountId, noteId, true);
          if (current.version !== input.baseVersion) {
            throw new AppError(PERSON_ERRORS.VERSION_CONFLICT);
          }
          await updateNote(tx, current, input);
        }),
      );
      return c.json(await guardDbErrors(() => readNote(accountId, noteId)), 200);
    })
    .openapi(routes.appendTalk, async (c) => {
      const { accountId } = currentAccount(c);
      const { noteId } = c.req.valid("param");
      const input = c.req.valid("json");
      await guardDbErrors(() =>
        db.transaction(async (tx) => {
          const current = await requireOwnedNote(tx, accountId, noteId, true);
          // 受けたのに答えが届かなかった書き足しの送り直し：書かずに今の値を返す（R7）
          if (current.lastAppendId === input.appendId) return;
          const meeting = input.meetingId
            ? await requireOwnedMeeting(tx, accountId, input.meetingId, true)
            : null;
          await appendToTalk(tx, current, { appendId: input.appendId, text: input.text, meeting });
          if (meeting) await attachMeeting(tx, accountId, noteId, meeting.id);
        }),
      );
      return c.json(await guardDbErrors(() => readNote(accountId, noteId)), 200);
    })
    .openapi(routes.deleteNote, async (c) => {
      const { accountId } = currentAccount(c);
      const { noteId } = c.req.valid("param");
      const deleted = await guardDbErrors(() => deleteNote(db, accountId, noteId));
      if (!deleted) throw new AppError(PERSON_ERRORS.NOT_FOUND);
      return c.body(null, 204);
    })
    .openapi(routes.attachMeeting, async (c) => {
      const { accountId } = currentAccount(c);
      const { noteId, meetingId } = c.req.valid("param");
      await guardDbErrors(() =>
        db.transaction(async (tx) => {
          await requireOwnedNote(tx, accountId, noteId, true);
          await requireOwnedMeeting(tx, accountId, meetingId, true);
          await attachMeeting(tx, accountId, noteId, meetingId);
        }),
      );
      return c.json(await guardDbErrors(() => readNote(accountId, noteId)), 200);
    })
    .openapi(routes.detachMeeting, async (c) => {
      const { accountId } = currentAccount(c);
      const { noteId, meetingId } = c.req.valid("param");
      await guardDbErrors(() =>
        db.transaction(async (tx) => {
          await requireOwnedNote(tx, accountId, noteId, true);
          await requireOwnedMeeting(tx, accountId, meetingId);
          await detachMeeting(tx, noteId, meetingId);
        }),
      );
      return c.json(await guardDbErrors(() => readNote(accountId, noteId)), 200);
    })
    .openapi(routes.listMeetings, async (c) => {
      const { accountId } = currentAccount(c);
      return c.json({ items: await guardDbErrors(() => listMeetings(db, accountId)) }, 200);
    })
    .openapi(routes.createMeeting, async (c) => {
      const { accountId } = currentAccount(c);
      const input = c.req.valid("json");
      const { meeting, created } = await guardDbErrors(async () => {
        const result = await findOrCreateMeeting(db, accountId, input);
        const owned = await requireOwnedMeeting(db, accountId, result.id);
        return { meeting: await meetingOf(db, owned), created: result.created };
      });
      return created ? c.json(meeting, 201) : c.json(meeting, 200);
    })
    .openapi(routes.getMeeting, async (c) => {
      const { accountId } = currentAccount(c);
      const { meetingId } = c.req.valid("param");
      const meeting = await guardDbErrors(async () =>
        meetingOf(db, await requireOwnedMeeting(db, accountId, meetingId)),
      );
      return c.json(meeting, 200);
    })
    .openapi(routes.deleteMeeting, async (c) => {
      const { accountId } = currentAccount(c);
      const { meetingId } = c.req.valid("param");
      const deleted = await guardDbErrors(() => deleteMeeting(db, accountId, meetingId));
      if (!deleted) throw new AppError(PERSON_ERRORS.NOT_FOUND);
      return c.body(null, 204);
    })
    .openapi(routes.exportCsv, async (c) => {
      const { accountId } = currentAccount(c);
      const rows = await guardDbErrors(() => listExportRows(db, accountId));
      return c.body(buildPersonCsv(rows), 200, csvAttachment("person-notes"));
    });
}
