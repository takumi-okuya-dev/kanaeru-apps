// 会った場の画面（/person/meetings/$meetingId。US3・FR-009・FR-010・SC-002）。会った場を選んだまま、そこで会った人を続けて足す
// （保存すると欄が空になり、次の人を足せる）・前に足した人を選んで付ける・付いている人を並べる・会った場を消す。
// 送りの ID（clientRequestId）は1人ごとに画面が作り、送り直しでも同じものを使う（保存できたら新しくする）。
import type { Meeting } from "@workspace/contracts/person";
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, focusFirstInvalid } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { NoteFields } from "./NoteFields.tsx";
import { attachMeeting, createNote, deleteMeeting } from "./api.ts";
import { EMPTY_NOTE_VALUES, PRIVACY_TEXT, checkCreate, toFormErrors } from "./note-form.ts";
import type { NoteFormValues } from "./note-form.ts";
import { PERSON_QUERY_KEYS, useMeeting, useNotes } from "./queries.ts";
import { LoadError, Loading } from "./states.tsx";

/**
 * 書いたあとに、会った場と一覧を読み直す。
 * @param queryClient 問い合わせの入れ物
 */
async function refreshPerson(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: PERSON_QUERY_KEYS.all });
}

/**
 * そこで会った人を続けて足すフォーム（保存すると欄が空になり、会った場は選んだまま）。
 * @param props 会った場（meeting）
 * @param props.meeting 会った場
 * @returns フォームの要素
 */
function QuickAddForm({ meeting }: { meeting: Meeting }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<NoteFormValues>(EMPTY_NOTE_VALUES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [added, setAdded] = useState<string>();
  // 保存したら、次の人を足せるよう欄を作り直す（閉じた欄も閉じ直す）
  const [round, setRound] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * 送る。
   * @param event 送る出来事
   */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFailure(undefined);
    setAdded(undefined);
    const checked = checkCreate(values, clientRequestId, meeting.id);
    if (!checked.ok) {
      setErrors(checked.errors);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const note = await createNote(checked.input);
      setValues(EMPTY_NOTE_VALUES);
      setClientRequestId(crypto.randomUUID());
      setRound((count) => count + 1);
      setAdded(`${note.fullName}さんを足しました。続けて次の人を足せます。`);
      await refreshPerson(queryClient);
      formRef.current?.querySelector<HTMLInputElement>('input[name="fullName"]')?.focus();
    } catch (error) {
      const fields = toFormErrors(fieldErrorsFromApi(error));
      setErrors(fields);
      if (Object.keys(fields).length === 0)
        setFailure(`保存できませんでした。${errorMessage(error)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      ref={formRef}
      aria-label="ここで会った人を足す"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex max-w-form flex-col gap-s"
    >
      <NoteFields
        key={round}
        compact
        values={values}
        errors={errors}
        onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
      />
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
            {pending ? "保存しています…" : "保存して次の人へ"}
          </Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
        {added ? <ResponseMessage tone="success">{added}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/** NoteSelect が受け取るもの。 */
type NoteSelectProps = {
  /** 選んだ人の ID（選ばないときは ""） */
  value: string;
  /** 選んだとき */
  onChange: (value: string) => void;
  /** 選択肢（人の ID・名前・見た目の特徴） */
  options: readonly { id: string; fullName: string; appearance: string | null }[];
};

/**
 * 前に足した人を選ぶ欄（Field の中で、名前と結ぶ。同じ名前の人は見た目の特徴で見分ける）。
 * @param props 値（value）・選んだとき（onChange）・選択肢（options）
 * @returns 欄の要素
 */
function NoteSelect({ value, onChange, options }: NoteSelectProps) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-xl`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      <option value="">選んでください</option>
      {options.map((note) => (
        <option key={note.id} value={note.id}>
          {note.appearance ? `${note.fullName}（${note.appearance}）` : note.fullName}
        </option>
      ))}
    </select>
  );
}

/**
 * 前に足した人を付ける欄。
 * @param props 会った場（meeting）
 * @param props.meeting 会った場
 * @returns 欄の要素
 */
function AttachForm({ meeting }: { meeting: Meeting }) {
  const queryClient = useQueryClient();
  const notes = useNotes();
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const attached = new Set(meeting.notes.map((note) => note.id));
  const options = (notes.data?.items ?? []).filter((note) => !attached.has(note.id));

  /** 付ける。 */
  const attach = async () => {
    if (pending || selected === "") return;
    setFailure(undefined);
    setPending(true);
    try {
      await attachMeeting(selected, meeting.id);
      setSelected("");
      await refreshPerson(queryClient);
    } catch (error) {
      setFailure(`付けられませんでした。${errorMessage(error)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex max-w-form flex-col gap-xxs">
      <Field label="前に足した人">
        <NoteSelect value={selected} onChange={setSelected} options={options} />
      </Field>
      <ButtonRow>
        <Button
          aria-disabled={pending || selected === "" || undefined}
          onClick={() => void attach()}
        >
          付ける
        </Button>
      </ButtonRow>
      {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
    </div>
  );
}

/**
 * 会った場の中身（読みこんだあと）。
 * @param props 会った場（meeting）
 * @param props.meeting 会った場
 * @returns 画面の要素
 */
function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  /** 消す。 */
  const remove = async () => {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteMeeting(meeting.id);
      queryClient.removeQueries({ queryKey: PERSON_QUERY_KEYS.meeting(meeting.id) });
      await refreshPerson(queryClient);
      showNotice({ tone: "success", message: "会った場を消しました。", path: "/person/meetings" });
      await navigate({ to: "/person/meetings" });
    } catch (error) {
      setDeleteError(`消せませんでした。${errorMessage(error)}`);
      setDeleting(false);
    }
  };

  return (
    <Page title={meeting.name} lead={`${meeting.metOn} に会った場です。${PRIVACY_TEXT}`}>
      <section aria-labelledby="person-quick-add" className="flex flex-col gap-xxs">
        <h2 id="person-quick-add" className="text-l leading-tight font-bold">
          ここで会った人を足す
        </h2>
        <QuickAddForm meeting={meeting} />
      </section>
      <section aria-labelledby="person-attach" className="flex flex-col gap-xxs">
        <h2 id="person-attach" className="text-l leading-tight font-bold">
          前に足した人を付ける
        </h2>
        <AttachForm meeting={meeting} />
      </section>
      <section aria-labelledby="person-met" className="flex flex-col gap-xs">
        <h2 id="person-met" className="text-l leading-tight font-bold">
          ここで会った人（{meeting.noteCount}人）
        </h2>
        {meeting.notes.length === 0 ? <p className="text-m">まだいません。</p> : null}
        <ul aria-label="ここで会った人" className="flex flex-col gap-xxs">
          {meeting.notes.map((note) => (
            <li key={note.id} className="flex flex-wrap items-baseline gap-x-xs text-m">
              <Link
                to="/person/notes/$noteId"
                params={{ noteId: note.id }}
                className="break-words text-text-link underline"
              >
                {note.fullName}
              </Link>
              {note.appearance ? (
                <span className="break-words text-text-sub">{note.appearance}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <ButtonRow>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          この会った場を消す
        </Button>
      </ButtonRow>
      <Link to="/person/meetings" className="text-m text-text-link underline">
        会った場の一覧へ
      </Link>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="会った場を消しますか"
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={deleting}
        error={deleteError}
        onConfirm={() => void remove()}
      >
        <p>この会った場を消します。人のメモは残り、会った場とのつながりだけが外れます。</p>
      </ConfirmDialog>
    </Page>
  );
}

/** MeetingPage が受け取るもの。 */
export type MeetingPageProps = {
  /** 会った場の ID */
  meetingId: string;
};

/**
 * 会った場を読みこむ。
 * @param props 会った場の ID（meetingId）
 * @returns 画面の要素
 */
function MeetingLoader({ meetingId }: MeetingPageProps) {
  const query = useMeeting(meetingId);
  if (query.isPending) {
    return (
      <Page title="会った場" lead={PRIVACY_TEXT}>
        <Loading />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page title="会った場を読みこめませんでした" lead={PRIVACY_TEXT}>
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
        <Link to="/person/meetings" className="text-m text-text-link underline">
          会った場の一覧へ
        </Link>
      </Page>
    );
  }
  return <MeetingDetail meeting={query.data} />;
}

/**
 * 会った場の画面（ログインが要る）。
 * @param props 会った場の ID（meetingId）
 * @returns 画面の要素
 */
export function MeetingPage({ meetingId }: MeetingPageProps) {
  return (
    <SessionGate>
      <MeetingLoader meetingId={meetingId} />
    </SessionGate>
  );
}

const routeApi = getRouteApi("/person/meetings/$meetingId");

/**
 * 会った場の道の部品（道の meetingId を渡す）。
 * @returns 画面の要素
 */
export function MeetingRoute() {
  const { meetingId } = routeApi.useParams();
  return <MeetingPage meetingId={meetingId} />;
}
