// A3 名簿に入れる（主催者だけ。booking-001。モックアップ A3）：タブ「名前をまとめて貼る」「CSV を取り込む」。
// CSV は画面の中で読み、サーバーに送るのは選んだ名前の列と行の番号だけ（research R5）。名前の列と媒体を選ぶと、
// 取り込む前の確かめ（入る・すでにある・名前が空）を出し、「N人を取り込む」で入れる。同じ見出しの CSV は、持ち主が前に選んだ
// 名前の列と媒体を最初から選んでおく（research R6）。入れたら名簿へ移り、画面の上の知らせの帯で伝える。
import type { EventView } from "@workspace/contracts/event";
import type { RosterImportInput } from "@workspace/contracts/booking";
import {
  ROSTER_IMPORT_FILE_MAX_BYTES,
  ROSTER_IMPORT_ROWS_MAX,
  bookingPaths,
  importMappingFits,
} from "@workspace/contracts/booking";
import { CHECKIN_NAME_MAX } from "@workspace/contracts/reception";
import type { ApplicationSource } from "@workspace/contracts/reception";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { inputClassName } from "@workspace/ui/components/input";
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
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { EventAccessGate } from "../event/index.ts";
import { APPLICATION_SOURCE_OPTIONS, SameNameFlag } from "../reception/index.ts";
import { fetchImportMappings, previewImport, runImport } from "./api.ts";
import { decodeCsv, parseCsv, splitPastedNames } from "../../lib/csv-read.ts";
import type { ParsedCsv } from "../../lib/csv-read.ts";
import { BOOKING_QUERY_KEYS } from "./queries.ts";
import { RosterGate } from "./RosterGate.tsx";

/** タブ。 */
const TABS = [
  { id: "paste", label: "名前をまとめて貼る" },
  { id: "csv", label: "CSV を取り込む" },
] as const;

/** タブの ID。 */
type TabId = (typeof TABS)[number]["id"];

/** 取り込む行の見積もりの頼み（媒体・行・CSV の対応）。 */
type Request = RosterImportInput;

/** 見積もりの行の結果の言葉。 */
const OUTCOME_LABELS = { insert: "入る", existing: "すでにある", empty: "名前が空" } as const;

/**
 * 行の名前が長すぎないか確かめる。
 * @param rows 行
 * @returns 長すぎる行の番号（なければ undefined）
 */
function tooLongLine(rows: readonly { line: number; name: string }[]): number | undefined {
  return rows.find((row) => row.name.length > CHECKIN_NAME_MAX)?.line;
}

/**
 * 名前の列を選ぶ欄（Field の中で使う）。
 * @param props 見出し（headers）・選んだ列（value）・変えたとき（onChange）
 * @param props.headers 見出し
 * @param props.value 選んだ列
 * @param props.onChange 変えたとき
 * @returns 欄の要素
 */
function ColumnSelect({
  headers,
  value,
  onChange,
}: {
  headers: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-xl`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      <option value="">選んでください</option>
      {headers.map((header) => (
        <option key={header} value={header}>
          {header}
        </option>
      ))}
    </select>
  );
}

/**
 * CSV のファイルを選ぶ欄（Field の中で使う）。
 * @param props 選んだとき（onChange）
 * @param props.onChange 選んだとき
 * @returns 欄の要素
 */
function FileInput({
  onChange,
}: {
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const control = useFieldControl();
  return (
    <input
      {...control}
      type="file"
      accept=".csv,text/csv"
      onChange={onChange}
      className="min-h-xl text-m file:mr-xxs file:min-h-l file:rounded-sm file:border file:border-border-input file:bg-surface file:px-xs file:text-m"
    />
  );
}

/**
 * タブの並び（矢印で移って選ぶ。選んだタブだけ Tab で止まる）。
 * @param props 選んだタブ（selected）・選んだとき（onSelect）
 * @param props.selected 選んだタブ
 * @param props.onSelect 選んだとき
 * @returns 要素
 */
function TabList({ selected, onSelect }: { selected: TabId; onSelect: (tab: TabId) => void }) {
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({ paste: null, csv: null });
  return (
    <div
      role="tablist"
      aria-label="入れ方"
      className="flex flex-wrap gap-x3s border-b border-border"
    >
      {TABS.map((tab, index) => {
        const current = tab.id === selected;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            id={`roster-import-tab-${tab.id}`}
            aria-controls={`roster-import-panel-${tab.id}`}
            aria-selected={current}
            tabIndex={current ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const next = TABS[(index + 1) % TABS.length];
              if (!next) return;
              onSelect(next.id);
              refs.current[next.id]?.focus();
            }}
            className={
              current
                ? "-mb-px min-h-xl border-b-2 border-primary px-xs text-m font-bold text-text"
                : "-mb-px min-h-xl border-b-2 border-transparent px-xs text-m text-text-sub"
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 取り込む前の確かめと「N人を取り込む」。
 * @param props 交流会の ID（eventId）・頼み（request）
 * @param props.eventId 交流会の ID
 * @param props.request 見積もりの頼み
 * @returns 要素
 */
function PreviewPanel({ eventId, request }: { eventId: string; request: Request }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ["booking", "import-preview", eventId, JSON.stringify(request)],
    queryFn: () => previewImport(eventId, request),
  });
  const mutation = useMutation({
    mutationFn: () => runImport(eventId, request),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
      const path = bookingPaths.roster(eventId);
      const { insert, existing } = result.counts;
      showNotice({
        tone: "success",
        message:
          existing > 0
            ? `${insert}人を名簿に取り込みました（${existing}行はすでにあったので入れていません）。`
            : `${insert}人を名簿に取り込みました。`,
        path,
      });
      await navigate({ to: "/admin/events/$eventId/roster", params: { eventId } });
    },
  });

  if (preview.isPending) {
    return (
      <p role="status" className="text-m text-text-sub">
        確かめています…
      </p>
    );
  }
  if (preview.isError)
    return <ResponseMessage tone="danger">{errorMessage(preview.error)}</ResponseMessage>;
  const { rows, counts } = preview.data;
  return (
    <section aria-labelledby="roster-import-preview" className="flex flex-col gap-xs">
      <h2 id="roster-import-preview" className="text-l leading-tight font-bold">
        取り込む前の確かめ
      </h2>
      <p role="status" className="flex flex-wrap gap-xs text-s">
        <span>
          <strong className="text-m">{counts.insert}</strong> 人 入ります
        </span>
        <span className="text-text-sub">{counts.existing} 行 すでにある（入りません）</span>
        <span className="text-text-sub">{counts.empty} 行 名前が空（入りません）</span>
      </p>
      <div className="overflow-x-auto rounded-md border border-border bg-surface">
        <Table aria-label="取り込む前の確かめ">
          <TableHeader>
            <TableRow>
              <TableHead>行</TableHead>
              <TableHead>名前</TableHead>
              <TableHead>どうなるか</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.line}
                className={row.outcome === "insert" ? undefined : "text-text-sub"}
              >
                <TableCell className="tabular-nums">{row.line}</TableCell>
                <TableCell>{row.name === "" ? "（空）" : row.name}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-x3s">
                    {OUTCOME_LABELS[row.outcome]}
                    {row.sameName ? <SameNameFlag /> : null}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col items-start gap-xxs">
        {/* 並べる順は「二番 → 主」（主は右・スマホは上。DESIGN.md の「ボタンの並べ方」） */}
        <ButtonRow>
          <Link
            to="/admin/events/$eventId/roster"
            params={{ eventId }}
            className={buttonVariants({ variant: "secondary" })}
          >
            やめる
          </Link>
          <Button
            variant="primary"
            aria-disabled={mutation.isPending || counts.insert === 0 || undefined}
            onClick={() => {
              if (!mutation.isPending && counts.insert > 0) mutation.mutate();
            }}
          >
            {mutation.isPending ? "取り込んでいます…" : `${counts.insert}人を取り込む`}
          </Button>
        </ButtonRow>
        {counts.insert === 0 ? (
          <p className="text-s text-text-sub">
            入る人がいません。名前の列と媒体を確かめてください。
          </p>
        ) : null}
        {mutation.isError ? (
          <ResponseMessage tone="danger">{`取り込めませんでした。${errorMessage(mutation.error)}`}</ResponseMessage>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 名前をまとめて貼るタブ。
 * @param props 交流会の ID（eventId）
 * @param props.eventId 交流会の ID
 * @returns 要素
 */
function PastePanel({ eventId }: { eventId: string }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<ApplicationSource | null>(null);
  const [errors, setErrors] = useState<{ text?: string; source?: string }>({});
  const [request, setRequest] = useState<Request>();

  /** 確かめる（貼った名前を切って、見積もりを頼む）。 */
  const check = () => {
    const rows = splitPastedNames(text);
    const next: { text?: string; source?: string } = {};
    if (rows.length === 0) next.text = "名前を1行に1人ずつ貼ってください。";
    else if (rows.length > ROSTER_IMPORT_ROWS_MAX) {
      next.text = `一度に入れられるのは${ROSTER_IMPORT_ROWS_MAX}行までです。分けて貼ってください。`;
    } else {
      const line = tooLongLine(rows);
      if (line !== undefined)
        next.text = `${line}行目の名前が長すぎます。${CHECKIN_NAME_MAX}文字までにしてください。`;
    }
    if (!source) next.source = "媒体を選んでください。";
    setErrors(next);
    setRequest(
      next.text || next.source || !source ? undefined : { applicationSource: source, rows },
    );
  };

  return (
    <div className="flex flex-col gap-s">
      <Field
        label="名前（1行に1人）"
        description="掲載サイトの参加者の一覧などから、名前だけを貼ります。"
        error={errors.text}
      >
        <Textarea
          name="names"
          rows={8}
          value={text}
          onChange={(change) => {
            setText(change.target.value);
            setRequest(undefined);
          }}
        />
      </Field>
      <ChoiceChips
        label="媒体"
        options={APPLICATION_SOURCE_OPTIONS}
        value={source}
        onValueChange={(value) => {
          setSource(value);
          setRequest(undefined);
        }}
        error={errors.source}
      />
      <ButtonRow>
        <Button onClick={check}>取り込む前に確かめる</Button>
      </ButtonRow>
      {request ? <PreviewPanel eventId={eventId} request={request} /> : null}
    </div>
  );
}

/**
 * CSV を取り込むタブ。
 * @param props 交流会の ID（eventId）
 * @param props.eventId 交流会の ID
 * @returns 要素
 */
function CsvPanel({ eventId }: { eventId: string }) {
  const mappings = useQuery({
    queryKey: BOOKING_QUERY_KEYS.mappings(eventId),
    queryFn: () => fetchImportMappings(eventId),
  });
  const [file, setFile] = useState<{ name: string; csv: ParsedCsv }>();
  const [fileError, setFileError] = useState<string>();
  const [column, setColumn] = useState("");
  const [source, setSource] = useState<ApplicationSource | null>(null);
  const [remembered, setRemembered] = useState(false);

  /**
   * ファイルを読む（画面の中だけ。送らない）。
   * @param event ファイルの選択
   */
  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    setFile(undefined);
    setFileError(undefined);
    setColumn("");
    setRemembered(false);
    if (!chosen) return;
    if (chosen.size > ROSTER_IMPORT_FILE_MAX_BYTES) {
      setFileError("ファイルが大きすぎます（5MB まで）。名前の列だけを残した CSV にしてください。");
      return;
    }
    const csv = parseCsv(decodeCsv(await chosen.arrayBuffer()));
    if (csv.headers.length === 0 || csv.rows.length === 0) {
      setFileError(
        "CSV の中身が読めませんでした。1行目が見出しで、2行目から1行に1人の CSV を選んでください。",
      );
      return;
    }
    if (csv.rows.length > ROSTER_IMPORT_ROWS_MAX) {
      setFileError(
        `一度に取り込めるのは${ROSTER_IMPORT_ROWS_MAX}行までです。ファイルを分けてください。`,
      );
      return;
    }
    setFile({ name: chosen.name, csv });
    const key = JSON.stringify(csv.headers);
    const known = mappings.data?.mappings.find((item) => JSON.stringify(item.headers) === key);
    if (known && csv.headers.includes(known.nameColumn)) {
      setColumn(known.nameColumn);
      setSource(known.applicationSource);
      setRemembered(true);
    }
  };

  const columnIndex = file ? file.csv.headers.indexOf(column) : -1;
  const rows =
    file && columnIndex >= 0
      ? file.csv.rows.map((row) => ({
          line: row.line,
          name: (row.cells[columnIndex] ?? "").trim(),
        }))
      : [];
  const longLine = tooLongLine(rows);
  // 列が多い・見出しが長い CSV は、列の対応を送らずに名前だけで取り込む（覚えないだけで、取り込みは止めない）
  const rememberable = file !== undefined && importMappingFits(file.csv.headers, column);
  const request: Request | undefined =
    file && columnIndex >= 0 && source && longLine === undefined
      ? {
          applicationSource: source,
          rows,
          ...(rememberable ? { mapping: { headers: file.csv.headers, nameColumn: column } } : {}),
        }
      : undefined;

  return (
    <div className="flex flex-col gap-s">
      <Field
        label="1. ファイル"
        description="ファイルは画面の中で読むだけで、そのまま送ったり残したりしません。Google フォームの回答や掲載サイトの参加者の一覧（CSV）を選びます。"
        error={fileError}
      >
        <FileInput onChange={(event) => void onFile(event)} />
      </Field>
      {file ? <p className="text-s">{`${file.name}（${file.csv.rows.length}行）`}</p> : null}
      {file ? (
        <Field
          label="2. 名前の列"
          description={
            !rememberable && column !== ""
              ? "この CSV は列が多いか見出しが長いので、選んだ列は覚えません（取り込みはできます）。"
              : remembered
                ? "前に選んだ列を選んでいます。選んだ列は覚え、次から同じ見出しの CSV で自動で選びます。"
                : "選んだ列は覚え、次から同じ見出しの CSV で自動で選びます。"
          }
          error={
            longLine === undefined
              ? undefined
              : `${longLine}行目の名前が長すぎます。${CHECKIN_NAME_MAX}文字までの列を選んでください。`
          }
        >
          <ColumnSelect headers={file.csv.headers} value={column} onChange={setColumn} />
        </Field>
      ) : null}
      {file ? (
        <ChoiceChips
          label="3. 媒体"
          description="Google フォーム・こくちーずなどは「その他」を選びます。"
          options={APPLICATION_SOURCE_OPTIONS}
          value={source}
          onValueChange={setSource}
        />
      ) : null}
      {request ? <PreviewPanel eventId={eventId} request={request} /> : null}
    </div>
  );
}

/**
 * 名簿に入れる画面の中身。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns 画面の要素
 */
function ImportView({ event }: { event: EventView }) {
  const [tab, setTab] = useState<TabId>("paste");
  return (
    <Page
      title="名簿に入れる"
      lead={event.name}
      actions={
        <Link
          to="/admin/events/$eventId/roster"
          params={{ eventId: event.id }}
          className={buttonVariants({ variant: "secondary" })}
        >
          名簿に戻る
        </Link>
      }
    >
      <TabList selected={tab} onSelect={setTab} />
      {TABS.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`roster-import-panel-${item.id}`}
          aria-labelledby={`roster-import-tab-${item.id}`}
          hidden={tab !== item.id}
        >
          {tab === item.id ? (
            item.id === "paste" ? (
              <PastePanel eventId={event.id} />
            ) : (
              <CsvPanel eventId={event.id} />
            )
          ) : null}
        </div>
      ))}
    </Page>
  );
}

/** ImportPage が受け取るもの。 */
export type ImportPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * A3 名簿に入れる（ログインが要る・主催者だけ）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function ImportPage({ eventId }: ImportPageProps) {
  return (
    <SessionGate>
      <EventAccessGate eventId={eventId} roles={["organizer"]}>
        {(event) => (
          <RosterGate event={event}>
            <ImportView event={event} />
          </RosterGate>
        )}
      </EventAccessGate>
    </SessionGate>
  );
}

const importRouteApi = getRouteApi("/admin/events/$eventId/roster/import");

/**
 * A3 の道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function ImportRoute() {
  const { eventId } = importRouteApi.useParams();
  return <ImportPage eventId={eventId} />;
}
