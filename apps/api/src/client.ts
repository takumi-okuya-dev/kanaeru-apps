// 画面に渡す型だけを出す入口。画面からは import type でだけ読む（lint の境界で止める）。
// 土台の道（AppType）と、領域ごとの道（ModuleRoutes。画面は createApiClient<ModuleRoutes["<領域>"]>() で呼ぶ）。
export type { AppRoutes as AppType, ModuleRoutes } from "./app.ts";
