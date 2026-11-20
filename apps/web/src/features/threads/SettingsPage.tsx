// 運用アカウントの設定：名前・Threads への接続と自動投稿（threads-002。AutoPostSettings.tsx）・投稿のルール（1行に1つ。プロンプトに入る）・
// 時間差のメンション（threads-007。MentionSettingsSection.tsx）・NG ワード（含む案は承認できない）・操作の記録（threads-005。ActivitySection.tsx）・アカウントを消す。
// 入力の誤りは欄のそば、送った結果は押したボタンの近く。消す前は確かめ、消したら一覧へ移って知らせの帯で伝える（EXPERIENCE.md）。
import {
  CORE_RULES_MAX,
  NG_WORD_MAX,
  CoreRulesInput,
  NgWordInput,
  ThreadsAccountInput,
} from "@workspace/contracts/threads";
import type { PostingRules, ThreadsAccount } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { ActivitySection } from "./ActivitySection.tsx";
import { ConnectionSection, ScheduleSection } from "./AutoPostSettings.tsx";
import { MentionSettingsSection } from "./MentionSettingsSection.tsx";
import { addNgWord, deleteAccount, deleteNgWord, renameAccount, saveCoreRules } from "./api.ts";
import { threadsPaths } from "./paths.ts";
import { THREADS_QUERY_KEYS, usePostingRules } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 節が受け取るもの。 */
type SectionProps = {
  /** 運用アカウント */
  account: ThreadsAccount;
};

/**
 * 名前を直す節。
 * @param props 運用アカウント（account）
 * @returns 節の要素
 */
function NameSection({ account }: SectionProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(account.name);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setResult(undefined);
    const parsed = ThreadsAccountInput.safeParse({ name });
    if (!parsed.success) {
      setError(fieldErrorsFromIssues(parsed.error.issues).name);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await renameAccount(account.id, parsed.data.name);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.all });
      setResult({ tone: "success", message: "名前を保存しました。" });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.name) setError(fields.name);
      else setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="threads-name" className="flex flex-col gap-xs">
      <h2 id="threads-name" className="text-l font-bold">
        アカウントの名前
      </h2>
      <form
        noValidate
        onSubmit={(submitEvent) => void submit(submitEvent)}
        className="flex flex-col gap-xs"
      >
        <Field label="名前" error={error} required>
          <Input
            autoComplete="off"
            value={name}
            onChange={(change) => setName(change.target.value)}
          />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit" aria-disabled={pending || undefined}>
            {pending ? "保存しています…" : "名前を保存"}
          </Button>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      </form>
    </section>
  );
}

/** RulesSection が受け取るもの。 */
type RulesSectionProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 読んだ投稿のルールと NG ワード */
  rules: PostingRules;
};

/**
 * 投稿のルールの節。
 * @param props 運用アカウントの ID（accountId）・投稿のルールと NG ワード（rules）
 * @returns 節の要素
 */
function CoreRulesSection({ accountId, rules }: RulesSectionProps) {
  const queryClient = useQueryClient();
  const [coreRules, setCoreRules] = useState(rules.coreRules);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setResult(undefined);
    const parsed = CoreRulesInput.safeParse({ coreRules });
    if (!parsed.success) {
      setError(fieldErrorsFromIssues(parsed.error.issues).coreRules);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const saved = await saveCoreRules(accountId, parsed.data.coreRules);
      queryClient.setQueryData(THREADS_QUERY_KEYS.postingRules(accountId), saved);
      setResult({ tone: "success", message: "投稿のルールを保存しました。" });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.coreRules) setError(fields.coreRules);
      else setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="threads-core-rules" className="flex flex-col gap-xs">
      <h2 id="threads-core-rules" className="text-l font-bold">
        投稿のルール
      </h2>
      <form
        noValidate
        onSubmit={(submitEvent) => void submit(submitEvent)}
        className="flex flex-col gap-xs"
      >
        <Field
          label="守ってほしいこと"
          description={`1行に1つ。案を作るプロンプトに入ります（${CORE_RULES_MAX.toLocaleString("ja-JP")}文字まで）。`}
          error={error}
        >
          <Textarea
            rows={6}
            placeholder={"例: 絵文字は1投稿に1つまで\n例: 最後は問いかけで終える"}
            value={coreRules}
            onChange={(change) => setCoreRules(change.target.value)}
          />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit" aria-disabled={pending || undefined}>
            {pending ? "保存しています…" : "投稿のルールを保存"}
          </Button>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      </form>
    </section>
  );
}

/**
 * NG ワードの節。
 * @param props 運用アカウントの ID（accountId）・投稿のルールと NG ワード（rules）
 * @returns 節の要素
 */
function NgWordsSection({ accountId, rules }: RulesSectionProps) {
  const queryClient = useQueryClient();
  const [word, setWord] = useState("");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  const [removingId, setRemovingId] = useState<string>();

  /**
   * 投稿のルールと NG ワードを読み直す（承認の判定も変わるので、運用アカウントの問い合わせをまとめて）。
   * @returns 読み直しの終わり
   */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });

  /**
   * 足す。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setResult(undefined);
    const parsed = NgWordInput.safeParse({ word });
    if (!parsed.success) {
      setError(fieldErrorsFromIssues(parsed.error.issues).word);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await addNgWord(accountId, parsed.data.word);
      await refresh();
      setWord("");
      setResult({ tone: "success", message: `「${parsed.data.word}」を足しました。` });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.word) setError(fields.word);
      else setResult({ tone: "danger", message: `足せませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  /**
   * 外す。
   * @param ngWordId NG ワードの ID
   * @param label NG ワード
   */
  const remove = async (ngWordId: string, label: string) => {
    if (removingId) return;
    setResult(undefined);
    setRemovingId(ngWordId);
    try {
      await deleteNgWord(accountId, ngWordId);
      await refresh();
      setResult({ tone: "success", message: `「${label}」を外しました。` });
    } catch (caught) {
      setResult({ tone: "danger", message: `外せませんでした。${errorMessage(caught)}` });
    } finally {
      setRemovingId(undefined);
    }
  };

  return (
    <section aria-labelledby="threads-ng-words" className="flex flex-col gap-xs">
      <h2 id="threads-ng-words" className="text-l font-bold">
        NGワード
      </h2>
      <p className="text-m">NGワードを含む案は承認できません。案を作るプロンプトにも入ります。</p>
      {rules.ngWords.length === 0 ? (
        <p className="text-m text-text-sub">まだNGワードはありません。</p>
      ) : (
        <ul aria-label="NGワードの一覧" className="flex flex-wrap gap-xxs">
          {rules.ngWords.map((ngWord) => (
            <li
              key={ngWord.id}
              className="flex items-center gap-x3s rounded-sm border border-border-input bg-surface pl-xxs"
            >
              <span className="text-m">{ngWord.word}</span>
              <Button
                variant="text"
                size="small"
                aria-label={`「${ngWord.word}」を外す`}
                aria-disabled={removingId === ngWord.id || undefined}
                onClick={() => void remove(ngWord.id, ngWord.word)}
              >
                外す
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        noValidate
        onSubmit={(submitEvent) => void submit(submitEvent)}
        className="flex flex-col gap-xs"
      >
        <Field label="足すNGワード" description={`${NG_WORD_MAX}文字まで`} error={error}>
          <Input
            autoComplete="off"
            value={word}
            onChange={(change) => setWord(change.target.value)}
          />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit" aria-disabled={pending || undefined}>
            {pending ? "足しています…" : "NGワードを足す"}
          </Button>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      </form>
    </section>
  );
}

/**
 * アカウントを消す節。
 * @param props 運用アカウント（account）
 * @returns 節の要素
 */
function DeleteSection({ account }: SectionProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  /** 消す。 */
  const confirm = async () => {
    if (pending) return;
    setError(undefined);
    setPending(true);
    try {
      await deleteAccount(account.id);
      queryClient.removeQueries({ queryKey: THREADS_QUERY_KEYS.account(account.id) });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.accounts });
      showNotice({
        tone: "success",
        message: `「${account.name}」を消しました。`,
        path: threadsPaths.accounts(),
      });
      await navigate({ to: "/threads" });
    } catch (caught) {
      setError(`消せませんでした。${errorMessage(caught)}`);
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="threads-delete" className="flex flex-col gap-xs">
      <h2 id="threads-delete" className="text-l font-bold">
        アカウントを消す
      </h2>
      <p className="text-m">
        戦略・投稿の案・投稿のルール・NGワード・Threads への接続も一緒に消えます。元に戻せません。
      </p>
      <div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          このアカウントを消す
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`「${account.name}」を消します`}
        confirmLabel="削除"
        pendingLabel="消しています…"
        pending={pending}
        error={error}
        onConfirm={() => void confirm()}
      >
        戦略・投稿の案・投稿のルール・NGワードも一緒に消えます。元に戻せません。
      </ConfirmDialog>
    </section>
  );
}

/**
 * 設定の画面の中身。
 * @param props 運用アカウント（account）
 * @returns 画面の要素
 */
function SettingsContent({ account }: SectionProps) {
  const rules = usePostingRules(account.id);
  return (
    <Page title="設定" lead={account.name}>
      <div className="flex max-w-form flex-col gap-l">
        <NameSection account={account} />
        <ConnectionSection accountId={account.id} />
        <ScheduleSection accountId={account.id} />
        <MentionSettingsSection accountId={account.id} />
        {rules.isPending ? (
          <Loading />
        ) : rules.isError ? (
          <LoadFailure error={rules.error} retry={() => void rules.refetch()} />
        ) : (
          <>
            <CoreRulesSection accountId={account.id} rules={rules.data} />
            <NgWordsSection accountId={account.id} rules={rules.data} />
          </>
        )}
        <ActivitySection accountId={account.id} />
        <DeleteSection account={account} />
      </div>
    </Page>
  );
}

/** SettingsPage が受け取るもの。 */
export type SettingsPageProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 設定の画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @returns 画面の要素
 */
export function SettingsPage({ accountId }: SettingsPageProps) {
  return (
    <AccountGate accountId={accountId}>
      {(account) => <SettingsContent account={account} />}
    </AccountGate>
  );
}

const settingsRouteApi = getRouteApi("/threads/accounts/$accountId/settings");

/**
 * 設定の道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function SettingsRoute() {
  const { accountId } = settingsRouteApi.useParams();
  return <SettingsPage accountId={accountId} />;
}
