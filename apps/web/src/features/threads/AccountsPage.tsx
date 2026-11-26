// 運用アカウントの一覧（/threads/accounts）。アカウントごとに @ユーザー名か未接続・要再接続・承認待ち・承認済みの数を出し、
// 名前からそのアカウントのホームへ移る（threads-012）。下に「アカウントを作る」（名前だけ。Threads への接続はあとで足す。
// 作ったらホームへ移る。めぐるの account-new と同じく、1つ以上あれば「登録済み n/上限件」を出す）。
// 入力の誤りは欄のそば、送った結果はボタンの近く。
// 組織で担当している運用アカウントは「担当している運用アカウント」に分けて出し、上限に数えない（threads-013）。
import type { ThreadsAccount, ThreadsAssignedAccount } from "@workspace/contracts/threads";
import { ThreadsAccountInput } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { SessionGate } from "../account/index.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { accountSecondary } from "./AccountSwitcher.tsx";
import { createAccount } from "./api.ts";
import { threadsPaths } from "./paths.ts";
import { THREADS_QUERY_KEYS, useThreadsAccounts } from "./queries.ts";
import { TeamNotices } from "./TeamNotices.tsx";

/** AccountCard が受け取るもの。 */
type AccountCardProps = {
  /** 運用アカウント（担当しているものは持ち主の表示名と組織の名前つき） */
  account: ThreadsAccount | ThreadsAssignedAccount;
};

/**
 * 運用アカウントの1行（カードの形）。
 * @param props 運用アカウント（account）
 * @returns 行の要素
 */
function AccountCard({ account }: AccountCardProps) {
  const headingId = `threads-account-${account.id}`;
  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
    >
      <h2 id={headingId} className="text-l leading-tight font-bold">
        <Link
          to="/threads/accounts/$accountId"
          params={{ accountId: account.id }}
          className="text-text-link underline"
        >
          {account.name}
        </Link>
      </h2>
      {"ownerName" in account ? (
        <p className="text-m text-text-sub">
          {account.ownerName}さんの運用アカウント・組織「{account.organizationName}」
        </p>
      ) : null}
      <p className="flex flex-wrap items-center gap-x-xxs text-m text-text-sub">
        {accountSecondary(account)}
        {account.connectionStatus === "needs_reconnect" ? (
          <Badge variant="danger">要再接続</Badge>
        ) : null}
      </p>
      <dl className="flex flex-wrap gap-x-s gap-y-x3s text-m">
        <div className="flex gap-x-xxs">
          <dt className="text-text-sub">承認待ち</dt>
          <dd className="tabular-nums">{account.counts.needsReview}件</dd>
        </div>
        <div className="flex gap-x-xxs">
          <dt className="text-text-sub">承認済み</dt>
          <dd className="tabular-nums">{account.counts.approved}件</dd>
        </div>
      </dl>
      {account.counts.needsReview > 0 ? (
        <div>
          <Badge>承認待ちがあります</Badge>
        </div>
      ) : null}
    </li>
  );
}

/** CreateAccountForm が受け取るもの。 */
type CreateAccountFormProps = {
  /** 作った数 */
  used: number;
  /** 持てる数の上限 */
  limit: number;
};

/**
 * アカウントを作るフォーム。作ったら、そのアカウントのホームへ移る。
 * @param props 作った数（used）・上限（limit）
 * @returns フォームの要素
 */
function CreateAccountForm({ used, limit }: CreateAccountFormProps) {
  const full = used >= limit;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setFailure(undefined);
    const parsed = ThreadsAccountInput.safeParse({ name });
    if (!parsed.success) {
      setError(fieldErrorsFromIssues(parsed.error.issues).name);
      inputRef.current?.focus();
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const created = await createAccount(parsed.data.name);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.accounts });
      const path = threadsPaths.home(created.id);
      showNotice({
        tone: "success",
        message: `「${created.name}」を作りました（登録済み ${used + 1}/${limit}件）。次にやることから始めてください。`,
        path,
      });
      await navigate({
        to: "/threads/accounts/$accountId",
        params: { accountId: created.id },
      });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.name) {
        setError(fields.name);
        inputRef.current?.focus();
      } else {
        setFailure(`作れませんでした。${errorMessage(caught)}`);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="threads-create-account" className="flex flex-col gap-xs">
      <div className="flex flex-col gap-x3s">
        <h2 id="threads-create-account" className="text-l font-bold">
          アカウントを作る
        </h2>
        {/* はじめての人には数を見せない（めぐるの account-new） */}
        {used > 0 ? (
          <p className="text-m text-text-sub">
            登録済み {used}/{limit}件
          </p>
        ) : null}
      </div>
      <form
        noValidate
        onSubmit={(submitEvent) => void submit(submitEvent)}
        className="flex max-w-form flex-col gap-xs"
      >
        <Field
          label="アカウントの名前"
          description="あとで直せます。Threads への接続は、あとで足します。"
          error={error}
          required
        >
          <Input
            ref={inputRef}
            autoComplete="off"
            value={name}
            onChange={(change) => setName(change.target.value)}
            disabled={full}
          />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <ButtonRow>
            <Button
              type="submit"
              variant="primary"
              disabled={full}
              aria-disabled={pending || undefined}
            >
              {pending ? "作っています…" : "作る"}
            </Button>
          </ButtonRow>
          {full ? (
            <ResponseMessage tone="info">
              これ以上作れません。使わないアカウントを消してから作ってください。
            </ResponseMessage>
          ) : null}
          {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
        </div>
      </form>
    </section>
  );
}

/**
 * 運用アカウントの一覧の中身（ログインのあと）。
 * @returns 画面の要素
 */
function Accounts() {
  const query = useThreadsAccounts();
  if (query.isPending) return <Loading />;
  if (query.isError) {
    return (
      <LoadFailure
        error={query.error}
        retry={() => void query.refetch()}
        notFoundTitle="この画面は使えません"
      />
    );
  }
  const { accounts, limit } = query.data;
  // 担当している運用アカウント（ほかの人のもの。上限に数えない。threads-013）
  const assigned = query.data.assigned ?? [];
  return (
    <ThreadsPage
      title="Threads のアカウント"
      lead="Threads のアカウントごとに、戦略・案・承認を管理します"
    >
      <TeamNotices />
      {accounts.length === 0 ? (
        <p className="text-m">
          まだアカウントはありません。下の「アカウントを作る」から始めてください。
        </p>
      ) : (
        <ul aria-label="アカウントの一覧" className="flex flex-col gap-xs">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </ul>
      )}
      {assigned.length > 0 ? (
        <section aria-labelledby="threads-assigned-accounts" className="flex flex-col gap-xs">
          <h2 id="threads-assigned-accounts" className="text-l font-bold">
            担当している運用アカウント
          </h2>
          <ul aria-label="担当している運用アカウント" className="flex flex-col gap-xs">
            {assigned.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </ul>
        </section>
      ) : null}
      <CreateAccountForm used={accounts.length} limit={limit} />
    </ThreadsPage>
  );
}

/**
 * 運用アカウントの一覧（ログインが要る）。
 * @returns 画面の要素
 */
export function AccountsPage() {
  return (
    <SessionGate>
      <Accounts />
    </SessionGate>
  );
}
