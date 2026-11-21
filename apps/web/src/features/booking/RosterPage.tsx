// A2 名簿（主催者・受付係。booking-001。モックアップ A2 のうち、キャンセル待ちと満員の帯を除く）。
// 上の操作：1人足す（主催者・受付係。画面の中に欄を開く）・貼る・CSV で入れる・書き出す（主催者だけ）・名簿に当てる。
// 人数の欄（確定・取り消し・来た・来なかった・飛び入り・媒体ごと）・絞り込み（すべて・確定・取り消し・来なかった）・表
// （名前・媒体・入口・状態・申し込んだ日時・来た）。同じ名前の印と「手で足した：（入れた人）」。主催者は行を取り消す・戻す・まとめる。
// 参加者のメールアドレスは出さない（持たない。FR-B26）。
import type { EventView } from "@workspace/contracts/event";
import type { Roster, RosterEntry, RosterEntryInput } from "@workspace/contracts/booking";
import {
  ATTENDANCE_LABELS,
  ENTRY_KIND_LABELS,
  ENTRY_MEMO_MAX,
  ENTRY_STATUS_LABELS,
  RosterEntryInput as RosterEntryInputSchema,
} from "@workspace/contracts/booking";
import { APPLICATION_SOURCE_LABELS, normalizeCheckinName } from "@workspace/contracts/reception";
import type { ApplicationSource } from "@workspace/contracts/reception";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { saveFile } from "../../lib/download.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { EventAccessGate, formatEventDateTime } from "../event/index.ts";
import { APPLICATION_SOURCE_OPTIONS, SameNameFlag } from "../reception/index.ts";
import { addEntry, downloadRosterCsv, mergeEntries, setEntryStatus } from "./api.ts";
import { BOOKING_QUERY_KEYS, useRoster } from "./queries.ts";
import { RosterGate } from "./RosterGate.tsx";

/** 絞り込み。 */
const FILTERS = [
  { value: "all", label: "すべて" },
  { value: "confirmed", label: "確定" },
  { value: "cancelled", label: "取り消し" },
  { value: "no_show", label: "来なかった" },
] as const;

/** 絞り込みの値。 */
type Filter = (typeof FILTERS)[number]["value"];

/**
 * 絞り込みに当たる行か。
 * @param entry 行
 * @param filter 絞り込み
 * @returns 当たれば true
 */
export function matchesFilter(entry: RosterEntry, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "no_show") return entry.attendance === "no_show";
  return entry.status === filter;
}

/**
 * 人数の欄の1つ。
 * @param props 名前（label）・中身（children）
 * @param props.label 名前
 * @param props.children 中身
 * @returns 欄の要素
 */
function CountTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-x3s rounded-md border border-border bg-surface px-xs py-xxs">
      <dt className="text-s text-text-sub">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * 人数の欄。
 * @param props 名簿（roster）
 * @param props.roster 名簿
 * @returns 欄の要素
 */
function Counts({ roster }: { roster: Roster }) {
  const bySource = roster.counts.bySource
    .filter((row) => row.count > 0)
    .map((row) => `${APPLICATION_SOURCE_LABELS[row.applicationSource]} ${row.count}`)
    .join("・");
  return (
    <div role="group" aria-label="人数">
      <dl className="grid grid-cols-2 gap-xxs wide:grid-cols-6">
        <CountTile label="確定">{roster.counts.confirmed}</CountTile>
        <CountTile label="取り消し">{roster.counts.cancelled}</CountTile>
        <CountTile label="来た">{roster.counts.came}</CountTile>
        <CountTile label="来なかった">{roster.eventEnded ? roster.counts.noShow : "—"}</CountTile>
        <CountTile label="飛び入り">{roster.counts.walkIn}</CountTile>
        <div className="col-span-2 flex min-w-0 flex-col gap-x3s rounded-md border border-border bg-surface px-xs py-xxs wide:col-span-1">
          <dt className="text-s text-text-sub">媒体ごと（確定）</dt>
          <dd className="text-s break-words">{bySource || "まだいません"}</dd>
        </div>
      </dl>
    </div>
  );
}

/** 1人足す欄の値。 */
type AddValues = { name: string; applicationSource: ApplicationSource | null; memo: string };

/**
 * 1人足す欄（画面の中に開く。重ねない）。
 * @param props 交流会の ID（eventId）・済んだとき（onDone）・やめたとき（onCancel）
 * @param props.eventId 交流会の ID
 * @param props.onDone 済んだとき（足した行）
 * @param props.onCancel やめたとき
 * @returns 欄の要素
 */
function AddEntryForm({
  eventId,
  onDone,
  onCancel,
}: {
  eventId: string;
  onDone: (entry: RosterEntry) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<AddValues>({ name: "", applicationSource: null, memo: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useMutation({
    mutationFn: (input: RosterEntryInput) => addEntry(eventId, input),
    onSuccess: onDone,
    onError: (error) => setErrors(fieldErrorsFromApi(error)),
  });

  /**
   * 送る。
   * @param event フォームの送信
   */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const parsed = RosterEntryInputSchema.safeParse({
      name: values.name,
      applicationSource: values.applicationSource ?? undefined,
      memo: values.memo.trim() === "" ? null : values.memo,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby="roster-add-title"
      className="flex flex-col gap-s rounded-md border border-border bg-surface p-xs"
    >
      <h2 id="roster-add-title" className="text-l leading-tight font-bold">
        1人足す
      </h2>
      <Field label="名前" error={errors.name}>
        <Input
          name="name"
          autoComplete="off"
          value={values.name}
          onChange={(change) => setValues({ ...values, name: change.target.value })}
        />
      </Field>
      <ChoiceChips
        label="媒体"
        options={APPLICATION_SOURCE_OPTIONS}
        value={values.applicationSource}
        onValueChange={(applicationSource) => setValues({ ...values, applicationSource })}
        error={errors.applicationSource}
      />
      <Field
        label="メモ"
        description={`任意・${ENTRY_MEMO_MAX}文字まで（例：電話で申込み）`}
        error={errors.memo}
      >
        <Textarea
          name="memo"
          rows={2}
          value={values.memo}
          onChange={(change) => setValues({ ...values, memo: change.target.value })}
        />
      </Field>
      <div className="flex flex-col gap-xxs">
        <div className="flex flex-wrap gap-xxs">
          <Button
            type="submit"
            aria-disabled={mutation.isPending || undefined}
            className="min-h-xl"
          >
            {mutation.isPending ? "足しています…" : "名簿に足す"}
          </Button>
          <Button type="button" className="min-h-xl" onClick={onCancel}>
            やめる
          </Button>
        </div>
        {mutation.isError && Object.keys(fieldErrorsFromApi(mutation.error)).length === 0 ? (
          <ResponseMessage tone="danger">
            {`足せませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
    </form>
  );
}

/**
 * 名簿の行の名前と印（同じ名前・手で足した・メモ）。
 * @param props 行（entry）
 * @param props.entry 行
 * @returns 要素
 */
function EntryName({ entry }: { entry: RosterEntry }) {
  return (
    <div className="flex flex-col items-start gap-x3s">
      <span
        className={
          entry.status === "cancelled"
            ? "text-m break-words text-text-sub line-through"
            : "text-m break-words"
        }
      >
        {entry.name}
      </span>
      {entry.sameName ? <SameNameFlag /> : null}
      {entry.entryKind === "manual" ? (
        <Badge className="border-border bg-surface-sunken font-normal whitespace-normal text-text-sub">
          {entry.enteredByName ? `手で足した：${entry.enteredByName}` : "手で足した"}
        </Badge>
      ) : null}
      {entry.memo ? <span className="text-s break-words text-text-sub">{entry.memo}</span> : null}
    </div>
  );
}

/**
 * 行の来たか（まだは —）。
 * @param props 行（entry）
 * @param props.entry 行
 * @returns 要素
 */
function AttendanceText({ entry }: { entry: RosterEntry }) {
  return entry.attendance === "pending" ? (
    <span className="text-text-sub">—</span>
  ) : (
    <span>{ATTENDANCE_LABELS[entry.attendance]}</span>
  );
}

/**
 * 名簿の画面の中身。
 * @param props 交流会（event）
 * @param props.event 交流会（役目つき）
 * @returns 画面の要素
 */
function RosterView({ event }: { event: EventView }) {
  const organizer = event.myRole === "organizer";
  const queryClient = useQueryClient();
  const roster = useRoster(event.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string }>();
  const [merging, setMerging] = useState<{ keep: RosterEntry; remove: RosterEntry }>();

  const refresh = () => queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
  const status = useMutation({
    mutationFn: (input: { entry: RosterEntry; status: "confirmed" | "cancelled" }) =>
      setEntryStatus(event.id, input.entry.id, input.status),
    onSuccess: async (entry) => {
      setMessage({
        tone: "success",
        text: `${entry.name}さんを${entry.status === "cancelled" ? "取り消し" : "確定"}にしました。`,
      });
      await refresh();
    },
    onError: (error) =>
      setMessage({ tone: "danger", text: `直せませんでした。${errorMessage(error)}` }),
  });
  const merge = useMutation({
    mutationFn: (input: { keep: RosterEntry; remove: RosterEntry }) =>
      mergeEntries(event.id, { keepEntryId: input.keep.id, removeEntryId: input.remove.id }),
    onSuccess: async (entry) => {
      setMerging(undefined);
      setMessage({ tone: "success", text: `${entry.name}さんの2つの行を1つにまとめました。` });
      await refresh();
    },
  });
  const exporting = useMutation({
    mutationFn: () => downloadRosterCsv(event.id),
    onSuccess: (file) => saveFile(file.blob, file.filename),
    onError: (error) =>
      setMessage({ tone: "danger", text: `書き出せませんでした。${errorMessage(error)}` }),
  });

  const entries = roster.data?.entries ?? [];
  const visible = entries.filter((entry) => matchesFilter(entry, filter));

  /**
   * まとめる相手（同じ名前のほかの行のうち最初のもの）。
   * @param entry 行
   * @returns 相手の行
   */
  const mergeTarget = (entry: RosterEntry) =>
    entries.find(
      (other) =>
        other.id !== entry.id &&
        other.status !== "cancelled" &&
        normalizeCheckinName(other.name) === normalizeCheckinName(entry.name),
    );

  /**
   * 行の操作（主催者だけ：取り消す・戻す・同じ名前があればまとめる）。
   * @param entry 行
   * @returns 操作の要素
   */
  const actionsOf = (entry: RosterEntry) => {
    const target = entry.sameName ? mergeTarget(entry) : undefined;
    return (
      <div className="flex flex-wrap gap-x3s">
        <Button
          variant="text"
          className="min-h-xl"
          aria-label={`${entry.name}を${entry.status === "cancelled" ? "確定に戻す" : "取り消す"}`}
          onClick={() => {
            if (status.isPending) return;
            setMessage(undefined);
            status.mutate({
              entry,
              status: entry.status === "cancelled" ? "confirmed" : "cancelled",
            });
          }}
        >
          {entry.status === "cancelled" ? "戻す" : "取り消す"}
        </Button>
        {target ? (
          <Button
            variant="text"
            className="min-h-xl"
            aria-label={`${entry.name}の同じ名前の行をまとめる`}
            onClick={() => {
              merge.reset();
              setMerging({ keep: entry, remove: target });
            }}
          >
            まとめる
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <Page
      title="名簿"
      lead={`${event.name}（${formatEventDateTime(event.startsAt)}）`}
      actions={
        <>
          <Button
            onClick={() => {
              setMessage(undefined);
              setAdding(true);
            }}
          >
            1人足す
          </Button>
          {organizer ? (
            <Link
              to="/admin/events/$eventId/roster/import"
              params={{ eventId: event.id }}
              className={buttonVariants({ variant: "secondary" })}
            >
              貼る・CSV で入れる
            </Link>
          ) : null}
          {organizer ? (
            <Button
              aria-disabled={exporting.isPending || undefined}
              onClick={() => {
                if (!exporting.isPending) exporting.mutate();
              }}
            >
              書き出す
            </Button>
          ) : null}
          <Link
            to="/admin/events/$eventId/roster/match"
            params={{ eventId: event.id }}
            className={buttonVariants({ variant: "secondary" })}
          >
            名簿に当てる
          </Link>
        </>
      }
    >
      {message ? <ResponseMessage tone={message.tone}>{message.text}</ResponseMessage> : null}
      {adding ? (
        <AddEntryForm
          eventId={event.id}
          onCancel={() => setAdding(false)}
          onDone={(entry) => {
            setAdding(false);
            setMessage({ tone: "success", text: `${entry.name}さんを名簿に足しました。` });
            void refresh();
          }}
        />
      ) : null}
      {roster.isPending ? (
        <p role="status" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      ) : roster.isError ? (
        <ResponseMessage tone="danger">{errorMessage(roster.error)}</ResponseMessage>
      ) : (
        <>
          <Counts roster={roster.data} />
          <ChoiceChips
            label="絞り込み"
            options={FILTERS}
            value={filter}
            onValueChange={setFilter}
          />
          {entries.length === 0 ? (
            <p className="text-m">
              {organizer
                ? "まだ名簿に誰もいません。「貼る・CSV で入れる」か「1人足す」で入れてください。"
                : "まだ名簿に誰もいません。「1人足す」で入れられます。"}
            </p>
          ) : visible.length === 0 ? (
            <p className="text-m">この絞り込みに当たる人はいません。</p>
          ) : (
            <>
              <div className="hidden wide:block">
                <Table aria-label="名簿">
                  <TableHeader>
                    <TableRow>
                      <TableHead>名前</TableHead>
                      <TableHead>媒体</TableHead>
                      <TableHead>入口</TableHead>
                      <TableHead>状態</TableHead>
                      <TableHead>申し込んだ日時</TableHead>
                      <TableHead>来た</TableHead>
                      {organizer ? (
                        <TableHead>
                          <span className="sr-only">操作</span>
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <EntryName entry={entry} />
                        </TableCell>
                        <TableCell>{APPLICATION_SOURCE_LABELS[entry.applicationSource]}</TableCell>
                        <TableCell>{ENTRY_KIND_LABELS[entry.entryKind]}</TableCell>
                        <TableCell>{ENTRY_STATUS_LABELS[entry.status]}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatEventDateTime(entry.appliedAt)}
                        </TableCell>
                        <TableCell>
                          <AttendanceText entry={entry} />
                        </TableCell>
                        {organizer ? <TableCell>{actionsOf(entry)}</TableCell> : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul aria-label="名簿" className="flex flex-col gap-xxs wide:hidden">
                {visible.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
                  >
                    <EntryName entry={entry} />
                    <span className="text-s">
                      {`${APPLICATION_SOURCE_LABELS[entry.applicationSource]}・${ENTRY_KIND_LABELS[entry.entryKind]}・${ENTRY_STATUS_LABELS[entry.status]}`}
                    </span>
                    <span className="text-s text-text-sub tabular-nums">
                      {`申し込んだ日時：${formatEventDateTime(entry.appliedAt)}`}
                    </span>
                    <span className="text-s">
                      来た：
                      <AttendanceText entry={entry} />
                    </span>
                    {organizer ? actionsOf(entry) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <ConfirmDialog
        open={merging !== undefined}
        onOpenChange={(open) => {
          if (!open) setMerging(undefined);
        }}
        title="同じ名前の行をまとめますか"
        confirmLabel="まとめる"
        pendingLabel="まとめています…"
        pending={merge.isPending}
        error={merge.isError ? errorMessage(merge.error) : undefined}
        onConfirm={() => {
          if (merging) merge.mutate(merging);
        }}
      >
        {merging ? (
          <>
            <p>{`この行（${APPLICATION_SOURCE_LABELS[merging.keep.applicationSource]}・${ENTRY_KIND_LABELS[merging.keep.entryKind]}）を残し、もう一方の行（${APPLICATION_SOURCE_LABELS[merging.remove.applicationSource]}・${ENTRY_KIND_LABELS[merging.remove.entryKind]}・${formatEventDateTime(merging.remove.appliedAt)}）を消します。`}</p>
            <p>もう一方の行に当てたチェックインやメモは、残す行に移します。</p>
          </>
        ) : null}
      </ConfirmDialog>
    </Page>
  );
}

/** RosterPage が受け取るもの。 */
export type RosterPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * A2 名簿（ログインが要る・主催者と受付係）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function RosterPage({ eventId }: RosterPageProps) {
  return (
    <SessionGate>
      <EventAccessGate eventId={eventId} roles={["organizer", "staff"]}>
        {(event) => (
          <RosterGate event={event}>
            <RosterView event={event} />
          </RosterGate>
        )}
      </EventAccessGate>
    </SessionGate>
  );
}

const rosterRouteApi = getRouteApi("/admin/events/$eventId/roster");

/**
 * A2 の道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function RosterRoute() {
  const { eventId } = rosterRouteApi.useParams();
  return <RosterPage eventId={eventId} />;
}
