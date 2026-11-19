// 設定 › アカウント（/settings/account。core-005）。どのアプリでも使う、本人のアカウント。
// - ログインしている人：表示名・ログインの方法（LINE）・登録した日・使えるアプリ。「ログアウト」（結果はボタンのそば）
// - 退会する：アカウントと、すべてのアプリの本人の記録を消す。消える記録と、元に戻せないことを確かめの枠に書く（AD-7・AD-19）。
//   ほかの人が書きこむ記録を持っていれば、API が 409 を返すので、枠の中にその文を出す
// ログアウト・退会のあとは、すべてのアプリの画面へ移り、画面の上の知らせの帯で伝える（画面が切り替わるため）。
import type { CurrentAccountView } from "@workspace/contracts/account";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate, signOut, useSession, withdrawAccount } from "../account/index.ts";
import { useVisibleApps } from "./queries.ts";

/** 登録した日の見せ方（日本時間の「2026年11月19日」）。 */
const JST_DATE = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** ログアウト・退会のあとに移る先。 */
const AFTER_SIGN_OUT_PATH = "/apps";

/**
 * ログインしている人のまとまり（表示名・ログインの方法・登録した日・使えるアプリ・ログアウト）。
 * @param props 今の利用者（account）
 * @returns 要素
 */
function AccountSummary({ account }: { account: CurrentAccountView }) {
  const { status, apps } = useVisibleApps();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const logout = async () => {
    setPending(true);
    setError(undefined);
    try {
      await signOut(queryClient);
      showNotice({ tone: "success", message: "ログアウトしました。", path: AFTER_SIGN_OUT_PATH });
      await navigate({ to: AFTER_SIGN_OUT_PATH });
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="account-summary-heading"
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-s"
    >
      <h2 id="account-summary-heading" className="text-l leading-tight font-bold">
        ログインしている人
      </h2>
      <dl className="flex flex-col gap-xxs text-m">
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">表示名</dt>
          <dd className="min-w-0 break-words">{account.displayName || "（名前なし）"}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">ログインの方法</dt>
          <dd>LINE</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">登録した日</dt>
          <dd>{JST_DATE.format(new Date(account.registeredAt))}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">使えるアプリ</dt>
          <dd>
            {status === "success" ? apps.map((app) => app.name).join("・") || "なし" : "…"}（
            <Link to="/apps" className="text-text-link underline">
              すべてのアプリ
            </Link>
            ）
          </dd>
        </div>
      </dl>
      <div className="flex flex-col items-start gap-xxs">
        <Button
          aria-disabled={pending ? true : undefined}
          aria-busy={pending ? true : undefined}
          onClick={() => {
            if (!pending) void logout();
          }}
        >
          {pending ? "ログアウトしています" : "ログアウト"}
        </Button>
        {error ? <ResponseMessage tone="danger">{error}</ResponseMessage> : null}
      </div>
    </section>
  );
}

/**
 * 退会のまとまり（消える記録を書き、確かめの枠で確かめてから消す）。
 * @returns 要素
 */
function Withdraw() {
  const { status, apps } = useVisibleApps();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const records =
    status === "success" && apps.length > 0
      ? `（${apps.map((app) => `${app.name}の${app.accountData}`).join("、")}）`
      : "";

  const confirm = async () => {
    setPending(true);
    setError(undefined);
    try {
      await withdrawAccount(queryClient);
      setOpen(false);
      showNotice({
        tone: "success",
        message: "退会しました。アカウントと、すべてのアプリの記録を消しました。",
        path: AFTER_SIGN_OUT_PATH,
      });
      await navigate({ to: AFTER_SIGN_OUT_PATH });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="withdraw-heading" className="flex flex-col gap-xxs">
      <h2 id="withdraw-heading" className="text-l leading-tight font-bold">
        退会する
      </h2>
      <p className="text-m">
        アカウントと、すべてのアプリのあなたの記録{records}を消します。元に戻せません。
      </p>
      <div>
        <Button
          variant="danger"
          onClick={() => {
            setError(undefined);
            setOpen(true);
          }}
        >
          退会する
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="退会しますか"
        confirmLabel="退会する"
        pendingLabel="退会しています"
        pending={pending}
        error={error}
        onConfirm={() => void confirm()}
      >
        <p>
          アカウントと、すべてのアプリのあなたの記録{records}
          を消します。ログインもできなくなります。消したものは元に戻せません。
        </p>
      </ConfirmDialog>
    </section>
  );
}

/**
 * アカウントの中身（ログインしているときだけ）。
 * @returns 要素
 */
function AccountContent() {
  const session = useSession();
  if (session.status !== "authenticated") return null;
  return (
    <Page title="アカウント" lead="どのアプリでも使う、あなたのアカウントです。">
      <AccountSummary account={session.account} />
      <Withdraw />
    </Page>
  );
}

/**
 * 設定 › アカウントの画面。
 * @returns 画面の要素
 */
export function AccountSettingsPage() {
  return (
    <SessionGate>
      <AccountContent />
    </SessionGate>
  );
}
