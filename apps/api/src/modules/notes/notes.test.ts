// メモの窓口の結合のテスト（本物の PostgreSQL）：作る・一覧・読む・直す・消すと、入力の誤り・同じ題・ない ID。
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, jsonRequest } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";

const database = useTestDatabase();

/** 窓口の答えのメモ（使う所だけ）。 */
type NoteBody = { id: string; title: string; body: string; createdAt: string; updatedAt: string };

/** エラーの本文（使う所だけ）。 */
type ErrorBody = {
  error: { code: string; message: string; fields?: { path: string; message: string }[] };
};

/**
 * メモを作る。
 * @param app 組み立てた API
 * @param input 題と本文
 * @returns 作ったメモ
 */
async function create(app: TestApp, input: { title: string; body?: string }): Promise<NoteBody> {
  const response = await app.request("/api/v1/notes", jsonRequest("POST", input));
  expect(response.status).toBe(201);
  return (await response.json()) as NoteBody;
}

describe("メモの窓口", () => {
  let app: TestApp;
  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database);
  });

  it("作る・読む・直す・一覧（新しく直した順）・消す", async () => {
    const first = await create(app, { title: "  買い物  ", body: "牛乳" });
    expect(first).toMatchObject({ title: "買い物", body: "牛乳" });
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    const second = await create(app, { title: "次にやること" });
    expect(second.body).toBe("");

    const read = await app.request(`/api/v1/notes/${first.id}`);
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual(first);

    const updated = await app.request(
      `/api/v1/notes/${first.id}`,
      jsonRequest("PUT", { title: "買い物（週末）", body: "牛乳と卵" }),
    );
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as NoteBody;
    expect(updatedBody).toMatchObject({ id: first.id, title: "買い物（週末）", body: "牛乳と卵" });
    expect(Date.parse(updatedBody.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt));

    const list = (await (await app.request("/api/v1/notes")).json()) as { items: NoteBody[] };
    expect(list.items.map((item) => item.id)).toEqual([first.id, second.id]);

    const deleted = await app.request(`/api/v1/notes/${first.id}`, jsonRequest("DELETE", {}));
    expect(deleted.status).toBe(204);
    expect((await app.request(`/api/v1/notes/${first.id}`)).status).toBe(404);
  });

  it("題がない・長すぎるときは 400 と、欄のそばに出せる日本語の理由", async () => {
    const response = await app.request(
      "/api/v1/notes",
      jsonRequest("POST", { title: " ", body: "あ".repeat(2001) }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.fields).toEqual([
      { path: "title", message: "題を入れてください。" },
      { path: "body", message: "本文は2000文字までにしてください。" },
    ]);
  });

  it("同じ題（大文字と小文字の違いを含む）は 409 の NOTE_TITLE_TAKEN と、題の欄の理由", async () => {
    await create(app, { title: "Memo" });
    const other = await create(app, { title: "ほか" });
    for (const [url, method] of [
      ["/api/v1/notes", "POST"],
      [`/api/v1/notes/${other.id}`, "PUT"],
    ] as const) {
      const response = await app.request(url, jsonRequest(method, { title: "memo" }));
      expect(response.status).toBe(409);
      const body = (await response.json()) as ErrorBody;
      expect(body.error.code).toBe("NOTE_TITLE_TAKEN");
      expect(body.error.fields).toEqual([{ path: "title", message: body.error.message }]);
    }
  });

  it("ない ID・uuid の形でない ID は、どの動きでも 404", async () => {
    for (const id of ["0193a1b2-0000-7000-8000-000000000000", "not-a-uuid"]) {
      expect((await app.request(`/api/v1/notes/${id}`)).status).toBe(404);
      expect(
        (await app.request(`/api/v1/notes/${id}`, jsonRequest("PUT", { title: "x" }))).status,
      ).toBe(404);
      expect((await app.request(`/api/v1/notes/${id}`, jsonRequest("DELETE", {}))).status).toBe(
        404,
      );
    }
  });
});
