// 投稿の案の枠（threads-001 の StockPage.tsx から分けた）：本文を直す枠と、理由をつけて却下する枠。
// threads-011：承認済みも直せる（保存すると承認待ちに戻る旨を上に出す）。直している本文に合わせて、文字数と NG ワード・規約に注意を出す。
// 却下の枠は、似ている案・規約に注意があれば、その理由をはじめから選んでおく（めぐるの FR-029）。
import {
  DRAFT_BODY_MAX,
  REJECT_NOTE_MAX,
  REJECT_REASONS,
  THREADS_TEXT_LIMIT,
  checkPublishable,
  threadsLength,
} from "@workspace/contracts/threads";
import type { NgWord, PostDraft, RejectReasonCode } from "@workspace/contracts/threads";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import { updateDraft } from "./api.ts";

/** EditDialog が受け取るもの。 */
type EditDialogProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 直す案（承認待ちか承認済み） */
  draft: PostDraft;
  /** NG ワード（直している本文に合わせて出す） */
  ngWords: readonly NgWord[];
  /** 閉じる */
  onClose: () => void;
  /** 直したあと（reopened：承認済みから承認待ちに戻った） */
  onDone: (reopened: boolean) => Promise<void>;
};

/**
 * 案の本文を直す枠。
 * @param props 運用アカウントの ID・直す案・NG ワード・閉じる・直したあと
 * @returns 枠の要素
 */
export function EditDialog({ accountId, draft, ngWords, onClose, onDone }: EditDialogProps) {
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const length = threadsLength(body);
  const check = checkPublishable(body, [...ngWords]);

  /** 保存する。 */
  const save = async () => {
    if (pending) return;
    setFailure(undefined);
    if (body.trim() === "") {
      setError("本文を入れてください。");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await updateDraft(accountId, draft.id, { body, version: draft.version });
      await onDone(draft.status === "approved");
      onClose();
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.body) setError(fields.body);
      else setFailure(`保存できませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title="案を直す"
      description={
        draft.status === "approved"
          ? "承認済みの案です。保存すると承認待ちに戻り、もう一度承認が要ります。"
          : undefined
      }
      footer={
        <div className="flex flex-col-reverse gap-xxs wide:flex-row wide:justify-end">
          <Button onClick={onClose} aria-disabled={pending || undefined}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            aria-disabled={pending || undefined}
          >
            {pending ? "保存しています…" : "保存"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-xs">
        <Field
          label="本文"
          description={`Threads の上限は${THREADS_TEXT_LIMIT}文字・リンク5つです。`}
          error={error}
          required
        >
          <Textarea
            rows={8}
            maxLength={DRAFT_BODY_MAX}
            value={body}
            onChange={(change) => setBody(change.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-xxs" aria-live="polite">
          <span
            className={
              length > THREADS_TEXT_LIMIT ? "text-s text-danger-text" : "text-s text-text-sub"
            }
          >
            今 {length}／{THREADS_TEXT_LIMIT}文字
            {length > THREADS_TEXT_LIMIT
              ? `（${length - THREADS_TEXT_LIMIT}文字多い）`
              : `（あと${THREADS_TEXT_LIMIT - length}文字）`}
          </span>
          {check.overThreadsLimit && length <= THREADS_TEXT_LIMIT ? (
            <Badge variant="danger">リンクが多すぎます</Badge>
          ) : null}
          {check.ngWords.length > 0 ? (
            <Badge variant="danger">
              NGワード：{check.ngWords.map((hit) => hit.word).join("、")}
            </Badge>
          ) : null}
          {check.policyCautions.map((caution) => (
            <Badge key={caution.id}>規約に注意：{caution.label}</Badge>
          ))}
        </div>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </Dialog>
  );
}

/** RejectDialog が受け取るもの。 */
type RejectDialogProps = {
  /** 却下する案の数 */
  count: number;
  /** はじめから選んでおく理由（似ている案・規約に注意） */
  initialReasons: readonly RejectReasonCode[];
  /** 送っている途中か */
  pending: boolean;
  /** 送れなかった理由 */
  failure: string | undefined;
  /** 閉じる */
  onClose: () => void;
  /** 却下する */
  onSubmit: (reject: { reasons: RejectReasonCode[]; note: string }) => void;
};

/**
 * 理由をつけて却下する枠。理由とメモは、次のプロンプトで「避けること」として使う。
 * @param props 案の数・はじめの理由・送っている途中か・送れなかった理由・閉じる・却下する
 * @returns 枠の要素
 */
export function RejectDialog({
  count,
  initialReasons,
  pending,
  failure,
  onClose,
  onSubmit,
}: RejectDialogProps) {
  const [reasons, setReasons] = useState<RejectReasonCode[]>(() => [...initialReasons]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  /** 却下する。 */
  const reject = () => {
    if (pending) return;
    if (reasons.length === 0 && note.trim() === "") {
      setError("却下の理由を選ぶか、メモを書いてください。");
      return;
    }
    setError(undefined);
    onSubmit({ reasons, note: note.trim() });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={count > 1 ? `${count}件の案を却下する` : "案を却下する"}
      description="理由とメモは、次に作るプロンプトに「避けること」として入ります。"
      footer={
        <div className="flex flex-col-reverse gap-xxs wide:flex-row wide:justify-end">
          <Button onClick={onClose} aria-disabled={pending || undefined}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={reject} aria-disabled={pending || undefined}>
            {pending ? "却下しています…" : "却下する"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-s">
        <fieldset
          className="flex flex-col gap-x3s"
          aria-describedby={error ? "threads-reject-error" : undefined}
        >
          <legend className="mb-x3s text-m font-bold">却下の理由（いくつでも）</legend>
          {REJECT_REASONS.map((reason) => (
            <label key={reason.code} className="flex min-h-l items-center gap-xxs text-m">
              <input
                type="checkbox"
                className="size-s accent-primary"
                checked={reasons.includes(reason.code)}
                onChange={(change) =>
                  setReasons((current) =>
                    change.target.checked
                      ? [...current, reason.code]
                      : current.filter((code) => code !== reason.code),
                  )
                }
              />
              {reason.label}
            </label>
          ))}
          {error ? (
            <p id="threads-reject-error" className="text-s text-danger-text">
              {error}
            </p>
          ) : null}
        </fieldset>
        <Field label="メモ" description={`任意。${REJECT_NOTE_MAX}文字まで`}>
          <Textarea
            rows={3}
            maxLength={REJECT_NOTE_MAX}
            value={note}
            onChange={(change) => setNote(change.target.value)}
          />
        </Field>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </Dialog>
  );
}
