// 受付の交流会から名簿を入れる窓口（PRD FR-M4・見本の M0。match-006）。
// - 読むのは reception の index.ts（チェックインした人。FR-B103）と booking の index.ts（確定した申込みの名簿。名前と account
//   だけ。AD-23）。ほかの領域の表は読まない（AD-3）。交流会の名前と日時は event の要約（getEventSummary）。
// - 選べる交流会は、event の判定で自分が主催者（持ち主か、入れた組織の管理者・編集者）のものだけ（AD-25）。交流会がない・
//   主催者でない・受付アプリが見えないときは、みな同じ 404（MATCH_EVENT_NOT_FOUND。ほかの人の交流会があるかを漏らさない）。
// - 試合表の権限（持ち主と、入れた組織の管理者・編集者）も確かめる。名前は呼び名を作るために運営の画面に返すだけで、
//   試合表には持たない（Constitution II）。レベルは、試合表を入れた組織（なければ持ち主）が覚えているものを付ける（AD-25）。
// - 選ぶ交流会の一覧は、画面が event の窓口（GET /api/v1/events の主催者の行）から読む（event に関数を足さないため。research R1）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/match";
import { MATCH_ERRORS } from "@workspace/contracts/match";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import {
  currentAccount,
  isOrganizer,
  requireSession,
  unauthenticatedResponse,
} from "../account/index.ts";
import { listApplicantRoster } from "../booking/index.ts";
import { getEventRole, getEventSummary } from "../event/index.ts";
import { listEventAttendees } from "../reception/index.ts";
import { isAppVisible } from "../suite/index.ts";
import { requireTableAccess } from "./access.ts";
import { holderOf, listRememberedLevels } from "./level-memory.ts";

/** 受付の交流会から入れられる人（文書の名前つき）。 */
const MatchReceptionRoster = contract.MatchReceptionRoster.openapi("MatchReceptionRoster");

/** 交流会を持つアプリの key（試合表のアプリの uses。AD-15・AD-25）。 */
const RECEPTION_APP_KEY = "reception";

/** 道の tableId と eventId。 */
const Params = z.object({
  tableId: uuidParam("tableId", "試合表の ID"),
  eventId: uuidParam("eventId", "受付の交流会の ID"),
});

/**
 * 受付の交流会から名簿を入れる窓口。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function matchReceptionRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const route = createRoute({
    method: "get",
    path: "/api/v1/match/tables/{tableId}/reception-events/{eventId}",
    tags: ["match"],
    operationId: "matchGetReceptionRoster",
    summary:
      "受付の交流会から入れられる人（チェックインした人と確定した申込みの名簿の名前・account・覚えているレベル。自分が主催者の交流会だけ）",
    description:
      "名前は呼び名を作るためだけに返す（試合表には持たない）。交流会がない・主催者でない・受付アプリが見えないときは同じ 404。",
    middleware: [requireSession(deps)] as const,
    request: { params: Params },
    responses: {
      200: {
        description: "入れられる人",
        content: { "application/json": { schema: MatchReceptionRoster } },
      },
      401: unauthenticatedResponse,
      403: domainErrorResponse(
        MATCH_ERRORS.FORBIDDEN,
        "試合表の持ち主でも、管理者・編集者でもない",
      ),
      404: domainErrorResponse(
        MATCH_ERRORS.EVENT_NOT_FOUND,
        "試合表がない（MATCH_NOT_FOUND）か、交流会がない・主催者でない・受付アプリが見えない（MATCH_EVENT_NOT_FOUND）",
      ),
    },
  });

  return new OpenAPIHono<ApiEnv>().openapi(route, async (c) => {
    const account = currentAccount(c);
    const { tableId, eventId } = c.req.valid("param");
    const access = await requireTableAccess(db, tableId, account.accountId);
    const viewer = { isOperator: isOrganizer(deps.config, account) };
    if (!(await isAppVisible(db, RECEPTION_APP_KEY, viewer))) {
      throw new AppError(MATCH_ERRORS.EVENT_NOT_FOUND);
    }
    if ((await getEventRole(db, deps.config, eventId, account)) !== "organizer") {
      throw new AppError(MATCH_ERRORS.EVENT_NOT_FOUND);
    }
    const summary = await getEventSummary(db, deps.config, eventId);
    if (!summary) throw new AppError(MATCH_ERRORS.EVENT_NOT_FOUND);
    const [attendees, applicants] = await Promise.all([
      listEventAttendees(db, eventId),
      listApplicantRoster(db, eventId),
    ]);
    const accountIds = [...attendees, ...applicants].flatMap((person) =>
      person.accountId ? [person.accountId] : [],
    );
    const levels = await listRememberedLevels(db, holderOf(access), accountIds);
    /**
     * 返す1人（名前・account・覚えているレベル）。
     * @param person チェックインした人か申込みの名簿の1人
     * @param person.name 名前
     * @param person.accountId account（なければ null）
     * @returns 返す1人
     */
    const toPerson = (person: { name: string; accountId: string | null }) => ({
      name: person.name,
      accountId: person.accountId,
      level: person.accountId ? (levels.get(person.accountId) ?? null) : null,
    });
    return c.json(
      {
        event: { id: summary.id, name: summary.name, startsAt: summary.startsAt },
        checkins: attendees.map(toPerson),
        applicants: applicants.map(toPerson),
      },
      200,
    );
  });
}
