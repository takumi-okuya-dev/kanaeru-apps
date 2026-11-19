// A2 交流会の作成・編集（主催者だけ。EXPERIENCE.md）。名前・日時（日本時間の日付と時刻）・会場・参加費・
// GoogleフォームのURL（任意）・LINEグループの招待リンク（任意）。入力の誤りは欄のそば、送った結果はボタンの近く。
// 作ったら準備の画面（QR）へ、直したら一覧へ移り、画面の上の知らせの帯で伝える。
import { EventInput } from "@workspace/contracts/event";
import type { EventView } from "@workspace/contracts/event";
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate, useSession } from "../account/index.ts";
import { EventAccessGate, Loading, OrganizerOnlyPage } from "./EventAccessGate.tsx";
import { createEvent, updateEvent } from "./api.ts";
import { fromJstInputs, parseFee, toJstInputs } from "./format.ts";
import { EVENT_QUERY_KEYS } from "./queries.ts";

/** 入力の欄の値（文字のまま）。 */
type FormValues = {
  name: string;
  date: string;
  time: string;
  venue: string;
  fee: string;
  googleFormUrl: string;
  lineGroupUrl: string;
};

/** 空の欄。 */
const EMPTY: FormValues = {
  name: "",
  date: "",
  time: "",
  venue: "",
  fee: "",
  googleFormUrl: "",
  lineGroupUrl: "",
};

/**
 * 交流会を、入力の欄の値にする（直すときの初期値）。
 * @param event 交流会
 * @returns 欄の値
 */
function toFormValues(event: EventView): FormValues {
  const { date, time } = toJstInputs(event.startsAt);
  return {
    name: event.name,
    date,
    time,
    venue: event.venue,
    fee: String(event.fee),
    googleFormUrl: event.googleFormUrl ?? "",
    lineGroupUrl: event.lineGroupUrl ?? "",
  };
}

/**
 * 欄の値を確かめ、送る形にする。
 * @param values 欄の値
 * @returns 送る形か、欄ごとの誤り
 */
export function validateEventForm(
  values: FormValues,
): { ok: true; input: EventInput } | { ok: false; errors: FieldErrors } {
  const startsAt = fromJstInputs(values.date, values.time);
  const parsed = EventInput.safeParse({
    name: values.name,
    startsAt: startsAt ?? "",
    venue: values.venue,
    fee: parseFee(values.fee),
    googleFormUrl: values.googleFormUrl.trim() || null,
    lineGroupUrl: values.lineGroupUrl.trim() || null,
  });
  const errors: FieldErrors = parsed.success ? {} : fieldErrorsFromIssues(parsed.error.issues);
  if (!values.date) errors.date = "日付を入れてください。";
  if (!values.time) errors.time = "時刻を入れてください。";
  if (errors.startsAt) {
    errors.date ??= errors.startsAt;
    delete errors.startsAt;
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, input: parsed.data };
}

/** EventForm が受け取るもの。 */
type EventFormProps = {
  /** 直す交流会（作るときはなし） */
  event?: EventView;
};

/**
 * 交流会の入力のフォーム。
 * @param props 直す交流会（event）
 * @returns フォームの要素
 */
function EventForm({ event }: EventFormProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>(event ? toFormValues(event) : EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(formRef.current);
  }, [focusRequest]);

  /**
   * 欄の値を変える。
   * @param name 欄の名前
   * @returns 変わったときの受け手
   */
  const bind = (name: keyof FormValues) => ({
    name,
    value: values[name],
    onChange: (change: React.ChangeEvent<HTMLInputElement>) => {
      const value = change.target.value;
      // 自動の入力などで、描き直す前に2つの欄が続けて変わっても、前の変更を消さない
      setValues((current) => ({ ...current, [name]: value }));
    },
  });

  /**
   * 送る。
   * @param submitEvent 送る出来事
   */
  const submit = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (pending) return;
    setFailure(undefined);
    const result = validateEventForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (event) {
        await updateEvent(event.id, result.input);
        await queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
        showNotice({ tone: "success", message: "交流会を直しました。", path: "/admin/events" });
        await navigate({ to: "/admin/events" });
      } else {
        const created = await createEvent(result.input);
        await queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
        const path = `/admin/events/${created.id}/setup`;
        showNotice({
          tone: "success",
          message: "交流会を作りました。受付QRとアンケートQRを用意してください。",
          path,
        });
        await navigate({ to: "/admin/events/$eventId/setup", params: { eventId: created.id } });
      }
    } catch (error) {
      const fields = fieldErrorsFromApi(error);
      if (fields.startsAt) {
        fields.date ??= fields.startsAt;
        delete fields.startsAt;
      }
      setErrors(fields);
      if (Object.keys(fields).length > 0) setFocusRequest((count) => count + 1);
      else setFailure(`${event ? "保存" : "作成"}できませんでした。${errorMessage(error)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(submitEvent) => void submit(submitEvent)}
      className="flex max-w-form flex-col gap-s"
    >
      <Field label="交流会の名前" error={errors.name} required>
        <Input autoComplete="off" {...bind("name")} />
      </Field>
      <div className="flex flex-wrap gap-xs">
        <Field label="日付" description="日本時間" error={errors.date} required>
          <Input type="date" {...bind("date")} />
        </Field>
        <Field label="時刻" description="始まりの時刻" error={errors.time} required>
          <Input type="time" {...bind("time")} />
        </Field>
      </div>
      <Field label="会場" error={errors.venue} required>
        <Input autoComplete="off" {...bind("venue")} />
      </Field>
      <Field
        label="参加費（円）"
        description={
          event
            ? "参加費を直しても、すでにあるチェックインの金額は変わりません。"
            : "0円も入れられます。"
        }
        error={errors.fee}
        required
      >
        <Input inputMode="numeric" autoComplete="off" {...bind("fee")} />
      </Field>
      <Field
        label="GoogleフォームのURL"
        description="任意。アプリのアンケートを送ったあとに「続けて交流会のアンケートへ」で案内します。"
        error={errors.googleFormUrl}
      >
        <Input type="url" autoComplete="off" spellCheck={false} {...bind("googleFormUrl")} />
      </Field>
      <Field
        label="LINEグループの招待リンク"
        description="任意。アンケートを開いてから、参加者に「交流会のLINEグループに参加する」で案内します。"
        error={errors.lineGroupUrl}
      >
        <Input type="url" autoComplete="off" spellCheck={false} {...bind("lineGroupUrl")} />
      </Field>
      <div className="flex flex-col items-start gap-xxs">
        <div className="flex flex-wrap gap-xxs">
          <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
            {event ? (pending ? "保存しています…" : "保存") : pending ? "作っています…" : "作る"}
          </Button>
          <Link to="/admin/events" className={buttonVariants({ variant: "secondary" })}>
            やめる
          </Link>
        </div>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/**
 * 交流会を作る画面の中身（主催者だけ）。
 * @returns 画面の要素
 */
function NewEvent() {
  const session = useSession();
  if (session.status !== "authenticated") return <Loading />;
  if (!session.account.isOrganizer) return <OrganizerOnlyPage />;
  return (
    <Page title="交流会を追加">
      <EventForm />
    </Page>
  );
}

/**
 * A2 交流会の作成（ログインが要る・主催者だけ）。
 * @returns 画面の要素
 */
export function EventNewPage() {
  return (
    <SessionGate>
      <NewEvent />
    </SessionGate>
  );
}

/** EventEditPage が受け取るもの。 */
export type EventEditPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * A2 交流会の編集（ログインが要る・主催者だけ）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function EventEditPage({ eventId }: EventEditPageProps) {
  return (
    <SessionGate>
      <EventAccessGate eventId={eventId} roles={["organizer"]}>
        {(event) => (
          <Page title="交流会を直す" lead={event.name}>
            <EventForm event={event} />
          </Page>
        )}
      </EventAccessGate>
    </SessionGate>
  );
}

const editRouteApi = getRouteApi("/admin/events/$eventId/edit");

/**
 * A2 交流会の編集の道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function EventEditRoute() {
  const { eventId } = editRouteApi.useParams();
  return <EventEditPage eventId={eventId} />;
}
