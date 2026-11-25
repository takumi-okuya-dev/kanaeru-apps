// 組織の招待（/join/{token}。suite-001・PRD 組織 FR-O21〜FR-O24）。外から開く道なので外枠のナビを出さない（layout: bare）。
// ログインを求めたうえで、組織の名前・管理者・人数・「メンバーとして入ります」と、入る前に知っておくこと（表示名と役割が見える・
// 退会すると組織に入れた記録は管理者に引き継がれる・アプリごとの見え方〈見えるアプリの分だけ〉）を出し、「入る」で入る。
// すでに入っている人には「すでに入っています」と組織の画面への入口、使えないリンクには理由と「管理者に新しいリンクを頼んでください」。
// 「入る」の上に、利用規約とプライバシーポリシーへのリンク（新しいタブ。suite-002）。
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { showNotice } from "../../lib/notice.ts";
import { visibleOrganizationExtensions } from "../../lib/organization.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { joinOrganization } from "./organization-api.ts";
import { LegalLink } from "./LegalLink.tsx";
import { organizationPath } from "./organization-paths.ts";
import { ORGANIZATION_QUERY_KEYS, useInvitePreview } from "./organization-queries.ts";
import { useVisibleApps } from "./queries.ts";

/** 使えないリンクのときに添える頼み方。 */
const ASK_ADMIN = "管理者に新しいリンクを頼んでください。";

/**
 * 使えない招待のリンクの画面。
 * @param props 理由（reason）
 * @param props.reason 理由の1文
 * @returns 画面の要素
 */
function InvalidJoin({ reason }: { reason: string }) {
  return <Page title="この招待のリンクは使えません" lead={`${reason}${ASK_ADMIN}`} />;
}

/**
 * 入る前に知っておくこと（suite の説明と、見えるアプリが足す説明）。
 * @returns 要素
 */
function JoinNotes() {
  const { status, apps } = useVisibleApps();
  const notes = visibleOrganizationExtensions(
    status === "success" ? new Set(apps.map((app) => app.key)) : null,
  ).flatMap((extension) => extension.joinNotes ?? []);
  return (
    <section aria-labelledby="join-notes-heading" className="flex flex-col gap-xxs">
      <h2 id="join-notes-heading" className="text-l leading-tight font-bold">
        入る前に知っておくこと
      </h2>
      <ul className="flex list-disc flex-col gap-x3s pl-s text-m">
        <li>組織の人どうしで、表示名と役割が見えます。</li>
        <li>あなたが退会すると、組織に入れたあなたの記録は、組織の管理者に引き継がれます。</li>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 招待の中身と「入る」（ログインしているとき）。
 * @param props 招待の札（token）
 * @param props.token 招待の札
 * @returns 画面の要素
 */
function JoinContent({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useInvitePreview(token);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [invalid, setInvalid] = useState<string | undefined>();

  if (query.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <InvalidJoin reason={errorMessage(query.error)} />;
    }
    return (
      <Page title="読みこめませんでした" lead={errorMessage(query.error)}>
        <div>
          <Button onClick={() => void query.refetch()}>もう一度</Button>
        </div>
      </Page>
    );
  }
  if (invalid) return <InvalidJoin reason={invalid} />;
  const preview = query.data;
  if (preview.alreadyMember) {
    return (
      <Page title="すでに入っています" lead={`あなたは、組織「${preview.name}」に入っています。`}>
        <div>
          <Link
            to={organizationPath(preview.organizationId)}
            className="text-m text-text-link underline"
          >
            組織の画面へ
          </Link>
        </div>
      </Page>
    );
  }
  if (preview.full) {
    return <InvalidJoin reason="この組織は人数の上限に達しています。" />;
  }

  /** 入る。 */
  const join = async () => {
    if (pending) return;
    setPending(true);
    setFailure(undefined);
    try {
      const joined = await joinOrganization(token);
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEYS.all });
      const to = organizationPath(joined.organizationId);
      showNotice({
        tone: "success",
        message: joined.alreadyMember
          ? `すでに組織「${preview.name}」に入っています。`
          : `組織「${preview.name}」に入りました。`,
        path: to,
      });
      await navigate({ to, replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setInvalid(errorMessage(caught));
      } else {
        setFailure(`入れませんでした。${errorMessage(caught)}`);
      }
      setPending(false);
    }
  };

  return (
    <Page title="組織への招待" lead={`組織「${preview.name}」に招かれています。`}>
      <dl className="flex flex-col gap-xxs text-m">
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">組織の名前</dt>
          <dd className="min-w-0 break-words">{preview.name}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">管理者</dt>
          <dd className="min-w-0 break-words">{preview.adminName || "名前のない人"}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">人数</dt>
          <dd>{preview.memberCount}人</dd>
        </div>
      </dl>
      <p className="text-m font-bold">メンバーとして入ります。</p>
      <JoinNotes />
      <p className="text-s text-text-sub">
        組織での情報の扱いは、
        <LegalLink to="terms" newTab />と<LegalLink to="privacy" newTab />
        に書いています（どちらも新しいタブで開きます）。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <Button
          variant="primary"
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          onClick={() => void join()}
        >
          {pending ? "入っています…" : "入る"}
        </Button>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </Page>
  );
}

/** JoinPage が受け取るもの。 */
export type JoinPageProps = {
  /** 招待の札（道の値） */
  token: string;
};

/**
 * 組織の招待の画面（ログインが要る）。
 * @param props 招待の札（token）
 * @returns 画面の要素
 */
export function JoinPage({ token }: JoinPageProps) {
  return (
    <SessionGate>
      <JoinContent token={token} />
    </SessionGate>
  );
}

const joinRouteApi = getRouteApi("/join/$joinToken");

/**
 * 組織の招待の道の部品（道の joinToken を渡す）。
 * @returns 画面の要素
 */
export function JoinRoute() {
  const { joinToken } = joinRouteApi.useParams();
  return <JoinPage token={joinToken} />;
}
