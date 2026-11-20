// 外部メディアの掲載文の窓口（threads-008）。道の頭は /api/v1/threads（AD-15）。ログインが要り、持ち主だけ（ほかの人のものは 404）。
// 掲載文は宣伝（threads-004）から、媒体の決まりで作る（決まった計算）。言い回しを整えるときは、画面が外の AI に貼るプロンプトを作る。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import { MEDIA, THREADS_ERRORS } from "@workspace/contracts/threads";
import { domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import {
  generateListing,
  getListingDetail,
  listExternalMedia,
  listMediaDefaults,
  saveMediaDefaults,
  updateListing,
} from "./external-media.ts";
import {
  ACCOUNTS_BASE,
  AccountParams,
  COMMON_ERRORS,
  TAGS,
  accountMiddleware,
  body,
  json,
  ownedAccount,
} from "./route-helpers.ts";

/** 道の媒体。 */
const mediaParam = z.enum(MEDIA).openapi({
  param: { name: "media", in: "path" },
  description: "媒体（kokuchpro・peatix・tsunagate・jmty・youtrust）",
});

/** 道の accountId・promotionId・media。 */
const ListingParams = z.object({
  accountId: uuidParam("accountId", "運用アカウントの ID"),
  promotionId: uuidParam("promotionId", "宣伝の ID"),
  media: mediaParam,
});

/** 道の accountId・media。 */
const DefaultsParams = z.object({
  accountId: uuidParam("accountId", "運用アカウントの ID"),
  media: mediaParam,
});

/**
 * 外部メディアの掲載文の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function mediaRoutes(deps: DomainRouteDeps) {
  const middleware = accountMiddleware(deps);
  const base = ACCOUNTS_BASE;
  const tags = TAGS;
  const errors = COMMON_ERRORS;
  const detail = json(contract.ListingDetail.openapi("ThreadsListingDetail"), "掲載文の画面");
  const conflict = domainErrorResponse(THREADS_ERRORS.THREADS_VERSION_CONFLICT, "版が合わない");
  const routes = {
    list: createRoute({
      method: "get",
      path: `${base}/{accountId}/external-media`,
      tags,
      operationId: "threadsListExternalMedia",
      summary: "外部メディアの一覧（宣伝と、媒体ごとの掲載の状況。開催日時の近い順）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.ExternalMediaList.openapi("ThreadsExternalMediaList"), "一覧"),
        ...errors,
      },
    }),
    detail: createRoute({
      method: "get",
      path: `${base}/{accountId}/external-media/{promotionId}/{media}`,
      tags,
      operationId: "threadsGetListing",
      summary: "宣伝×媒体の掲載文（まだ作っていなければ欄は null）と媒体の既定値",
      middleware,
      request: { params: ListingParams },
      responses: { 200: detail, ...errors },
    }),
    generate: createRoute({
      method: "post",
      path: `${base}/{accountId}/external-media/{promotionId}/{media}/generate`,
      tags,
      operationId: "threadsGenerateListing",
      summary:
        "掲載文を作る・作り直す（媒体の決まりで組み立て、ルールに合わない行を外す。イベントの情報がなければ 400）",
      middleware,
      request: {
        params: ListingParams,
        body: body(contract.ListingGenerateInput.openapi("ThreadsListingGenerateInput")),
      },
      responses: { 200: detail, 400: invalidInputResponse, 409: conflict, ...errors },
    }),
    update: createRoute({
      method: "put",
      path: `${base}/{accountId}/external-media/{promotionId}/{media}`,
      tags,
      operationId: "threadsUpdateListing",
      summary:
        "掲載文の欄・状況・掲載 URL・画像の種類を保存する（欄は自動の直しをもう一度通す。版）",
      middleware,
      request: {
        params: ListingParams,
        body: body(contract.ListingUpdateInput.openapi("ThreadsListingUpdateInput")),
      },
      responses: { 200: detail, 400: invalidInputResponse, 409: conflict, ...errors },
    }),
    defaults: createRoute({
      method: "get",
      path: `${base}/{accountId}/media-defaults`,
      tags,
      operationId: "threadsListMediaDefaults",
      summary: "5つの媒体の既定値（事務局名・連絡先など）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.MediaDefaultsList.openapi("ThreadsMediaDefaultsList"), "既定値"),
        ...errors,
      },
    }),
    saveDefaults: createRoute({
      method: "put",
      path: `${base}/{accountId}/media-defaults/{media}`,
      tags,
      operationId: "threadsSaveMediaDefaults",
      summary: "媒体の既定値を保存する（既定値にできる欄だけ。版）",
      middleware,
      request: {
        params: DefaultsParams,
        body: body(contract.MediaDefaultsInput.openapi("ThreadsMediaDefaultsInput")),
      },
      responses: {
        200: json(contract.MediaDefaults.openapi("ThreadsMediaDefaults"), "保存した既定値"),
        400: invalidInputResponse,
        409: conflict,
        ...errors,
      },
    }),
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.list, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(await listExternalMedia(deps.db, account.id, new Date()), 200);
    })
    .openapi(routes.detail, async (c) => {
      const { accountId, promotionId, media } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      return c.json(
        await getListingDetail(deps.db, account.id, promotionId, media, new Date()),
        200,
      );
    })
    .openapi(routes.generate, async (c) => {
      const { accountId, promotionId, media } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      return c.json(
        await generateListing(
          deps.db,
          account.id,
          promotionId,
          media,
          c.req.valid("json").version,
          new Date(),
        ),
        200,
      );
    })
    .openapi(routes.update, async (c) => {
      const { accountId, promotionId, media } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      return c.json(
        await updateListing(
          deps.db,
          account.id,
          promotionId,
          media,
          c.req.valid("json"),
          new Date(),
        ),
        200,
      );
    })
    .openapi(routes.defaults, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(await listMediaDefaults(deps.db, account.id), 200);
    })
    .openapi(routes.saveDefaults, async (c) => {
      const { accountId, media } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      return c.json(await saveMediaDefaults(deps.db, account.id, media, c.req.valid("json")), 200);
    });
}
