// 同意の画面（/oauth/consent）。AI のアプリ（MCP のクライアント）が本人の記録を読むことを、本人が許すか決める（FR-014）。
// 範囲は要求のうち、本人が外せる（既定は全部許す）。決めたら、API が返す戻り先へ進む（許す・断るとも）。
// 要求の項目が形から外れているときは、アプリからもう一度始めてもらう。
import { useMutation, useQuery } from "@tanstack/react-query";
import { AuthorizeParams } from "@workspace/contracts/account";
import type { AuthorizeQuery, ConsentDecisionInput } from "@workspace/contracts/account";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { decideConsent, fetchConsentView } from "./api.ts";

/** 同意の画面が受け取るもの（道の問い合わせのまま。形は中で確かめる）。 */
export type OAuthConsentPageProps = {
  /** 問い合わせ（認可の要求の項目） */
  search: Record<string, unknown>;
};

/**
 * 同意の画面。
 * @param props 問い合わせ（search）
 * @returns 画面の要素
 */
export function OAuthConsentPage({ search }: OAuthConsentPageProps) {
  const parsed = AuthorizeParams.safeParse(search);
  if (!parsed.success) {
    return (
      <Page
        title="この画面は開けません"
        lead="要求の項目が足りないか、形が違います。アプリからもう一度始めてください。"
      />
    );
  }
  return <ConsentBody request={parsed.data} />;
}

/**
 * 同意の本体（要求の項目が確かめられたあと）。
 * @param props 認可の要求の項目
 * @returns 画面の要素
 */
function ConsentBody({ request }: { request: AuthorizeQuery }) {
  const view = useQuery({
    queryKey: ["account", "oauth-consent", request],
    queryFn: () => fetchConsentView(request),
    retry: false,
  });
  if (view.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (view.isError) {
    return (
      <Page title="同意の画面を読めません" lead={errorMessage(view.error)}>
        <div>
          <Button onClick={() => void view.refetch()}>もう一度</Button>
        </div>
      </Page>
    );
  }
  return <ConsentForm request={request} clientName={view.data.clientName} scopes={view.data.scopes} />;
}

/** 範囲の1行（画面の形）。 */
type ScopeRow = { scope: string; label: string; description: string };

/**
 * 同意の決めの欄（許す範囲を外せる。送ると戻り先へ進む）。
 * @param props 認可の要求・クライアントの名前・範囲
 * @returns 画面の要素
 */
function ConsentForm({
  request,
  clientName,
  scopes,
}: {
  request: AuthorizeQuery;
  clientName: string;
  scopes: readonly ScopeRow[];
}) {
  const [granted, setGranted] = useState<string[]>(() => scopes.map((row) => row.scope));
  const decision = useMutation({
    mutationFn: (input: ConsentDecisionInput) => decideConsent(input),
    onSuccess: (result) => {
      // 戻り先はクライアントのもの（https か、手元の loopback）。画面の中では開かず、そこへ進める
      window.location.assign(result.redirectTo);
    },
  });

  /**
   * 決めを送る。
   * @param value 許す・断る
   * @param granted_scopes 許す範囲（断るときは空）
   */
  const send = (value: "approve" | "deny", granted_scopes: string[]) => {
    decision.mutate({ ...request, decision: value, granted_scopes });
  };

  return (
    <Page
      title={`${clientName}にあなたの記録を読ませますか`}
      lead="許すと、このアプリが下の範囲の記録を読めるようになります。外す範囲は読めません。あとで「設定 › 接続」からいつでも取り消せます。"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          send("approve", granted);
        }}
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="text-m font-bold">許す範囲</legend>
          {scopes.map((row) => (
            <label key={row.scope} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={granted.includes(row.scope)}
                onChange={(event) =>
                  setGranted((current) =>
                    event.target.checked
                      ? [...current, row.scope]
                      : current.filter((scope) => scope !== row.scope),
                  )
                }
              />
              <span>
                <span className="block text-m">{row.label}</span>
                {row.description ? (
                  <span className="block text-s text-text-sub">{row.description}</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
        {decision.isError ? (
          <ResponseMessage tone="danger">{errorMessage(decision.error)}</ResponseMessage>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" disabled={granted.length === 0 || decision.isPending}>
            許可する
          </Button>
          <Button
            type="button"
            disabled={decision.isPending}
            onClick={() => send("deny", [])}
          >
            許可しない
          </Button>
        </div>
      </form>
    </Page>
  );
}
