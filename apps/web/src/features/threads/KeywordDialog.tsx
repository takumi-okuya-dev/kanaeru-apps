// リサーチのキーワードを直す枠（threads-012。めぐるの components/research/KeywordFormDialog.tsx の直す振る舞いを写した）。
// 読んだ版と同じときだけ保存する。同じキーワード（照合の形）があれば、欄のそばに出す。直した内容があるまま閉じるときは確かめる。
import { ResearchKeywordInput, SHORT_TEXT_MAX, countChars } from "@workspace/contracts/threads";
import type { ResearchKeyword } from "@workspace/contracts/threads";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { updateKeyword } from "./api.ts";

/** EditKeywordDialog が受け取るもの。 */
export type EditKeywordDialogProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 直すキーワード */
  keyword: ResearchKeyword;
  /** 閉じる */
  onClose: () => void;
  /** 保存したあと（保存したキーワード） */
  onSaved: (saved: ResearchKeyword) => Promise<void>;
};

/**
 * キーワードを直す枠。
 * @param props 運用アカウントの ID・直すキーワード・閉じる・保存したあと
 * @returns 枠の要素
 */
export function EditKeywordDialog({
  accountId,
  keyword,
  onClose,
  onSaved,
}: EditKeywordDialogProps) {
  const [value, setValue] = useState(keyword.keyword);
  const [purpose, setPurpose] = useState(keyword.purpose);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = value !== keyword.keyword || purpose !== keyword.purpose;

  /** 保存する。 */
  const save = async () => {
    if (pending) return;
    setFailure(undefined);
    const input = ResearchKeywordInput.safeParse({ keyword: value, purpose });
    if (!input.success) {
      setErrors(fieldErrorsFromIssues(input.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const saved = await updateKeyword(accountId, keyword.id, input.data, keyword.version);
      await onSaved(saved);
      onClose();
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (caught instanceof ApiError && caught.code === "THREADS_KEYWORD_DUPLICATE") {
        setErrors({ keyword: errorMessage(caught) });
      } else if (fields.keyword || fields.purpose) {
        setErrors(fields);
      } else {
        setFailure(`保存できませんでした。${errorMessage(caught)}`);
      }
    } finally {
      setPending(false);
    }
  };

  /** 閉じる（直した内容があれば確かめる）。 */
  const requestClose = () => {
    if (pending) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      title="キーワードを直す"
      footer={
        <>
          <Button onClick={requestClose} aria-disabled={pending || undefined}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            aria-disabled={pending || undefined}
          >
            {pending ? "保存しています…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xs">
        <Field
          label="キーワード"
          description={`${countChars(value).toString()}／${SHORT_TEXT_MAX.toString()}文字`}
          error={errors.keyword}
          required
        >
          <Input
            disabled={pending}
            value={value}
            onChange={(change) => setValue(change.target.value)}
          />
        </Field>
        <Field
          label="狙い"
          description={`${countChars(purpose).toString()}／${SHORT_TEXT_MAX.toString()}文字`}
          error={errors.purpose}
        >
          <Input
            disabled={pending}
            value={purpose}
            onChange={(change) => setPurpose(change.target.value)}
          />
        </Field>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={(next) => {
          if (!next) setConfirmClose(false);
        }}
        title="保存していない変更があります"
        confirmLabel="捨てて閉じる"
        cancelLabel="入力に戻る"
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      >
        直した内容は、閉じると消えます。
      </ConfirmDialog>
    </Dialog>
  );
}
