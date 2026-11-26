// 自前の申込みページの部品（申込みページ・札のページ・自分の申込みが共に使う。booking-003）：交流会の欄・カレンダーに追加・
// 公式 LINE の友だち追加・連絡のメールアドレス・LINE でログインへの入口。ボタンの高さは Button の大きさに任せ、
// 並べる所は ButtonRow に入れる（DESIGN.md の「ボタンの並べ方」）。
// 外へのリンクは rel="noreferrer"（札のページの URL を外へ送らない。research S3）。
import type { ApplyEvent, CalendarLinks } from "@workspace/contracts/booking";
import { ContactInput } from "@workspace/contracts/booking";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { getLiff } from "../../lib/liff.ts";
import { formatEventDateTime, formatFee } from "../event/index.ts";
import { deleteMyContact, fetchMyContact, saveMyContact } from "./apply-api.ts";

/** 外のページへのリンクの属性（参照元を送らない）。 */
export const EXTERNAL_LINK = { target: "_blank", rel: "noopener noreferrer" } as const;

/** 予約の参加者の問い合わせの鍵。 */
export const APPLY_QUERY_KEYS = {
  /**
   * 申込みページ（ログインしているかで中身が変わる）。
   * @param eventId 交流会の ID
   * @param signedIn ログインしているか
   * @returns 鍵
   */
  page: (eventId: string, signedIn: boolean) =>
    ["booking", "apply-page", eventId, signedIn] as const,
  /**
   * 札のページ。
   * @param token 札
   * @returns 鍵
   */
  entryToken: (token: string) => ["booking", "entry-token", token] as const,
  /** 自分の申込み */
  myEntries: ["booking", "me", "entries"] as const,
  /** 部の予定 */
  mySchedule: ["booking", "me", "schedule"] as const,
  /** 案内の同意 */
  myConsents: ["booking", "me", "consents"] as const,
  /** 連絡のメールアドレス */
  myContact: ["booking", "me", "contact"] as const,
};

/**
 * 交流会の欄（日時・会場・参加費・主催）。
 * @param props 交流会（event）と主催（hostName）
 * @param props.event 交流会
 * @param props.hostName 主催の名前（空なら出さない）
 * @returns 欄の要素
 */
export function ApplyEventList({ event, hostName }: { event: ApplyEvent; hostName: string }) {
  const items: [string, string][] = [
    ["日時", formatEventDateTime(event.startsAt)],
    ...(event.venue ? ([["会場", event.venue]] as [string, string][]) : []),
    ["参加費", `${formatFee(event.fee)}（当日、受付で）`],
    ...(hostName ? ([["主催", hostName]] as [string, string][]) : []),
  ];
  return (
    <dl className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs text-m">
      {items.map(([term, value]) => (
        <div key={term} className="flex gap-xs">
          <dt className="w-xxl shrink-0 font-bold text-text-sub">{term}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * カレンダーに追加（Google カレンダーと .ics）。
 * @param props リンク（calendar）
 * @param props.calendar リンク
 * @returns 節の要素
 */
export function CalendarSection({ calendar }: { calendar: CalendarLinks }) {
  return (
    <section aria-labelledby="apply-calendar" className="flex flex-col gap-xxs">
      <h2 id="apply-calendar" className="text-l leading-tight font-bold">
        カレンダーに追加
      </h2>
      <ButtonRow layout="grid" className="wide:grid-cols-2">
        <a
          href={calendar.googleUrl}
          {...EXTERNAL_LINK}
          className={buttonVariants({ variant: "secondary" })}
        >
          Google カレンダー
        </a>
        <a
          href={calendar.icsPath}
          download="event.ics"
          className={buttonVariants({ variant: "secondary" })}
        >
          ほかのカレンダー（.ics）
        </a>
      </ButtonRow>
      <p className="text-s text-text-sub">
        「ほかのカレンダー」は iPhone・Outlook
        用のファイルです。終わりの時刻は、始まりから2時間にしています。
      </p>
    </section>
  );
}

/**
 * 公式 LINE で知らせを受け取る（設定にベーシック ID があるときだけ）。
 * @param props 友だち追加の URL・紐づいているか・主催
 * @param props.url 友だち追加の URL
 * @param props.linked 紐づいているか
 * @param props.hostName 主催の名前
 * @returns 節の要素
 */
export function LineFriendSection({
  url,
  linked,
  hostName,
}: {
  url: string;
  linked: boolean;
  hostName: string;
}) {
  return (
    <section
      aria-labelledby="apply-line"
      className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
    >
      <h2 id="apply-line" className="text-l leading-tight font-bold">
        知らせを LINE で受け取る
      </h2>
      {linked ? (
        <p className="text-m">{`${hostName}の公式 LINE とつながっています。申込みの知らせは LINE に届きます。`}</p>
      ) : (
        <>
          <p className="text-m">
            {`${hostName}の公式 LINE を友だちに追加し、届いたリンクを開くと、日時の変更などが LINE で届きます。`}
          </p>
          <ButtonRow>
            <a href={url} {...EXTERNAL_LINK} className={buttonVariants({ variant: "secondary" })}>
              公式 LINE を友だちに追加する
            </a>
          </ButtonRow>
        </>
      )}
    </section>
  );
}

/**
 * 連絡のメールアドレス（任意・主催者に見えない・いつでも消せる。booking-002 の /me/contact）。
 * @returns 節の要素
 */
export function ContactSection() {
  const queryClient = useQueryClient();
  const contact = useQuery({ queryKey: APPLY_QUERY_KEYS.myContact, queryFn: fetchMyContact });
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const save = useMutation({
    mutationFn: (email: string) => saveMyContact(email),
    onSuccess: async () => {
      setValue("");
      setDone("メールアドレスを入れました。");
      await queryClient.invalidateQueries({ queryKey: APPLY_QUERY_KEYS.myContact });
    },
    onError: (caught) => setError(fieldErrorsFromApi(caught).email ?? errorMessage(caught)),
  });
  const remove = useMutation({
    mutationFn: deleteMyContact,
    onSuccess: async () => {
      setDone("メールアドレスを消しました。");
      await queryClient.invalidateQueries({ queryKey: APPLY_QUERY_KEYS.myContact });
    },
  });

  /**
   * 入れる。
   * @param event 送る
   */
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setDone(undefined);
    const parsed = ContactInput.safeParse({ email: value.trim() });
    if (!parsed.success) {
      setError(fieldErrorsFromIssues(parsed.error.issues).email);
      return;
    }
    setError(undefined);
    save.mutate(parsed.data.email);
  };

  const current = contact.data?.email ?? null;
  return (
    <section aria-labelledby="apply-contact" className="flex flex-col gap-xxs">
      <h2 id="apply-contact" className="text-l leading-tight font-bold">
        メールでも知らせを受け取る（任意）
      </h2>
      {current ? (
        <div className="flex flex-col items-start gap-xxs">
          <p className="text-m break-all">{`入れているアドレス：${current}`}</p>
          <Button
            variant="text"
            aria-busy={remove.isPending || undefined}
            onClick={() => remove.mutate()}
          >
            メールアドレスを消す
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-xxs">
          <Field
            label="メールアドレス"
            description="日時の変更などを、メールでも知らせます。主催者には見えません。いつでも消せます。"
            error={error}
          >
            <Input
              type="email"
              autoComplete="email"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <ButtonRow>
            <Button type="submit" aria-busy={save.isPending || undefined}>
              {save.isPending ? "入れています…" : "メールアドレスを入れる"}
            </Button>
          </ButtonRow>
        </form>
      )}
      {done ? <ResponseMessage tone="success">{done}</ResponseMessage> : null}
      {remove.isError ? (
        <ResponseMessage tone="danger">{errorMessage(remove.error)}</ResponseMessage>
      ) : null}
    </section>
  );
}

/**
 * LINE でログインする入口（LINE の中は開き直す・外のブラウザは LINE のログインへ・手元は手元のログインへ）。
 * 置く所で ButtonRow に入れる（幅と並びは ButtonRow が決める）。
 * @param props ボタンの言葉（label）と主のボタンか（primary）
 * @param props.label ボタンの言葉
 * @param props.primary 主のボタンにするか
 * @returns ボタンかリンクの要素
 */
export function LineLoginButton({ label, primary = true }: { label: string; primary?: boolean }) {
  const liff = getLiff();
  const location = useLocation();
  const variant = primary ? "primary" : "secondary";
  if (liff.mode === "fake") {
    return (
      <Link
        to="/dev/login"
        search={{ redirect: location.href }}
        className={buttonVariants({ variant })}
      >
        {label}
      </Link>
    );
  }
  return (
    <Button
      variant={variant}
      onClick={() => {
        if (liff.isInClient()) window.location.reload();
        else liff.login();
      }}
    >
      {label}
    </Button>
  );
}
