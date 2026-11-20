// 運用アカウントの一覧（Threads の運用の入口）。アカウントごとに承認待ち・承認済みの数を出し、名前から投稿の案へ移る。
// 下に「アカウントを作る」（名前だけ。Threads への接続はあとで足す）。入力の誤りは欄のそば、送った結果はボタンの近く。
import type { ThreadsAccount } from "@workspace/contracts/threads";
import { ThreadsAccountInput } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { createAccount } from "./api.ts";
import { threadsPaths } from "./paths.ts";
import { THREADS_QUERY_KEYS, useThreadsAccounts } from "./queries.ts";

/** AccountCard が受け取るもの。 */
type AccountCardProps = {
  /** 運用アカウント */
  account: ThreadsAccount;
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
          to="/threads/accounts/$accountId/stock"
          params={{ accountId: account.id }}
          className="text-text-link underline"
        >
          {account.name}
        </Link>
      </h2>
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
  /** 上限に達しているか */
  full: boolean;
};

/**
 * アカウントを作るフォーム。作ったら、そのアカウントの戦略の画面へ移る。
 * @param props 上限に達しているか（full）
 * @returns フォームの要素
 */
function CreateAccountForm({ full }: CreateAccountFormProps) {
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
      const path = threadsPaths.strategy(created.id);
      showNotice({
        tone: "success",
        message: "アカウントを作りました。まず戦略を書いてください。",
        path,
      });
      await navigate({
        to: "/threads/accounts/$accountId/strategy",
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
      <h2 id="threads-create-account" className="text-l font-bold">
        アカウントを作る
      </h2>
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
          <Button
            type="submit"
            variant="primary"
            disabled={full}
            aria-disabled={pending || undefined}
          >
            {pending ? "作っています…" : "作る"}
          </Button>
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
  return (
    <Page
      title="Threads のアカウント"
      lead="運用する Threads のアカウントごとに、戦略・投稿の案・承認を管理します。"
    >
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
      <CreateAccountForm full={accounts.length >= limit} />
    </Page>
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
