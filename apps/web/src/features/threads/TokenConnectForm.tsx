// 長期のアクセストークンを貼ってつなぐ・つなぎ直す欄（threads-002 の欄を threads-012 でめぐるの TokenConnectForm にそろえた）。
// - 5つの短い手順と「詳しい手順を見る」（新しいタブ）
// - 欄はパスワードの欄にしない（ブラウザやパスワードの管理の道具にトークンを残させない）。隠している間は「•」だけを出し、
//   本当の値はこの部品の状態だけで持つ。「表示」「隠す」で切りかえる
// - 送る前に形を確かめ、合わなければ欄のそばに出す（数える失敗にしない）
// - 確かめの失敗が続いて待たされたら、待ちが終わるまでボタンを止める
// - 自分の別の運用アカウントがつないでいたら、アカウントの一覧へ案内する
// - 注意の文のあとに、利用規約とプライバシーポリシーへのリンク（新しいタブ。貼りかけのトークンを失わないため。suite-002）
// トークンの値は保存しない（送ったら欄を空にする）。入力の誤りは欄のそば、送った結果はボタンの近く（EXPERIENCE.md）。
import {
  THREADS_ERRORS,
  TOKEN_CHECK_LOCK_MINUTES,
  TOKEN_WARNING_LABELS,
  cleanToken,
  isTokenShaped,
} from "@workspace/contracts/threads";
import type { ConnectResult } from "@workspace/contracts/threads";
import { Link } from "@tanstack/react-router";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import { LegalLink } from "../suite/index.ts";
import { connectThreads } from "./api.ts";
import { AccountSwitchSteps } from "./ConnectGuide.tsx";
import {
  TOKEN_MASK,
  TOKEN_STEPS,
  isAccountSwitchError,
  lockedUntilLabel,
  unmask,
} from "./connect-guide.ts";
import { threadsPaths } from "./paths.ts";

/** TokenConnectForm が受け取るもの。 */
export type TokenConnectFormProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** つないでいるか（つなぎ直しを含む） */
  connected: boolean;
  /** 今つないでいる Threads のユーザー名（@ なし。未接続は null） */
  username: string | null;
  /** つないだあと（問い合わせを読み直す） */
  onConnected: (result: ConnectResult) => Promise<void>;
};

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string; code?: string };

/**
 * トークンを貼ってつなぐ欄。
 * @param props 運用アカウントの ID（accountId）・つないでいるか（connected）・今のユーザー名（username）・つないだあと（onConnected）
 * @returns 要素
 */
export function TokenConnectForm({
  accountId,
  connected,
  username,
  onConnected,
}: TokenConnectFormProps) {
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [notes, setNotes] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const again = connected ? "つなぎ直す" : "つなぐ";

  // 待ちの時間が過ぎたら、ボタンを戻す
  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = setTimeout(() => setLockedUntil(null), Math.max(0, lockedUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [lockedUntil]);

  /**
   * つなぐ。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending || lockedUntil !== null) return;
    setResult(undefined);
    setNotes([]);
    const cleaned = cleanToken(token);
    if (!cleaned) {
      setError("トークンを貼ってください。");
      return;
    }
    if (!isTokenShaped(cleaned)) {
      setError(
        "トークンの形ではないようです。「ユーザートークン生成ツール」で作ったトークンを、そのまま貼ってください。",
      );
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const outcome = await connectThreads(accountId, cleaned);
      setToken("");
      await onConnected(outcome);
      setResult({
        tone: "success",
        message: `@${outcome.connection.username ?? ""} に${outcome.kind === "connect" ? "つなぎました" : "つなぎ直しました"}。`,
      });
      setNotes(outcome.warnings.map((warning) => TOKEN_WARNING_LABELS[warning]));
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.token) {
        setError(fields.token);
        return;
      }
      const code = caught instanceof ApiError ? caught.code : undefined;
      if (code === THREADS_ERRORS.THREADS_TOKEN_CHECK_LOCKED.code) {
        // 待ちの残りは応答に入らないので、いちばん長い待ち（5回目の失敗から10分）だけ止める【仮決め】
        const until = Date.now() + TOKEN_CHECK_LOCK_MINUTES * 60_000;
        setLockedUntil(until);
        setResult({
          tone: "danger",
          message: `${errorMessage(caught)}（${lockedUntilLabel(until)}ごろから、また貼れます）`,
          code,
        });
        return;
      }
      setResult({ tone: "danger", message: `つなげませんでした。${errorMessage(caught)}`, code });
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(submitEvent) => void submit(submitEvent)}
      className="flex flex-col gap-xs"
    >
      <div className="flex flex-col gap-xxs">
        <p className="text-m font-bold">自分の Meta のアプリのトークンでつなぐ</p>
        <Disclosure summary={`トークンの作り方（${TOKEN_STEPS.length}つの手順）`}>
          <ol className="list-decimal pl-s text-s">
            {TOKEN_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <a
            className="text-s text-text-link underline"
            href={threadsPaths.tokenGuide()}
            target="_blank"
            rel="noreferrer"
          >
            詳しい手順を見る（新しいタブ）
          </a>
        </Disclosure>
      </div>
      <Field
        label="長期のアクセストークン"
        description="周りに人がいない所で貼ってください。"
        error={error}
        required={!connected}
      >
        <div className="flex gap-xxs">
          <Input
            type="text"
            name="threads-access-token"
            className="min-w-0 flex-1 font-mono"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore=""
            data-lpignore="true"
            value={visible ? token : TOKEN_MASK.repeat(token.length)}
            onChange={(change) =>
              setToken(visible ? change.target.value : unmask(token, change.target.value))
            }
            onPaste={(paste) => {
              if (visible) return;
              // 隠している間の貼りつけは、欄の中身を貼った文字で置きかえる（ふつうは1回で全部を貼る）
              paste.preventDefault();
              setToken(paste.clipboardData.getData("text"));
            }}
          />
          <Button
            type="button"
            onClick={() => setVisible((shown) => !shown)}
            aria-pressed={visible}
          >
            {visible ? "隠す" : "表示"}
          </Button>
        </div>
      </Field>
      <Disclosure summary="トークンの扱い">
        <p className="text-s text-text-sub">
          トークンは暗号にして持ち、画面には二度と出しません。この Threads
          のアカウントの投稿と、プロフィール・反応の数を読むためだけに使います。
        </p>
      </Disclosure>
      <p className="text-s text-text-sub">
        トークンと投稿の扱いは、
        <LegalLink to="terms" newTab />と<LegalLink to="privacy" newTab />
        に書いています（どちらも新しいタブで開きます）。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button
            type="submit"
            variant="primary"
            aria-disabled={pending || lockedUntil !== null || undefined}
          >
            {pending ? "確かめています…" : again}
          </Button>
        </ButtonRow>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        {result?.code === THREADS_ERRORS.THREADS_ACCOUNT_REGISTERED.code ? (
          <Link to={threadsPaths.accounts()} className="text-s text-text-link underline">
            アカウントの一覧で、つないでいるアカウントを確かめる
          </Link>
        ) : null}
        {isAccountSwitchError(result?.code) ? (
          <AccountSwitchSteps expected={connected ? username : null} again={again} />
        ) : null}
        {notes.map((note) => (
          <p key={note} className="text-s text-text-sub">
            {note}
          </p>
        ))}
      </div>
    </form>
  );
}
