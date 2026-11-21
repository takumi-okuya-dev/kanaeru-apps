// 見せてもらっている運用アカウント（/threads/organizations/{organizationId}/accounts/{accountId}。threads-013。PRD 組織 FR-T4。
// めぐるの pages/team-shared-account.tsx）。持ち主が「チームに見せる」にした運用アカウントの、投稿の案（一覧）と戦略を読むだけで出す。
// 画面の上に「（持ち主）さんの運用アカウントを見ています（読むだけ）・（組織の名前）」と「組織に戻る」。直す・承認・消す・貼り付けの操作は出さない。
// 反応・分析・設定・操作の記録は出さない（API も断る）。見せるをオフにされたら、次に読んだときに開けなくなる（API が 403）。
import {
  DRAFT_LIST_STATUSES,
  DRAFT_STATUS_LABELS,
  STRATEGY_FIELDS,
} from "@workspace/contracts/threads";
import type { DraftListStatus, Strategy } from "@workspace/contracts/threads";
import { jstDateTime } from "@workspace/contracts/core";
import { Link, getRouteApi } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { useState } from "react";
import { SessionGate } from "../account/index.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { useDrafts, useStrategy, useTeamOrganization } from "./queries.ts";

/** 道の値。 */
type SharedAccountProps = {
  /** 組織の ID */
  organizationId: string;
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 投稿の案（読むだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 節の要素
 */
function SharedDrafts({ accountId }: { accountId: string }) {
  const [status, setStatus] = useState<DraftListStatus>("needs_review");
  const query = useDrafts(accountId, status);
  return (
    <section aria-labelledby="threads-shared-drafts" className="flex flex-col gap-xs">
      <h2 id="threads-shared-drafts" className="text-l font-bold">
        投稿の案
      </h2>
      <ChoiceChips
        label="表示する案"
        options={DRAFT_LIST_STATUSES.map((value) => ({ value, label: DRAFT_STATUS_LABELS[value] }))}
        value={status}
        onValueChange={setStatus}
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailure error={query.error} retry={() => void query.refetch()} />
      ) : query.data.drafts.length === 0 ? (
        <p className="text-m">{DRAFT_STATUS_LABELS[status]}の案はありません。</p>
      ) : (
        <ul aria-label={`${DRAFT_STATUS_LABELS[status]}の案`} className="flex flex-col gap-xs">
          {query.data.drafts.map((draft) => (
            <li
              key={draft.id}
              className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
            >
              <p className="text-s text-text-sub">
                ためた：{jstDateTime(draft.createdAt)}
                {draft.publishedAt ? `・投稿：${jstDateTime(draft.publishedAt)}` : ""}
              </p>
              <p className="text-m break-words whitespace-pre-wrap">{draft.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 戦略（読むだけ。入れた項目だけ）。
 * @param props 戦略（strategy）
 * @param props.strategy 戦略
 * @returns 節の要素
 */
function SharedStrategy({ strategy }: { strategy: Strategy }) {
  const filled = STRATEGY_FIELDS.filter((field) => {
    const value = (strategy as Record<string, unknown>)[field.key];
    return typeof value === "string" && value.trim() !== "";
  });
  return (
    <section aria-labelledby="threads-shared-strategy" className="flex flex-col gap-xs">
      <h2 id="threads-shared-strategy" className="text-l font-bold">
        戦略
      </h2>
      {filled.length === 0 ? (
        <p className="text-m">戦略はまだ入っていません。</p>
      ) : (
        <dl className="flex flex-col gap-xs">
          {filled.map((field) => (
            <div key={field.key} className="flex flex-col gap-x3s">
              <dt className="text-s font-bold text-text-sub">{field.label}</dt>
              <dd className="text-m break-words whitespace-pre-wrap">
                {String((strategy as Record<string, unknown>)[field.key])}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/**
 * 見せてもらっている運用アカウントの中身（ログインのあと）。
 * @param props 組織の ID（organizationId）・運用アカウントの ID（accountId）
 * @returns 画面の要素
 */
function SharedAccount({ organizationId, accountId }: SharedAccountProps) {
  const organization = useTeamOrganization(organizationId);
  const strategy = useStrategy(accountId);
  if (organization.isPending) return <Loading />;
  if (organization.isError) {
    return (
      <LoadFailure
        error={organization.error}
        retry={() => void organization.refetch()}
        notFoundTitle="この組織は見つかりません"
      />
    );
  }
  const account = organization.data.accounts.find((row) => row.id === accountId);
  if (!account || account.access === "none") {
    return (
      <ThreadsPage
        title="この運用アカウントは見られません"
        lead="持ち主が見せていないか、組織から外れた可能性があります。"
      >
        <div>
          <Link
            to="/threads/organizations/$organizationId"
            params={{ organizationId }}
            className={buttonVariants({ variant: "secondary" })}
          >
            組織に戻る
          </Link>
        </div>
      </ThreadsPage>
    );
  }
  return (
    <ThreadsPage title={account.name} lead="投稿の案と戦略を、読むだけで見ています。">
      <div
        role="status"
        className="flex flex-col gap-xxs rounded-sm border border-border bg-surface-sunken p-xs text-m"
      >
        <p>
          {account.ownerName || "（名前なし）"}
          さんの運用アカウントを見ています（読むだけ）・{organization.data.name}
        </p>
        <div>
          <Link
            to="/threads/organizations/$organizationId"
            params={{ organizationId }}
            className={buttonVariants({ variant: "secondary", size: "small" })}
          >
            組織に戻る
          </Link>
        </div>
      </div>
      <SharedDrafts accountId={accountId} />
      {strategy.isPending ? (
        <Loading />
      ) : strategy.isError ? (
        <LoadFailure error={strategy.error} retry={() => void strategy.refetch()} />
      ) : (
        <SharedStrategy strategy={strategy.data} />
      )}
    </ThreadsPage>
  );
}

/**
 * 見せてもらっている運用アカウント（ログインが要る）。
 * @param props 組織の ID（organizationId）・運用アカウントの ID（accountId）
 * @returns 画面の要素
 */
export function SharedAccountPage(props: SharedAccountProps) {
  return (
    <SessionGate>
      <SharedAccount {...props} />
    </SessionGate>
  );
}

const sharedRouteApi = getRouteApi("/threads/organizations/$organizationId/accounts/$accountId");

/**
 * 見せてもらっている運用アカウントの道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function SharedAccountRoute() {
  const { organizationId, accountId } = sharedRouteApi.useParams();
  return <SharedAccountPage organizationId={organizationId} accountId={accountId} />;
}
