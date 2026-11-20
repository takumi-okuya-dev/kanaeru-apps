// 交流会ごとの権限の結合のテスト（本物の PostgreSQL）：ほかの領域が requireEventRole・currentEventRole・
// getEventRole・getEventSummary を使う形を、テストだけの領域で確かめる（AD-5）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it } from "vitest";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import {
  currentEventRole,
  eventForbiddenResponse,
  eventNotFoundResponse,
  getEventRole,
  getEventSummary,
  requireEventRole,
} from "./index.ts";

const database = useTestDatabase();

/** テストの設定（主催者とオープンチャットの URL つき）。 */
const config = testConfig({
  organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST,
  openChatUrl: "https://line.me/ti/g2/example",
});

/** テストだけの領域：reception・survey が requireEventRole を使う形。 */
const consumer = {
  routes: (deps: DomainRouteDeps) =>
    new OpenAPIHono<ApiEnv>()
      .openapi(
        createRoute({
          method: "get",
          path: "/api/v1/events/{eventId}/test-only/members",
          middleware: [
            requireSession(deps),
            requireEventRole(deps, ["organizer", "staff"]),
          ] as const,
          request: { params: z.object({ eventId: z.string() }) },
          responses: {
            200: {
              description: "役目",
              content: { "application/json": { schema: z.object({ role: z.string() }) } },
            },
            401: unauthenticatedResponse,
            403: eventForbiddenResponse,
            404: eventNotFoundResponse,
          },
        }),
        (c) => c.json({ role: currentEventRole(c) }, 200),
      )
      .openapi(
        createRoute({
          method: "get",
          path: "/api/v1/events/{eventId}/test-only/organizer",
          middleware: [requireSession(deps), requireEventRole(deps, ["organizer"])] as const,
          request: { params: z.object({ eventId: z.string() }) },
          responses: { 200: { description: "主催者だけ" } },
        }),
        async (c) => {
          const role = await getEventRole(
            deps.db,
            deps.config,
            c.req.valid("param").eventId,
            currentAccount(c),
          );
          return c.json({ role }, 200);
        },
      ),
};

describe("交流会ごとの権限", () => {
  let app: TestApp;
  let organizer: string;
  let eventId: string;
  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, config, { extraModules: [consumer] });
    organizer = (await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST })).cookie;
    eventId = (await createEvent(app, organizer)).id;
  });

  it("持ち主は主催者、受付係はその交流会だけ受付係、ほかは 403", async () => {
    const staff = await makeStaff(app, organizer, eventId);
    const other = await loginAs(app);
    const otherEventId = (await createEvent(app, organizer, { name: "別の交流会" })).id;

    const members = (cookie: string, id = eventId) =>
      call(app, cookie, `/api/v1/events/${id}/test-only/members`);
    expect(await (await members(organizer)).json()).toEqual({ role: "organizer" });
    expect(await (await members(staff.cookie)).json()).toEqual({ role: "staff" });

    const forbidden = await members(other.cookie);
    expect(forbidden.status).toBe(403);
    expect(((await forbidden.json()) as ErrorBody).error).toMatchObject({
      code: "FORBIDDEN",
      message: "この交流会の管理の画面は使えません。主催者に確かめてください。",
    });
    expect((await members(staff.cookie, otherEventId)).status).toBe(403);

    // 受付係は、主催者だけの道を使えない
    const organizerOnly = (cookie: string) =>
      call(app, cookie, `/api/v1/events/${eventId}/test-only/organizer`);
    expect((await organizerOnly(staff.cookie)).status).toBe(403);
    expect(await (await organizerOnly(organizer)).json()).toEqual({ role: "organizer" });
  });

  it("ない交流会・形の違う ID は 404、未ログインは 401", async () => {
    for (const id of ["0193a1b2-0000-7000-8000-000000000000", "not-a-uuid"]) {
      const response = await call(app, organizer, `/api/v1/events/${id}/test-only/members`);
      expect(response.status).toBe(404);
      expect(((await response.json()) as ErrorBody).error.code).toBe("NOT_FOUND");
    }
    const anonymous = await app.request(`/api/v1/events/${eventId}/test-only/members`);
    expect(anonymous.status).toBe(401);
  });

  it("外した受付係は、次の要求から 403（役目は要求のたびに引く）", async () => {
    const staff = await makeStaff(app, organizer, eventId);
    const path = `/api/v1/events/${eventId}/test-only/members`;
    expect((await call(app, staff.cookie, path)).status).toBe(200);
    const removed = await call(
      app,
      organizer,
      `/api/v1/events/${eventId}/staff/${staff.account.id}`,
      "DELETE",
    );
    expect(removed.status).toBe(204);
    expect((await call(app, staff.cookie, path)).status).toBe(403);
  });

  it("getEventRole は、ない交流会・形の違う ID で null", async () => {
    const me = await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
    const account = { accountId: me.account.id, lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST };
    expect(await getEventRole(database.db, config, eventId, account)).toBe("organizer");
    expect(
      await getEventRole(database.db, config, "0193a1b2-0000-7000-8000-000000000000", account),
    ).toBeNull();
    expect(await getEventRole(database.db, config, "x", account)).toBeNull();
  });

  it("getEventSummary は決めた欄とオープンチャットの URL を返し、ない交流会は null", async () => {
    const summary = await getEventSummary(database.db, config, eventId);
    expect(summary).toMatchObject({
      id: eventId,
      name: "11月の交流会",
      venue: "渋谷の会場",
      fee: 1000,
      surveyOpen: false,
      googleFormUrl: null,
      lineGroupUrl: null,
      openChatUrl: "https://line.me/ti/g2/example",
    });
    expect(await getEventSummary(database.db, config, "x")).toBeNull();
    expect(
      await getEventSummary(database.db, testConfig({ openChatUrl: undefined }), eventId),
    ).toMatchObject({ openChatUrl: null });
  });
});
