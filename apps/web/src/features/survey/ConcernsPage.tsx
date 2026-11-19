// 困りごとの画面（主催者だけ。EXPERIENCE.md の A3 の困りごと・FR-14・UJ-4）。管理の画面の行き来は外枠のナビ（core-003）。
// 回答ごとに、名前（チェックインの名前。AD-6）・困りごと・月いくら・テスター・仕事の立場・職種。
// 表の上に「絞りこみ」（すべて／テスターに「はい」だけ）と「並べ方」（回答の新しい順／月いくらの高い順）のチップ。
// 広い画面は表、狭い画面はカード。5秒おきに読み直す（queries.ts）。読み直しが失敗しても前のものを出したまま。
// 絞りこみ・並べ方を変えたら、その鍵で読めるまで前の行を出さない（読みこみ中・読めなければ誤りを出す）。
import type { EventView } from "@workspace/contracts/event";
import type { SurveyAnswerRow, SurveyListQuery, SurveySort } from "@workspace/contracts/survey";
import {
  JOB_ROLE_LABELS,
  JOB_TYPE_LABELS,
  MONTHLY_PRICE_LABELS,
  SURVEY_COLUMN_LABELS,
  TESTER_ANSWER_LABELS,
  choiceLabel,
} from "@workspace/contracts/survey";
import { Link, getRouteApi } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import type { ChoiceOption } from "@workspace/ui/components/choice-chips";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { EventAccessGate, formatEventDateTime } from "../event/index.ts";
import { isNightStop, useSurveyAnswers } from "./queries.ts";

/** 絞りこみの値。 */
type FilterValue = "all" | "tester";

/** 絞りこみのチップ。 */
const FILTER_OPTIONS: readonly ChoiceOption<FilterValue>[] = [
  { value: "all", label: "すべて" },
  { value: "tester", label: "テスターに「はい」だけ" },
];

/** 並べ方のチップ。 */
const SORT_OPTIONS: readonly ChoiceOption<SurveySort>[] = [
  { value: "newest", label: "回答の新しい順" },
  { value: "price", label: "月いくらの高い順" },
];

/**
 * 絞りこみと並べ方を、窓口の問い合わせにする（値のない欄は入れない。問い合わせの鍵をそろえるため）。
 * @param filter 絞りこみ
 * @param sort 並べ方
 * @returns 問い合わせ
 */
export function toListQuery(filter: FilterValue, sort: SurveySort): SurveyListQuery {
  return filter === "tester" ? { tester: "yes", sort } : { sort };
}

/**
 * 1つの回答の選択肢の言葉（月いくら・テスター・仕事の立場・職種）。
 * @param row 回答
 * @returns 言葉
 */
function choiceTexts(row: SurveyAnswerRow) {
  return {
    monthlyPrice: choiceLabel(MONTHLY_PRICE_LABELS, row.monthlyPrice),
    tester: choiceLabel(TESTER_ANSWER_LABELS, row.tester),
    jobRole: choiceLabel(JOB_ROLE_LABELS, row.jobRole),
    jobType: choiceLabel(JOB_TYPE_LABELS, row.jobType),
  };
}

/**
 * 回答の表（広い画面）とカード（狭い画面）。
 * @param props 回答（rows）
 * @param props.rows 回答の並び
 * @returns 要素
 */
function AnswerRows({ rows }: { rows: readonly SurveyAnswerRow[] }) {
  return (
    <>
      <div className="hidden wide:block">
        <Table>
          <TableCaption className="sr-only">困りごと</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>名前</TableHead>
              <TableHead>{SURVEY_COLUMN_LABELS.concern}</TableHead>
              <TableHead>{SURVEY_COLUMN_LABELS.monthlyPrice}</TableHead>
              <TableHead>{SURVEY_COLUMN_LABELS.tester}</TableHead>
              <TableHead>{SURVEY_COLUMN_LABELS.jobRole}</TableHead>
              <TableHead>{SURVEY_COLUMN_LABELS.jobType}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const texts = choiceTexts(row);
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-bold break-words">{row.name}</TableCell>
                  <TableCell className="whitespace-pre-wrap break-words">
                    {row.concern ?? ""}
                  </TableCell>
                  <TableCell>{texts.monthlyPrice}</TableCell>
                  <TableCell>{texts.tester}</TableCell>
                  <TableCell>{texts.jobRole}</TableCell>
                  <TableCell>{texts.jobType}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="困りごと" className="flex flex-col gap-xxs wide:hidden">
        {rows.map((row) => {
          const texts = choiceTexts(row);
          const details = [
            [SURVEY_COLUMN_LABELS.monthlyPrice, texts.monthlyPrice],
            [SURVEY_COLUMN_LABELS.tester, texts.tester],
            [SURVEY_COLUMN_LABELS.jobRole, texts.jobRole],
            [SURVEY_COLUMN_LABELS.jobType, texts.jobType],
          ] as const;
          return (
            <li
              key={row.id}
              className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
            >
              <p className="text-m font-bold break-words">{row.name}</p>
              {row.concern ? (
                <p className="text-m whitespace-pre-wrap break-words">{row.concern}</p>
              ) : null}
              <dl className="flex flex-wrap gap-x-xs gap-y-x3s text-s">
                {details.map(([term, value]) => (
                  <div key={term} className="flex gap-x3s">
                    <dt className="text-text-sub">{term}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * 困りごとの画面の中身（主催者だけ）。
 * @param props 交流会（event）
 * @param props.event 交流会（役目つき）
 * @returns 画面の要素
 */
function Concerns({ event }: { event: EventView }) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sort, setSort] = useState<SurveySort>("newest");
  const query = useSurveyAnswers(event.id, toListQuery(filter, sort));
  const rows = query.data?.answers;

  return (
    <Page
      title="困りごと"
      lead={`${event.name}（${formatEventDateTime(event.startsAt)}）`}
      actions={
        <Link
          to="/admin/events/$eventId/data"
          params={{ eventId: event.id }}
          className={buttonVariants({ variant: "secondary" })}
        >
          書き出しと削除
        </Link>
      }
    >
      <div className="flex flex-col gap-xs wide:flex-row wide:gap-m">
        <ChoiceChips
          label="絞りこみ"
          options={FILTER_OPTIONS}
          value={filter}
          onValueChange={setFilter}
        />
        <ChoiceChips label="並べ方" options={SORT_OPTIONS} value={sort} onValueChange={setSort} />
      </div>
      {query.isRefetchError ? (
        <p className="text-s text-text-sub">
          {isNightStop(query.error)
            ? "夜間（0時〜8時）は止まっています。8時からもう一度開いてください。"
            : "最新にできませんでした。電波の良い所で、しばらく待つと読み直します。"}
        </p>
      ) : null}
      {rows === undefined ? (
        query.isError ? (
          <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>
        ) : (
          <p aria-busy="true" className="text-m text-text-sub">
            読みこんでいます…
          </p>
        )
      ) : rows.length === 0 ? (
        filter === "tester" ? (
          <p className="text-m">テスターに「はい」と答えた人はいません。</p>
        ) : (
          <div className="flex flex-col gap-xxs">
            <p className="text-m">まだ困りごとはありません。</p>
            {event.surveyOpen ? null : (
              <p className="text-m">
                <Link
                  to="/admin/events/$eventId/setup"
                  params={{ eventId: event.id }}
                  className="text-text-link underline"
                >
                  準備の画面でアンケートを開く
                </Link>
              </p>
            )}
          </div>
        )
      ) : (
        <>
          <p className="text-m">{`${rows.length.toLocaleString("ja-JP")}件の回答があります。`}</p>
          <AnswerRows rows={rows} />
        </>
      )}
    </Page>
  );
}

/** ConcernsPage が受け取るもの。 */
export type ConcernsPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * 困りごとの画面（ログインが要る・主催者だけ）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function ConcernsPage({ eventId }: ConcernsPageProps) {
  return (
    <SessionGate>
      <EventAccessGate eventId={eventId} roles={["organizer"]}>
        {(event) => <Concerns event={event} />}
      </EventAccessGate>
    </SessionGate>
  );
}

const concernsRouteApi = getRouteApi("/admin/events/$eventId/concerns");

/**
 * 困りごとの道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function ConcernsRoute() {
  const { eventId } = concernsRouteApi.useParams();
  return <ConcernsPage eventId={eventId} />;
}
