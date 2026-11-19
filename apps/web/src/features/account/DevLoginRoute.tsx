// 手元のログインの道の部品（開いたときに別に読む。約束の zod を最初の束に入れないため）。
import { getRouteApi } from "@tanstack/react-router";
import { DevLoginPage } from "./DevLoginPage.tsx";

const routeApi = getRouteApi("/dev/login");

/**
 * 手元のログインの道の部品（問い合わせの redirect を渡す）。
 * @returns 画面の要素
 */
export function DevLoginRoute() {
  const { redirect } = routeApi.useSearch();
  return <DevLoginPage redirect={redirect} />;
}
