// A4 予約の知らせ（設定の画面の下。booking-002 US1・US4。モックアップ A4）。
// - /settings/reception/notify：個人の LINE 公式アカウントとメールの設定と、自分が管理者の組織の一覧（組織の設定への入口）
// - /settings/reception/notify/organizations/{id}：組織の設定（組織の管理者だけ。ほかは「組織の管理者だけが変えられます」）
// 鍵は末尾だけを出し、「入れ直す」で入れ直す。Webhook の URL のコピー・紐づいた人数・今月送った数・あいさつの見本・
// 自分に確かめのメッセージを送る・メールの送り主の名前（変えられない）と返信先。送った結果は押したボタンのそば（EXPERIENCE.md）。
import {
  BOOKING_SETTINGS_ROUTE_PATTERNS,
  LineChannelInput,
  MailSettingInput,
  NOTIFY_MODE_LABELS,
  bookingSettingsPaths,
} from "@workspace/contracts/booking";
import type { NotifySettings, TestMessageResult } from "@workspace/contracts/booking";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Icon } from "../../lib/icon.tsx";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import {
  fetchNotifySettings,
  removeLineChannel,
  saveLineChannel,
  saveReplyTo,
  sendTestMessage,
} from "./notify-api.ts";
import type { NotifyHolderKey } from "./notify-api.ts";
import { PRODUCT_NAME } from "@workspace/contracts/core";

/** 問い合わせの鍵。 */
export const NOTIFY_QUERY_KEYS = {
  /**
   * 設定の画面。
   * @param organizationId 組織の ID（なければ個人）
   * @returns 鍵
   */
  settings: (organizationId?: string) =>
    ["booking", "notify-settings", organizationId ?? "personal"] as const,
};

/** 結果の文。 */
type Result = { tone: "success" | "danger" | "info"; message: string };

/**
 * 区切りの枠つきの節。
 * @param props 見出しの ID（id）・見出し（title）・中身（children）
 * @param props.id 見出しの ID
 * @param props.title 見出し
 * @param props.children 中身
 * @returns 要素
 */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-s"
    >
      <h2 id={id} className="text-l leading-tight font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * 文をコピーするボタンと結果。
 * @param props コピーする文（text）と名前（label）
 * @param props.text コピーする文
 * @param props.label ボタンの名前
 * @returns 要素
 */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [result, setResult] = useState<Result>();
  return (
    <div className="flex flex-col items-start gap-xxs">
      <ButtonRow>
        <Button
          onClick={() => {
            navigator.clipboard.writeText(text).then(
              () =>
                setResult({
                  tone: "success",
                  message: "コピーしました。LINE の画面に貼ってください。",
                }),
              () =>
                setResult({
                  tone: "danger",
                  message: "コピーできませんでした。URL を選んで、手でコピーしてください。",
                }),
            );
          }}
        >
          {label}
        </Button>
      </ButtonRow>
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
    </div>
  );
}

/**
 * 公式アカウントの値を入れるフォーム（初め・入れ直す）。
 * @param props 持ち主・入れ直しか・閉じる・保存したあと
 * @param props.holder 持ち主
 * @param props.rotating 入れ直しか（空の欄は前の値のまま）
 * @param props.onDone 保存した・やめたとき
 * @returns 要素
 */
function LineForm({
  holder,
  rotating,
  onDone,
}: {
  holder: NotifyHolderKey;
  rotating: boolean;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({ lineChannelId: "", channelSecret: "", accessToken: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setFailure(undefined);
    const input = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value.trim() !== ""),
    );
    // 初めは3つとも要る（入れ直しは1つ以上）
    const missing: FieldErrors = rotating
      ? {}
      : Object.fromEntries(
          (
            [
              ["lineChannelId", "チャネル ID を入れてください。"],
              ["channelSecret", "チャネルシークレットを入れてください。"],
              ["accessToken", "チャネルアクセストークンを入れてください。"],
            ] as const
          ).filter(([key]) => !(key in input)),
        );
    const parsed = LineChannelInput.safeParse(input);
    if (Object.keys(missing).length > 0 || !parsed.success) {
      const fields = {
        ...(parsed.success ? {} : fieldErrorsFromIssues(parsed.error.issues)),
        ...missing,
      };
      if (fields[""] && Object.keys(missing).length === 0) setFailure(fields[""]);
      setErrors(fields);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    if (!parsed.success) return;
    setErrors({});
    setPending(true);
    try {
      const saved = await saveLineChannel(holder, parsed.data);
      queryClient.setQueryData(NOTIFY_QUERY_KEYS.settings(holder.organizationId), saved);
      setValues({ lineChannelId: "", channelSecret: "", accessToken: "" });
      onDone?.();
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      } else setFailure(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  const set = (key: keyof typeof values) => (change: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: change.target.value }));
  const optional = rotating ? "入れ直すものだけ入れてください（空の欄は前のまま）。" : undefined;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-xs"
    >
      {optional ? <p className="text-s text-text-sub">{optional}</p> : null}
      <Field
        label="チャネル ID"
        required={!rotating}
        error={errors.lineChannelId}
        description="LINE Developers の Messaging API のチャネルの「チャネル基本設定」にある数字"
      >
        <Input
          inputMode="numeric"
          autoComplete="off"
          value={values.lineChannelId}
          onChange={set("lineChannelId")}
        />
      </Field>
      <Field
        label="チャネルシークレット"
        required={!rotating}
        error={errors.channelSecret}
        description="同じ「チャネル基本設定」にある32文字"
      >
        <Input
          type="password"
          autoComplete="off"
          value={values.channelSecret}
          onChange={set("channelSecret")}
        />
      </Field>
      <Field
        label="チャネルアクセストークン（長期）"
        required={!rotating}
        error={errors.accessToken}
        description="「Messaging API 設定」の下で発行したもの"
      >
        <Input
          type="password"
          autoComplete="off"
          value={values.accessToken}
          onChange={set("accessToken")}
        />
      </Field>
      {/* 並べる順は「二番 → 主」（主は右・スマホは上。DESIGN.md の「ボタンの並べ方」） */}
      <ButtonRow>
        {rotating && onDone ? <Button onClick={onDone}>やめる</Button> : null}
        <Button
          type="submit"
          variant="primary"
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
        >
          {pending ? "確かめています…" : "保存する"}
        </Button>
      </ButtonRow>
      {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
    </form>
  );
}

/**
 * 公式アカウントの節。
 * @param props 持ち主と設定
 * @param props.holder 持ち主
 * @param props.settings 設定
 * @returns 要素
 */
function LineSection({ holder, settings }: { holder: NotifyHolderKey; settings: NotifySettings }) {
  const queryClient = useQueryClient();
  const [rotating, setRotating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string>();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestMessageResult | { error: string }>();
  const line = settings.line;

  const remove = async () => {
    setRemoving(true);
    setRemoveError(undefined);
    try {
      const saved = await removeLineChannel(holder);
      queryClient.setQueryData(NOTIFY_QUERY_KEYS.settings(holder.organizationId), saved);
      setConfirming(false);
    } catch (caught) {
      setRemoveError(errorMessage(caught));
    } finally {
      setRemoving(false);
    }
  };

  const test = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(undefined);
    try {
      setTestResult(await sendTestMessage(holder));
      await queryClient.invalidateQueries({
        queryKey: NOTIFY_QUERY_KEYS.settings(holder.organizationId),
      });
    } catch (caught) {
      setTestResult({ error: errorMessage(caught) });
    } finally {
      setTesting(false);
    }
  };

  if (!line) {
    return (
      <Section id="notify-line-heading" title="LINE 公式アカウント">
        <p className="text-m">
          参加者への知らせを、{settings.holder.name}の LINE
          公式アカウントから送ります。メッセージの費用は、その公式アカウントの LINE
          の契約で払います。Messaging API を使えるようにした公式アカウントの値を入れてください。
        </p>
        <LineForm holder={holder} rotating={false} />
      </Section>
    );
  }

  return (
    <Section id="notify-line-heading" title="LINE 公式アカウント">
      <dl className="flex flex-col gap-xxs text-m">
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">チャネル ID</dt>
          <dd>{line.lineChannelId}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">チャネルシークレット</dt>
          <dd>末尾 {line.channelSecretTail}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">アクセストークン</dt>
          <dd>末尾 {line.accessTokenTail}</dd>
        </div>
        {line.basicId ? (
          <div className="flex flex-wrap gap-x-xs">
            <dt className="text-text-sub">ベーシック ID</dt>
            <dd>{line.basicId}</dd>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">紐づいた人</dt>
          <dd>{line.linkedCount}人</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">今月 LINE で送った数</dt>
          <dd>{line.sentThisMonth}通</dd>
        </div>
      </dl>
      {rotating ? (
        <LineForm holder={holder} rotating onDone={() => setRotating(false)} />
      ) : (
        // 消す操作は主の場所（最後）に置かない（二番の「設定を消す」→「入れ直す」の順）
        <ButtonRow>
          <Button onClick={() => setConfirming(true)}>公式アカウントの設定を消す</Button>
          <Button onClick={() => setRotating(true)}>入れ直す</Button>
        </ButtonRow>
      )}

      <div className="flex flex-col gap-xxs">
        <h3 className="text-m font-bold">Webhook の URL</h3>
        <p className="min-w-0 rounded-sm bg-surface-over p-xxs text-s break-all">
          <code>{line.webhookUrl}</code>
        </p>
        <CopyButton text={line.webhookUrl} label="Webhook の URL をコピー" />
        <ol className="list-decimal pl-s text-s text-text-sub">
          <li>
            LINE Developers の「Messaging API 設定」の「Webhook URL」に貼り、「Webhook
            の利用」を入にする
          </li>
          <li>「検証」を押して、成功になるかを確かめる</li>
          <li>
            「Webhook の再送」を入にする（夜中に止まっている間の知らせを、LINE が送り直します）
          </li>
          <li>
            LINE Official Account Manager
            の応答設定で、あいさつメッセージと応答メッセージを切にする（あいさつが2つ届かないように）
          </li>
        </ol>
      </div>

      <div className="flex flex-col gap-xxs">
        <h3 className="text-m font-bold">友だち追加したときのあいさつ（見本）</h3>
        <p className="rounded-sm bg-surface-over p-xxs text-s whitespace-pre-wrap">
          {settings.greetingPreview}
        </p>
      </div>

      <div className="flex flex-col items-start gap-xxs">
        <h3 className="text-m font-bold">確かめ</h3>
        <p className="text-s text-text-sub">
          {settings.myLink.linked
            ? "あなたはこの公式アカウントと紐づいています。"
            : "あなたはまだ紐づいていません。公式アカウントを友だち追加し、届いたリンクを開いて紐づけると、確かめのメッセージを送れます。"}
        </p>
        <ButtonRow>
          <Button
            aria-disabled={testing || undefined}
            aria-busy={testing || undefined}
            onClick={() => void test()}
          >
            {testing ? "送っています…" : "自分に確かめのメッセージを送る"}
          </Button>
        </ButtonRow>
        {testResult ? (
          "error" in testResult ? (
            <ResponseMessage tone="danger">{testResult.error}</ResponseMessage>
          ) : (
            <ResponseMessage tone={testResult.result === "sent" ? "success" : "info"}>
              {testResult.message}
              {testResult.lineUserId ? (
                <>
                  <br />
                  <code className="break-all">{testResult.lineUserId}</code>
                </>
              ) : null}
            </ResponseMessage>
          )
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="公式アカウントの設定を消しますか"
        confirmLabel="消す"
        pendingLabel="消しています"
        pending={removing}
        error={removeError}
        onConfirm={() => void remove()}
      >
        チャネル ID・シークレット・アクセストークンと、{line.linkedCount}
        人の紐づけが消えます。もう一度入れたあとは、参加者に紐づけ直してもらう必要があります。メールの返信先は残ります。
      </ConfirmDialog>
    </Section>
  );
}

/**
 * メールの節。
 * @param props 持ち主と設定
 * @param props.holder 持ち主
 * @param props.settings 設定
 * @returns 要素
 */
function MailSection({ holder, settings }: { holder: NotifyHolderKey; settings: NotifySettings }) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [replyTo, setReplyTo] = useState(settings.mail.replyToEmail ?? "");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setResult(undefined);
    const parsed = MailSettingInput.safeParse({
      replyToEmail: replyTo.trim() === "" ? null : replyTo.trim(),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const saved = await saveReplyTo(holder, parsed.data.replyToEmail);
      queryClient.setQueryData(NOTIFY_QUERY_KEYS.settings(holder.organizationId), saved);
      setResult({ tone: "success", message: "返信先を保存しました。" });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields.replyToEmail) setError(fields.replyToEmail);
      else setResult({ tone: "danger", message: errorMessage(caught) });
    } finally {
      setPending(false);
    }
  };

  return (
    <Section id="notify-mail-heading" title="メール">
      <p className="text-m">
        公式アカウントと紐づけていない参加者には、本人が入れたメールアドレスに {PRODUCT_NAME}
        から送ります（入れていない人には送りません）。
        参加者のメールアドレスは、主催者には見えません。
      </p>
      <dl className="flex flex-col gap-xxs text-m">
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">送り主の名前</dt>
          <dd className="min-w-0 break-words">{settings.mail.senderName}</dd>
        </div>
      </dl>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-xs"
      >
        <Field
          label="返信先のメールアドレス"
          error={error}
          description="参加者がメールに返信したときに届くアドレス（任意。空なら返信できないメールになります）"
        >
          <Input
            type="email"
            autoComplete="email"
            value={replyTo}
            onChange={(change) => setReplyTo(change.target.value)}
          />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <ButtonRow>
            <Button
              type="submit"
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
            >
              {pending ? "保存しています…" : "返信先を保存する"}
            </Button>
          </ButtonRow>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      </form>
    </Section>
  );
}

/**
 * 設定の画面の中身（ログインしているとき）。
 * @param props 組織の ID（なければ個人）
 * @param props.organizationId 組織の ID
 * @returns 要素
 */
function NotifySettingsContent({ organizationId }: { organizationId?: string | undefined }) {
  const holder: NotifyHolderKey = { organizationId };
  const query = useQuery({
    queryKey: NOTIFY_QUERY_KEYS.settings(organizationId),
    queryFn: () => fetchNotifySettings(holder),
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
  });
  const title = organizationId ? "予約の知らせ（組織）" : "予約の知らせ";
  if (query.isPending) {
    return (
      <Page title={title}>
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      </Page>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 403) {
      return (
        <Page
          title={title}
          lead="組織の LINE 公式アカウントとメールの設定は、組織の管理者だけが変えられます。変えたいときは管理者に頼んでください。"
        />
      );
    }
    return (
      <Page title={title} lead={errorMessage(query.error)}>
        <ButtonRow>
          <Button onClick={() => void query.refetch()}>もう一度</Button>
        </ButtonRow>
      </Page>
    );
  }
  const settings = query.data;
  return (
    <Page
      title={organizationId ? `予約の知らせ（${settings.holder.name}）` : title}
      lead="交流会の申込みの確定・キャンセル待ちの繰り上げ・日時や場所の変更・中止を、参加者に LINE かメールで知らせるための設定です。"
    >
      <p className="rounded-md border border-border bg-surface-over p-xs text-s">
        {NOTIFY_MODE_LABELS[settings.deliveryMode]}
      </p>
      {settings.adminOrganizations ? (
        <Section id="notify-organizations-heading" title="組織の設定">
          {settings.adminOrganizations.length === 0 ? (
            <p className="text-m text-text-sub">
              管理者の組織はありません。組織に入れた交流会は、その組織の公式アカウントから知らせます（組織の管理者が設定します）。
            </p>
          ) : (
            <ul className="flex flex-col rounded-md border border-border">
              {settings.adminOrganizations.map((organization) => (
                <li key={organization.id} className="border-b border-border last:border-b-0">
                  <Link
                    to={bookingSettingsPaths.notifyOrganization(organization.id)}
                    className="flex min-h-xxl items-center justify-between gap-xs px-xs py-xxs text-m text-text hover:bg-surface-over"
                  >
                    <span className="min-w-0 font-bold break-words">
                      {organization.name}の設定を開く
                    </span>
                    <Icon name="chevron" className="shrink-0 text-text-sub" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-s text-text-sub">
            下の設定は、あなたの個人の交流会（組織に入れていない交流会）で使います。
          </p>
        </Section>
      ) : (
        <p className="text-s">
          <Link to={bookingSettingsPaths.notify()} className="text-text-link underline">
            個人の設定へ
          </Link>
        </p>
      )}
      <LineSection holder={holder} settings={settings} />
      <MailSection key={settings.mail.replyToEmail ?? ""} holder={holder} settings={settings} />
    </Page>
  );
}

/**
 * 予約の知らせの画面（ログインが要る）。
 * @param props 組織の ID（organizationId。なければ個人）
 * @param props.organizationId 組織の ID
 * @returns 画面の要素
 */
export function NotifySettingsPage({ organizationId }: { organizationId?: string | undefined }) {
  return (
    <SessionGate>
      <NotifySettingsContent key={organizationId ?? "personal"} organizationId={organizationId} />
    </SessionGate>
  );
}

const organizationRouteApi = getRouteApi(BOOKING_SETTINGS_ROUTE_PATTERNS.notifyOrganization);

/**
 * 予約の知らせ（個人）の道の部品。
 * @returns 画面の要素
 */
export function NotifySettingsRoute() {
  return <NotifySettingsPage />;
}

/**
 * 予約の知らせ（組織）の道の部品（道の organizationId を渡す）。
 * @returns 画面の要素
 */
export function OrganizationNotifySettingsRoute() {
  const { organizationId } = organizationRouteApi.useParams();
  return <NotifySettingsPage organizationId={organizationId} />;
}
