// 設定の「Threads への接続」の中の、アプリの Meta のアプリでつなぐ（threads-010）。機能の印 threads.oauth と Meta のアプリの設定が
// そろっているときだけ出す（窓口が使えるかを返す）。押すと Threads の許可の画面へ移り、戻ったら完了の画面が設定へ戻す（問い合わせ oauth=）。
import { OAUTH_RESULT_MESSAGES, THREADS_ERRORS } from "@workspace/contracts/threads";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fetchOauthAvailability, startOauth } from "./api.ts";
import { THREADS_QUERY_KEYS } from "./queries.ts";

/**
 * 戻ってきたときの結果の文。
 * @param code 問い合わせ oauth= の値
 * @returns 文（なければ undefined）
 */
function resultOf(code: string | undefined) {
  if (!code) return undefined;
  const known = OAUTH_RESULT_MESSAGES[code];
  if (known) return known;
  const domain = Object.values(THREADS_ERRORS).find((item) => item.code === code);
  return {
    tone: "danger" as const,
    message: domain?.message ?? "つなげませんでした。もう一度お試しください。",
  };
}

/**
 * アプリの Meta のアプリでつなぐボタンと、戻ってきたときの結果。
 * @param props 運用アカウントの ID（accountId）・接続しているか（connected）
 * @param props.accountId 運用アカウントの ID
 * @param props.connected 接続しているか（接続し直しも含む）
 * @returns 要素（使えなければ、結果だけか null）
 */
export function OauthConnect({ accountId, connected }: { accountId: string; connected: boolean }) {
  const search: { oauth?: unknown } = useSearch({ strict: false });
  const query = useQuery({
    queryKey: [...THREADS_QUERY_KEYS.all, "oauth-availability"],
    queryFn: fetchOauthAvailability,
  });
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const result = resultOf(typeof search.oauth === "string" ? search.oauth : undefined);

  /** 始めて、Threads の許可の画面へ移る。 */
  const start = async () => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const { authorizeUrl } = await startOauth(accountId);
      window.location.assign(authorizeUrl);
    } catch (caught) {
      setError(`始められませんでした。${errorMessage(caught)}`);
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-xxs">
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      {query.data?.available ? (
        <>
          <p className="text-s text-text-sub">
            Threads の画面で許可するだけでつなげます（トークンを作って貼る必要はありません）。
          </p>
          <Button
            variant="primary"
            onClick={() => void start()}
            aria-disabled={pending || undefined}
          >
            {pending
              ? "Threads へ移っています…"
              : connected
                ? "Meta のアプリでつなぎ直す"
                : "Meta のアプリでつなぐ"}
          </Button>
          {error ? <ResponseMessage tone="danger">{error}</ResponseMessage> : null}
        </>
      ) : null}
    </div>
  );
}
