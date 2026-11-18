// メモの窓口（一覧・作る・読む・直す・消す）。道はすべて createRoute で書き、入力は約束（@workspace/contracts/notes）で確かめる。
// 約束はふつうの zod なので、文書（OpenAPI）の名前と例は、ここで .openapi() で付ける（画面の組み立てに OpenAPI の道具を入れないため）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/notes";
import { NOTES_ERRORS } from "@workspace/contracts/notes";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, notFoundResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { createNote, deleteNote, findNote, listNotes, updateNote } from "./repository.ts";

/** メモを作る・直すときの入力（文書の名前と例つき）。 */
const NoteInput = contract.NoteInput.openapi("NoteInput", {
  example: { title: "買い物", body: "牛乳と卵" },
});

/** メモ（文書の名前つき）。 */
const Note = contract.Note.openapi("Note");

/** メモの一覧（文書の名前つき）。 */
const NoteList = contract.NoteList.openapi("NoteList");

/** 道の noteId。 */
const NoteParams = z.object({ noteId: uuidParam("noteId", "メモの ID") });

/** 入力の本文。 */
const inputBody = {
  required: true,
  content: { "application/json": { schema: NoteInput } },
} as const;

/** 同じ題があるときの応答。 */
const titleTaken = domainErrorResponse(NOTES_ERRORS.NOTE_TITLE_TAKEN, "同じ題のメモがある");

const listRoute = createRoute({
  method: "get",
  path: "/api/v1/notes",
  tags: ["notes"],
  operationId: "listNotes",
  summary: "メモの一覧（新しく直した順）",
  responses: {
    200: { description: "一覧", content: { "application/json": { schema: NoteList } } },
  },
});

const createNoteRoute = createRoute({
  method: "post",
  path: "/api/v1/notes",
  tags: ["notes"],
  operationId: "createNote",
  summary: "メモを作る",
  request: { body: inputBody },
  responses: {
    201: { description: "作ったメモ", content: { "application/json": { schema: Note } } },
    400: invalidInputResponse,
    409: titleTaken,
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/api/v1/notes/{noteId}",
  tags: ["notes"],
  operationId: "getNote",
  summary: "メモを読む",
  request: { params: NoteParams },
  responses: {
    200: { description: "メモ", content: { "application/json": { schema: Note } } },
    404: notFoundResponse,
  },
});

const updateRoute = createRoute({
  method: "put",
  path: "/api/v1/notes/{noteId}",
  tags: ["notes"],
  operationId: "updateNote",
  summary: "メモを直す（題と本文をまるごと置きかえる）",
  request: { params: NoteParams, body: inputBody },
  responses: {
    200: { description: "直したメモ", content: { "application/json": { schema: Note } } },
    400: invalidInputResponse,
    404: notFoundResponse,
    409: titleTaken,
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/api/v1/notes/{noteId}",
  tags: ["notes"],
  operationId: "deleteNote",
  summary: "メモを消す（元に戻せない）",
  request: { params: NoteParams },
  responses: {
    204: { description: "消した" },
    404: notFoundResponse,
  },
});

/**
 * メモの窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function noteRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  return new OpenAPIHono<ApiEnv>()
    .openapi(listRoute, async (c) => c.json({ items: await listNotes(db) }, 200))
    .openapi(createNoteRoute, async (c) => c.json(await createNote(db, c.req.valid("json")), 201))
    .openapi(getRoute, async (c) => {
      const found = await findNote(db, c.req.valid("param").noteId);
      if (!found) throw new AppError("NOT_FOUND");
      return c.json(found, 200);
    })
    .openapi(updateRoute, async (c) => {
      const id = c.req.valid("param").noteId;
      const updated = await updateNote(db, id, c.req.valid("json"));
      if (!updated) throw new AppError("NOT_FOUND");
      return c.json(updated, 200);
    })
    .openapi(deleteRoute, async (c) => {
      const deleted = await deleteNote(db, c.req.valid("param").noteId);
      if (!deleted) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    });
}
