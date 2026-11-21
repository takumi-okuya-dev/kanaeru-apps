// 運用アカウントの設定：名前・Threads への接続と自動投稿（threads-002。AutoPostSettings.tsx）・投稿のルール（1行に1つ。プロンプトに入る）・
// 時間差のメンション（threads-007。MentionSettingsSection.tsx）・NG ワード（含む案は承認できない）・組織（threads-013。TeamSection.tsx）・
// 操作の記録（threads-005。ActivitySection.tsx）・アカウントを消す。担当の人には読むだけの画面を出す（threads-013）。
// 入力の誤りは欄のそば、送った結果は押したボタンの近く。消す前は確かめ、消したら一覧へ移って知らせの帯で伝える（EXPERIENCE.md）。
import {
  CORE_RULES_MAX,
  NG_WORD_LIMIT,
  NG_WORD_MAX,
  CoreRulesInput,
  THREADS_ERRORS,
  ThreadsAccountInput,
  confirmNameMatches,
  splitNgWords,
} from "@workspace/contracts/threads";
import type { PostingRules, ThreadsAccount } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { ActivitySection } from "./ActivitySection.tsx";
import { ConnectionSection, ScheduleSection } from "./AutoPostSettings.tsx";
import { MentionSettingsSection } from "./MentionSettingsSection.tsx";
import { PolicyInfo } from "./PolicyInfoDialog.tsx";
import { addNgWords, deleteAccount, deleteNgWord, renameAccount, saveCoreRules } from "./api.ts";
import { threadsPaths } from "./paths.ts";
import { THREADS_QUERY_KEYS, usePostingRules } from "./queries.ts";
import { useThreadsAccess, useThreadsCan } from "./team-access.ts";
import { TeamSection } from "./TeamSection.tsx";

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
      <PolicyInfo />
    </section>
  );
}

/**
 * NG ワードの節。threads-011：改行・「、」で区切ってまとめて足せる。もうある語は知らせ、足した語を含む承認済みの案は承認待ちに戻る。
 * @param props 運用アカウントの ID（accountId）・投稿のルールと NG ワード（rules）
 * @returns 節の要素
 */
function NgWordsSection({ accountId, rules }: RulesSectionProps) {
  const queryClient = useQueryClient();
  const [word, setWord] = useState("");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ tone: "success" | "danger" | "info"; message: string }>();
  const [pending, setPending] = useState(false);
  const [removingId, setRemovingId] = useState<string>();
  const atLimit = rules.ngWords.length >= NG_WORD_LIMIT;

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
    const words = splitNgWords(word);
    if (words.length === 0) {
      setError("NGワードを入れてください。");
      return;
    }
    const tooLong = words.find((item) => [...item].length > NG_WORD_MAX);
    if (tooLong) {
      setError(`「${tooLong}」が長すぎます。NGワードは1語${NG_WORD_MAX}文字までにしてください。`);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const saved = await addNgWords(accountId, words);
      await refresh();
      setWord("");
      const parts = [
        saved.added.length > 0
          ? `${saved.added.map((item) => `「${item.word}」`).join("")}を足しました。`
          : "",
        saved.duplicates.length > 0
          ? `${saved.duplicates.map((item) => `「${item}」`).join("")}は、もうあります。`
          : "",
        saved.reopenedCount > 0
          ? `NGワードを含む承認済みの案${saved.reopenedCount}件を、承認待ちに戻しました。`
          : "",
      ];
      setResult({
        tone: saved.added.length > 0 ? "success" : "info",
        message: parts.join(""),
      });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      const fieldError = Object.entries(fields).find(([path]) => path.startsWith("words"))?.[1];
      if (fieldError) setError(fieldError);
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
      <Disclosure summary="見分け方">
        <p className="text-s text-text-sub">
          全角・半角、大文字・小文字の違いは同じ言葉として扱います。
        </p>
      </Disclosure>
      <p className="text-s text-text-sub">
        {rules.ngWords.length}／{NG_WORD_LIMIT}語
      </p>
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
        <Field
          label="足すNGワード"
          description={
            atLimit
              ? `上限（${NG_WORD_LIMIT}語）に達しています。使わないNGワードを外してから足してください。`
              : `改行か「、」で区切ると、まとめて足せます（1語${NG_WORD_MAX}文字まで）。足した語を含む承認済みの案は、承認待ちに戻ります。`
          }
          error={error}
        >
          <Textarea
            rows={3}
            value={word}
            disabled={atLimit}
            placeholder="例：絶対、必ず儲かる"
            onChange={(change) => setWord(change.target.value)}
          />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit" disabled={atLimit} aria-disabled={pending || undefined}>
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
  const [confirmName, setConfirmName] = useState("");
  const [nameError, setNameError] = useState<string>();

  /**
   * 開く・閉じる（閉じたら入れた名前を消す）。
   * @param next 開くか
   */
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setConfirmName("");
      setNameError(undefined);
      setError(undefined);
    }
  };

  /** 消す（名前が合うときだけ送る。API も同じ比べ方で確かめる。threads-012）。 */
  const confirm = async () => {
    if (pending) return;
    setError(undefined);
    if (!confirmNameMatches(confirmName, account.name)) {
      setNameError(
        confirmName.trim() === ""
          ? "消すアカウントの名前を入れてください。"
          : THREADS_ERRORS.THREADS_ACCOUNT_NAME_MISMATCH.message,
      );
      return;
    }
    setNameError(undefined);
    setPending(true);
    try {
      await deleteAccount(account.id, confirmName);
      queryClient.removeQueries({ queryKey: THREADS_QUERY_KEYS.account(account.id) });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.accounts });
      showNotice({
        tone: "success",
        message: `「${account.name}」を消しました。`,
        path: threadsPaths.accounts(),
      });
      await navigate({ to: "/threads/accounts" });
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.code === THREADS_ERRORS.THREADS_ACCOUNT_NAME_MISMATCH.code
      )
        setNameError(THREADS_ERRORS.THREADS_ACCOUNT_NAME_MISMATCH.message);
      else setError(`消せませんでした。${errorMessage(caught)}`);
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
        onOpenChange={changeOpen}
        title={`「${account.name}」を消します`}
        confirmLabel="削除"
        pendingLabel="消しています…"
        pending={pending}
        error={error}
        onConfirm={() => void confirm()}
      >
        <div className="flex flex-col gap-xs">
          <p>戦略・投稿の案・投稿のルール・NGワードも一緒に消えます。元に戻せません。</p>
          <Field
            label="確かめのため、アカウントの名前を入れてください"
            description={`「${account.name}」とそのまま入れます。`}
            error={nameError}
          >
            <Input
              autoComplete="off"
              value={confirmName}
              onChange={(change) => setConfirmName(change.target.value)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter") {
                  keyEvent.preventDefault();
                  void confirm();
                }
              }}
            />
          </Field>
        </div>
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
  const can = useThreadsCan();
  // 担当の人（持ち主でない人）には、変える操作を出さずに読むだけで出す（threads-013。判定の正は API）
  if (!can.manage) return <AssigneeSettings account={account} rulesQuery={rules} />;
  return (
    <ThreadsPage title="設定" lead={account.name}>
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
        <TeamSection accountId={account.id} owner />
        <ActivitySection accountId={account.id} />
        <DeleteSection account={account} />
      </div>
    </ThreadsPage>
  );
}

/**
 * 担当の人の設定の画面（読むだけ。チームのカード・投稿のルールと NG ワード・管理者なら操作の記録。threads-013）。
 * @param props 運用アカウント（account）・投稿のルールの問い合わせ（rulesQuery）
 * @returns 画面の要素
 */
function AssigneeSettings({
  account,
  rulesQuery,
}: SectionProps & { rulesQuery: ReturnType<typeof usePostingRules> }) {
  const access = useThreadsAccess();
  const can = useThreadsCan();
  return (
    <ThreadsPage title="設定" lead={account.name}>
      <div className="flex max-w-form flex-col gap-l">
        <p role="status" className="rounded-sm border border-border bg-surface-sunken p-xs text-m">
          {access?.ownerName || "持ち主"}
          さんの運用アカウントです。設定・Threads
          への接続・消すのは持ち主だけなので、ここでは読むだけです。
        </p>
        <TeamSection accountId={account.id} owner={false} />
        {rulesQuery.isPending ? (
          <Loading />
        ) : rulesQuery.isError ? (
          <LoadFailure error={rulesQuery.error} retry={() => void rulesQuery.refetch()} />
        ) : (
          <section aria-labelledby="threads-rules-readonly" className="flex flex-col gap-xs">
            <h2 id="threads-rules-readonly" className="text-l font-bold">
              投稿のルールと NG ワード
            </h2>
            {rulesQuery.data.coreRules.trim() ? (
              <p className="text-m break-words whitespace-pre-wrap">{rulesQuery.data.coreRules}</p>
            ) : (
              <p className="text-m">投稿のルールはまだありません。</p>
            )}
            <p className="text-m">
              NGワード：
              {rulesQuery.data.ngWords.length > 0
                ? rulesQuery.data.ngWords.map((ngWord) => ngWord.word).join("、")
                : "なし"}
            </p>
          </section>
        )}
        {can.activity ? <ActivitySection accountId={account.id} /> : null}
      </div>
    </ThreadsPage>
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
