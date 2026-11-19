// P2 アンケートの画面（参加者がチェックインの画面かアンケートQRから開く。EXPERIENCE.md の P2・UJ-2）。
// 目的の案内（見出しは h1）→ 設問 → 「送る」（回答済みなら「送り直す」。この画面の主のボタン1つ）。
// 送ったら同じ画面をお礼の状態に変え、お礼の文にフォーカスを移す。Googleフォームの URL があれば「続けて交流会のアンケートへ」、
// LINE グループの招待リンクがあれば「交流会のLINEグループに参加する」（FR-10・FR-22・A20・A21）。
// 状態の順：読めない → 閉じている → チェックインしていない → 入力 → お礼（research R9）。
// 送ったときに閉じていた・チェックインがなかったときは「送る」の近くに出し、入れた値は残す。
import { participantPaths } from "@workspace/contracts/core";
import type { EventSummary } from "@workspace/contracts/event";
import type { MySurveyState, SurveyAnswer, SurveyAnswerInput } from "@workspace/contracts/survey";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { StatusIcon } from "@workspace/ui/components/status-icon";
import { cn } from "@workspace/ui/lib/cn";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { InternalLink, useEventSummary } from "../event/index.ts";
import { SurveyFields } from "./SurveyFields.tsx";
import { putMySurvey } from "./api.ts";
import { SURVEY_QUERY_KEYS, isNightStop, useMySurvey } from "./queries.ts";
import { surveyFormFromAnswer, validateSurveyForm } from "./survey-form.ts";
import type { SurveyFormValues } from "./survey-form.ts";

/** 主のボタンの見た目（高さ 48px・狭い画面では横いっぱい。DESIGN の button-primary）。 */
const primaryActionClassName = "min-h-xl w-full wide:w-auto";

/** 外のページへのリンクの属性（LINE の中でもアプリの外として開く）。 */
const EXTERNAL_LINK = { target: "_blank", rel: "noopener noreferrer" } as const;

/** お礼の文（PRD FR-10 のまま）。 */
export const SURVEY_THANKS = "あなたの困りごとが、解決する企画やアプリにつながります";

/** お礼の状態が受け取るもの。 */
type ThanksProps = {
  /** 交流会の要約 */
  summary: EventSummary;
  /** 答えを直すとき */
  onEdit: () => void;
};

/**
 * お礼の状態（お礼の文・Googleフォーム・LINE グループ）。
 * @param props 要約（summary）・答えを直すとき（onEdit）
 * @returns 画面の要素
 */
function SurveyThanks({ summary, onEdit }: ThanksProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // 送ったあとは、お礼をいちばん上に出し、読み上げる（EXPERIENCE Accessibility Floor）
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, []);
  return (
    <Page title="アンケート" lead={summary.name}>
      <section
        aria-labelledby="survey-thanks-title"
        className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-s"
      >
        <div className="flex items-start gap-xxs">
          <StatusIcon tone="success" className="size-s shrink-0" />
          <h2
            id="survey-thanks-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl leading-tight font-bold outline-none"
          >
            {SURVEY_THANKS}
          </h2>
        </div>
        <p className="text-m">ご協力ありがとうございました。</p>
      </section>
      {summary.googleFormUrl || summary.lineGroupUrl ? (
        <div className="flex flex-col gap-xxs wide:flex-row">
          {summary.googleFormUrl ? (
            <a
              href={summary.googleFormUrl}
              {...EXTERNAL_LINK}
              className={cn(buttonVariants({ variant: "primary" }), primaryActionClassName)}
            >
              続けて交流会のアンケートへ
            </a>
          ) : null}
          {summary.lineGroupUrl ? (
            <a
              href={summary.lineGroupUrl}
              {...EXTERNAL_LINK}
              className={cn(buttonVariants({ variant: "secondary" }), "min-h-xl")}
            >
              交流会のLINEグループに参加する
            </a>
          ) : null}
        </div>
      ) : null}
      <div>
        <Button variant="text" className="min-h-l" onClick={onEdit}>
          答えを直す
        </Button>
      </div>
    </Page>
  );
}

/** 入力の画面が受け取るもの。 */
type FormProps = {
  /** 交流会の要約 */
  summary: EventSummary;
  /** 前の回答（なければ null） */
  answer: SurveyAnswer | null;
  /** 送ったとき */
  onSent: () => void;
};

/**
 * 入力の画面（目的の案内・設問・「送る」）。
 * @param props 要約（summary）・前の回答（answer）・送ったとき（onSent）
 * @returns 画面の要素
 */
function SurveyForm({ summary, answer, onSent }: FormProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<SurveyFormValues>(() => surveyFormFromAnswer(answer));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const mutation = useMutation({
    mutationFn: (input: SurveyAnswerInput) => putMySurvey(summary.id, input),
    onSuccess: (saved) => {
      queryClient.setQueryData<MySurveyState>(SURVEY_QUERY_KEYS.mine(summary.id), {
        checkedIn: true,
        answer: saved,
      });
      onSent();
    },
    onError: (error) => {
      const fields = fieldErrorsFromApi(error);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setFocusRequest((count) => count + 1);
      }
    },
  });

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(formRef.current);
  }, [focusRequest]);

  /**
   * 送る。
   * @param event フォームの送信
   */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    // 前に送れなかった文を消してから確かめる（手元の誤りで止まったときに、古い「送れませんでした」を残さない）
    mutation.reset();
    const result = validateSurveyForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    mutation.mutate(result.input);
  };

  const submitLabel = answer ? "送り直す" : "送る";
  const fieldError = mutation.error instanceof ApiError && mutation.error.fields.length > 0;
  return (
    <Page
      title="仕事の困りごとを聞かせてください"
      lead="この交流会では、参加者の仕事の困りごとを集めて、AI活用勉強会のテーマや小さなアプリにしています。"
    >
      <ul className="flex list-disc flex-col gap-x3s pl-s text-m">
        <li>
          書いてもらった内容は、主催者だけが読みます。勉強会やアプリにするときに、お名前を出すことはありません。
        </li>
        <li>1分ほどで終わります。答えにくい設問は、飛ばして大丈夫です。</li>
      </ul>
      <p className="text-s text-text-sub break-words">{`${summary.name}のアンケート`}</p>
      {answer ? (
        <ResponseMessage tone="info">
          回答済みです。直すときは、答えを変えて送り直してください。
        </ResponseMessage>
      ) : null}
      <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-s">
        <SurveyFields values={values} onChange={setValues} errors={errors} />
        <div className="flex flex-col gap-xxs">
          <Button
            type="submit"
            variant="primary"
            aria-disabled={mutation.isPending || undefined}
            className={primaryActionClassName}
          >
            {mutation.isPending ? "送っています…" : submitLabel}
          </Button>
          {mutation.isError && !fieldError ? (
            <ResponseMessage tone="danger">
              {`送れませんでした。${errorMessage(mutation.error)}`}
            </ResponseMessage>
          ) : null}
        </div>
      </form>
    </Page>
  );
}

/** 失敗の画面が受け取るもの。 */
type FailureProps = {
  /** 投げられたもの */
  error: unknown;
  /** もう一度読む */
  retry: () => void;
};

/**
 * 読めなかったとき（交流会がない・夜間の停止・ほかの失敗）。
 * @param props 投げられたもの（error）・もう一度（retry）
 * @returns 画面の要素
 */
function SurveyLoadFailure({ error, retry }: FailureProps) {
  if (error instanceof ApiError && error.status === 404) {
    return <Page title="この交流会は見つかりません" lead="受付の人に声をかけてください。" />;
  }
  if (isNightStop(error)) {
    return <Page title="夜間（0時〜8時）は止まっています" lead="8時からもう一度開いてください。" />;
  }
  return (
    <Page
      title="読みこめませんでした"
      lead="電波の良い所で、もう一度試してください。開かないときは、受付の人に声をかけてください。"
    >
      <p className="text-s text-text-sub">{errorMessage(error)}</p>
      <div>
        <Button onClick={retry}>もう一度</Button>
      </div>
    </Page>
  );
}

/** SurveyScreen が受け取るもの。 */
type SurveyScreenProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * アンケートの画面の中身（ログインしたあと）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
function SurveyScreen({ eventId }: SurveyScreenProps) {
  const summaryQuery = useEventSummary(eventId);
  const mineQuery = useMySurvey(eventId);
  const [sent, setSent] = useState(false);

  if (summaryQuery.isError || mineQuery.isError) {
    return (
      <SurveyLoadFailure
        error={summaryQuery.error ?? mineQuery.error}
        retry={() => {
          void summaryQuery.refetch();
          void mineQuery.refetch();
        }}
      />
    );
  }
  if (summaryQuery.isPending || mineQuery.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  const summary = summaryQuery.data;
  const state = mineQuery.data;
  if (sent) return <SurveyThanks summary={summary} onEdit={() => setSent(false)} />;
  if (!summary.surveyOpen) {
    return (
      <Page title="アンケートは閉じています" lead={summary.name}>
        <p className="text-m">主催者がアンケートを開いている間だけ答えられます。</p>
      </Page>
    );
  }
  if (!state.checkedIn) {
    return (
      <Page title="先にチェックインしてください" lead={summary.name}>
        <p className="text-m">チェックインすると、アンケートに答えられます。</p>
        <div>
          <InternalLink
            href={participantPaths.checkin(summary.id)}
            className={cn(buttonVariants({ variant: "primary" }), primaryActionClassName)}
          >
            チェックインの画面へ
          </InternalLink>
        </div>
      </Page>
    );
  }
  return <SurveyForm summary={summary} answer={state.answer} onSent={() => setSent(true)} />;
}

/** SurveyPage が受け取るもの。 */
export type SurveyPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * P2 アンケートの画面（ログインが要る。答えられるのはチェックインした人）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function SurveyPage({ eventId }: SurveyPageProps) {
  return (
    <SessionGate>
      <SurveyScreen eventId={eventId} />
    </SessionGate>
  );
}

const surveyRouteApi = getRouteApi("/e/$eventId/survey");

/**
 * P2 の道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function SurveyRoute() {
  const { eventId } = surveyRouteApi.useParams();
  return <SurveyPage eventId={eventId} />;
}
