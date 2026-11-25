// 設定の画面の「Threads への接続」と「自動投稿」の節（threads-002）。
// 接続：長期のアクセストークンを貼ってつなぐ（トークンは画面に戻さない）・確かめる・切る（切る前は確かめる）。
// 自動投稿：オン・オフ、時刻（日本時間。夜間の DB の停止のため 08:30〜23:00）、前後10分でずらすか。
// 入力の誤りは欄のそば、送った結果は押したボタンの近く（EXPERIENCE.md）。
import {
  AUTOPOST_SLOT_LIMIT,
  CONNECTION_STATUS_LABELS,
  PostingScheduleSaveInput,
  TOKEN_WARNING_LABELS,
} from "@workspace/contracts/threads";
import type { Connection, PostingScheduleView } from "@workspace/contracts/threads";
import { jstDate } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useId, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { checkConnection, disconnectThreads, savePostingSchedule } from "./api.ts";
import { OauthConnect } from "./OauthConnect.tsx";
import { PublishCheck, scheduleSavedResult } from "./PublishCheck.tsx";
import { TokenConnectForm } from "./TokenConnectForm.tsx";
import { THREADS_QUERY_KEYS, useConnection, usePostingSchedule } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 時刻の欄の1行（同じ時刻が並んでも見分けられるよう ID を持つ）。 */
type TimeRow = { id: string; value: string };

/**
 * 時刻の欄の1行を作る。
 * @param value 時刻（"HH:MM" か空）
 * @returns 1行
 */
function timeRow(value: string): TimeRow {
  return { id: crypto.randomUUID(), value };
}

/** 節が受け取るもの。 */
type SectionProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 接続の状態の札。
 * @param props 接続（connection）
 * @param props.connection 接続
 * @returns 札の要素
 */
function ConnectionBadge({ connection }: { connection: Connection }) {
  const variant =
    connection.status === "connected"
      ? "success"
      : connection.status === "needs_reconnect"
        ? "danger"
        : "neutral";
  return <Badge variant={variant}>{CONNECTION_STATUS_LABELS[connection.status]}</Badge>;
}

/**
 * 「Threads への接続」の節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
export function ConnectionSection({ accountId }: SectionProps) {
  const query = useConnection(accountId);
  return (
    <section aria-labelledby="threads-connection" className="flex flex-col gap-xs">
      <h2 id="threads-connection" className="text-l font-bold">
        Threads への接続
      </h2>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <OauthConnect
            accountId={accountId}
            connected={query.data.status !== "not_connected"}
            username={query.data.username}
          />
          <ConnectionBody accountId={accountId} connection={query.data} />
        </>
      )}
    </section>
  );
}

/**
 * 接続の中身（状態・貼る欄・確かめる・切る）。
 * @param props 運用アカウントの ID（accountId）・接続（connection）
 * @param props.accountId 運用アカウントの ID
 * @param props.connection 接続
 * @returns 要素
 */
function ConnectionBody({ accountId, connection }: { accountId: string; connection: Connection }) {
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<Result>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string>();
  const connected = connection.status !== "not_connected";

  /**
   * 運用アカウントの問い合わせをまとめて読み直す（自動投稿の状態も変わる）。
   * @returns 読み直しの終わり
   */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });

  /** 持っているトークンで確かめる。 */
  const check = async () => {
    if (checking) return;
    setCheckResult(undefined);
    setChecking(true);
    try {
      const checked = await checkConnection(accountId);
      await refresh();
      setCheckResult(
        checked.status === "connected"
          ? { tone: "success", message: "使えることを確かめました。" }
          : {
              tone: "danger",
              message:
                "トークンが使えません。新しい長期のアクセストークンを貼って、つなぎ直してください。",
            },
      );
    } catch (caught) {
      setCheckResult({
        tone: "danger",
        message: `確かめられませんでした。${errorMessage(caught)}`,
      });
    } finally {
      setChecking(false);
    }
  };

  /** 切る（確かめの枠から）。 */
  const confirmDisconnect = async () => {
    if (disconnecting) return;
    setDisconnectError(undefined);
    setDisconnecting(true);
    try {
      await disconnectThreads(accountId);
      await refresh();
      setConfirmOpen(false);
      setCheckResult({ tone: "success", message: "接続を切りました。自動投稿もオフにしました。" });
    } catch (caught) {
      setDisconnectError(`切れませんでした。${errorMessage(caught)}`);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-xxs">
        <ConnectionBadge connection={connection} />
        {connection.username ? <span className="text-m">@{connection.username}</span> : null}
        {connection.expiresAt ? (
          <span className="text-s text-text-sub">
            トークンの期限：{jstDate(connection.expiresAt)}（期限の前に自動で延ばします）
          </span>
        ) : null}
      </div>
      {connection.status === "needs_reconnect" ? (
        <p className="text-m text-danger-text">
          {connection.reconnectHint === "short_lived_token"
            ? "期限の短いトークンだったため、使えなくなりました。長期のアクセストークン（60日）を貼って、つなぎ直してください。"
            : "トークンが使えなくなりました。新しい長期のアクセストークンを貼って、つなぎ直してください。それまで自動投稿は止まります。"}
        </p>
      ) : null}
      {connection.insightsDenied ? (
        <p className="text-s text-text-sub">{TOKEN_WARNING_LABELS.no_insights_permission}</p>
      ) : null}
      {connection.repliesDenied ? (
        <p className="text-s text-text-sub">{TOKEN_WARNING_LABELS.no_replies_permission}</p>
      ) : null}
      <TokenConnectForm
        accountId={accountId}
        connected={connected}
        username={connection.username}
        onConnected={refresh}
      />
      {connected ? (
        <div className="flex flex-col items-start gap-xxs">
          <div className="flex flex-wrap gap-xxs">
            <Button onClick={() => void check()} aria-disabled={checking || undefined}>
              {checking ? "確かめています…" : "接続を確かめる"}
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              接続を切る
            </Button>
          </div>
          {checkResult ? (
            <ResponseMessage tone={checkResult.tone}>{checkResult.message}</ResponseMessage>
          ) : null}
        </div>
      ) : checkResult ? (
        <ResponseMessage tone={checkResult.tone}>{checkResult.message}</ResponseMessage>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Threads への接続を切ります"
        confirmLabel="切る"
        pendingLabel="切っています…"
        pending={disconnecting}
        error={disconnectError}
        onConfirm={() => void confirmDisconnect()}
      >
        持っているトークンを消し、自動投稿をオフにします。投稿の案と投稿済みの記録は残ります。もう一度使うときは、トークンを貼り直してください。
      </ConfirmDialog>
    </>
  );
}

/**
 * 「自動投稿」の節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
export function ScheduleSection({ accountId }: SectionProps) {
  const query = usePostingSchedule(accountId);
  return (
    <section aria-labelledby="threads-schedule" className="flex flex-col gap-xs">
      <h2 id="threads-schedule" className="text-l font-bold">
        自動投稿
      </h2>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <ScheduleForm accountId={accountId} view={query.data} />
      )}
      <PublishCheck accountId={accountId} />
    </section>
  );
}

/**
 * 投稿の設定のフォーム。
 * @param props 運用アカウントの ID（accountId）・投稿の設定と決まり（view）
 * @param props.accountId 運用アカウントの ID
 * @param props.view 投稿の設定と決まり
 * @returns 要素
 */
function ScheduleForm({ accountId, view }: { accountId: string; view: PostingScheduleView }) {
  const queryClient = useQueryClient();
  const { schedule, limits } = view;
  const [enabled, setEnabled] = useState(schedule.enabled);
  // 読み直した設定でオン・オフが変わったら（Threads を切るとオフになる）、欄もそろえる。
  // そろえないと、つなぎ直したあとに欄だけオンのまま残り、時刻を保存するとオンに戻ってしまう
  const [loadedEnabled, setLoadedEnabled] = useState(schedule.enabled);
  if (loadedEnabled !== schedule.enabled) {
    setLoadedEnabled(schedule.enabled);
    setEnabled(schedule.enabled);
  }
  const [rows, setRows] = useState<TimeRow[]>(() =>
    (schedule.slotTimes.length > 0 ? schedule.slotTimes : ["12:00"]).map(timeRow),
  );
  const [jitter, setJitter] = useState(schedule.jitter);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  const timesErrorId = useId();

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setResult(undefined);
    const slotTimes = rows.map((row) => row.value).filter((time) => time !== "");
    const parsed = PostingScheduleSaveInput.safeParse({
      enabled,
      slotTimes,
      jitter,
      version: schedule.version,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const saved = await savePostingSchedule(accountId, parsed.data);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      // オンにしたら、次の投稿の予定か、承認済みの案を用意する案内を添える（threads-012）
      setResult(await scheduleSavedResult(accountId, saved.schedule, saved.connectionCheck));
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.slotTimes || fields.enabled) setErrors(fields);
      else setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  const timesError = errors.slotTimes ?? errors.enabled;
  return (
    <form
      noValidate
      onSubmit={(submitEvent) => void submit(submitEvent)}
      className="flex flex-col gap-xs"
    >
      <p className="text-m">承認した案を、決めた時刻（日本時間）に Threads へ投稿します。</p>
      <Disclosure summary="選べる時刻">
        <p className="text-s text-text-sub">
          夜間（0時〜8時）は DB が止まるため、{limits.earliest}〜{limits.latest}{" "}
          の中から選んでください。時刻は{limits.slots}個までです。
        </p>
      </Disclosure>
      <label className="flex min-h-l items-center gap-xxs text-m">
        <input
          type="checkbox"
          className="size-s accent-primary"
          checked={enabled}
          onChange={(change) => setEnabled(change.target.checked)}
        />
        自動投稿をオンにする
      </label>
      <fieldset
        className="flex flex-col gap-xxs"
        aria-describedby={timesError ? timesErrorId : undefined}
      >
        <legend className="text-m font-bold">投稿の時刻</legend>
        <ul className="flex flex-col gap-xxs">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-xxs">
              <Input
                type="time"
                aria-label={`${index + 1}つ目の時刻`}
                min={limits.earliest}
                max={limits.latest}
                step={60}
                value={row.value}
                aria-invalid={timesError ? true : undefined}
                className="w-auto"
                onChange={(change) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.id === row.id ? { ...item, value: change.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                variant="text"
                size="small"
                aria-label={`${index + 1}つ目の時刻を外す`}
                onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
              >
                外す
              </Button>
            </li>
          ))}
        </ul>
        <div>
          <Button
            size="small"
            disabled={rows.length >= AUTOPOST_SLOT_LIMIT}
            onClick={() => setRows((current) => [...current, timeRow("")])}
          >
            時刻を足す
          </Button>
        </div>
        {timesError ? (
          <p id={timesErrorId} className="text-s text-danger-text">
            {timesError}
          </p>
        ) : null}
      </fieldset>
      <label className="flex min-h-l items-center gap-xxs text-m">
        <input
          type="checkbox"
          className="size-s accent-primary"
          checked={jitter}
          onChange={(change) => setJitter(change.target.checked)}
        />
        時刻を前後{limits.jitterMinutes}分の中でずらす（ずらすときは、時刻どうしを
        {limits.minGapMinutes}分以上あけます）
      </label>
      <div className="flex flex-col items-start gap-xxs">
        <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
          {pending ? "保存しています…" : "自動投稿の設定を保存"}
        </Button>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </form>
  );
}
