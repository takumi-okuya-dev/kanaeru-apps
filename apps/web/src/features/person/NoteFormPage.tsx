// 人を足す画面（/person/new。US1・FR-001・FR-005・FR-007）。フルネームだけで足せる。
// 送りの ID（clientRequestId）は画面が作り、同じ中身の送り直しでは同じものを使う（二重に足さない。中身を変えたら新しい ID。research R7）。
// 保存に失敗しても書いた内容は画面に残り、もう一度保存できる。足したら、その人のメモへ移り、画面の上の知らせの帯で伝える。
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, focusFirstInvalid } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { NoteFields } from "./NoteFields.tsx";
import { createNote } from "./api.ts";
import {
  EMPTY_NOTE_VALUES,
  PRIVACY_TEXT,
  checkCreate,
  toFormErrors,
  valuesToFields,
} from "./note-form.ts";
import type { NoteFormValues } from "./note-form.ts";
import { PERSON_QUERY_KEYS } from "./queries.ts";
import { useRetryId } from "./retry-id.ts";

/**
 * 人を足すフォーム。
 * @returns フォームの要素
 */
function NewNoteForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState<NoteFormValues>(EMPTY_NOTE_VALUES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [focusRequest, setFocusRequest] = useState(0);
  // 同じ中身の送り直しは同じ ID（答えが届かなかった送りを二重にしない）。中身を変えたら新しい ID
  const retry = useRetryId();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(formRef.current);
  }, [focusRequest]);

  /**
   * 送る。
   * @param event 送る出来事
   */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFailure(undefined);
    const checked = checkCreate(values, retry.idFor(valuesToFields(values)));
    if (!checked.ok) {
      setErrors(checked.errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const note = await createNote(checked.input);
      await queryClient.invalidateQueries({ queryKey: PERSON_QUERY_KEYS.all });
      showNotice({
        tone: "success",
        message: "人を足しました。",
        path: `/person/notes/${encodeURIComponent(note.id)}`,
      });
      await navigate({ to: "/person/notes/$noteId", params: { noteId: note.id } });
    } catch (error) {
      const fields = toFormErrors(fieldErrorsFromApi(error));
      setErrors(fields);
      if (Object.keys(fields).length > 0) setFocusRequest((count) => count + 1);
      else setFailure(`保存できませんでした。${errorMessage(error)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex max-w-form flex-col gap-s"
    >
      <NoteFields
        values={values}
        errors={errors}
        onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
      />
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Link to="/person" className={buttonVariants({ variant: "secondary" })}>
            やめる
          </Link>
          <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
            {pending ? "保存しています…" : "保存"}
          </Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/**
 * 人を足す画面（ログインが要る）。
 * @returns 画面の要素
 */
export function NoteNewPage() {
  return (
    <SessionGate>
      <Page title="人を足す" lead={PRIVACY_TEXT}>
        <NewNoteForm />
      </Page>
    </SessionGate>
  );
}
