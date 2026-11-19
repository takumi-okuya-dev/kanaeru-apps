// 見えるか（構成の決めごと AD-16）。アプリが見えるかを決めるのは、ここの isAppVisible と requireApp だけ。
// - 公開：だれにでも見える（ログインの前も）。運営者だけ：運営者にだけ。切：だれにも見えない。行がなければ運営者だけ
// - requireApp は各アプリが付けない。組み立て（app.ts）が apps.list.ts の「アプリ → 属する領域」から、その領域のすべての道に付ける
// - 見えないときは 404（道があることも知らせない）。公開のアプリは、セッションを引かずに通す
import type { AppViewer, AppVisibility } from "@workspace/contracts/suite";
import { DEFAULT_APP_VISIBILITY, isVisibleTo } from "@workspace/contracts/suite";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { ApiEnv, DomainConfig } from "../../kernel/http.ts";
import { findSessionViewer, isOrganizer } from "../account/index.ts";
import { findVisibility } from "./repository.ts";

/**
 * アプリの公開の状態（行がなければ既定の「運営者だけ」）。
 * @param db DB
 * @param appKey アプリの key
 * @returns 公開の状態
 */
export async function appVisibility(db: Executor, appKey: string): Promise<AppVisibility> {
  return (await findVisibility(db, appKey)) ?? DEFAULT_APP_VISIBILITY;
}

/**
 * アプリが、見る人に見えるか（AD-16。ログインの前は viewer を null にする）。
 * @param db DB
 * @param appKey アプリの key
 * @param viewer 見る人（運営者か。ログインの前は null）
 * @returns 見えるなら true
 */
export async function isAppVisible(
  db: Executor,
  appKey: string,
  viewer: AppViewer,
): Promise<boolean> {
  return isVisibleTo(await appVisibility(db, appKey), viewer);
}

/**
 * 要求の見る人を読む（ログインしていなければ null。セッションがあっても 401 にしない）。
 * @param deps db と config
 * @param deps.db DB
 * @param deps.config 領域の設定（webUrl・organizerLineUserId）
 * @param c 要求の文脈
 * @returns 見る人
 */
export async function readViewer(
  deps: { db: Db; config: Pick<DomainConfig, "webUrl" | "organizerLineUserId"> },
  c: Context,
): Promise<AppViewer> {
  const account = await findSessionViewer(deps, c);
  return account ? { isOperator: isOrganizer(deps.config, account) } : null;
}

/**
 * アプリが見えるときだけ先へ進める middleware を作る（見えなければ 404 NOT_FOUND）。
 * 組み立て（app.ts）が、アプリに属する領域のすべての道に付ける。各アプリは付けない。
 * @param deps db と config（組み立てが領域に渡すもの）
 * @param deps.db DB
 * @param deps.config 領域の設定（webUrl・organizerLineUserId）
 * @param appKey アプリの key
 * @returns middleware
 */
export function requireApp(
  deps: { db: Db; config: Pick<DomainConfig, "webUrl" | "organizerLineUserId"> },
  appKey: string,
) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const visibility = await appVisibility(deps.db, appKey);
    // 公開のアプリは、セッションを引かずに通す（ほとんどの要求はここ）
    if (visibility !== "public") {
      const viewer = visibility === "off" ? null : await readViewer(deps, c);
      if (!isVisibleTo(visibility, viewer)) throw new AppError("NOT_FOUND");
    }
    await next();
  });
}
