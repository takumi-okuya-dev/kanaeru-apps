// P3 受付係の招待（/invite/{inviteToken}。EXPERIENCE.md）。交流会の名前を確かめて「受ける」→ 一覧画面へ。
// 使えないリンク（知らない・作り直された・交流会の日が終わった）は決めた言葉で出す。
// すでに受付係・主催者なら、受けずにそのまま行き先へ移る（EXPERIENCE「すでに受付係なら、そのまま A3 へ」）。
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useState } from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { Loading } from "./EventAccessGate.tsx";
import { firstAdminPath } from "./admin-tabs.ts";
import { acceptInvite, fetchInvitePreview } from "./api.ts";
import { formatEventDateTime } from "./format.ts";
import { useRegisteredPaths } from "./navigation.tsx";
import { EVENT_QUERY_KEYS } from "./queries.ts";

/** 交流会の一覧の道（行き先の管理の画面がまだないとき）。 */
const EVENT_LIST_PATH = "/admin/events";

/**
 * 使えない招待のリンクの画面。
 * @param props 理由（reason。なければ決めた言葉だけ）
 * @param props.reason 理由の1文
 * @returns 画面の要素
 */
function InvalidInvite({ reason }: { reason?: string }) {
  return (
    <Page
      title="この招待のリンクは使えません"
      lead={`${reason ?? ""}主催者に新しいリンクをもらってください。`}
    />
  );
}

/**
 * 招待の中身と「受ける」（ログインしているとき）。
 * @param props 招待の印（inviteToken）
 * @param props.inviteToken 招待の印
 * @returns 画面の要素
 */
function InviteAccept({ inviteToken }: { inviteToken: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const registered = useRegisteredPaths();
  const query = useQuery({
    queryKey: EVENT_QUERY_KEYS.invitePreview(inviteToken),
    queryFn: () => fetchInvitePreview(inviteToken),
  });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ message: string; expired: boolean }>();

  /**
   * 行き先へ移る（その役目の最初の管理の画面。なければ交流会の一覧）。
   * @param eventId 交流会の ID
   * @param role 役目
   * @param message 知らせの帯の文
   */
  const goToEvent = async (eventId: string, role: "organizer" | "staff", message: string) => {
    const destination = firstAdminPath(eventId, role, registered) ?? EVENT_LIST_PATH;
    // 招待の中身は読み直さない（読み直すと「すでに受付係」になり、もう一度移ってしまう）
    await queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.list });
    await queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.detail(eventId) });
    showNotice({ tone: "success", message, path: destination });
    await navigate({ href: destination, replace: true });
  };

  const preview = query.data;
  const alreadyMember = preview?.myRole ?? null;
  useEffect(() => {
    if (!preview || !alreadyMember) return;
    const message =
      alreadyMember === "organizer"
        ? "主催者なので、受付係にならなくても使えます。"
        : "すでにこの交流会の受付係です。";
    void goToEvent(preview.eventId, alreadyMember, message);
    // 読んだ招待の中身が変わったときだけ移る（goToEvent は描くたびに作り直すので並べない）
  }, [preview?.eventId, alreadyMember]);

  if (query.isPending || alreadyMember) return <Loading />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <InvalidInvite />;
    return (
      <Page title="読みこめませんでした" lead={errorMessage(query.error)}>
        <ButtonRow>
          <Button onClick={() => void query.refetch()}>もう一度</Button>
        </ButtonRow>
      </Page>
    );
  }
  if (query.data.expired || failure?.expired) {
    return <InvalidInvite reason="交流会の日が終わりました。" />;
  }

  /** 受ける。 */
  const accept = async () => {
    if (pending) return;
    setPending(true);
    setFailure(undefined);
    try {
      const accepted = await acceptInvite(inviteToken);
      await goToEvent(accepted.eventId, accepted.role, "受付係になりました。");
    } catch (error) {
      const expired = error instanceof ApiError && error.code === "STAFF_INVITE_EXPIRED";
      setFailure({ message: `受けられませんでした。${errorMessage(error)}`, expired });
      setPending(false);
    }
  };

  return (
    <Page
      title="受付係の招待"
      lead={`${query.data.eventName}（${formatEventDateTime(query.data.startsAt)}）の受付係に招かれています。`}
    >
      <p className="text-m">
        受けると、この交流会の参加者の一覧と合計を見て、手でチェックインできるようになります。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button
            variant="primary"
            aria-disabled={pending || undefined}
            onClick={() => void accept()}
          >
            {pending ? "受けています…" : "受ける"}
          </Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure.message}</ResponseMessage> : null}
      </div>
    </Page>
  );
}

/** InviteAcceptPage が受け取るもの。 */
export type InviteAcceptPageProps = {
  /** 招待の印（道の値） */
  inviteToken: string;
};

/**
 * P3 受付係の招待（ログインが要る）。
 * @param props 招待の印（inviteToken）
 * @returns 画面の要素
 */
export function InviteAcceptPage({ inviteToken }: InviteAcceptPageProps) {
  return (
    <SessionGate>
      <InviteAccept inviteToken={inviteToken} />
    </SessionGate>
  );
}

const inviteRouteApi = getRouteApi("/invite/$inviteToken");

/**
 * P3 受付係の招待の道の部品（道の inviteToken を渡す）。
 * @returns 画面の要素
 */
export function InviteAcceptRoute() {
  const { inviteToken } = inviteRouteApi.useParams();
  return <InviteAcceptPage inviteToken={inviteToken} />;
}
