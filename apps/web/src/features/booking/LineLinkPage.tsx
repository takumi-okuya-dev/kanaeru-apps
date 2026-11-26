// 紐づけ（/line-link/{linkToken}。参加者が外から開く道。booking-002 US2・AD-14）。公式アカウントを友だち追加したときのあいさつの
// リンクから開く。LINE でログインし（SessionGate）、公式アカウントの持ち主の名前を確かめて「紐づける」。外枠のナビは出さない。
// 使えないリンク（知らない・期限切れ・使った）は理由と、友だち追加し直すと新しいリンクが届くことを出す。札はログにも画面の文にも出さない。
// リンクを他人に渡されたときの守り（research S7）：その札の LINE の友だちの表示名（読めたときだけ）と、「自分で受け取ったリンクで
// なければ押さない」を出す。
import { PARTICIPANT_ROUTE_PATTERNS } from "@workspace/contracts/core";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { acceptLineLink, fetchLineLink } from "./notify-api.ts";
import { PRODUCT_NAME } from "@workspace/contracts/core";

/** 新しいリンクのもらい方。 */
const RELINK_HINT =
  "公式アカウントをいったんブロックしてから、もう一度友だち追加すると、新しいリンクが届きます。";

/**
 * 紐づけの中身（ログインしているとき）。
 * @param props 札（linkToken）
 * @param props.linkToken 札
 * @returns 要素
 */
function LineLink({ linkToken }: { linkToken: string }) {
  const query = useQuery({
    queryKey: ["booking", "line-link", linkToken],
    queryFn: () => fetchLineLink(linkToken),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const [pending, setPending] = useState(false);
  const [linkedName, setLinkedName] = useState<string>();
  const [failure, setFailure] = useState<string>();

  if (linkedName !== undefined) {
    return (
      <Page
        title="紐づけました"
        lead={`${linkedName}の交流会の予約の知らせが、この LINE に届きます。この画面は閉じてかまいません。`}
      />
    );
  }
  if (query.isPending) {
    return (
      <Page title="LINE の紐づけ">
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      </Page>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <Page title="このリンクは使えません" lead={RELINK_HINT} />;
    }
    return (
      <Page title="読みこめませんでした" lead={errorMessage(query.error)}>
        <ButtonRow>
          <Button onClick={() => void query.refetch()}>もう一度</Button>
        </ButtonRow>
      </Page>
    );
  }
  const preview = query.data;
  if (preview.state === "used") {
    return preview.linkedToMe ? (
      <Page
        title="もう紐づいています"
        lead={`${preview.holderName}の交流会の予約の知らせは、この LINE に届きます。`}
      />
    ) : (
      <Page title="このリンクは使い終わっています" lead={RELINK_HINT} />
    );
  }
  if (preview.state === "expired") {
    return (
      <Page
        title="このリンクは期限が切れました"
        lead={`リンクは7日のあいだ使えます。${RELINK_HINT}`}
      />
    );
  }

  /** 紐づける。 */
  const accept = async () => {
    if (pending) return;
    setPending(true);
    setFailure(undefined);
    try {
      setLinkedName((await acceptLineLink(linkToken)).holderName);
    } catch (caught) {
      setFailure(`紐づけられませんでした。${errorMessage(caught)}`);
      setPending(false);
    }
  };

  return (
    <Page
      title="LINE の紐づけ"
      lead={`${preview.holderName}の LINE 公式アカウントと、あなたの ${PRODUCT_NAME} のアカウントを紐づけます。`}
    >
      {preview.lineDisplayName ? (
        <p className="text-m">{`紐づける LINE：${preview.lineDisplayName}さん`}</p>
      ) : null}
      <p className="text-m">
        紐づけると、{preview.holderName}
        の交流会の申込みの確定・キャンセル待ちの繰り上げ・日時や場所の変更・中止が、この公式アカウントから届きます。公式アカウントをブロックすると、紐づけは外れます。
      </p>
      <p className="text-m font-bold">
        自分の LINE に届いたリンクでなければ、押さないでください（ほかの人の LINE
        と紐づき、あなたの予約の知らせがその人に届きます）。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button
            variant="primary"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            onClick={() => void accept()}
          >
            {pending ? "紐づけています…" : "紐づける"}
          </Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </Page>
  );
}

/**
 * 紐づけの画面（ログインが要る）。
 * @param props 札（linkToken）
 * @param props.linkToken 札
 * @returns 画面の要素
 */
export function LineLinkPage({ linkToken }: { linkToken: string }) {
  return (
    <SessionGate>
      <LineLink linkToken={linkToken} />
    </SessionGate>
  );
}

const lineLinkRouteApi = getRouteApi(PARTICIPANT_ROUTE_PATTERNS.lineLink);

/**
 * 紐づけの道の部品（道の linkToken を渡す）。
 * @returns 画面の要素
 */
export function LineLinkRoute() {
  const { linkToken } = lineLinkRouteApi.useParams();
  return <LineLinkPage linkToken={linkToken} />;
}
