// スイートの領域の入口（docs/apps/suite.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes と requireApp を読む。
// アプリが見えるかを決めるのは、ここが出す isAppVisible と requireApp だけ（AD-16）。アプリは app_setting を読まない。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { suiteRoutes } from "./routes.ts";

export { INITIAL_APP_SETTINGS, restoreInitialAppSettings, upsertVisibility } from "./repository.ts";
export { appVisibility, isAppVisible, requireApp } from "./visibility.ts";

/**
 * スイートの領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return suiteRoutes(deps);
}
