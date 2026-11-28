// 会った場の一覧の画面（/person/meetings。US3・FR-008・FR-010）。名前と日付で会った場を作り、その会った場の画面へ移る。
// そろえて同じ名前と日付の会った場は、作らずに前のものを開く（API が返す）。日付の初めの値は今日（日本時間）。
// 「会った場を作る」の上に「PaletKit の交流会」の欄（person-002）：参加した・主催した・受付係をした交流会が並び、「開く」で
// その交流会の会った場を作って（あれば前のものを）開く。受付アプリが見えなければ欄を出さない。読みこみ中も出さない（出たり消えたりしないように）。
import { MeetingCreateInput } from "@workspace/contracts/person";
import { PRODUCT_NAME, jstDate } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { createMeeting, createMeetingFromEvent } from "./api.ts";
import { PRIVACY_TEXT } from "./note-form.ts";
import { PERSON_QUERY_KEYS, useEventCandidates, useMeetings } from "./queries.ts";
import { LoadError, Loading } from "./states.tsx";

/** 会った場を開いたときの知らせの文。 */
const OPENED_NOTICE = "会った場を開きました。ここで会った人を続けて足せます。";

/**
 * 「PaletKit の交流会」の欄（選べる交流会を並べ、「開く」で交流会から会った場を作って開く）。
 * 「開く」は作った会でも API に送る（前の会った場が返る。画面の印が古くても、消した会った場は作り直される）。
 * @returns 欄の要素（受付アプリが見えない・読みこみ中は null）
 */
function EventCandidates() {
  const query = useEventCandidates();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string>();
  const [failure, setFailure] = useState<string>();
  // 送っている間の印（描きなおす前に続けて押されても、二度送らないように、すぐ読み書きできる ref に持つ）
  const sending = useRef(false);

  if (query.isPending) return null;
  if (query.isSuccess && !query.data.available) {
    // 送ったあとに受付アプリが見えなくなったときも、開けなかったことは伝える
    return failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null;
  }

  /**
   * 交流会から会った場を作り（あれば前のもの）、その画面へ移る。
   * @param eventId 交流会の ID
   */
  const open = async (eventId: string) => {
    if (sending.current) return;
    sending.current = true;
    setFailure(undefined);
    setPendingId(eventId);
    try {
      const meeting = await createMeetingFromEvent({ eventId });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PERSON_QUERY_KEYS.meetings }),
        queryClient.invalidateQueries({ queryKey: PERSON_QUERY_KEYS.eventCandidates }),
      ]);
      showNotice({
        tone: "success",
        message: OPENED_NOTICE,
        path: `/person/meetings/${encodeURIComponent(meeting.id)}`,
      });
      await navigate({ to: "/person/meetings/$meetingId", params: { meetingId: meeting.id } });
    } catch (error) {
      setFailure(`開けませんでした。${errorMessage(error)}`);
      // 選べなくなった交流会（受付係から外れた・消えた）を一覧から消す
      await queryClient.invalidateQueries({ queryKey: PERSON_QUERY_KEYS.eventCandidates });
    } finally {
      sending.current = false;
      setPendingId(undefined);
    }
  };

  const items = query.data?.items ?? [];
  return (
    <section aria-labelledby="person-meeting-events" className="flex flex-col gap-xxs">
      <h2 id="person-meeting-events" className="text-l leading-tight font-bold">
        {PRODUCT_NAME} の交流会
      </h2>
      <p className="text-m text-text-sub">
        参加した・主催した・受付係をした交流会を選ぶと、その名前と日付の会った場を開きます。
      </p>
      {query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-m">選べる交流会はまだありません。</p>
      ) : (
        <ul aria-label="選べる交流会" className="flex flex-col gap-xs">
          {items.map((item) => {
            const busy = pendingId === item.eventId;
            return (
              <li
                key={item.eventId}
                className="flex flex-wrap items-center justify-between gap-xs rounded-md border border-border bg-surface p-xs"
              >
                <div className="flex min-w-0 flex-col gap-x3s">
                  <span className="text-l font-bold break-words">{item.name}</span>
                  <span className="flex flex-wrap items-center gap-xxs text-m text-text-sub">
                    {item.metOn}
                    {item.meetingId ? <Badge variant="success">作った</Badge> : null}
                  </span>
                </div>
                <Button
                  size="small"
                  aria-label={`${busy ? "開いています" : "開く"}：${item.name}`}
                  aria-disabled={pendingId !== undefined || undefined}
                  onClick={() => void open(item.eventId)}
                >
                  {busy ? "開いています…" : "開く"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
    </section>
  );
}

/**
 * 会った場を作るフォーム。
 * @returns フォームの要素
 */
function CreateMeetingForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [metOn, setMetOn] = useState(() => jstDate(new Date()));
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
    const parsed = MeetingCreateInput.safeParse({ name, metOn });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const meeting = await createMeeting(parsed.data);
      await queryClient.invalidateQueries({ queryKey: PERSON_QUERY_KEYS.meetings });
      showNotice({
        tone: "success",
        message: OPENED_NOTICE,
        path: `/person/meetings/${encodeURIComponent(meeting.id)}`,
      });
      await navigate({ to: "/person/meetings/$meetingId", params: { meetingId: meeting.id } });
    } catch (error) {
      const fields = fieldErrorsFromApi(error);
      setErrors(fields);
      if (Object.keys(fields).length === 0) setFailure(`作れませんでした。${errorMessage(error)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      aria-label="会った場を作る"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex max-w-form flex-col gap-xs"
    >
      <Field
        label="会った場の名前"
        description="同じ名前と日付の会った場があれば、それを開きます。"
        error={errors.name}
        required
      >
        <Input autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="日付" error={errors.metOn} required>
        <Input type="date" value={metOn} onChange={(event) => setMetOn(event.target.value)} />
      </Field>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
            {pending ? "作っています…" : "作る"}
          </Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/**
 * 会った場の一覧の中身（ログインしているとき）。
 * @returns 画面の要素
 */
function MeetingList() {
  const query = useMeetings();
  const meetings = query.data?.items ?? [];
  return (
    <Page title="会った場" lead={PRIVACY_TEXT}>
      <EventCandidates />
      <section aria-labelledby="person-meeting-new" className="flex flex-col gap-xxs">
        <h2 id="person-meeting-new" className="text-l leading-tight font-bold">
          会った場を作る
        </h2>
        <CreateMeetingForm />
      </section>
      <section aria-labelledby="person-meeting-list" className="flex flex-col gap-xs">
        <h2 id="person-meeting-list" className="text-l leading-tight font-bold">
          会った場の一覧
        </h2>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <LoadError error={query.error} onRetry={() => void query.refetch()} />
        ) : meetings.length === 0 ? (
          <p className="text-m">まだ会った場はありません。</p>
        ) : (
          <ul aria-label="会った場" className="flex flex-col gap-xs">
            {meetings.map((meeting) => (
              <li
                key={meeting.id}
                className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
              >
                <Link
                  to="/person/meetings/$meetingId"
                  params={{ meetingId: meeting.id }}
                  className="text-l font-bold break-words text-text-link underline"
                >
                  {meeting.name}
                </Link>
                <span className="text-m text-text-sub">
                  {meeting.metOn}・{meeting.noteCount}人
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link to="/person" className="text-m text-text-link underline">
        人の一覧へ
      </Link>
    </Page>
  );
}

/**
 * 会った場の一覧の画面（ログインが要る）。
 * @returns 画面の要素
 */
export function MeetingsPage() {
  return (
    <SessionGate>
      <MeetingList />
    </SessionGate>
  );
}
