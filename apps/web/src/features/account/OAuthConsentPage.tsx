// 同意の画面（/oauth/consent）。AI のアプリ（MCP のクライアント）が本人の記録を読むことを、本人が許すか決める（FR-014）。
// 範囲は要求のうち、本人が外せる（既定は全部許す）。決めたら、API が返す戻り先へ進む（許す・断るとも）。
// 戻り先のホストを出す（自己申告の名前〈DCR〉だけで見分けさせない）。
// 要求が読めないとき・戻り先を信じられない要求のときは、アプリからもう一度始めてもらう（「もう一度」では直らない）。
// 戻り先へ返すべき失敗（範囲・宛先・PKCE）は、窓口が返す戻り先へそのまま進む。
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  AuthorizeQuery,
  ConsentDecisionInput,
  ConsentViewData,
} from "@workspace/contracts/account";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { ConsentRequestError, decideConsent, fetchConsentView } from "./api.ts";

/** 同意の画面が受け取るもの。 */
export type OAuthConsentPageProps = {
  /** 認可の要求（URL かしまった要求から読めたもの。読めなければ undefined） */
  request: AuthorizeQuery | undefined;
};

/**
 * 同意の画面。
 * @param props 認可の要求（request）
 * @returns 画面の要素
 */
export function OAuthConsentPage({ request }: OAuthConsentPageProps) {
  if (!request) {
    return (
      <Page
        title="この画面は開けません"
        lead="要求の項目が足りないか、形が違います。アプリからもう一度始めてください。"
      />
    );
  }
  return <ConsentBody request={request} />;
}

/**
 * 戻り先へ進む（画面の中では開かない。クライアントの戻り先は https か、手元の loopback）。
 * @param url 戻り先の URL
 */
function goTo(url: string): void {
  window.location.assign(url);
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
    if (view.error instanceof ConsentRequestError) {
      return (
        <Page
          title="この要求は使えません"
          lead={`${view.error.message}。アプリからもう一度始めてください。`}
        />
      );
    }
    return (
      <Page title="同意の画面を読めません" lead={errorMessage(view.error)}>
        <ButtonRow>
          <Button onClick={() => void view.refetch()}>もう一度</Button>
        </ButtonRow>
      </Page>
    );
  }
  if ("redirectTo" in view.data) return <Redirecting to={view.data.redirectTo} />;
  return <ConsentForm request={request} view={view.data} />;
}

/**
 * 戻り先へ進む間の表示（窓口が戻り先へ返すべき失敗と判断したとき）。
 * @param props 戻り先の URL
 * @returns 画面の要素
 */
function Redirecting({ to }: { to: string }) {
  useEffect(() => {
    goTo(to);
  }, [to]);
  return (
    <p aria-busy="true" className="text-m text-text-sub">
      アプリに戻っています…
    </p>
  );
}

/**
 * 同意の決めの欄（許す範囲を外せる。送ると戻り先へ進む）。
 * @param props 認可の要求・同意の画面に出すもの
 * @returns 画面の要素
 */
function ConsentForm({ request, view }: { request: AuthorizeQuery; view: ConsentViewData }) {
  const { clientName, clientKind, redirectHost, scopes } = view;
  const [granted, setGranted] = useState<string[]>(() => scopes.map((row) => row.scope));
  const decision = useMutation({
    mutationFn: (input: ConsentDecisionInput) => decideConsent(input),
    onSuccess: (result) => {
      goTo(result.redirectTo);
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
  // 送ったあとは、戻り先へ移るまでボタンを止めたままにする（同意とコードを2つ作らない）
  const locked = decision.isPending || decision.isSuccess;

  return (
    <Page
      title={`${clientName}にあなたの記録を読ませますか`}
      lead="許すと、このアプリが下の範囲の記録を読めるようになります。外す範囲は読めません。あとで「設定 › 接続」からいつでも取り消せます。"
    >
      <form
        className="flex flex-col gap-s"
        onSubmit={(event) => {
          event.preventDefault();
          send("approve", granted);
        }}
      >
        <dl className="flex flex-col gap-x3s text-m">
          <div className="flex gap-xxs">
            <dt className="text-text-sub">戻り先</dt>
            <dd>{redirectHost}</dd>
          </div>
        </dl>
        {clientKind === "dcr" ? (
          <ResponseMessage tone="info">
            このアプリの名前は、アプリ自身が名乗ったもので、確かめられていません。戻り先が知っているものか確かめてから許可してください。
          </ResponseMessage>
        ) : null}
        <fieldset className="flex flex-col gap-xxs">
          <legend className="text-m font-bold">許す範囲</legend>
          {scopes.map((row) => (
            <label key={row.scope} className="flex min-h-xl items-start gap-xxs">
              <input
                type="checkbox"
                className="mt-x3s size-s shrink-0 accent-primary"
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
        <ButtonRow>
          <Button type="button" disabled={locked} onClick={() => send("deny", [])}>
            許可しない
          </Button>
          <Button type="submit" variant="primary" disabled={granted.length === 0 || locked}>
            許可する
          </Button>
        </ButtonRow>
      </form>
    </Page>
  );
}
