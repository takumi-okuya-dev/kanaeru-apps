// P1 チェックインの画面（参加者が受付QRから開く。EXPERIENCE.md の P1・UJ-1）。
// 交流会の要約 → 名前（初期値あり）→ 3つのチップ →（割引があれば）割引のチップと紹介者の欄 → 何をどう使うかの1文 →
// 「チェックインする」（この画面の主のボタン1つ）。
// 済んだら同じ画面をチェックインのカードに変え、カードの見出しにフォーカスを移す。チェックイン済みなら、欄を出さずにカードを出す。
// 済んだ状態：紙の名札の案内・オープンチャット（URL があれば。FR-17）・アンケートが開いていれば「アンケートに答える」（survey の道）と
// LINE グループ（招待リンクがあれば。FR-22）。友だち追加の案内は重ねない（FR-6）。
import { participantPaths } from "@workspace/contracts/core";
import type { EventSummary } from "@workspace/contracts/event";
import type { MyCheckinState } from "@workspace/contracts/reception";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { StatusIcon } from "@workspace/ui/components/status-icon";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { InternalLink, formatEventDateTime, formatFee, useEventSummary } from "../event/index.ts";
import { CheckinFields } from "./CheckinFields.tsx";
import { checkInMine } from "./api.ts";
import { EMPTY_CHECKIN_FORM, focusFirstCheckinError, validateCheckinForm } from "./checkin-form.ts";
import type { CheckinFormValues } from "./checkin-form.ts";
import { RECEPTION_QUERY_KEYS, isNightStop, useMyCheckin } from "./queries.ts";

/**
 * 主のボタンの見た目（高さ 48px・狭い画面では横いっぱい・広い画面では言葉の幅に左右 32px の余白。DESIGN の button-primary）。
 * 縦に並べる flex の中では w-auto だけだと横に伸びるので、広い画面では self-start で左に寄せる。
 */
/** 外のページへのリンクの属性（LINE の中でもアプリの外として開く）。 */
const EXTERNAL_LINK = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * 交流会の要約（日時・会場・参加費）。
 * @param props 要約（summary）
 * @param props.summary 交流会の要約
 * @returns 要約の要素
 */
function EventSummaryList({ summary }: { summary: EventSummary }) {
  const items = [
    ["日時", formatEventDateTime(summary.startsAt)],
    ["会場", summary.venue],
    ["参加費", formatFee(summary.fee)],
  ] as const;
  return (
    <dl className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs text-m">
      {items.map(([term, value]) => (
        <div key={term} className="flex gap-xs">
          <dt className="shrink-0 font-bold text-text-sub">{term}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 済んだ状態が受け取るもの。 */
type DoneProps = {
  /** 交流会の要約 */
  summary: EventSummary;
  /** いまチェックインしたか（false ならチェックイン済み） */
  justCheckedIn: boolean;
};

/**
 * 済んだ状態（チェックインのカードと案内）。
 * @param props 要約（summary）・いまチェックインしたか（justCheckedIn）
 * @returns 要素
 */
function CheckinDone({ summary, justCheckedIn }: DoneProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!justCheckedIn) return;
    // 押したあとは、カードをいちばん上に出し、見出しを読み上げる（EXPERIENCE Accessibility Floor）
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [justCheckedIn]);
  return (
    <div className="flex flex-col gap-s">
      <section
        aria-labelledby="checkin-done-title"
        className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-s"
      >
        <div className="flex items-center gap-xxs">
          <StatusIcon tone="success" className="size-s" />
          <h2
            id="checkin-done-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl leading-tight font-bold outline-none"
          >
            {justCheckedIn ? "チェックインしました" : "チェックイン済み"}
          </h2>
        </div>
        <p className="text-m font-bold break-words">{summary.name}</p>
        <p className="text-m">受付で紙の名札に名前を書いて、お入りください。</p>
      </section>
      {summary.surveyOpen ? (
        <ButtonRow>
          {summary.lineGroupUrl ? (
            <a
              href={summary.lineGroupUrl}
              {...EXTERNAL_LINK}
              className={buttonVariants({ variant: "secondary" })}
            >
              交流会のLINEグループに参加する
            </a>
          ) : null}
          <InternalLink
            href={participantPaths.survey(summary.id)}
            className={buttonVariants({ variant: "primary" })}
          >
            アンケートに答える
          </InternalLink>
        </ButtonRow>
      ) : null}
      {summary.openChatUrl ? (
        <p className="text-m">
          <a href={summary.openChatUrl} {...EXTERNAL_LINK} className="text-text-link underline">
            コミュニティのオープンチャットに参加する
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** 入力の画面が受け取るもの。 */
type FormProps = {
  /** 交流会の要約 */
  summary: EventSummary;
  /** 自分のチェックインと初期値 */
  state: MyCheckinState;
  /** 済んだとき（いまチェックインしたか） */
  onDone: (justCheckedIn: boolean) => void;
};

/**
 * 入力の画面（名前と3つのチップと「チェックインする」）。
 * @param props 要約（summary）・初期値（state）・済んだとき（onDone）
 * @returns 要素
 */
function CheckinForm({ summary, state, onDone }: FormProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<CheckinFormValues>({
    ...EMPTY_CHECKIN_FORM,
    name: state.prefill.name,
    referral: state.prefill.referral,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof checkInMine>[1]) => checkInMine(summary.id, input),
    onSuccess: (result) => {
      queryClient.setQueryData<MyCheckinState>(RECEPTION_QUERY_KEYS.mine(summary.id), {
        ...state,
        checkin: result.checkin,
      });
      onDone(!result.alreadyCheckedIn);
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
    if (focusRequest > 0) focusFirstCheckinError(formRef.current);
  }, [focusRequest]);

  /**
   * 送る。
   * @param event フォームの送信
   */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-s">
      <CheckinFields
        values={values}
        onChange={setValues}
        errors={errors}
        discounts={summary.discounts}
      />
      <div className="flex flex-col gap-xxs">
        <p className="text-s text-text-sub">
          {summary.discounts.some((discount) => discount.asksReferrer)
            ? "お名前・選んだ答え・紹介してくれた人の名前は、この交流会の受付と、主催者の集計だけに使います。紹介してくれた人の名前は主催者だけが読みます。"
            : "お名前と選んだ答えは、この交流会の受付と、主催者の集計だけに使います。"}
        </p>
        <ButtonRow>
          <Button type="submit" variant="primary" aria-disabled={mutation.isPending || undefined}>
            {mutation.isPending ? "チェックインしています…" : "チェックインする"}
          </Button>
        </ButtonRow>
        {mutation.isError && Object.keys(fieldErrorsFromApi(mutation.error)).length === 0 ? (
          <ResponseMessage tone="danger">
            {`チェックインできませんでした。${errorMessage(mutation.error)}開かないときは、受付の人に声をかけてください。`}
          </ResponseMessage>
        ) : null}
      </div>
    </form>
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
function CheckinLoadFailure({ error, retry }: FailureProps) {
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
      <ButtonRow>
        <Button onClick={retry}>もう一度</Button>
      </ButtonRow>
    </Page>
  );
}

/** CheckinScreen が受け取るもの。 */
type CheckinScreenProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * チェックインの画面の中身（ログインしたあと）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
function CheckinScreen({ eventId }: CheckinScreenProps) {
  const summaryQuery = useEventSummary(eventId);
  const mineQuery = useMyCheckin(eventId);
  const [justCheckedIn, setJustCheckedIn] = useState<boolean>();

  // 失敗の画面は、まだ何も読めていないときだけ。読めたあとの読み直し（ログインし直したときなど）の失敗では、
  // 入れかけの欄や済んだカードを消さないよう、前に読んだもので出したままにする
  const summaryFailed = summaryQuery.isError && summaryQuery.data === undefined;
  const mineFailed = mineQuery.isError && mineQuery.data === undefined;
  if (summaryFailed || mineFailed) {
    return (
      <CheckinLoadFailure
        error={summaryFailed ? summaryQuery.error : mineQuery.error}
        retry={() => {
          void summaryQuery.refetch();
          void mineQuery.refetch();
        }}
      />
    );
  }
  if (summaryQuery.data === undefined || mineQuery.data === undefined) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  const summary = summaryQuery.data;
  const state = mineQuery.data;
  return (
    <Page title={summary.name}>
      {state.checkin ? (
        <CheckinDone summary={summary} justCheckedIn={justCheckedIn ?? false} />
      ) : null}
      <EventSummaryList summary={summary} />
      {state.checkin ? null : (
        <CheckinForm summary={summary} state={state} onDone={setJustCheckedIn} />
      )}
    </Page>
  );
}

/** CheckinPage が受け取るもの。 */
export type CheckinPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * P1 チェックインの画面（ログインが要る。ログインした人なら誰でも）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function CheckinPage({ eventId }: CheckinPageProps) {
  return (
    <SessionGate>
      <CheckinScreen eventId={eventId} />
    </SessionGate>
  );
}

const checkinRouteApi = getRouteApi("/e/$eventId/checkin");

/**
 * P1 の道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function CheckinRoute() {
  const { eventId } = checkinRouteApi.useParams();
  return <CheckinPage eventId={eventId} />;
}
