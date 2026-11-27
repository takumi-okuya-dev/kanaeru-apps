// 申込みページ（/e/{eventId}。参加者が外から開く道。外枠のナビなし。booking-003 US1・US4・US5・モックアップ P1・P2・P3・P7）。
// ログインなしで交流会の名前・日時・会場・参加費・主催・受付の状態を見せる。主のボタンは「LINE でログインして申し込む」か
// 「申し込む」の1つ。LINE を使わない人は、同じ画面の中で名前とメールアドレスの欄に切り替える（道を足さない。research R2）。
// 申し込んだら「申し込みました」（確定・カレンダーに追加・公式 LINE・メールアドレス・自分の申込み）に変える。
// 部員だけの回は「この会は見られません」（中身は API が返さない）。ほかの人の名前は出さない。
// 定員があるとき（booking-004）：残りの席か満員とキャンセル待ちの人数を出し、満員なら「キャンセル待ちに申し込む」。完了の画面に
// キャンセル待ちの何番目か・打診中なら期限と「自分の申込み」で答える入口。中止した会は「この会は中止になりました」。
import type { ApplyPage as ApplyPageData, MyEntry } from "@workspace/contracts/booking";
import { ApplyInput, EmailApplyInput, PAGE_STATE_LABELS } from "@workspace/contracts/booking";
import { PARTICIPANT_ROUTE_PATTERNS } from "@workspace/contracts/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { StatusIcon } from "@workspace/ui/components/status-icon";
import { useRef, useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { useSession } from "../account/index.ts";
import { applyToEvent, cancelMyEntry, fetchApplyPage, requestEmailApply } from "./apply-api.ts";
import {
  APPLY_QUERY_KEYS,
  ApplyEventList,
  CalendarSection,
  ContactSection,
  LineFriendSection,
  LineLoginButton,
} from "./apply-parts.tsx";
import { EntryStatusBadge, SeatsLine, StandingNote } from "./waitlist-parts.tsx";

/**
 * 読みこめないときの画面（ない・見られない・ほか）。
 * @param props 誤り・ログインしているか・読み直し
 * @param props.error 誤り
 * @param props.signedIn ログインしているか
 * @param props.retry 読み直す
 * @returns 画面の要素
 */
function ApplyLoadFailure({
  error,
  signedIn,
  retry,
}: {
  error: unknown;
  signedIn: boolean;
  retry: () => void;
}) {
  if (error instanceof ApiError && error.status === 404) {
    return <Page title="この会の申込みページはありません" lead={error.message} />;
  }
  if (error instanceof ApiError && error.status === 403) {
    return (
      <Page title="この会は見られません" lead="部員だけの会です。">
        {signedIn ? (
          <p className="text-m">部の主催者に、部に入れてもらってから開いてください。</p>
        ) : (
          <ButtonRow>
            <LineLoginButton label="部員の方は LINE でログイン" />
          </ButtonRow>
        )}
      </Page>
    );
  }
  return (
    <Page title="読みこめませんでした" lead={errorMessage(error)}>
      <ButtonRow>
        <Button onClick={retry}>もう一度</Button>
      </ButtonRow>
    </Page>
  );
}

/**
 * 申し込んだばかりの見出し。
 * @param entry 申込み
 * @returns 見出し
 */
function appliedTitle(entry: MyEntry): string {
  return entry.status === "waitlisted" ? "キャンセル待ちに入りました" : "申し込みました";
}

/**
 * 申し込んだあとの画面（申込み完了・もう申し込んでいる）。
 * @param props 申込みページ・申込み・申し込んだばかりか
 * @param props.page 申込みページ
 * @param props.entry 申込み
 * @param props.justApplied 申し込んだばかりか
 * @param props.onCancelled 取り消したあと
 * @returns 画面の要素
 */
function AppliedView({
  page,
  entry,
  justApplied,
  onCancelled,
}: {
  page: ApplyPageData;
  entry: MyEntry;
  justApplied: boolean;
  onCancelled: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelMyEntry(entry.id),
    onSuccess: async () => {
      setConfirming(false);
      await onCancelled();
    },
  });
  const viewer = page.viewer.signedIn ? page.viewer : null;
  return (
    <div className="flex flex-col gap-s">
      <section
        aria-labelledby="apply-done"
        className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-s"
      >
        <div className="flex items-center gap-xxs">
          {entry.status === "confirmed" ? <StatusIcon tone="success" className="size-s" /> : null}
          <h1
            id="apply-done"
            tabIndex={-1}
            className="text-xl leading-tight font-bold outline-none"
          >
            {justApplied ? appliedTitle(entry) : page.event.name}
          </h1>
        </div>
        {justApplied ? <p className="text-m font-bold break-words">{page.event.name}</p> : null}
        <div>
          <EntryStatusBadge status={entry.status} waitlistPosition={entry.waitlistPosition} />
        </div>
        <p className="text-m">{`お名前：${entry.name}`}</p>
        {entry.status === "confirmed" ? (
          <p className="text-m">当日は受付でお名前を伝えてください。</p>
        ) : entry.status === "cancelled" ? (
          <p className="text-m">この申込みは取り消しています。</p>
        ) : (
          <StandingNote status={entry.status} standing={entry} />
        )}
        {entry.canAccept ? (
          <p className="text-m">「自分の申込み」から「参加する」を押して答えてください。</p>
        ) : null}
      </section>
      <ApplyEventList event={page.event} hostName={page.hostName} />
      {entry.status === "confirmed" ? <CalendarSection calendar={page.calendar} /> : null}
      {page.lineFriendUrl && viewer ? (
        <LineFriendSection
          url={page.lineFriendUrl}
          linked={viewer.lineLinked}
          hostName={page.hostName}
        />
      ) : null}
      {viewer ? <ContactSection /> : null}
      <div className="flex flex-col items-start gap-xxs">
        <Link
          to={PARTICIPANT_ROUTE_PATTERNS.myBookings}
          className="inline-flex min-h-xl items-center text-m text-text-link underline"
        >
          自分の申込みを見る
        </Link>
        {entry.cancellable ? (
          <Button variant="text" onClick={() => setConfirming(true)}>
            この申込みを取り消す
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="申込みを取り消しますか"
        confirmLabel="取り消す"
        pendingLabel="取り消しています…"
        danger
        pending={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : undefined}
        onConfirm={() => cancel.mutate()}
      >
        <p>{`${page.event.name}の申込みを取り消します。受付中なら、あとから申し込み直せます。`}</p>
      </ConfirmDialog>
    </div>
  );
}

/**
 * LINE ログインのあとの申込みの欄（名前の初めの値つき・案内の同意は初めは外す）。
 * @param props 申込みページ・申し込んだあと
 * @param props.page 申込みページ（ログインしているもの）
 * @param props.onApplied 申し込んだあと
 * @returns フォームの要素
 */
function ApplyForm({
  page,
  onApplied,
}: {
  page: ApplyPageData;
  onApplied: (entry: MyEntry, next: ApplyPageData) => void;
}) {
  const viewer = page.viewer.signedIn ? page.viewer : null;
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(viewer?.defaultName ?? "");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useMutation({
    mutationFn: () => applyToEvent(page.event.id, { name, consent }),
    onSuccess: (result) => onApplied(result.entry, result.page),
    onError: (caught) => {
      setErrors(fieldErrorsFromApi(caught));
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
    },
  });

  /**
   * 送る。
   * @param event 送る
   */
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const parsed = ApplyInput.safeParse({ name, consent });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setErrors({});
    mutation.mutate();
  };

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-s">
      <Field
        label="お名前"
        description="LINE の名前を入れています。名簿と当日の受付で使います。"
        error={errors.name}
        required
      >
        <Input value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} />
      </Field>
      {page.hostName ? (
        viewer?.consented ? (
          <p className="text-m">{`${page.hostName}の次の会の案内を受け取っています（自分の申込みの画面で外せます）。`}</p>
        ) : (
          <label className="flex min-h-xl items-start gap-xxs text-m">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-x3s size-s shrink-0 accent-primary"
            />
            <span className="flex flex-col">
              <span>{`${page.hostName}から、次の会の案内を受け取る`}</span>
              <span className="text-s text-text-sub">あとから、自分の申込みの画面で外せます。</span>
            </span>
          </label>
        )
      ) : null}
      <div className="flex flex-col gap-xxs">
        <ButtonRow>
          <Button type="submit" variant="primary" aria-busy={mutation.isPending || undefined}>
            {mutation.isPending
              ? "申し込んでいます…"
              : page.seats && page.seats.remaining === 0
                ? "キャンセル待ちに申し込む"
                : "申し込む"}
          </Button>
        </ButtonRow>
        <p className="text-s text-text-sub">取り消しは、始まりまでいつでもできます。</p>
        {mutation.isError && Object.keys(fieldErrorsFromApi(mutation.error)).length === 0 ? (
          <ResponseMessage tone="danger">
            {`申し込めませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
    </form>
  );
}

/**
 * LINE を使わずに申し込む欄（名前とメールアドレス。確認のメールのリンクで確定する。research R10）。
 * @param props 交流会の ID・閉じる
 * @param props.eventId 交流会の ID
 * @param props.onBack LINE で申し込むに戻る
 * @returns フォームの要素
 */
function EmailApplyForm({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sent, setSent] = useState(false);
  const mutation = useMutation({
    mutationFn: () => requestEmailApply(eventId, { name, email: email.trim() }),
    onSuccess: () => setSent(true),
    onError: (caught) => {
      setErrors(fieldErrorsFromApi(caught));
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
    },
  });

  /**
   * 送る。
   * @param event 送る
   */
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setSent(false);
    const parsed = EmailApplyInput.safeParse({ name, email: email.trim() });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setErrors({});
    mutation.mutate();
  };

  return (
    <section aria-labelledby="apply-email" className="flex flex-col gap-xs">
      <h2 id="apply-email" className="text-l leading-tight font-bold">
        LINE を使わずに申し込む
      </h2>
      <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-s">
        <Field label="お名前" error={errors.name} required>
          <Input
            value={name}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field
          label="メールアドレス"
          description="確認のメールを送ります。メールのリンクを開いて「申込みを確定する」を押すと申込みになります（24時間有効）。主催者には見えません。"
          error={errors.email}
          required
        >
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-xxs">
          <ButtonRow>
            <Button type="submit" variant="primary" aria-busy={mutation.isPending || undefined}>
              {mutation.isPending ? "送っています…" : "確認のメールを送る"}
            </Button>
          </ButtonRow>
          {sent ? (
            <ResponseMessage tone="success">
              確認のメールを送りました。メールのリンクを開くと、申込みが確定します。届かないときは、迷惑メールのフォルダを見てください。
            </ResponseMessage>
          ) : null}
          {mutation.isError && Object.keys(fieldErrorsFromApi(mutation.error)).length === 0 ? (
            <ResponseMessage tone="danger">
              {`送れませんでした。${errorMessage(mutation.error)}`}
            </ResponseMessage>
          ) : null}
          <p className="text-s text-text-sub">取り消しも、メールのリンクからできます。</p>
        </div>
      </form>
      <Button variant="text" className="self-start" onClick={onBack}>
        LINE で申し込む
      </Button>
    </section>
  );
}

/**
 * 申込みページの中身。
 * @param props 交流会の ID
 * @param props.eventId 交流会の ID
 * @returns 画面の要素
 */
export function ApplyPage({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const query = useQuery({
    queryKey: APPLY_QUERY_KEYS.page(eventId, signedIn),
    queryFn: () => fetchApplyPage(eventId),
    enabled: session.status !== "loading",
    retry: (count, error) =>
      !(error instanceof ApiError && (error.status === 403 || error.status === 404)) && count < 2,
  });
  // 申し込んだばかりの印（申込みの ID と状態）。中身は問い合わせの答えを正にし、読み直した最新の答えを出す
  // （主催者の取り消し・日時や場所の変更が、申し込んだあとの画面にも映るように）
  const [applied, setApplied] = useState<{ id: string; status: MyEntry["status"] }>();
  const [emailMode, setEmailMode] = useState(false);

  if (session.status === "loading" || query.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (query.isError) {
    return (
      <ApplyLoadFailure
        error={query.error}
        signedIn={signedIn}
        retry={() => void query.refetch()}
      />
    );
  }

  /** 取り消したあと：読み直して、申込みの欄に戻す。 */
  const reload = async () => {
    setApplied(undefined);
    await queryClient.invalidateQueries({ queryKey: ["booking"] });
  };

  const page = query.data;
  const myEntry = page.viewer.signedIn ? page.viewer.myEntry : null;
  if (myEntry && (myEntry.status !== "cancelled" || page.state !== "open")) {
    return (
      <AppliedView
        page={page}
        entry={myEntry}
        justApplied={applied?.id === myEntry.id && applied.status === myEntry.status}
        onCancelled={reload}
      />
    );
  }

  const membersOnly = page.visibility === "members";
  return (
    <Page title={page.event.name} lead={membersOnly ? "部員だけの会です。" : undefined}>
      <ApplyEventList event={page.event} hostName={page.hostName} />
      <p className="text-m font-bold">{PAGE_STATE_LABELS[page.state]}</p>
      {page.seats && page.state === "open" ? <SeatsLine seats={page.seats} /> : null}
      {page.state === "cancelled" ? (
        <p className="text-m">主催者が予約を中止しました。申込みは受け付けていません。</p>
      ) : null}
      {page.state === "closed" ? (
        <p className="text-m">
          いまは申込みを受け付けていません。受付が開いたら、この画面から申し込めます。
        </p>
      ) : null}
      {page.state === "started" ? (
        <p className="text-m">始まりを過ぎたので、受付を終えました。</p>
      ) : null}
      {page.state === "open" && page.viewer.signedIn ? (
        <ApplyForm
          page={page}
          onApplied={(entry, next) => {
            queryClient.setQueryData<ApplyPageData>(
              APPLY_QUERY_KEYS.page(eventId, signedIn),
              next.viewer.signedIn ? { ...next, viewer: { ...next.viewer, myEntry: entry } } : next,
            );
            setApplied({ id: entry.id, status: entry.status });
            void queryClient.invalidateQueries({ queryKey: APPLY_QUERY_KEYS.myEntries });
          }}
        />
      ) : null}
      {page.state === "open" && !page.viewer.signedIn ? (
        emailMode ? (
          <EmailApplyForm eventId={page.event.id} onBack={() => setEmailMode(false)} />
        ) : (
          <div className="flex flex-col gap-xxs">
            <ButtonRow>
              <LineLoginButton label="LINE でログインして申し込む" />
            </ButtonRow>
            {/* 別の申し込み方への入口は、文字だけのボタンのまま主のボタンの下に置く（並びに入れない） */}
            {membersOnly ? null : (
              <Button variant="text" className="self-start" onClick={() => setEmailMode(true)}>
                LINE を使わずに申し込む
              </Button>
            )}
          </div>
        )
      ) : null}
    </Page>
  );
}

const applyRouteApi = getRouteApi(PARTICIPANT_ROUTE_PATTERNS.apply);

/**
 * 申込みページの道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function ApplyRoute() {
  const { eventId } = applyRouteApi.useParams();
  return <ApplyPage eventId={eventId} />;
}
