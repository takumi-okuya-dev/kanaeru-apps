// スイートの窓口（見えるアプリの一覧・アプリの台帳）。道は /api/v1/suite/* の下に createRoute で書く（Consistency Conventions）。
// - 見えるアプリの一覧はログインの前でも答える（公開のアプリだけ。運営者には「運営者だけ」のアプリも。AD-16）
// - 台帳を読む・変えるのは運営者（AD-5 の ORGANIZER_LINE_USER_ID の人）だけ。変えるとすぐに効く（デプロイは要らない）
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { APP_KEY_FORMAT } from "@workspace/contracts/core";
import type { AppDefinition } from "@workspace/contracts/core";
import * as contract from "@workspace/contracts/suite";
import { DEFAULT_APP_VISIBILITY, isVisibleTo } from "@workspace/contracts/suite";
import { AppError } from "../../kernel/errors.ts";
import { invalidInputResponse, notFoundResponse } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import {
  forbiddenResponse,
  requireOrganizer,
  requireSession,
  unauthenticatedResponse,
} from "../account/index.ts";
import { listVisibilities, upsertVisibility } from "./repository.ts";
import { readViewer } from "./visibility.ts";

/** 見えるアプリの一覧（文書の名前つき）。 */
const VisibleAppList = contract.VisibleAppList.openapi("SuiteVisibleAppList");

/** 台帳（文書の名前つき）。 */
const AppSettingList = contract.AppSettingList.openapi("SuiteAppSettingList");

/** 台帳の1行（文書の名前つき）。 */
const AppSettingView = contract.AppSettingView.openapi("SuiteAppSettingView");

/** 公開の状態を変える入力（文書の名前と例つき）。 */
const AppSettingInput = contract.AppSettingInput.openapi("SuiteAppSettingInput", {
  example: { visibility: "public" },
});

/** 道の appKey（形が合わなければ 404）。 */
const AppKeyParams = z.object({
  appKey: z
    .string()
    .regex(APP_KEY_FORMAT)
    .openapi({ param: { name: "appKey", in: "path" }, description: "アプリの key" }),
});

const listVisibleAppsRoute = createRoute({
  method: "get",
  path: "/api/v1/suite/apps",
  tags: ["suite"],
  operationId: "suiteListVisibleApps",
  summary: "見る人に見えるアプリの一覧（ログインの前でも答える）",
  description:
    "公開のアプリはだれにでも、運営者だけのアプリは運営者にだけ返す。切のアプリは返さない（AD-16）。登録の順。",
  responses: {
    200: {
      description: "見えるアプリ",
      content: { "application/json": { schema: VisibleAppList } },
    },
  },
});

/**
 * 台帳を読む道（運営者だけ）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function listSettingsRoute(deps: DomainRouteDeps) {
  return createRoute({
    method: "get",
    path: "/api/v1/suite/app-settings",
    tags: ["suite"],
    operationId: "suiteListAppSettings",
    summary: "アプリの台帳（運営者だけ。登録されたアプリごとに1行）",
    middleware: [requireSession(deps), requireOrganizer(deps)] as const,
    responses: {
      200: {
        description: "台帳",
        content: { "application/json": { schema: AppSettingList } },
      },
      401: unauthenticatedResponse,
      403: forbiddenResponse,
    },
  });
}

/**
 * 公開の状態を変える道（運営者だけ。すぐに効く）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function updateSettingRoute(deps: DomainRouteDeps) {
  return createRoute({
    method: "put",
    path: "/api/v1/suite/app-settings/{appKey}",
    tags: ["suite"],
    operationId: "suiteUpdateAppSetting",
    summary: "アプリの公開の状態を変える（運営者だけ。デプロイせずにすぐ効く）",
    middleware: [requireSession(deps), requireOrganizer(deps)] as const,
    request: {
      params: AppKeyParams,
      body: { required: true, content: { "application/json": { schema: AppSettingInput } } },
    },
    responses: {
      200: {
        description: "変えたあとの台帳の行",
        content: { "application/json": { schema: AppSettingView } },
      },
      400: invalidInputResponse,
      401: unauthenticatedResponse,
      403: forbiddenResponse,
      404: notFoundResponse,
    },
  });
}

/**
 * 台帳の1行の答えの形にする。
 * @param app アプリの定義
 * @param stored 台帳の行の公開の状態（なければ undefined）
 * @returns 台帳の1行
 */
function presentSetting(
  app: AppDefinition,
  stored: contract.AppVisibility | undefined,
): contract.AppSettingView {
  return {
    key: app.key,
    name: app.name,
    domains: [...app.domains],
    visibility: stored ?? DEFAULT_APP_VISIBILITY,
    stored: stored !== undefined,
  };
}

/**
 * スイートの窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function suiteRoutes(deps: DomainRouteDeps) {
  const { db, apps } = deps;
  return new OpenAPIHono<ApiEnv>()
    .openapi(listVisibleAppsRoute, async (c) => {
      const viewer = await readViewer(deps, c);
      const stored = await listVisibilities(db);
      const visible = apps.flatMap((app): contract.VisibleAppView[] => {
        const visibility = stored.get(app.key) ?? DEFAULT_APP_VISIBILITY;
        if (!isVisibleTo(visibility, viewer)) return [];
        return [
          {
            key: app.key,
            name: app.name,
            summary: app.summary,
            description: app.description,
            icon: app.icon,
            domains: [...app.domains],
            basePath: app.basePath,
            accountData: app.accountData,
            visibility,
          },
        ];
      });
      return c.json({ apps: visible, isOperator: viewer?.isOperator === true }, 200);
    })
    .openapi(listSettingsRoute(deps), async (c) => {
      const stored = await listVisibilities(db);
      return c.json({ apps: apps.map((app) => presentSetting(app, stored.get(app.key))) }, 200);
    })
    .openapi(updateSettingRoute(deps), async (c) => {
      const app = apps.find((candidate) => candidate.key === c.req.valid("param").appKey);
      if (!app) throw new AppError("NOT_FOUND");
      const { visibility } = c.req.valid("json");
      await upsertVisibility(db, app.key, visibility);
      return c.json(presentSetting(app, visibility), 200);
    });
}
