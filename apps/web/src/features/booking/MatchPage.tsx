// S1 名簿に当てる（主催者・受付係。booking-001。モックアップ S1）。スマホで受付係が使う形を基本にする。
// - 上：来た人数／確定の人数・飛び入りの人数
// - 当てを待つチェックイン：候補のカード（当てる・ちがう人）・名簿にいないカード（名簿から選ぶ・飛び入りにする）
// - さっきのチェックイン：当たった（自動・手）・飛び入り。手で当てたものは外せる
// - 下：手でチェックイン（名簿から選ぶ）＝名前で探して選び、知ったきっかけと支払い方法を選んでチェックインする。
//   名簿にいない人は「名簿にいない人（飛び入り）」で、チェックインと名簿の行を一緒に作る
// 5秒おきに読み直す（夜間の停止の 503 だけ止める）。送った結果は押したボタンの近くに出す。
import type { EventView } from "@workspace/contracts/event";
import type { MatchBoard } from "@workspace/contracts/booking";
import { APPLICATION_SOURCE_LABELS, normalizeCheckinName } from "@workspace/contracts/reception";
import type { CheckinInput } from "@workspace/contracts/reception";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { EventAccessGate, formatEventDateTime } from "../event/index.ts";
import {
  CheckinFields,
  EMPTY_CHECKIN_FORM,
  focusFirstCheckinError,
  isNightStop,
  validateCheckinForm,
} from "../reception/index.ts";
import type { CheckinFormValues } from "../reception/index.ts";
import { checkInEntry, dismissCandidate, matchCheckin, walkIn, walkInFromCheckin } from "./api.ts";
import { BOOKING_QUERY_KEYS, useMatchBoard } from "./queries.ts";
import { RosterGate } from "./RosterGate.tsx";

/** 受付係の画面のチェックイン。 */
type BoardCheckin = MatchBoard["checkins"][number];

/** 名簿から選べる行。 */
type Choice = MatchBoard["choices"][number];

/** 当てた状態の言葉（さっきのチェックイン）。 */
const DONE_LABELS = {
  matched_auto: "名簿に当たった（自動）",
  matched_manual: "名簿に当たった（手）",
  walk_in: "飛び入り",
} as const;

/**
 * チェックインの時刻（例：13:02）。
 * @param iso 時刻
 * @returns 時と分
 */
function timeOf(iso: string): string {
  return formatEventDateTime(iso).replace(/^.*）/u, "");
}

/**
 * 名簿から名前で探して選ぶ欄。
 * @param props 選べる行（choices）・選んだとき（onPick）・やめたとき（onCancel）・見出し（title）
 * @param props.choices 選べる行
 * @param props.onPick 選んだとき
 * @param props.onCancel やめたとき
 * @param props.title 見出し
 * @param props.children 下の並びに足すボタン（任意。「やめる」のあとに並べる）
 * @returns 欄の要素
 */
function ChoicePicker({
  choices,
  onPick,
  onCancel,
  title,
  children,
}: {
  choices: readonly Choice[];
  onPick: (choice: Choice) => void;
  onCancel: () => void;
  title: string;
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const key = normalizeCheckinName(query);
  const found = choices.filter((choice) => normalizeCheckinName(choice.name).includes(key));
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
    >
      <h3 className="text-m font-bold">{title}</h3>
      <Field label="名前で探す">
        <Input ref={inputRef} value={query} onChange={(change) => setQuery(change.target.value)} />
      </Field>
      {found.length === 0 ? (
        <p className="text-s text-text-sub">
          {choices.length === 0
            ? "名簿に、まだ来ていない確定の人はいません。"
            : "当たる人がいません。"}
        </p>
      ) : (
        <ul
          aria-label="名簿の人"
          className="flex max-h-dialog flex-col divide-y divide-border overflow-y-auto"
        >
          {found.map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                onClick={() => onPick(choice)}
                className="flex min-h-xl w-full items-center justify-between gap-xxs px-x3s text-left text-m hover:bg-surface-over"
              >
                <span>{choice.name}</span>
                <span className="text-s text-text-sub">
                  {APPLICATION_SOURCE_LABELS[choice.applicationSource]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* 枠の下の並び（「やめる」→ 足したもの の順。DESIGN.md の「ボタンの並べ方」） */}
      <ButtonRow>
        <Button type="button" onClick={onCancel}>
          やめる
        </Button>
        {children}
      </ButtonRow>
    </section>
  );
}

/**
 * 手でチェックインする欄（名簿から選んだ人か、飛び入り）。
 * @param props 交流会（event）・選んだ行（choice。飛び入りは undefined）・済んだとき（onDone）・やめたとき（onCancel）
 * @param props.event 交流会
 * @param props.choice 選んだ行
 * @param props.onDone 済んだとき
 * @param props.onCancel やめたとき
 * @returns 欄の要素
 */
function ManualForm({
  event,
  choice,
  onDone,
  onCancel,
}: {
  event: EventView;
  choice: Choice | undefined;
  onDone: (board: MatchBoard, name: string) => void;
  onCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<CheckinFormValues>({
    ...EMPTY_CHECKIN_FORM,
    name: choice?.name ?? "",
    applicationSource: choice?.applicationSource ?? null,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const mutation = useMutation({
    mutationFn: (input: CheckinInput) =>
      choice ? checkInEntry(event.id, choice.id, input) : walkIn(event.id, input),
    onSuccess: (board, input) => onDone(board, input.name),
    onError: (error) => {
      const fields = fieldErrorsFromApi(error);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setFocusRequest((count) => count + 1);
      }
    },
  });
  useEffect(() => {
    if (focusRequest > 0) focusFirstCheckinError(formRef.current);
  }, [focusRequest]);

  /**
   * 送る。
   * @param submitEvent フォームの送信
   */
  const submit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (mutation.isPending) return;
    const result = validateCheckinForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    mutation.mutate(result.input);
  };

  const title = choice
    ? `${choice.name}さんを手でチェックイン`
    : "名簿にいない人（飛び入り）をチェックイン";
  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      aria-label={title}
      className="flex flex-col gap-s rounded-md border border-border bg-surface p-xs"
    >
      <h3 className="text-l leading-tight font-bold">{title}</h3>
      <CheckinFields
        values={values}
        onChange={setValues}
        errors={errors}
        discounts={event.discounts}
      />
      <div className="flex flex-col gap-xxs">
        {/* 並べる順は「二番 → 主」（主は右・スマホは上。DESIGN.md の「ボタンの並べ方」） */}
        <ButtonRow>
          <Button type="button" onClick={onCancel}>
            やめる
          </Button>
          <Button type="submit" variant="primary" aria-disabled={mutation.isPending || undefined}>
            {mutation.isPending ? "チェックインしています…" : "チェックインする"}
          </Button>
        </ButtonRow>
        {mutation.isError && Object.keys(fieldErrorsFromApi(mutation.error)).length === 0 ? (
          <ResponseMessage tone="danger">
            {`チェックインできませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
    </form>
  );
}

/**
 * 当てを待つチェックインのカード。
 * @param props 交流会の ID（eventId）・チェックイン（checkin）・選べる行（choices）・済んだとき（onDone）
 * @param props.eventId 交流会の ID
 * @param props.checkin チェックイン
 * @param props.choices 選べる行
 * @param props.onDone 済んだとき（新しい画面と知らせの文）
 * @returns カードの要素
 */
function PendingCard({
  eventId,
  checkin,
  choices,
  onDone,
}: {
  eventId: string;
  checkin: BoardCheckin;
  choices: readonly Choice[];
  onDone: (board: MatchBoard, text: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const mutation = useMutation({
    mutationFn: (action: { kind: "match" | "dismiss"; entry: Choice } | { kind: "walk_in" }) =>
      action.kind === "walk_in"
        ? walkInFromCheckin(eventId, checkin.checkinId)
        : action.kind === "match"
          ? matchCheckin(eventId, checkin.checkinId, { entryId: action.entry.id })
          : dismissCandidate(eventId, checkin.checkinId, { entryId: action.entry.id }),
    onSuccess: (board, action) =>
      onDone(
        board,
        action.kind === "walk_in"
          ? `${checkin.name}さんを飛び入りとして名簿に足しました。`
          : action.kind === "match"
            ? `${checkin.name}さんを名簿の${action.entry.name}さんに当てました。`
            : `${checkin.name}さんと${action.entry.name}さんは、ちがう人にしました。`,
      ),
  });
  const run = (action: Parameters<typeof mutation.mutate>[0]) => {
    if (!mutation.isPending) mutation.mutate(action);
  };
  const candidate = checkin.state === "candidate" ? checkin.entry : null;
  return (
    <article
      aria-label={`${checkin.name}のチェックイン`}
      className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
    >
      <span className="text-xs text-text-sub">
        {`${checkin.method === "line" ? "LINE でチェックイン" : "手でチェックイン"}・${timeOf(checkin.checkedInAt)}`}
      </span>
      <strong className="text-m break-words">{checkin.name}</strong>
      {candidate ? (
        <>
          <p className="rounded-sm border border-border bg-surface-sunken px-xxs py-x3s text-s">
            名簿の候補：<strong>{candidate.name}</strong>
            {`（${APPLICATION_SOURCE_LABELS[candidate.applicationSource]}・確定）`}
            <br />
            <span className="text-text-sub">名前がそろうのは1人だけです</span>
          </p>
          {/* カードの中の操作なので、ButtonRow に入れずカードの中の同じ幅の2列に置く */}
          <div className="grid grid-cols-2 gap-xxs">
            <Button onClick={() => run({ kind: "match", entry: candidate })}>当てる</Button>
            <Button onClick={() => run({ kind: "dismiss", entry: candidate })}>ちがう人</Button>
          </div>
        </>
      ) : (
        <>
          <span className="text-s text-text-sub">名前がそろう人が名簿にいません</span>
          {picking ? (
            <ChoicePicker
              title={`${checkin.name}さんを名簿から選ぶ`}
              choices={choices}
              onPick={(entry) => run({ kind: "match", entry })}
              onCancel={() => setPicking(false)}
            />
          ) : (
            <div className="grid grid-cols-2 gap-xxs">
              <Button onClick={() => setPicking(true)}>名簿から選ぶ</Button>
              <Button onClick={() => run({ kind: "walk_in" })}>飛び入りにする</Button>
            </div>
          )}
        </>
      )}
      {mutation.isError ? (
        <ResponseMessage tone="danger">{`できませんでした。${errorMessage(mutation.error)}`}</ResponseMessage>
      ) : null}
    </article>
  );
}

/**
 * 名簿に当てる画面の中身。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns 画面の要素
 */
function MatchView({ event }: { event: EventView }) {
  const queryClient = useQueryClient();
  const board = useMatchBoard(event.id);
  const [message, setMessage] = useState<string>();
  const [manual, setManual] = useState<
    { step: "pick" } | { step: "form"; choice: Choice | undefined }
  >();

  /**
   * 済んだあと：画面を新しくし、名簿も読み直す。
   * @param next 新しい画面
   * @param text 知らせの文
   */
  const done = (next: MatchBoard, text: string) => {
    queryClient.setQueryData(BOOKING_QUERY_KEYS.matches(event.id), next);
    void queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.roster(event.id) });
    setMessage(text);
  };

  const data = board.data;
  const pending =
    data?.checkins.filter((item) => item.state === "candidate" || item.state === "unmatched") ?? [];
  const finished =
    data?.checkins.filter((item) => item.state !== "candidate" && item.state !== "unmatched") ?? [];
  return (
    <Page
      title={`名簿に当てる（${pending.length}）`}
      lead={
        data
          ? `${event.name}・来た ${data.counts.came} 人 ／ 確定 ${data.counts.confirmed} 人・飛び入り ${data.counts.walkIn} 人`
          : event.name
      }
    >
      {board.isRefetchError ? (
        <p className="text-s text-text-sub">
          {isNightStop(board.error)
            ? "夜間（0時〜8時）は止まっています。8時からもう一度開いてください。"
            : "最新にできませんでした。電波の良い所で、しばらく待つと読み直します。"}
        </p>
      ) : null}
      {message ? <ResponseMessage tone="success">{message}</ResponseMessage> : null}
      {board.isPending ? (
        <p role="status" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      ) : board.isLoadingError ? (
        <ResponseMessage tone="danger">{errorMessage(board.error)}</ResponseMessage>
      ) : data ? (
        <>
          {pending.length === 0 ? (
            <p className="text-m">当てを待つチェックインはありません。</p>
          ) : (
            <div className="grid gap-xxs wide:grid-cols-2">
              {pending.map((checkin) => (
                <PendingCard
                  key={checkin.checkinId}
                  eventId={event.id}
                  checkin={checkin}
                  choices={data.choices}
                  onDone={done}
                />
              ))}
            </div>
          )}
          <section aria-labelledby="match-done" className="flex flex-col gap-xxs">
            <h2 id="match-done" className="text-s font-bold text-text-sub">
              さっきのチェックイン
            </h2>
            {finished.length === 0 ? (
              <p className="text-s text-text-sub">まだありません。</p>
            ) : (
              <ul
                aria-labelledby="match-done"
                className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface"
              >
                {finished.slice(0, 20).map((checkin) => (
                  <li
                    key={checkin.checkinId}
                    className="flex min-h-xl items-center justify-between gap-xxs px-xs"
                  >
                    <span className="text-m break-words">{checkin.name}</span>
                    <span
                      className={
                        checkin.state === "walk_in"
                          ? "text-xs text-text-sub"
                          : "text-xs text-success-text"
                      }
                    >
                      {DONE_LABELS[checkin.state as keyof typeof DONE_LABELS]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {manual?.step === "pick" ? (
            <ChoicePicker
              title="手でチェックイン（名簿から選ぶ）"
              choices={data.choices}
              onPick={(choice) => setManual({ step: "form", choice })}
              onCancel={() => setManual(undefined)}
            >
              <Button type="button" onClick={() => setManual({ step: "form", choice: undefined })}>
                名簿にいない人（飛び入り）
              </Button>
            </ChoicePicker>
          ) : manual?.step === "form" ? (
            <ManualForm
              event={event}
              choice={manual.choice}
              onCancel={() => setManual(undefined)}
              onDone={(next, name) => {
                setManual(undefined);
                done(next, `${name}さんをチェックインしました。`);
              }}
            />
          ) : (
            <div className="sticky bottom-0 bg-background py-xxs">
              <ButtonRow>
                <Button
                  variant="primary"
                  onClick={() => {
                    setMessage(undefined);
                    setManual({ step: "pick" });
                  }}
                >
                  手でチェックイン（名簿から選ぶ）
                </Button>
              </ButtonRow>
            </div>
          )}
        </>
      ) : null}
    </Page>
  );
}

/** MatchPage が受け取るもの。 */
export type MatchPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * S1 名簿に当てる（ログインが要る・主催者と受付係）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function MatchPage({ eventId }: MatchPageProps) {
  return (
    <SessionGate>
      <EventAccessGate eventId={eventId} roles={["organizer", "staff"]}>
        {(event) => (
          <RosterGate event={event}>
            <MatchView event={event} />
          </RosterGate>
        )}
      </EventAccessGate>
    </SessionGate>
  );
}

const matchRouteApi = getRouteApi("/admin/events/$eventId/roster/match");

/**
 * S1 の道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function MatchRoute() {
  const { eventId } = matchRouteApi.useParams();
  return <MatchPage eventId={eventId} />;
}
