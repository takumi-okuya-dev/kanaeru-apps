// Threads の許可の画面から戻った人を受け止める画面（threads-010）。ログインを確かめてから、state と code を API に送って接続を済ませ、
// 返った道（設定の画面など）へ移る。接続は、ログインした同じ人のときだけ済む（API が state の持ち主と比べる）。
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { Loading } from "./AccountGate.tsx";
import { completeOauth } from "./api.ts";

const completeRouteApi = getRouteApi("/threads/oauth/complete");

/**
 * 完了を送る（ログインのあと）。
 * @returns 画面の要素
 */
function Completer() {
  const search = completeRouteApi.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!search.state) {
      setError("接続の手続きの情報がありません。設定の画面から、もう一度つないでください。");
      return;
    }
    completeOauth({
      state: search.state,
      ...(search.code ? { code: search.code } : {}),
      ...(search.error ? { error: search.error } : {}),
    }).then(
      ({ redirectTo }) => void navigate({ href: redirectTo, replace: true }),
      (caught: unknown) => setError(errorMessage(caught)),
    );
  }, [navigate, search]);

  if (error) {
    return (
      <Page title="つなげませんでした" lead={error}>
        <div>
          <Button onClick={() => void navigate({ to: "/threads" })}>アカウントの一覧へ</Button>
        </div>
      </Page>
    );
  }
  return (
    <Page title="Threads につないでいます" lead="少しお待ちください。">
      <Loading />
    </Page>
  );
}

/**
 * OAuth の完了の道の画面。
 * @returns 画面の要素
 */
export function OauthCompleteRoute() {
  return (
    <SessionGate>
      <Completer />
    </SessionGate>
  );
}
