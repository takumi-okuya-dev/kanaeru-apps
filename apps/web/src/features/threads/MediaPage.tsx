// 外部メディア（threads-008。めぐるの「外部媒体展開」の一覧）：宣伝（イベントの情報つき）ごとに、5つのイベントの掲載サイト
// （こくちーずプロ・Peatix・つなげーと・ジモティー・YOUTRUST）の掲載の状況を出し、掲載文の画面へ進む。媒体ごとの既定値（事務局名・連絡先など）も決める。
import {
  LISTING_STATUS_LABELS,
  MEDIA,
  MEDIA_DEFINITIONS,
  MEDIA_DESCRIPTIONS,
  MEDIA_LABELS,
  formatEventWhen,
} from "@workspace/contracts/threads";
import type { ExternalMediaList, Media, ThreadsAccount } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi } from "../../lib/form.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { useThreadsCan } from "./team-access.ts";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { saveMediaDefaults } from "./api.ts";
import { threadsPaths } from "./paths.ts";
import { THREADS_QUERY_KEYS, useExternalMedia, useMediaDefaults } from "./queries.ts";

/** 一覧の宣伝の1件。 */
type PromotionItem = ExternalMediaList["promotions"][number];

/**
 * 宣伝ごとの媒体の並び。
 * @param props 運用アカウントの ID・宣伝
 * @param props.accountId 運用アカウントの ID
 * @param props.item 宣伝
 * @returns カードの要素
 */
function PromotionCard({ accountId, item }: { accountId: string; item: PromotionItem }) {
  const headingId = `threads-media-${item.id}`;
  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-xs"
    >
      <div className="flex flex-col gap-x3s">
        <h3 id={headingId} className="text-m font-bold break-words">
          {item.title}
        </h3>
        <p className="text-s text-text-sub">
          {item.event
            ? `開催：${formatEventWhen(item.event)}`
            : "イベントの情報がありません（宣伝とリサーチの画面で、宣伝に足すと作れます）"}
        </p>
      </div>
      <ul aria-label={`${item.title}の媒体`} className="flex flex-col gap-xxs">
        {MEDIA.map((media) => {
          const listing = item.listings.find((entry) => entry.media === media);
          const status = listing?.status ?? "not_started";
          return (
            <li
              key={media}
              className="flex flex-col gap-x3s border-t border-border pt-xxs wide:flex-row wide:items-center wide:justify-between"
            >
              <div className="flex flex-wrap items-center gap-xxs">
                <span className="text-m font-bold">{MEDIA_LABELS[media]}</span>
                <span className="text-s text-text-sub">{MEDIA_DESCRIPTIONS[media]}</span>
                <Badge variant={status === "posted" ? "success" : "neutral"}>
                  {LISTING_STATUS_LABELS[status]}
                </Badge>
              </div>
              {item.event ? (
                <Link
                  to={threadsPaths.listing(accountId, item.id, media)}
                  className={buttonVariants({ variant: "secondary", size: "small" })}
                  aria-label={`${item.title}の${MEDIA_LABELS[media]}の掲載文を開く`}
                >
                  掲載文を開く
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

/**
 * 1つの媒体の既定値のフォーム。
 * @param props 運用アカウントの ID・媒体・今の値・版
 * @param props.accountId 運用アカウントの ID
 * @param props.media 媒体
 * @param props.values 今の値
 * @param props.version 版
 * @returns フォームの要素（既定値にできる欄がなければ null）
 */
function DefaultsForm({
  accountId,
  media,
  values,
  version,
}: {
  accountId: string;
  media: Media;
  values: Record<string, string>;
  version: number;
}) {
  const queryClient = useQueryClient();
  const fields = MEDIA_DEFINITIONS[media].fields.filter((field) => field.defaultable);
  const [form, setForm] = useState<Record<string, string>>(values);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string }>();
  const [pending, setPending] = useState(false);
  if (fields.length === 0) return null;

  /** 保存する。 */
  const save = async () => {
    if (pending) return;
    setPending(true);
    setResult(undefined);
    setErrors({});
    try {
      await saveMediaDefaults(accountId, media, {
        version,
        values: Object.fromEntries(fields.map((field) => [field.key, form[field.key] ?? ""])),
      });
      await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
      setResult({ tone: "success", message: `${MEDIA_LABELS[media]}の既定値を保存しました。` });
    } catch (caught) {
      const fieldErrors = fieldErrorsFromApi(caught);
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-xs rounded-md border border-border p-xs"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h3 className="text-m font-bold">{MEDIA_LABELS[media]}</h3>
      {fields.map((field) => (
        <Field
          key={field.key}
          label={`${MEDIA_LABELS[media]}：${field.label}`}
          description={field.help}
          error={errors[`values.${field.key}`]}
        >
          <Input
            value={form[field.key] ?? ""}
            maxLength={500}
            onChange={(change) => {
              const value = change.target.value;
              setForm((current) => ({ ...current, [field.key]: value }));
            }}
          />
        </Field>
      ))}
      <div className="flex flex-col items-start gap-xxs">
        <Button type="submit" aria-disabled={pending || undefined}>
          {`${MEDIA_LABELS[media]}の既定値を保存`}
        </Button>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
    </form>
  );
}

/**
 * 媒体の既定値の節。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 節の要素
 */
function DefaultsSection({ accountId }: { accountId: string }) {
  const query = useMediaDefaults(accountId);
  const can = useThreadsCan();
  return (
    <section aria-labelledby="threads-media-defaults" className="flex flex-col gap-xs">
      <h2 id="threads-media-defaults" className="text-l font-bold">
        媒体ごとの既定値
      </h2>
      <p className="text-s text-text-sub">
        事務局名・連絡先・主催のグループなど、毎回同じものを入れておくと、掲載文を作るときに入ります。
      </p>
      {!can.manage ? (
        <p className="text-s text-text-sub">
          既定値は、持ち主だけが変えられます。掲載文を作るときは、持ち主が入れた既定値が入ります。
        </p>
      ) : query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailure error={query.error} retry={() => void query.refetch()} />
      ) : (
        query.data.items.map((item) => (
          <DefaultsForm
            key={item.media}
            accountId={accountId}
            media={item.media}
            values={item.values}
            version={item.version}
          />
        ))
      )}
    </section>
  );
}

/**
 * 外部メディアの画面の中身。
 * @param props 運用アカウント（account）
 * @param props.account 運用アカウント
 * @returns 画面の要素
 */
function MediaContent({ account }: { account: ThreadsAccount }) {
  const query = useExternalMedia(account.id);
  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  const { promotions } = query.data;
  return (
    <ThreadsPage
      title="外部メディア"
      lead={`${account.name}：宣伝のイベントを、外のイベントの掲載サイトに載せる文を作ります。`}
    >
      <section aria-labelledby="threads-media-list" className="flex flex-col gap-xs">
        <h2 id="threads-media-list" className="text-l font-bold">
          宣伝と媒体
        </h2>
        <p className="text-s text-text-sub">
          掲載文は、宣伝の内容とイベントの情報から、媒体の登録画面と同じ順で作ります。媒体のルールに合わない行（外部の
          URL・連絡先など）は外します。言い回しを整えたいときは、外の AI
          に貼るプロンプトをコピーできます。
        </p>
        {promotions.length === 0 ? (
          <div className="flex flex-col items-start gap-xxs">
            <p className="text-m">まだ宣伝がありません。宣伝とリサーチの画面で足してください。</p>
            <Link
              to={threadsPaths.research(account.id)}
              className={buttonVariants({ variant: "secondary" })}
            >
              宣伝とリサーチへ
            </Link>
          </div>
        ) : (
          <ul aria-label="宣伝" className="flex flex-col gap-xs">
            {promotions.map((item) => (
              <PromotionCard key={item.id} accountId={account.id} item={item} />
            ))}
          </ul>
        )}
      </section>
      <DefaultsSection accountId={account.id} />
    </ThreadsPage>
  );
}

/** MediaPage が受け取るもの。 */
export type MediaPageProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 外部メディアの画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @returns 画面の要素
 */
export function MediaPage({ accountId }: MediaPageProps) {
  return (
    <AccountGate accountId={accountId}>
      {(account) => <MediaContent account={account} />}
    </AccountGate>
  );
}

const mediaRouteApi = getRouteApi("/threads/accounts/$accountId/media");

/**
 * 外部メディアの道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function MediaRoute() {
  const { accountId } = mediaRouteApi.useParams();
  return <MediaPage accountId={accountId} />;
}
