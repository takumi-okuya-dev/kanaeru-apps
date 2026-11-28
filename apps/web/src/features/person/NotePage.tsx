// 人のメモの画面（/person/notes/$noteId。US1・US4・US5・FR-016）。話したことと次に話したいことを最初に出し、その下に
// 書き足す欄・くわしい欄・アカウント・会った場・消すを置く。「直す」で全部の欄を書き直せる（もとの版が違えば 409）。
// 書き足しの ID（appendId）は画面が作り、同じ中身の送り直しでは同じものを使う（中身を変えたら新しい ID。research R7）。
// 保存に失敗しても書いた内容は残る（FR-005）。直すときの版は、直し始めたときの版を送る（読み直しで新しくなっても変えない）。
// アカウントは contracts の accountUrl で URL にし、新しいタブで開く（http・https にならないものはリンクにしない。FR-018）。
import {
  PERSON_ACCOUNT_KINDS,
  PERSON_ACCOUNT_LABELS,
  accountUrl,
} from "@workspace/contracts/person";
import type { Note } from "@workspace/contracts/person";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { NoteFields } from "./NoteFields.tsx";
import { appendTalk, attachMeeting, deleteNote, detachMeeting, updateNote } from "./api.ts";
import {
  PRIVACY_TEXT,
  SENSITIVE_HINT,
  checkUpdate,
  noteToValues,
  toFormErrors,
} from "./note-form.ts";
import type { NoteFormValues } from "./note-form.ts";
import { PERSON_QUERY_KEYS, useMeetings, useNote } from "./queries.ts";
import { useRetryId } from "./retry-id.ts";
import { LoadError, Loading } from "./states.tsx";

/** 会った場を選ぶ欄の選択肢。 */
type MeetingOption = { id: string; name: string; metOn: string };

/**
 * 書いたあとに、読んだものを新しくする（この人は答えで置きかえ、一覧と会った場は読み直す）。
 * @param queryClient 問い合わせの入れ物
 * @param note 書いたあとの人（消したときは undefined）
 */
async function refreshAfterWrite(queryClient: QueryClient, note?: Note): Promise<void> {
  if (note) queryClient.setQueryData(PERSON_QUERY_KEYS.note(note.id), note);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: PERSON_QUERY_KEYS.notes }),
    queryClient.invalidateQueries({ queryKey: PERSON_QUERY_KEYS.meetings }),
    queryClient.invalidateQueries({ queryKey: ["person", "meeting"] }),
  ]);
}

/** MeetingSelect が受け取るもの。 */
type MeetingSelectProps = {
  /** 選んだ会った場の ID（選ばないときは ""） */
  value: string;
  /** 選んだとき */
  onChange: (value: string) => void;
  /** 選択肢 */
  options: readonly MeetingOption[];
  /** 選ばないときの言葉 */
  emptyLabel: string;
};

/**
 * 会った場を選ぶ欄（Field の中で、名前・説明と結ぶ）。
 * @param props 値（value）・選んだとき（onChange）・選択肢（options）・選ばないときの言葉（emptyLabel）
 * @returns 欄の要素
 */
function MeetingSelect({ value, onChange, options, emptyLabel }: MeetingSelectProps) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-xl`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {options.map((meeting) => (
        <option key={meeting.id} value={meeting.id}>
          {meeting.name}（{meeting.metOn}）
        </option>
      ))}
    </select>
  );
}

/**
 * 話したことに書き足す欄（US4）。
 * @param props 人（note）
 * @param props.note 人
 * @returns 欄の要素
 */
function AppendForm({ note }: { note: Note }) {
  const queryClient = useQueryClient();
  const meetings = useMeetings();
  const [text, setText] = useState("");
  const [meetingId, setMeetingId] = useState("");
  // 同じ中身の送り直しは同じ ID（答えが届かなかった書き足しを二重にしない）。中身を変えたら・書けたら新しい ID
  const retry = useRetryId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [done, setDone] = useState(false);

  /**
   * 送る。
   * @param event 送る出来事
   */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFailure(undefined);
    setDone(false);
    if (text.trim() === "") {
      setError("書き足すことを入れてください。");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const content = { text, ...(meetingId ? { meetingId } : {}) };
      const saved = await appendTalk(note.id, { appendId: retry.idFor(content), ...content });
      setText("");
      setMeetingId("");
      retry.reset();
      setDone(true);
      await refreshAfterWrite(queryClient, saved);
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      const fieldError = fields.talk ?? fields.text;
      if (fieldError) setError(fieldError);
      else setFailure(`保存できませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      aria-label="話したことに書き足す"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex max-w-form flex-col gap-xs"
    >
      <p className="text-s text-text-sub">{SENSITIVE_HINT}</p>
      <Field
        label="書き足すこと"
        description="書き足した日（と選んだ会った場）の見出しが付きます。"
        error={error}
      >
        <Textarea rows={3} value={text} onChange={(change) => setText(change.target.value)} />
      </Field>
      <Field label="会った場（任意）">
        <MeetingSelect
          value={meetingId}
          onChange={setMeetingId}
          options={meetings.data?.items ?? []}
          emptyLabel="選ばない"
        />
      </Field>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
            {pending ? "保存しています…" : "書き足す"}
          </Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
        {done ? <ResponseMessage tone="success">書き足しました。</ResponseMessage> : null}
      </div>
    </form>
  );
}

/**
 * アカウントの一覧（押すと新しいタブで開く。LINE ID には注意を添える）。
 * @param props 人（note）
 * @param props.note 人
 * @returns 一覧の要素（アカウントがなければ案内）
 */
function AccountList({ note }: { note: Note }) {
  const entries = PERSON_ACCOUNT_KINDS.flatMap((kind) => {
    const value = note.accounts[kind];
    return value ? [{ kind, value, href: accountUrl(kind, value) }] : [];
  });
  if (entries.length === 0) return <p className="text-m text-text-sub">まだ入れていません。</p>;
  return (
    <ul className="flex flex-col gap-xxs">
      {entries.map(({ kind, value, href }) => (
        <li key={kind} className="flex flex-col gap-x3s text-m">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-text-link underline"
            >
              {PERSON_ACCOUNT_LABELS[kind]}：{value}
              <span className="sr-only">（新しいタブで開きます）</span>
            </a>
          ) : (
            <span className="break-all">
              <span>{PERSON_ACCOUNT_LABELS[kind]}：</span>
              <span>{value}</span>
            </span>
          )}
          {kind === "line" ? (
            <span className="text-s text-text-sub">
              相手が ID で見つけられる設定のときだけ開けます。
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * 付いている会った場と、付ける・外す欄。
 * @param props 人（note）
 * @param props.note 人
 * @returns 要素
 */
function MeetingSection({ note }: { note: Note }) {
  const queryClient = useQueryClient();
  const meetings = useMeetings();
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const attachedIds = new Set(note.meetings.map((meeting) => meeting.id));
  const options = (meetings.data?.items ?? []).filter((meeting) => !attachedIds.has(meeting.id));

  /**
   * 付ける・外す。
   * @param run 呼ぶ窓口
   */
  const change = async (run: () => Promise<Note>) => {
    if (pending) return;
    setFailure(undefined);
    setPending(true);
    try {
      await refreshAfterWrite(queryClient, await run());
      setSelected("");
    } catch (error) {
      setFailure(`保存できませんでした。${errorMessage(error)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-xs">
      {note.meetings.length === 0 ? (
        <p className="text-m text-text-sub">まだ付いていません。</p>
      ) : (
        <ul className="flex flex-col gap-xxs">
          {note.meetings.map((meeting) => (
            <li key={meeting.id} className="flex flex-wrap items-center gap-xs text-m">
              <Link
                to="/person/meetings/$meetingId"
                params={{ meetingId: meeting.id }}
                className="text-text-link underline"
              >
                {meeting.name}（{meeting.metOn}）
              </Link>
              <Button
                size="small"
                aria-label={`外す：${meeting.name}`}
                aria-disabled={pending || undefined}
                onClick={() => void change(() => detachMeeting(note.id, meeting.id))}
              >
                外す
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex max-w-form flex-col gap-xxs">
        <Field label="会った場を付ける">
          <MeetingSelect
            value={selected}
            onChange={setSelected}
            options={options}
            emptyLabel="選んでください"
          />
        </Field>
        <ButtonRow>
          <Button
            aria-disabled={pending || selected === "" || undefined}
            onClick={() => {
              if (selected) void change(() => attachMeeting(note.id, selected));
            }}
          >
            付ける
          </Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
        <Link to="/person/meetings" className="text-m text-text-link underline">
          会った場を作る
        </Link>
      </div>
    </div>
  );
}

/**
 * 全部の欄を書き直すフォーム（もとの版が違えば 409 で、書いた内容は残る）。
 * @param props 人（note）・閉じる（onClose）
 * @param props.note 人
 * @param props.onClose 閉じる（保存したら saved が true）
 * @returns フォームの要素
 */
function EditForm({ note, onClose }: { note: Note; onClose: (saved: boolean) => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<NoteFormValues>(() => noteToValues(note));
  // 直し始めたときの版（つながり直しなどで読み直して note が新しくなっても変えない。ほかの端末の直しを黙って上書きしない）
  const [baseVersion] = useState(() => note.version);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();

  /**
   * 送る。
   * @param event 送る出来事
   */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFailure(undefined);
    const checked = checkUpdate(values, baseVersion);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await refreshAfterWrite(queryClient, await updateNote(note.id, checked.input));
      onClose(true);
    } catch (error) {
      const fields = toFormErrors(fieldErrorsFromApi(error));
      setErrors(fields);
      if (Object.keys(fields).length === 0) {
        setFailure(`保存できませんでした。${errorMessage(error)}`);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      aria-label="メモを直す"
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
          <Button onClick={() => onClose(false)}>やめる</Button>
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
 * 人のメモの中身（読みこんだあと）。
 * @param props 人（note）
 * @param props.note 人
 * @returns 画面の要素
 */
function NoteDetail({ note }: { note: Note }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  /** 消す。 */
  const remove = async () => {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteNote(note.id);
      showNotice({ tone: "success", message: "メモを消しました。", path: "/person" });
      // 先に一覧へ移る（この画面が見ている間に消すと、読み直して 404 を出してしまう）
      await navigate({ to: "/person" });
      queryClient.removeQueries({ queryKey: PERSON_QUERY_KEYS.note(note.id) });
      await refreshAfterWrite(queryClient);
    } catch (error) {
      setDeleteError(`消せませんでした。${errorMessage(error)}`);
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <Page title="メモを直す" lead={PRIVACY_TEXT}>
        <EditForm
          note={note}
          onClose={(done) => {
            setEditing(false);
            setSaved(done);
          }}
        />
      </Page>
    );
  }

  return (
    <Page
      title={note.fullName}
      lead={PRIVACY_TEXT}
      actions={
        <Button
          onClick={() => {
            setSaved(false);
            setEditing(true);
          }}
        >
          直す
        </Button>
      }
    >
      {saved ? <ResponseMessage tone="success">保存しました。</ResponseMessage> : null}
      <section aria-labelledby="person-talk" className="flex flex-col gap-xxs">
        <h2 id="person-talk" className="text-l leading-tight font-bold">
          話したこと
        </h2>
        <p className="text-m break-words whitespace-pre-wrap">
          {note.talk || <span className="text-text-sub">まだ書いていません。</span>}
        </p>
      </section>
      <section aria-labelledby="person-next" className="flex flex-col gap-xxs">
        <h2 id="person-next" className="text-l leading-tight font-bold">
          次に話したいこと
        </h2>
        <p className="text-m break-words whitespace-pre-wrap">
          {note.nextTopic || <span className="text-text-sub">まだ書いていません。</span>}
        </p>
      </section>
      <section aria-labelledby="person-append" className="flex flex-col gap-xxs">
        <h2 id="person-append" className="text-l leading-tight font-bold">
          書き足す
        </h2>
        <AppendForm note={note} />
      </section>
      <section aria-labelledby="person-details" className="flex flex-col gap-xxs">
        <h2 id="person-details" className="text-l leading-tight font-bold">
          くわしく
        </h2>
        <dl className="flex flex-col gap-x3s text-m">
          {(
            [
              ["見た目の特徴", note.appearance],
              ["よみ", note.reading],
              ["LINE の名前", note.lineName],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex flex-wrap gap-x-xs">
              <dt className="text-text-sub">{label}</dt>
              <dd className="min-w-0 break-words">{value ?? "—"}</dd>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-xs gap-y-x3s">
            <dt className="text-text-sub">タグ</dt>
            <dd className="flex flex-wrap gap-x3s">
              {note.tags.length === 0
                ? "—"
                : note.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="person-accounts" className="flex flex-col gap-xxs">
        <h2 id="person-accounts" className="text-l leading-tight font-bold">
          アカウント
        </h2>
        <AccountList note={note} />
      </section>
      <section aria-labelledby="person-meetings" className="flex flex-col gap-xxs">
        <h2 id="person-meetings" className="text-l leading-tight font-bold">
          会った場
        </h2>
        <MeetingSection note={note} />
      </section>
      <ButtonRow>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          このメモを消す
        </Button>
      </ButtonRow>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="メモを消しますか"
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={deleting}
        error={deleteError}
        onConfirm={() => void remove()}
      >
        <p>この人のメモを消します。消したメモは戻せません。会った場は残ります。</p>
      </ConfirmDialog>
    </Page>
  );
}

/** NotePage が受け取るもの。 */
export type NotePageProps = {
  /** 人の ID */
  noteId: string;
};

/**
 * 人のメモを読みこむ。
 * @param props 人の ID（noteId）
 * @returns 画面の要素
 */
function NoteLoader({ noteId }: NotePageProps) {
  const query = useNote(noteId);
  if (query.isPending) {
    return (
      <Page title="人物メモ" lead={PRIVACY_TEXT}>
        <Loading />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page title="メモを読みこめませんでした" lead={PRIVACY_TEXT}>
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
        <Link to="/person" className="text-m text-text-link underline">
          人の一覧へ
        </Link>
      </Page>
    );
  }
  return <NoteDetail key={query.data.id} note={query.data} />;
}

/**
 * 人のメモの画面（ログインが要る）。
 * @param props 人の ID（noteId）
 * @returns 画面の要素
 */
export function NotePage({ noteId }: NotePageProps) {
  return (
    <SessionGate>
      <NoteLoader noteId={noteId} />
    </SessionGate>
  );
}

const routeApi = getRouteApi("/person/notes/$noteId");

/**
 * 人のメモの道の部品（道の noteId を渡す）。
 * @returns 画面の要素
 */
export function NoteRoute() {
  const { noteId } = routeApi.useParams();
  return <NotePage noteId={noteId} />;
}
