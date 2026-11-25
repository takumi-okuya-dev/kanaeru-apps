// 同意の画面の道の部品（開いたときに別に読む）。ログインが要るので SessionGate で包む（AD-12）。
import { getRouteApi } from "@tanstack/react-router";
import { OAuthConsentPage } from "./OAuthConsentPage.tsx";
import { SessionGate } from "./SessionGate.tsx";

const routeApi = getRouteApi("/oauth/consent");

/**
 * 同意の画面の道の部品（問い合わせをそのまま渡す）。
 * @returns 画面の要素
 */
export function OAuthConsentRoute() {
  const search = routeApi.useSearch();
  return (
    <SessionGate>
      <OAuthConsentPage search={search} />
    </SessionGate>
  );
}
