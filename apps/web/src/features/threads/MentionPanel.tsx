// 投稿の案のカードの「時間差のメンション」（threads-007。めぐるの MentionPanel）：画面を移らずに、カードの中で人を選び、返信の文を確かめて付ける。
// 承認待ち・承認済みの案は投稿の時間差のあとに返信する（承認済みに付け直すと承認し直し）。投稿済み（7日以内）の案は「返信する」で今から返信する。
import {
  MENTION_FAILURE_LABELS,
  MENTION_PER_REPLY_MAX,
  MENTION_PUBLISHED_DAYS,
  THREADS_TEXT_LIMIT,
  buildMentionText,
  checkPublishable,
  mentionDelayLabel,
  mentionUsernamesIn,
  threadsLength,
  toggleMentionInText,
} from "@workspace/contracts/threads";
import type { MentionSettings, NgWord, PostDraft } from "@workspace/contracts/threads";
import { jstDateTime } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import { attachMention, detachMention } from "./api.ts";
import { THREADS_QUERY_KEYS } from "./queries.ts";

/** MentionPanel が受け取るもの。 */
export type MentionPanelProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 案 */
  draft: PostDraft;
  /** メンションの設定 */
  settings: MentionSettings;
  /** NG ワード */
  ngWords: readonly NgWord[];
};

/**
 * 時間差のメンションを付けられる案か。
 * @param draft 案
 * @param settings 設定
 * @returns 付けられるなら true
 */
function canAttach(draft: PostDraft, settings: MentionSettings): boolean {
  if (settings.people.length === 0 || settings.repliesDenied) return false;
  if (draft.status === "needs_review" || draft.status === "approved") return true;
  if (draft.status !== "published" || !draft.publishedAt || draft.mention) return false;
  return Date.now() - new Date(draft.publishedAt).getTime() <= MENTION_PUBLISHED_DAYS * 86_400_000;
}

/**
 * 今の時間差のメンションの書き出し。
 * @param mention 時間差のメンション
 * @returns 文
 */
function statusText(mention: NonNullable<PostDraft["mention"]>): string {
  const names = mention.usernames.map((name) => `@${name}`).join(" ");
  if (mention.state === "sent")
    return `メンション済み（${mention.sentAt ? jstDateTime(mention.sentAt) : ""}）：${names}`;
  if (mention.state === "failed")
    return `メンションを出せませんでした（${mention.failureReason ? MENTION_FAILURE_LABELS[mention.failureReason] : "理由不明"}）`;
  if (mention.state === "canceled") return "メンションはやめました";
  if (mention.dueAt) return `${jstDateTime(mention.dueAt)}ごろにメンション：${names}`;
  return `投稿の${mention.delayMinutes === null ? "" : mentionDelayLabel(mention.delayMinutes)}後にメンション：${names}`;
}

/**
 * 案のカードの時間差のメンション。
 * @param props 運用アカウントの ID・案・設定・NG ワード
 * @returns 要素（付けられず、付いてもいなければ null）
 */
export function MentionPanel({ accountId, draft, settings, ngWords }: MentionPanelProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string }>();
  const [pending, setPending] = useState(false);
  const mention = draft.mention;
  const published = draft.status === "published";
  const known = settings.people.map((person) => person.username);
  // ほかの案の予定・24時間以内に済みの人は選べない
  const blocked = new Map(
    settings.blocked
      .filter((item) => item.draftId !== draft.id)
      .map((item) => [item.username, item.reason] as const),
  );
  const editable =
    mention?.state === "pending" &&
    (draft.status === "needs_review" || draft.status === "approved");
  const cancellable = mention?.state === "pending" && draft.status !== "publishing";
  if (!mention && !canAttach(draft, settings)) return null;

  /** 付ける・直す枠を開く。 */
  const open = () => {
    const initial =
      mention?.text ??
      buildMentionText(
        settings.message,
        settings.people
          .filter((person) => person.always && !blocked.has(person.username))
          .slice(0, MENTION_PER_REPLY_MAX)
          .map((person) => person.username),
      );
    setText(initial);
    setError(undefined);
    setResult(undefined);
    setEditing(true);
  };

  const chosen = mentionUsernamesIn(text, known);
  const check = checkPublishable(text, [...ngWords]);

  /** 保存する（投稿済みは返信する）。 */
  const save = async () => {
    if (pending) return;
    if (chosen.length === 0) {
      setError("メンションする人を選んでください。");
      return;
    }
    if (chosen.length > MENTION_PER_REPLY_MAX) {
      setError(`1つの返信で選べるのは${MENTION_PER_REPLY_MAX}人までです。`);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await attachMention(accountId, draft.id, { version: draft.version, usernames: chosen, text });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      setEditing(false);
      setResult({
        tone: "success",
        message: published
          ? "数分以内に返信します。"
          : draft.status === "approved"
            ? "メンションを付けました。返信の文が変わったので、承認し直してください。"
            : "メンションを付けました。承認すると、投稿のあとに返信します。",
      });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      setError(fields.text ?? fields.usernames ?? `保存できませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  /** 外す・やめる。 */
  const cancel = async () => {
    if (pending) return;
    setPending(true);
    setResult(undefined);
    try {
      await detachMention(accountId, draft.id);
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      setResult({
        tone: "success",
        message: published ? "メンションをやめました。" : "メンションを外しました。",
      });
    } catch (caught) {
      setResult({ tone: "danger", message: `できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-xxs rounded-sm border border-border bg-surface-sunken p-xs">
      {mention && !editing ? (
        <>
          <p className={mention.state === "failed" ? "text-s text-danger-text" : "text-s"}>
            {statusText(mention)}
          </p>
          <p className="text-s break-words whitespace-pre-wrap text-text-sub">{mention.text}</p>
          {mention.replyPermalink ? (
            <div>
              <a
                href={mention.replyPermalink}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "text", size: "small" })}
              >
                返信を Threads で見る（新しいタブ）
              </a>
            </div>
          ) : null}
        </>
      ) : null}
      {editing ? (
        <div className="flex flex-col gap-xxs">
          <p className="text-s font-bold">
            {published
              ? "今からメンションする（「返信する」を押すと、数分以内に返信します）"
              : `投稿の${mentionDelayLabel(settings.delayMinutes)}後にメンション`}
          </p>
          <div role="group" aria-label="メンションする人" className="flex flex-wrap gap-xxs">
            {settings.people.map((person) => {
              const pressed = chosen.includes(person.username);
              const reason = blocked.get(person.username);
              return (
                <Button
                  key={person.id}
                  size="small"
                  variant={pressed ? "primary" : "secondary"}
                  aria-pressed={pressed}
                  disabled={reason !== undefined && !pressed}
                  onClick={() =>
                    setText((current) => toggleMentionInText(current, person.username))
                  }
                >
                  {`${person.label}（@${person.username}）${reason === "pending" ? "・ほかの投稿で予定" : reason === "recent" ? "・24時間以内に済み" : ""}`}
                </Button>
              );
            })}
          </div>
          <Field
            label="返信の文"
            description={`${threadsLength(text)}／${THREADS_TEXT_LIMIT}文字。@ユーザー名 で一覧の人を選びます。`}
            error={error}
          >
            <Textarea rows={3} value={text} onChange={(change) => setText(change.target.value)} />
          </Field>
          {!check.approvable ? (
            <p className="text-s text-danger-text">
              返信の文に NG ワードがあるか、Threads の上限を超えています。
            </p>
          ) : null}
          <div className="flex flex-wrap gap-xxs">
            <Button
              variant="primary"
              size="small"
              disabled={published && !check.approvable}
              aria-disabled={pending || undefined}
              onClick={() => void save()}
            >
              {published ? "返信する" : "メンションを保存"}
            </Button>
            <Button size="small" variant="secondary" onClick={() => setEditing(false)}>
              やめる
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-xxs">
          {!mention ? (
            <Button size="small" onClick={open}>
              メンションを付ける
            </Button>
          ) : null}
          {editable ? (
            <Button size="small" onClick={open}>
              メンションを直す
            </Button>
          ) : null}
          {cancellable ? (
            <Button
              size="small"
              variant="text"
              aria-disabled={pending || undefined}
              onClick={() => void cancel()}
            >
              {published ? "メンションをやめる" : "メンションを外す"}
            </Button>
          ) : null}
        </div>
      )}
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
    </div>
  );
}
