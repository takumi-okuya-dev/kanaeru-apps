// 運用アカウントのホーム（threads-012。めぐるの pages/account-home.tsx・components/guides/IntroGuide.tsx・
// components/NotConnectedNotice.tsx の振る舞いを、kanaeru の部品で作り直したもの）：
// - はじめに読んでほしいこと（「詳しく」の開け閉め。初めは閉じておく。threads-017）
// - 未接続の帯（Threads につなぐと、承認した案を自動で投稿し、反応を分析できる）・接続し直しが要るときの知らせ
// - 次にやること（約束の homeNextStep：つなぐ → 戦略 → 宣伝 → リサーチ → 案を作る）と、その行き先のボタン
// - 投稿の材料の3枚のカード（戦略の入れた数・宣伝の対象の数・参考の投稿の数）。次にやることのカードは枠を強める
import { homeNextStep } from "@workspace/contracts/threads";
import type { HomeStepTarget, ThreadsAccount } from "@workspace/contracts/threads";
import { Link, getRouteApi } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { cn } from "@workspace/ui/lib/cn";
import type * as React from "react";
import { Icon } from "../../lib/icon.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { accountSecondary } from "./AccountSwitcher.tsx";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { useAccountHome, useAccountPlacement } from "./queries.ts";
import { TeamNotices } from "./TeamNotices.tsx";
import { useThreadsCan } from "./team-access.ts";

/** はじめに読んでほしいこと（めぐるの IntroGuide の文）。 */
const INTRO_POINTS = [
  "SNS の運用は地道です。毎日少しずつでも続けることが、いちばんの力になります。",
  "始めのうちは反応が少ないのが当たり前です。数日・数週間の数字で落ちこまなくて大丈夫です。",
  "このアプリは投稿づくりを手伝いますが、フォロワーや問い合わせが増えることを約束するものではありません。",
  "SNS の時間を、先に予定に入れておきましょう（通勤中・寝る前の15分など）。",
  "完璧を目指さず、小さく試して、反応を見ながら直していきましょう。",
];

/**
 * はじめに読んでほしいこと（初めは閉じておき、見たい人が開く。core-010 の決まり）。
 * @returns 要素
 */
function IntroGuide() {
  return (
    <Disclosure summary={`はじめに読んでほしいこと（${INTRO_POINTS.length}つ）`}>
      <ul className="flex list-disc flex-col gap-x3s pl-s text-m">
        {INTRO_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </Disclosure>
  );
}

/**
 * 接続の帯（未接続・接続し直しが要るとき）。
 * @param props 運用アカウント（account）
 * @returns 帯（つないでいれば出さない）
 */
function ConnectionBanner({ account }: { account: ThreadsAccount }) {
  const can = useThreadsCan();
  if (account.connectionStatus === "connected") return null;
  const needsReconnect = account.connectionStatus === "needs_reconnect";
  return (
    <section
      aria-label="Threads への接続"
      className="flex flex-wrap items-center gap-x-xs gap-y-x3s rounded-md bg-surface-sunken px-xs py-xxs text-m"
    >
      <span className="flex-1">
        {needsReconnect
          ? "Threads への接続し直しが要ります。つなぎ直すまで、自動の投稿と反応の取りこみは止まっています。"
          : "未接続：Threads につなぐと、承認した案を自動で投稿し、反応を分析できます。"}
      </span>
      {can.manage ? (
        <Link
          to="/threads/accounts/$accountId/settings"
          params={{ accountId: account.id }}
          hash="threads-connection"
          className="font-bold text-text-link underline"
        >
          {needsReconnect ? "Threads につなぎ直す" : "Threads につなぐ"}
        </Link>
      ) : (
        <span className="text-s text-text-sub">つなぐのは持ち主です。</span>
      )}
    </section>
  );
}

/** 次にやることの行き先のボタンの文字。 */
const STEP_ACTION_LABELS: Record<HomeStepTarget, string> = {
  connect: "Threads につなぐ",
  strategy: "戦略を書く",
  promotions: "宣伝を足す",
  research: "リサーチを足す",
  create: "投稿の案を作る",
};

/**
 * 次にやることの行き先のリンク。
 * @param props 運用アカウントの ID（accountId）・行き先（target）
 * @returns リンクの要素
 */
function StepLink({ accountId, target }: { accountId: string; target: HomeStepTarget }) {
  const className = buttonVariants({ variant: "primary" });
  const label = STEP_ACTION_LABELS[target];
  const params = { accountId };
  switch (target) {
    case "connect":
      return (
        <Link
          to="/threads/accounts/$accountId/settings"
          params={params}
          hash="threads-connection"
          className={className}
        >
          {label}
        </Link>
      );
    case "strategy":
      return (
        <Link to="/threads/accounts/$accountId/strategy" params={params} className={className}>
          {label}
        </Link>
      );
    case "promotions":
      return (
        <Link
          to="/threads/accounts/$accountId/research"
          params={params}
          hash="threads-promotions"
          className={className}
        >
          {label}
        </Link>
      );
    case "research":
      return (
        <Link
          to="/threads/accounts/$accountId/research"
          params={params}
          hash="threads-references"
          className={className}
        >
          {label}
        </Link>
      );
    case "create":
      return (
        <Link to="/threads/accounts/$accountId/create" params={params} className={className}>
          {label}
        </Link>
      );
  }
}

/** 材料のカードが受け取るもの。 */
type MaterialCardProps = {
  /** 題 */
  label: string;
  /** 数の文 */
  text: string;
  /** 次にやることの行き先か（枠を強める） */
  highlighted: boolean;
  /** リンク（道の道具の Link） */
  children: (className: string, content: React.ReactNode) => React.ReactNode;
};

/**
 * 材料のカード（1枚）。
 * @param props 題（label）・数の文（text）・強めるか（highlighted）・リンクを描く関数（children）
 * @returns カードの要素
 */
function MaterialCard({ label, text, highlighted, children }: MaterialCardProps) {
  const className = cn(
    "flex min-h-xl items-center gap-xs rounded-md border bg-surface p-xs text-text no-underline hover:bg-surface-over",
    highlighted ? "border-2 border-primary" : "border-border",
  );
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="font-bold">{label}</span>
        <span className="text-s text-text-sub">{text}</span>
      </span>
      <Icon name="chevron" className="size-xs text-text-sub" />
    </>
  );
  return <li className="flex flex-col">{children(className, content)}</li>;
}

/**
 * 入っているチームの印（チームに入れた運用アカウントだけ。押すとチームの画面。threads-021）。
 * 名前は運用アカウントの一覧（切り替えと同じ問い合わせ）から読む。一覧にないもの（読むだけで見ているもの）は出さない。
 * @param props 運用アカウントの ID（accountId）
 * @returns 印の要素
 */
function TeamBadge({ accountId }: { accountId: string }) {
  const placement = useAccountPlacement(accountId);
  if (!placement) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-xxs text-s">
      <Icon name="people" className="size-xs text-text-sub" />
      <span className="text-text-sub">チーム</span>
      <Link
        to="/threads/teams/$teamId"
        params={{ teamId: placement.teamId }}
        className="font-bold text-text-link underline"
      >
        {placement.teamName}
      </Link>
      <span className="text-text-sub">（{placement.organizationName}）</span>
    </p>
  );
}

/**
 * ホームの中身（運用アカウントを読んだあと）。
 * @param props 運用アカウント（account）
 * @returns 要素
 */
function HomeContent({ account }: { account: ThreadsAccount }) {
  const query = useAccountHome(account.id);
  const params = { accountId: account.id };
  return (
    <ThreadsPage title="ホーム" lead={`${account.name}（${accountSecondary(account)}）`}>
      <TeamNotices />
      <TeamBadge accountId={account.id} />
      <IntroGuide />
      <ConnectionBanner account={account} />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <HomeSteps account={account} home={query.data} params={params} />
      )}
    </ThreadsPage>
  );
}

/**
 * 次にやることと、材料のカード。
 * @param props 運用アカウント（account）・材料の数（home）・道の値（params）
 * @returns 要素
 */
function HomeSteps({
  account,
  home,
  params,
}: {
  account: ThreadsAccount;
  home: NonNullable<ReturnType<typeof useAccountHome>["data"]>;
  params: { accountId: string };
}) {
  const can = useThreadsCan();
  const step = homeNextStep(home, {
    connected: account.connectionStatus !== "not_connected",
    approvedCount: account.counts.approved,
    canConnect: can.manage,
  });
  return (
    <>
      <section aria-labelledby="threads-next-step" className="flex flex-col gap-xxs">
        <p className="text-s font-bold text-text-sub">次にやること</p>
        <h2 id="threads-next-step" className="text-l leading-tight font-bold">
          {step.title}
        </h2>
        <p className="text-m">{step.body}</p>
        <ButtonRow className="pt-x3s">
          <StepLink accountId={account.id} target={step.target} />
        </ButtonRow>
      </section>
      <nav aria-label="投稿の材料">
        <ul className="grid gap-xxs md:grid-cols-3">
          <MaterialCard
            label="戦略"
            text={`${home.strategy.filledCount}/${home.strategy.total} 入力済み`}
            highlighted={step.target === "strategy"}
          >
            {(className, content) => (
              <Link
                to="/threads/accounts/$accountId/strategy"
                params={params}
                className={className}
              >
                {content}
              </Link>
            )}
          </MaterialCard>
          <MaterialCard
            label="宣伝"
            text={`宣伝の対象 ${home.promotions.targetableCount}件（任意）`}
            highlighted={step.target === "promotions"}
          >
            {(className, content) => (
              <Link
                to="/threads/accounts/$accountId/research"
                params={params}
                hash="threads-promotions"
                className={className}
              >
                {content}
              </Link>
            )}
          </MaterialCard>
          <MaterialCard
            label="リサーチ"
            text={`参考の投稿 ${home.research.referencePostCount}件（任意）`}
            highlighted={step.target === "research"}
          >
            {(className, content) => (
              <Link
                to="/threads/accounts/$accountId/research"
                params={params}
                hash="threads-references"
                className={className}
              >
                {content}
              </Link>
            )}
          </MaterialCard>
        </ul>
      </nav>
    </>
  );
}

/**
 * 運用アカウントのホーム（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 画面の要素
 */
export function HomePage({ accountId }: { accountId: string }) {
  return (
    <AccountGate accountId={accountId}>
      {(account) => <HomeContent account={account} />}
    </AccountGate>
  );
}

const homeRouteApi = getRouteApi("/threads/accounts/$accountId");

/**
 * ホームの道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function HomeRoute() {
  const { accountId } = homeRouteApi.useParams();
  return <HomePage accountId={accountId} />;
}
