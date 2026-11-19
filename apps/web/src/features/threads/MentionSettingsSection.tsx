// 設定の画面の「時間差のメンション」の節（threads-007。めぐるの MentionSettingsSection）：ひとこと・時間差・メンションする人。
// 投稿のあと決めた時間がたつと、その投稿への返信で、選んだ人に @ユーザー名 でメンションする（投稿の案のカードで付ける）。
import {
  MENTION_DELAY_OPTIONS,
  MENTION_LABEL_MAX,
  MENTION_MESSAGE_MAX,
  MENTION_PEOPLE_MAX,
  MentionPersonInput,
  MentionSettingsInput,
  mentionDelayLabel,
} from "@workspace/contracts/threads";
import type { MentionSettings } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import {
  addMentionPerson,
  removeMentionPerson,
  saveMentionSettings,
  updateMentionPerson,
} from "./api.ts";
import { THREADS_QUERY_KEYS, useMentionSettings } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 時間差の選択肢。 */
const DELAY_OPTIONS = MENTION_DELAY_OPTIONS.map((minutes) => ({
  value: String(minutes),
  label: `${mentionDelayLabel(minutes)}後`,
}));

/**
 * ひとことと時間差のフォーム。
 * @param props 運用アカウントの ID・設定
 * @param props.accountId 運用アカウントの ID
 * @param props.settings 設定
 * @returns 要素
 */
function MessageForm({ accountId, settings }: { accountId: string; settings: MentionSettings }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState(settings.message);
  const [delay, setDelay] = useState(String(settings.delayMinutes));
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);

  /** 保存する。 */
  const save = async () => {
    if (pending) return;
    setResult(undefined);
    const parsed = MentionSettingsInput.safeParse({
      message,
      delayMinutes: Number(delay),
      version: settings.version,
    });
    if (!parsed.success) {
      setError(fieldErrorsFromIssues(parsed.error.issues).message);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await saveMentionSettings(accountId, parsed.data);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      setResult({ tone: "success", message: "メンションの設定を保存しました。" });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.message) setError(fields.message);
      else setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-xs">
      <Field
        label="ひとこと"
        description={`任意。${MENTION_MESSAGE_MAX}文字まで。返信の文の初めに置き、次の行に @ユーザー名 が続きます。`}
        error={error}
      >
        <Input
          value={message}
          maxLength={MENTION_MESSAGE_MAX}
          onChange={(change) => setMessage(change.target.value)}
        />
      </Field>
      <ChoiceChips
        label="投稿から返信までの時間"
        options={DELAY_OPTIONS}
        value={delay}
        onValueChange={setDelay}
      />
      <div className="flex flex-col items-start gap-xxs">
        <Button variant="primary" onClick={() => void save()} aria-disabled={pending || undefined}>
          {pending ? "保存しています…" : "メンションの設定を保存"}
        </Button>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </div>
  );
}

/**
 * メンションする人を足すフォーム。
 * @param props 運用アカウントの ID・人数
 * @param props.accountId 運用アカウントの ID
 * @param props.count 今の人数
 * @returns 要素
 */
function AddPersonForm({ accountId, count }: { accountId: string; count: number }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [label, setLabel] = useState("");
  const [always, setAlways] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  const full = count >= MENTION_PEOPLE_MAX;

  /** 足す。 */
  const add = async () => {
    if (pending || full) return;
    setResult(undefined);
    const parsed = MentionPersonInput.safeParse({ username, label, always });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await addMentionPerson(accountId, parsed.data);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      setResult({ tone: "success", message: `「${parsed.data.label}」を足しました。` });
      setUsername("");
      setLabel("");
      setAlways(false);
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setResult({ tone: "danger", message: `足せませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-xs rounded-md border border-border p-xs"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <h3 className="text-m font-bold">メンションする人を足す</h3>
      <Field
        label="Threads のユーザー名"
        description="@ のあとの英数字（例：minato_place）"
        error={errors.username}
        required
      >
        <Input
          value={username}
          autoComplete="off"
          onChange={(change) => setUsername(change.target.value)}
        />
      </Field>
      <Field
        label="呼び名"
        description={`${MENTION_LABEL_MAX}文字まで（画面で見分けるため）`}
        error={errors.label}
        required
      >
        <Input
          value={label}
          maxLength={MENTION_LABEL_MAX}
          onChange={(change) => setLabel(change.target.value)}
        />
      </Field>
      <label className="flex min-h-l items-center gap-xxs text-m">
        <input
          type="checkbox"
          className="size-s accent-primary"
          checked={always}
          onChange={(change) => setAlways(change.target.checked)}
        />
        いつも付ける（メンションを付けるとき、はじめから選ぶ）
      </label>
      <div className="flex flex-col items-start gap-xxs">
        <Button type="submit" aria-disabled={pending || full || undefined}>
          メンションする人を足す
        </Button>
        {full ? (
          <p className="text-s text-text-sub">{`${MENTION_PEOPLE_MAX}人まで足せます。`}</p>
        ) : null}
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/**
 * 時間差のメンションの節。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 節の要素
 */
export function MentionSettingsSection({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const query = useMentionSettings(accountId);
  const [removing, setRemoving] = useState<MentionSettings["people"][number]>();
  const [removeError, setRemoveError] = useState<string>();
  const [removePending, setRemovePending] = useState(false);
  const [rowResult, setRowResult] = useState<Result>();

  /** 消すのを確かめたあと。 */
  const confirmRemove = async () => {
    if (!removing || removePending) return;
    setRemovePending(true);
    setRemoveError(undefined);
    try {
      await removeMentionPerson(accountId, removing.id);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      setRowResult({ tone: "success", message: `「${removing.label}」を消しました。` });
      setRemoving(undefined);
    } catch (caught) {
      setRemoveError(`消せませんでした。${errorMessage(caught)}`);
    } finally {
      setRemovePending(false);
    }
  };

  /**
   * 「いつも付ける」を切り替える。
   * @param person 人
   */
  const toggleAlways = async (person: MentionSettings["people"][number]) => {
    setRowResult(undefined);
    try {
      await updateMentionPerson(accountId, person.id, {
        label: person.label,
        always: !person.always,
      });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
    } catch (caught) {
      setRowResult({ tone: "danger", message: `直せませんでした。${errorMessage(caught)}` });
    }
  };

  return (
    <section aria-labelledby="threads-mention" className="flex flex-col gap-xs">
      <h2 id="threads-mention" className="text-l font-bold">
        時間差のメンション
      </h2>
      <p className="text-s text-text-sub">
        投稿のあと決めた時間がたってから、その投稿への返信で、選んだ人に @ユーザー名
        でメンションします。付けるのは投稿の案のカードからです。同じ人へは24時間に1回までです。夜間（0時〜8時）に来た返信は8時から出し、24時間を過ぎたら出しません。相手がメンションを受けない設定だと、通知されないことがあります。
      </p>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.repliesDenied ? (
            <p className="text-m text-danger-text">
              返信の権限（threads_manage_replies）がないため、メンションの返信を出せません。Meta
              のアプリで権限を足し、トークンを作り直してつなぎ直してください。
            </p>
          ) : null}
          <MessageForm accountId={accountId} settings={query.data} />
          <h3 className="text-m font-bold">メンションする人</h3>
          {query.data.people.length === 0 ? (
            <p className="text-m">まだメンションする人はいません。</p>
          ) : (
            <ul aria-label="メンションする人" className="flex flex-col gap-xxs">
              {query.data.people.map((person) => (
                <li
                  key={person.id}
                  className="flex flex-col gap-x3s rounded-sm border border-border bg-surface p-xxs"
                >
                  <div className="flex flex-wrap items-center gap-xxs">
                    <span className="text-m font-bold">{person.label}</span>
                    <span className="text-s text-text-sub">@{person.username}</span>
                    {person.always ? <Badge variant="success">いつも付ける</Badge> : null}
                    {person.pendingCount > 0 ? (
                      <span className="text-s text-text-sub">{`予定 ${person.pendingCount}件`}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-xxs">
                    <Button size="small" onClick={() => void toggleAlways(person)}>
                      {person.always
                        ? `${person.label}を「いつも付ける」から外す`
                        : `${person.label}を「いつも付ける」にする`}
                    </Button>
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => {
                        setRemoveError(undefined);
                        setRemoving(person);
                      }}
                    >
                      {`${person.label}を消す`}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {rowResult ? (
            <ResponseMessage tone={rowResult.tone}>{rowResult.message}</ResponseMessage>
          ) : null}
          <AddPersonForm accountId={accountId} count={query.data.people.length} />
        </>
      )}
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        title="メンションする人を消します"
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={removePending}
        error={removeError}
        onConfirm={() => void confirmRemove()}
      >
        {removing && removing.pendingCount > 0
          ? `「${removing.label}」を選んだ、まだ出していない返信が${removing.pendingCount}件あります。承認待ち・承認済みの案は返信の文からこの人を外して承認待ちに戻し、投稿済みの予定は出しません。`
          : "消した人は元に戻せません（もう一度足せます）。"}
      </ConfirmDialog>
    </section>
  );
}
