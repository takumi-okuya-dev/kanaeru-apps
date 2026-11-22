// 試合表の窓口（一覧・作る・読む・直す・担当の端末を受け取る・消す・入れられる組織。match-002 contracts）。
// 道はすべて createRoute で書き、道の頭は /api/v1/match（AD-25）。どの道もログインが要る（account の requireSession）。
// 権限は access.ts の requireTableAccess（持ち主と、入れた組織の管理者・編集者。AD-25）。アプリが見えないときの 404 は、
// 組み立てが付ける suite の requireApp（AD-16）。
// 直すのは担当の端末だけで、もとの版が今の版と同じときだけ受けて版を1つ上げる。同じ変更の ID の送り直しは前と同じ答えを返す（AD-28）。
// 中身は約束（MatchTableContent）で確かめて持つだけで、組み合わせを計算し直さない（AD-28・AD-29）。呼び名はログに出さない。
// 中身を受けたとき、account のある人（受付の交流会から入れた人）のレベルが入った・変わったら覚える（level-memory.ts。match-006）。
// 中身の写し（receptionEvent）の交流会が変わったら、入れてよい交流会のときだけ match_table.event_id につなぐ（入れてよくなければ
// 外す。送りは止めない）。一覧と試合表には、名簿を入れた受付の交流会の見せ方を付ける（reception-link.ts。match-007）。
import { randomInt } from "node:crypto";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/match";
import { MATCH_ERRORS, MatchReceptionSource } from "@workspace/contracts/match";
import type { Tx } from "../../kernel/db.ts";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { isForeignKeyViolation } from "../../kernel/pg-errors.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import type { SessionAccount } from "../account/index.ts";
import { findMembership, listMemberships } from "../suite/index.ts";
import { requireTableAccess } from "./access.ts";
import type { TableAccess } from "./access.ts";
import { holderOf, levelChanges, rememberLevels } from "./level-memory.ts";
import { canImportEvent, resolveReceptionLinks } from "./reception-link.ts";
import type { ReceptionLinkRow } from "./reception-link.ts";
import {
  deleteExpiredTables,
  deleteTable,
  insertTable,
  listTables,
  readTable,
  readTableState,
  setEditorDevice,
  setLinkedEvent,
  writeContent,
} from "./repository.ts";
import type { WithReceptionLink } from "./repository.ts";

/** 試合表の一覧（文書の名前つき）。 */
const MatchTableList = contract.MatchTableList.openapi("MatchTableList");
/** 試合表（中身つき）。 */
const MatchTable = contract.MatchTable.openapi("MatchTable");
/** 試合表を作る入力。 */
const MatchTableCreateInput = contract.MatchTableCreateInput.openapi("MatchTableCreateInput", {
  example: { name: "12/13(日) 練習会", playDate: "2026-12-13", deviceId: "d-0123456789abcdef" },
});
/** 試合表を直す入力。 */
const MatchTableUpdateInput = contract.MatchTableUpdateInput.openapi("MatchTableUpdateInput");
/** 担当の端末を受け取る入力。 */
const MatchEditorInput = contract.MatchEditorInput.openapi("MatchEditorInput");
/** 入れられる組織。 */
const MatchOrganizationOptions = contract.MatchOrganizationOptions.openapi(
  "MatchOrganizationOptions",
);

/** 道の tableId。 */
const TableParams = z.object({ tableId: uuidParam("tableId", "試合表の ID") });

/** 試合表がない応答。 */
const notFoundResponse = domainErrorResponse(
  MATCH_ERRORS.NOT_FOUND,
  "試合表がない（消された・90日を過ぎて消えた）",
);
/** 権限がない応答。 */
const forbiddenResponse = domainErrorResponse(
  MATCH_ERRORS.FORBIDDEN,
  "持ち主でも、入れた組織の管理者・編集者でもない",
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
 * 試合表の窓口の道の定義（middleware に deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const tags = ["match"];
  const base = "/api/v1/match/tables";
  const tableErrors = {
    401: unauthenticatedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
  } as const;
  return {
    list: createRoute({
      method: "get",
      path: base,
      tags,
      operationId: "matchListTables",
      summary:
        "開ける試合表の一覧（自分が持ち主のものと、管理者・編集者の組織に入れたもの。試合の日の新しい順。自分の90日を過ぎた試合表を先に消す）",
      middleware: [session] as const,
      responses: { 200: json(MatchTableList, "一覧"), 401: unauthenticatedResponse },
    }),
    create: createRoute({
      method: "post",
      path: base,
      tags,
      operationId: "matchCreateTable",
      summary:
        "試合表を作る（作った端末が担当の端末。組織は自分が入っているものだけ。自分の90日を過ぎた試合表を先に消す）",
      middleware: [session] as const,
      request: { body: body(MatchTableCreateInput) },
      responses: {
        201: json(MatchTable, "作った試合表"),
        400: {
          description: "入力の誤り・入っていない組織（MATCH_ORGANIZATION_NOT_FOUND）",
          content: invalidInputResponse.content,
        },
        401: unauthenticatedResponse,
      },
    }),
    organizations: createRoute({
      method: "get",
      path: "/api/v1/match/organization-options",
      tags,
      operationId: "matchListOrganizationOptions",
      summary: "試合表を入れられる組織（自分が入っている組織。入った順）",
      middleware: [session] as const,
      responses: { 200: json(MatchOrganizationOptions, "組織"), 401: unauthenticatedResponse },
    }),
    get: createRoute({
      method: "get",
      path: `${base}/{tableId}`,
      tags,
      operationId: "matchGetTable",
      summary: "試合表を読む（中身・版の番号・担当の端末）",
      middleware: [session] as const,
      request: { params: TableParams },
      responses: { 200: json(MatchTable, "試合表"), ...tableErrors },
    }),
    update: createRoute({
      method: "put",
      path: `${base}/{tableId}`,
      tags,
      operationId: "matchUpdateTable",
      summary:
        "試合表の中身を直す（担当の端末だけ。もとの版が今の版と同じときだけ受けて版を1つ上げる。同じ変更の ID は前と同じ答え）",
      middleware: [session] as const,
      request: { params: TableParams, body: body(MatchTableUpdateInput) },
      responses: {
        200: json(MatchTable, "直した試合表"),
        400: invalidInputResponse,
        ...tableErrors,
        409: {
          description:
            "担当の端末でない（MATCH_NOT_EDITOR）か、もとの版が今の版と違う（MATCH_VERSION_CONFLICT）",
          content: domainErrorResponse(MATCH_ERRORS.VERSION_CONFLICT, "").content,
        },
      },
    }),
    takeEditor: createRoute({
      method: "put",
      path: `${base}/{tableId}/editor`,
      tags,
      operationId: "matchTakeEditor",
      summary:
        "この端末を担当の端末にする（権限のある人が、つながっている端末で受け取る。前の担当の端末は次の送りで MATCH_NOT_EDITOR）",
      middleware: [session] as const,
      request: { params: TableParams, body: body(MatchEditorInput) },
      responses: {
        200: json(MatchTable, "担当の端末を替えた試合表"),
        400: invalidInputResponse,
        ...tableErrors,
      },
    }),
    remove: createRoute({
      method: "delete",
      path: `${base}/{tableId}`,
      tags,
      operationId: "matchDeleteTable",
      summary: "試合表を消す（受付の行も一緒に消える。戻せない）",
      middleware: [session] as const,
      request: { params: TableParams },
      responses: { 204: { description: "消した" }, ...tableErrors },
    }),
  };
}

/**
 * 行から見せ方を決める前の欄（中身の写し・つないだ交流会）を外し、見せ方（receptionEvent）を付ける。
 * @param row 行
 * @param receptionEvent 見せ方
 * @returns 答えの行
 */
function withLink<T extends ReceptionLinkRow>(
  row: T,
  receptionEvent: contract.MatchReceptionEventLink | null,
): Omit<T, keyof ReceptionLinkRow> & { receptionEvent: contract.MatchReceptionEventLink | null } {
  const { source: _source, linkedEventId: _linkedEventId, ...rest } = row;
  return { ...rest, receptionEvent };
}

/**
 * 試合表の窓口。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function matchRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);

  /**
   * 試合表を読み、名簿を入れた受付の交流会の見せ方を付ける。
   * @param access 権限を確かめた試合表
   * @param account 今の利用者
   * @returns 試合表
   */
  const tableFor = async (access: TableAccess, account: SessionAccount) => {
    const row: WithReceptionLink<contract.MatchTable> = await readTable(
      db,
      access,
      account.accountId,
    );
    const [link] = await resolveReceptionLinks(db, deps.config, account, [row]);
    return withLink(row, link ?? null);
  };

  /**
   * 中身の写しの交流会が前の中身の写しと変わったら（入れた・入れ直した・外した）、つなぎ直す（入れてよい交流会のときだけ
   * つなぎ、ほかは外す。入れてよくなくても送りは止めない。写しは中身に残り、画面は「交流会は見られません」と出す）。
   * 写しが変わらない送り（ふだんの直し）では確かめない（つなげなかった写しを、あとでほかの人の送りでつながない）。
   * 確かめてから書くまでに交流会が消えたら、外部キーで止まるので、区切りの中で書いて外す。
   * @param tx DB（トランザクション）
   * @param access 権限を確かめた試合表
   * @param account 今の利用者
   * @param before 前の中身（形を確かめる前の DB の値）
   * @param content 受けた中身
   */
  const relinkEvent = async (
    tx: Tx,
    access: TableAccess,
    account: SessionAccount,
    before: unknown,
    content: contract.MatchTableContent,
  ) => {
    const eventId = content.receptionEvent?.eventId ?? null;
    const previous = MatchReceptionSource.safeParse(
      typeof before === "object" && before !== null && "receptionEvent" in before
        ? before.receptionEvent
        : undefined,
    );
    if (eventId === (previous.success ? previous.data.eventId : null)) return;
    const allowed =
      eventId !== null && (await canImportEvent(tx, deps.config, account, eventId, access));
    try {
      await tx.transaction((savepoint) =>
        setLinkedEvent(savepoint, access.tableId, allowed ? eventId : null),
      );
    } catch (error) {
      if (!isForeignKeyViolation(error)) throw error;
      await setLinkedEvent(tx, access.tableId, null);
    }
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.list, async (c) => {
      const account = currentAccount(c);
      await deleteExpiredTables(db, account.accountId);
      const rows = await listTables(db, account.accountId);
      const links = await resolveReceptionLinks(db, deps.config, account, rows);
      return c.json({ tables: rows.map((row, index) => withLink(row, links[index] ?? null)) }, 200);
    })
    .openapi(routes.create, async (c) => {
      const { accountId } = currentAccount(c);
      const input = c.req.valid("json");
      const organizationId = input.organizationId ?? null;
      const tableId = await db
        .transaction(async (tx) => {
          await deleteExpiredTables(tx, accountId);
          if (organizationId && !(await findMembership(tx, organizationId, accountId))) {
            throw new AppError(MATCH_ERRORS.ORGANIZATION_NOT_FOUND);
          }
          return insertTable(tx, {
            ownerAccountId: accountId,
            name: input.name,
            playDate: input.playDate,
            organizationId,
            deviceId: input.deviceId,
            seed: randomInt(-2147483648, 2147483647),
          });
        })
        .catch((error: unknown) => {
          // 確かめたあとに組織を抜けた・組織が消えたときは、組織の人への外部キーで止まる
          if (isForeignKeyViolation(error)) throw new AppError(MATCH_ERRORS.ORGANIZATION_NOT_FOUND);
          throw error;
        });
      const access = await requireTableAccess(db, tableId, accountId);
      return c.json(await tableFor(access, currentAccount(c)), 201);
    })
    .openapi(routes.organizations, async (c) => {
      const memberships = await listMemberships(db, currentAccount(c).accountId);
      return c.json(
        {
          organizations: memberships.map((membership) => ({
            id: membership.organizationId,
            name: membership.organizationName,
          })),
        },
        200,
      );
    })
    .openapi(routes.get, async (c) => {
      const account = currentAccount(c);
      const access = await requireTableAccess(db, c.req.valid("param").tableId, account.accountId);
      return c.json(await tableFor(access, account), 200);
    })
    .openapi(routes.update, async (c) => {
      const account = currentAccount(c);
      const { tableId } = c.req.valid("param");
      const input = c.req.valid("json");
      const access = await db.transaction(async (tx) => {
        const locked = await requireTableAccess(tx, tableId, account.accountId, true);
        const state = await readTableState(tx, tableId);
        if (!state) throw new AppError(MATCH_ERRORS.NOT_FOUND);
        // 受けたのに答えが届かなかった送りの送り直し：書かずに今の試合表を返す（AD-28）
        if (state.lastChangeId === input.changeId) return locked;
        if (state.editorDeviceId !== input.deviceId) throw new AppError(MATCH_ERRORS.NOT_EDITOR);
        if (state.version !== input.baseVersion) {
          throw new AppError(MATCH_ERRORS.VERSION_CONFLICT);
        }
        await writeContent(tx, tableId, {
          content: input.content,
          seed: input.seed,
          changeId: input.changeId,
          version: state.version,
        });
        // account のある人のレベルを入れた・変えたら覚える（同じ運営の次の試合表で使う。AD-25・match-006）
        await rememberLevels(tx, holderOf(locked), levelChanges(state.content, input.content));
        // 名簿を入れた受付の交流会が変わったら、つなぎ直す（match-007）
        await relinkEvent(tx, locked, account, state.content, input.content);
        return locked;
      });
      return c.json(await tableFor(access, account), 200);
    })
    .openapi(routes.takeEditor, async (c) => {
      const account = currentAccount(c);
      const { tableId } = c.req.valid("param");
      const access = await requireTableAccess(db, tableId, account.accountId);
      await setEditorDevice(db, tableId, c.req.valid("json").deviceId);
      return c.json(await tableFor(access, account), 200);
    })
    .openapi(routes.remove, async (c) => {
      const { accountId } = currentAccount(c);
      const { tableId } = c.req.valid("param");
      await requireTableAccess(db, tableId, accountId);
      await deleteTable(db, tableId);
      return c.body(null, 204);
    });
}
