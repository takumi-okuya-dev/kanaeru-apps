// 同意の画面の道の部品（開いたときに別に読む）。ログインが要るので SessionGate で包む（AD-12）。
// 認可の要求は、ログインの前に URL から読んでしまっておく（LINE のログインから戻ると URL が変わるため）。
import { useState } from "react";
import { OAuthConsentPage } from "./OAuthConsentPage.tsx";
import { readConsentRequest } from "./oauth-consent-request.ts";
import { SessionGate } from "./SessionGate.tsx";

/**
 * 同意の画面の道の部品（認可の要求を文字列のまま読んで渡す）。
 * @returns 画面の要素
 */
export function OAuthConsentRoute() {
  const [request] = useState(() => readConsentRequest(window.location.search));
  return (
    <SessionGate>
      <OAuthConsentPage request={request} />
    </SessionGate>
  );
}
