// 外部メディアの掲載文（threads-008。めぐるの「入力の画面」と「作業の画面」）：宣伝×媒体の掲載文を、媒体の登録画面と同じ順・同じ欄の名前で出す。
// 入力：欄ごとに直してコピーする・ルールのチェック（赤・黄・参考）・自動で直した内容・まとめてコピー・画像と言い回しのプロンプト（外の AI に貼る）・状況と掲載 URL。
// 作業：媒体の画面の順の STEP で、上から順にコピーして貼る。ルールのチェック・組み立ては約束の media で、その場で計算する（アプリは AI を呼ばない。AD-20）。
import {
  IMAGE_STYLES,
  LISTING_STATUSES,
  LISTING_STATUS_LABELS,
  MEDIA,
  MEDIA_DEFINITIONS,
  MEDIA_LABELS,
  ListingUpdateInput,
  buildListing,
  checkListing,
  countChars,
  formatEventAddress,
  formatEventFee,
  formatEventPlace,
  formatEventWhen,
  imagePrompt,
  listingAsText,
  listingBodyKey,
  parsePolishAnswer,
  polishPrompt,
  previewListingFixes,
  workSteps,
} from "@workspace/contracts/threads";
import type {
  ImageStyle,
  ListingDetail,
  ListingSource,
  ListingStatus,
  Media,
  MediaField,
  Promotion,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useBlocker } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useRef, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { AccountGate, LoadFailure, Loading } from "./AccountGate.tsx";
import { generateListing, updateListing } from "./api.ts";
import { CopyButton } from "./CopyButton.tsx";
import { threadsPaths } from "./paths.ts";
import { THREADS_QUERY_KEYS, useListing } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 画像の種類の名前。 */
const IMAGE_STYLE_LABELS: Record<ImageStyle, string> = {
  illustration: "イラスト型",
  photo: "写真を使う型",
};

/** ルールのチェックの名前。 */
const CHECK_LABELS = { red: "掲載できない", yellow: "確かめる", info: "参考" } as const;

/** 選ぶ欄で、チップにする選択肢の数の上限（多いものは選ぶ欄にする）。 */
const CHIP_OPTIONS_MAX = 6;

/**
 * 掲載文を作る材料（画面で、ルールのチェックとプロンプトに使う）。
 * @param detail 掲載文の画面の中身
 * @returns 材料
 */
function sourceOf(detail: ListingDetail): ListingSource {
  const { promotion } = detail;
  return {
    title: promotion.title,
    content: promotion.content,
    targetLocation: promotion.targetLocation,
    targetPersona: promotion.targetPersona,
    targetAgeRange: promotion.targetAgeRange,
    cta: promotion.cta,
    linkedUrl: promotion.linkedUrl,
    event: promotion.event,
    defaults: detail.defaults,
  };
}

/**
 * 選択肢の多い欄の選ぶ欄（入力欄と同じ見た目。Field の名前・説明と結ぶ）。
 * @param props 選択肢・値・変えたとき
 * @param props.options 選択肢
 * @param props.value 値
 * @param props.onChange 変えたとき
 * @returns 要素
 */
function OptionSelect({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-l`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      <option value="">選んでいません</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/**
 * 欄1つ（名前・必須・登録後は変えられない・文字数・選んだ理由・タイトルのほかの案・コピー）。
 * @param props 欄・値・理由・ほかの案・誤り・変えたとき
 * @param props.field 欄
 * @param props.value 値
 * @param props.reason 選んだ理由
 * @param props.candidates タイトルのほかの案（押すと入れ替える）
 * @param props.error 誤り
 * @param props.onChange 変えたとき
 * @returns 要素
 */
function FieldRow({
  field,
  value,
  reason,
  candidates = [],
  error,
  onChange,
}: {
  field: MediaField;
  value: string;
  reason: string | undefined;
  candidates?: readonly string[];
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const length = countChars(value);
  const over = field.max !== undefined && length > field.max;
  const notes = [
    field.help,
    field.max !== undefined ? `${length}／${field.max}文字` : null,
    reason && field.kind === "select"
      ? `このイベントでは「${value}」を選びます（${reason}）`
      : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-x3s">
      <div className="flex flex-wrap gap-xxs">
        {field.required ? <Badge>必須</Badge> : null}
        {field.immutable ? <Badge variant="danger">登録後は変更できない</Badge> : null}
      </div>
      {field.kind === "select" && (field.options ?? []).length <= CHIP_OPTIONS_MAX ? (
        <ChoiceChips
          label={field.label}
          options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
          value={value === "" ? null : value}
          onValueChange={onChange}
          description={notes.join("。")}
          error={error}
        />
      ) : (
        <Field
          label={field.label}
          description={notes.length > 0 ? notes.join("。") : undefined}
          error={error ?? (over ? `${field.max ?? 0}文字を超えています。` : undefined)}
        >
          {field.kind === "select" ? (
            <OptionSelect options={field.options ?? []} value={value} onChange={onChange} />
          ) : field.kind === "textarea" ? (
            <Textarea rows={6} value={value} onChange={(change) => onChange(change.target.value)} />
          ) : (
            <Input value={value} onChange={(change) => onChange(change.target.value)} />
          )}
        </Field>
      )}
      {candidates.length > 0 ? (
        <div className="flex flex-col gap-x3s">
          <p className="text-s text-text-sub">ほかの案（押すと入れ替えます）</p>
          <ul aria-label={`「${field.label}」のほかの案`} className="flex flex-col gap-x3s">
            {candidates.map((candidate) => (
              <li key={candidate}>
                <Button
                  size="small"
                  className="h-auto w-full justify-start py-x3s text-left whitespace-normal"
                  aria-pressed={candidate === value}
                  onClick={() => onChange(candidate)}
                >
                  {candidate}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {value !== "" ? (
        <CopyButton
          text={value}
          label={`「${field.label}」をコピー`}
          successMessage="コピーしました。媒体の画面に貼ってください。"
          size="small"
        />
      ) : null}
    </div>
  );
}

/**
 * 宣伝の元の情報（読むだけ。掲載文を直しても変わらない。めぐるの SourcePanel）。
 * @param props 宣伝
 * @param props.promotion 宣伝
 * @returns 要素
 */
function SourcePanel({ promotion }: { promotion: Promotion }) {
  const event = promotion.event;
  const rows: [string, string][] = [
    ["タイトル", promotion.title],
    ...(event
      ? ([
          ["開催日時", formatEventWhen(event)],
          ["場所", formatEventPlace(event)],
          ["住所", event.format === "venue" ? formatEventAddress(event) : ""],
          [
            "定員・参加費",
            [event.capacity !== null ? `${event.capacity}名` : "", formatEventFee(event)]
              .filter(Boolean)
              .join("・"),
          ],
        ] as [string, string][])
      : []),
  ];
  return (
    <aside
      aria-labelledby="threads-listing-source"
      className="flex flex-col gap-xxs rounded-md border border-border bg-surface-sunken p-xs"
    >
      <h2 id="threads-listing-source" className="text-m font-bold">
        宣伝の元の情報（変わりません）
      </h2>
      <dl className="flex flex-col gap-xxs text-s">
        {rows
          .filter(([, value]) => value !== "")
          .map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-text-sub">{label}</dt>
              <dd className="break-words whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
      </dl>
      <Disclosure summary="宣伝したい内容" className="text-s">
        <p className="break-words whitespace-pre-wrap">{promotion.content}</p>
      </Disclosure>
    </aside>
  );
}

/**
 * ルールのチェックの一覧。
 * @param props 項目
 * @param props.checks 項目
 * @returns 要素
 */
function CheckList({ checks }: { checks: ReturnType<typeof checkListing> }) {
  const count = (level: "red" | "yellow" | "info") =>
    checks.filter((check) => check.level === level).length;
  return (
    <section aria-labelledby="threads-listing-checks" className="flex flex-col gap-xxs">
      <h2 id="threads-listing-checks" className="text-l font-bold">
        ルールのチェック
      </h2>
      <p className="text-s">{`掲載できない ${count("red")}件・確かめる ${count("yellow")}件・参考 ${count("info")}件`}</p>
      {checks.length > 0 ? (
        <ul aria-label="ルールのチェック" className="flex flex-col gap-x3s">
          {checks.map((check, index) => (
            <li
              // 同じ文が2つ出ることがあるので、並びの位置もつける
              key={`${check.level}-${index.toString()}`}
              className={check.level === "red" ? "text-s text-danger-text" : "text-s"}
            >
              {`【${CHECK_LABELS[check.level]}】${check.message}`}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * 作業の画面（媒体の画面の順の STEP）。
 * @param props 媒体・値・材料・画像の種類・ルールのチェック
 * @param props.media 媒体
 * @param props.values 欄の値
 * @param props.source 材料
 * @param props.imageStyle 画像の種類
 * @param props.redCount 掲載できない項目の数
 * @returns 要素
 */
function WorkView({
  media,
  values,
  source,
  imageStyle,
  redCount,
}: {
  media: Media;
  values: Record<string, string>;
  source: ListingSource;
  imageStyle: ImageStyle;
  redCount: number;
}) {
  const steps = workSteps(media, values);
  return (
    <section aria-labelledby="threads-listing-work" className="flex flex-col gap-xs">
      <h2 id="threads-listing-work" className="text-l font-bold">
        作業の手順
      </h2>
      <p className="text-s">{`上から順番にコピーして、${MEDIA_LABELS[media]}に貼り付けてください。`}</p>
      <ol className="flex flex-col gap-xs">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
          >
            <h3 className="text-m font-bold">{`STEP ${index + 1}：${step.title}`}</h3>
            {step.instruction ? <p className="text-s">{step.instruction}</p> : null}
            {step.ruleCheck ? (
              <p className={redCount > 0 ? "text-s text-danger-text" : "text-s"}>
                {redCount > 0
                  ? `掲載できない項目が${redCount}件あります。入力の画面で直してから進めてください。`
                  : "掲載できない項目はありません。"}
              </p>
            ) : null}
            {step.values.map(({ field, value }) => (
              <div key={field.key} className="flex flex-col gap-x3s">
                <p className="text-s font-bold">{field.label}</p>
                <p className="text-s break-words whitespace-pre-wrap">
                  {value === "" ? "（空）" : value}
                </p>
                {value !== "" ? (
                  <CopyButton
                    text={value}
                    label={`「${field.label}」をコピー`}
                    successMessage="コピーしました。媒体の画面に貼ってください。"
                    size="small"
                  />
                ) : null}
              </div>
            ))}
            {step.image ? (
              <CopyButton
                text={imagePrompt(media, source, imageStyle)}
                label="画像のプロンプトをコピー"
                size="small"
              />
            ) : null}
            {step.notes.length > 0 ? (
              <ul className="flex list-disc flex-col gap-x3s pl-m text-s text-text-sub">
                {step.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * 掲載文の中身（作ったあと）。
 * @param props 運用アカウントの ID・掲載文の画面の中身
 * @param props.accountId 運用アカウントの ID
 * @param props.detail 掲載文の画面の中身
 * @returns 要素
 */
function ListingEditor({ accountId, detail }: { accountId: string; detail: ListingDetail }) {
  const queryClient = useQueryClient();
  const media = detail.media;
  const def = MEDIA_DEFINITIONS[media];
  const source = sourceOf(detail);
  const [values, setValues] = useState<Record<string, string>>(detail.listing.fields ?? {});
  const [mode, setMode] = useState<"input" | "work">("input");
  const [imageStyle, setImageStyle] = useState<ImageStyle>(detail.listing.imageStyle);
  const [status, setStatus] = useState<ListingStatus>(detail.listing.status);
  const [postedUrl, setPostedUrl] = useState(detail.listing.postedUrl ?? "");
  const [answer, setAnswer] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [result, setResult] = useState<Result>();
  const [statusResult, setStatusResult] = useState<Result>();
  const [polishResult, setPolishResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  const built = buildListing(media, source);
  const reasons = built.reasons;
  // 直している値に自動の直しを通した結果（保存しない。保存すると、この内容を外す）
  const previewFixes = previewListingFixes(media, values, source).fixes;
  const checks = checkListing(
    media,
    values,
    source,
    detail.listing.fixes.length + previewFixes.length,
  );
  const redCount = checks.filter((check) => check.level === "red").length;
  // 保存していない変更（欄・状況・掲載 URL・画像の種類）があれば、画面を離れる前に確かめる
  const dirty =
    def.fields.some(
      (field) => (values[field.key] ?? "") !== (detail.listing.fields?.[field.key] ?? ""),
    ) ||
    status !== detail.listing.status ||
    postedUrl !== (detail.listing.postedUrl ?? "") ||
    imageStyle !== detail.listing.imageStyle;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  /**
   * 保存する。
   * @param input 送るもの（版のほか）
   * @param done 結果を出す先
   * @param message できたときの文
   */
  const save = async (
    input: Omit<ListingUpdateInput, "version">,
    done: (result: Result) => void,
    message: string,
  ) => {
    if (pending) return;
    const parsed = ListingUpdateInput.safeParse({ ...input, version: detail.listing.version });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const saved = await updateListing(accountId, detail.promotion.id, media, parsed.data);
      if (input.fields) setValues(saved.listing.fields ?? {});
      queryClient.setQueryData(
        THREADS_QUERY_KEYS.listing(accountId, detail.promotion.id, media),
        saved,
      );
      await queryClient.invalidateQueries({
        queryKey: THREADS_QUERY_KEYS.externalMedia(accountId),
      });
      done({ tone: "success", message });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else done({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  const parsedAnswer = answer.trim() ? parsePolishAnswer(answer) : undefined;

  return (
    <>
      <CheckList checks={checks} />
      <ChoiceChips
        label="画面"
        options={[
          { value: "input", label: "入力" },
          { value: "work", label: "作業の手順" },
        ]}
        value={mode}
        onValueChange={setMode}
      />
      {mode === "work" ? (
        <WorkView
          media={media}
          values={values}
          source={source}
          imageStyle={imageStyle}
          redCount={redCount}
        />
      ) : (
        <>
          <div className="flex flex-col gap-s wide:grid wide:grid-cols-3 wide:items-start">
            <SourcePanel promotion={detail.promotion} />
            <section
              aria-labelledby="threads-listing-fields"
              className="flex min-w-0 flex-col gap-s wide:col-span-2"
            >
              <h2 id="threads-listing-fields" className="text-l font-bold">
                掲載文
              </h2>
              {def.steps.map((step, index) => (
                <div key={step} className="flex flex-col gap-xs">
                  <h3 className="text-m font-bold">{`${index + 1}. ${step}`}</h3>
                  {def.fields
                    .filter((field) => field.step === index)
                    .map((field) => (
                      <FieldRow
                        key={field.key}
                        field={field}
                        value={values[field.key] ?? ""}
                        reason={reasons[field.key]}
                        candidates={field.key === "title" ? built.titleCandidates : []}
                        error={errors[`fields.${field.key}`]}
                        onChange={(value) =>
                          setValues((current) => ({ ...current, [field.key]: value }))
                        }
                      />
                    ))}
                </div>
              ))}
              <div className="flex flex-col items-start gap-xxs">
                <ButtonRow>
                  <Button
                    variant="primary"
                    aria-disabled={pending || undefined}
                    onClick={() =>
                      void save(
                        { fields: values },
                        setResult,
                        "掲載文を保存しました（ルールに合わない行は外しました）。",
                      )
                    }
                  >
                    掲載文を保存
                  </Button>
                </ButtonRow>
                {result ? (
                  <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage>
                ) : null}
              </div>
              <CopyButton
                text={listingAsText(media, values)}
                label="まとめてコピー"
                successMessage="コピーしました。"
              />
            </section>
          </div>
          {previewFixes.length > 0 ? (
            <section
              aria-labelledby="threads-listing-preview-fixes"
              className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
            >
              <h2 id="threads-listing-preview-fixes" className="text-m font-bold">
                {`保存すると外す内容（${previewFixes.length}件）`}
              </h2>
              <ul className="flex flex-col gap-x3s text-s">
                {previewFixes.map((fix, index) => (
                  <li
                    key={`${fix.field}-${index.toString()}`}
                  >{`「${fix.excerpt}」を外します（${fix.reason}）`}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {detail.listing.fixes.length > 0 ? (
            <Disclosure
              summary={`自動で直した内容（${detail.listing.fixes.length}件）`}
              variant="heading"
            >
              <ul className="flex flex-col gap-x3s text-s">
                {detail.listing.fixes.map((fix, index) => (
                  <li
                    key={`${fix.field}-${index.toString()}`}
                  >{`「${fix.excerpt}」を外しました（${fix.reason}）`}</li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
          <section aria-labelledby="threads-listing-ai" className="flex flex-col gap-xs">
            <h2 id="threads-listing-ai" className="text-l font-bold">
              外の AI に頼む
            </h2>
            <ChoiceChips
              label="画像の種類"
              options={IMAGE_STYLES.map((value) => ({ value, label: IMAGE_STYLE_LABELS[value] }))}
              value={imageStyle}
              onValueChange={setImageStyle}
            />
            <CopyButton
              text={imagePrompt(media, source, imageStyle)}
              label="画像のプロンプトをコピー"
            />
            <CopyButton
              text={polishPrompt(media, source, values)}
              label="言い回しを整えるプロンプトをコピー"
            />
            <Field
              label="AI の言い回しの答え"
              description="【タイトル】【本文】【ここまで】の目印のある答えを、そのまま貼ります。"
            >
              <Textarea
                rows={5}
                value={answer}
                onChange={(change) => setAnswer(change.target.value)}
              />
            </Field>
            {parsedAnswer ? (
              <p className="text-s">
                {`読み取れたもの：${[parsedAnswer.title ? "タイトル" : null, parsedAnswer.body ? "本文" : null].filter(Boolean).join("・") || "なし"}`}
              </p>
            ) : null}
            <div className="flex flex-col items-start gap-xxs">
              <ButtonRow>
                <Button
                  aria-disabled={
                    !parsedAnswer || (!parsedAnswer.title && !parsedAnswer.body) || undefined
                  }
                  onClick={() => {
                    if (!parsedAnswer || (!parsedAnswer.title && !parsedAnswer.body)) return;
                    setValues((current) => ({
                      ...current,
                      ...(parsedAnswer.title ? { title: parsedAnswer.title } : {}),
                      ...(parsedAnswer.body ? { [listingBodyKey(media)]: parsedAnswer.body } : {}),
                    }));
                    setAnswer("");
                    setPolishResult({
                      tone: "success",
                      message: "答えを欄に入れました。確かめて「掲載文を保存」を押してください。",
                    });
                  }}
                >
                  答えを欄に入れる
                </Button>
              </ButtonRow>
              {polishResult ? (
                <ResponseMessage tone={polishResult.tone}>{polishResult.message}</ResponseMessage>
              ) : null}
            </div>
          </section>
        </>
      )}
      <section aria-labelledby="threads-listing-status" className="flex flex-col gap-xs">
        <h2 id="threads-listing-status" className="text-l font-bold">
          掲載の状況
        </h2>
        <ChoiceChips
          label="状況"
          options={LISTING_STATUSES.map((value) => ({
            value,
            label: LISTING_STATUS_LABELS[value],
          }))}
          value={status}
          onValueChange={setStatus}
        />
        <Field
          label="掲載 URL"
          description="公開したら、媒体のイベントの URL を入れます。"
          error={errors.postedUrl}
        >
          <Input
            value={postedUrl}
            inputMode="url"
            onChange={(change) => setPostedUrl(change.target.value)}
          />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <ButtonRow>
            <Button
              aria-disabled={pending || undefined}
              onClick={() =>
                void save(
                  { status, postedUrl, imageStyle },
                  setStatusResult,
                  "掲載の状況を保存しました。",
                )
              }
            >
              状況を保存
            </Button>
          </ButtonRow>
          {statusResult ? (
            <ResponseMessage tone={statusResult.tone}>{statusResult.message}</ResponseMessage>
          ) : null}
        </div>
      </section>
      <ConfirmDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
        title="保存していない変更があります"
        confirmLabel="保存せずに離れる"
        cancelLabel="この画面に残る"
        onConfirm={() => {
          if (blocker.status === "blocked") blocker.proceed();
        }}
      >
        画面を離れると、直した掲載文・状況・掲載 URL は消えます。
      </ConfirmDialog>
    </>
  );
}

/**
 * 掲載文の画面の中身。
 * @param props 運用アカウント・宣伝の ID・媒体
 * @param props.account 運用アカウント
 * @param props.promotionId 宣伝の ID
 * @param props.media 媒体
 * @returns 画面の要素
 */
function ListingContent({
  account,
  promotionId,
  media,
}: {
  account: ThreadsAccount;
  promotionId: string;
  media: Media;
}) {
  const queryClient = useQueryClient();
  const query = useListing(account.id, promotionId, media);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <LoadFailure
        error={query.error}
        retry={() => void query.refetch()}
        notFoundTitle="この宣伝は見つかりません"
      />
    );
  const detail = query.data;

  /** 掲載文を作る・作り直す。 */
  const generate = async () => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const made = await generateListing(account.id, promotionId, media, detail.listing.version);
      queryClient.setQueryData(THREADS_QUERY_KEYS.listing(account.id, promotionId, media), made);
      await queryClient.invalidateQueries({
        queryKey: THREADS_QUERY_KEYS.externalMedia(account.id),
      });
      setConfirming(false);
    } catch (caught) {
      setError(`作れませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <ThreadsPage
      wide
      title={`${MEDIA_LABELS[media]}の掲載文`}
      lead={`宣伝「${detail.promotion.title}」から、${MEDIA_LABELS[media]}の登録画面と同じ順で作ります。宣伝の文は変わりません。`}
      actions={
        <Link
          to={threadsPaths.media(account.id)}
          className={buttonVariants({ variant: "secondary" })}
        >
          外部メディアの一覧へ
        </Link>
      }
    >
      {detail.listing.fields === null ? (
        <div className="flex flex-col items-start gap-xxs">
          {detail.promotion.event ? (
            <>
              <p className="text-m">まだ掲載文を作っていません。</p>
              <ButtonRow>
                <Button
                  variant="primary"
                  aria-disabled={pending || undefined}
                  onClick={() => void generate()}
                >
                  {pending ? "作っています…" : "掲載文を作る"}
                </Button>
              </ButtonRow>
            </>
          ) : (
            <p className="text-m">
              宣伝にイベントの情報（開催日時など）がありません。宣伝とリサーチの画面で足してください。
            </p>
          )}
          {error ? <ResponseMessage tone="danger">{error}</ResponseMessage> : null}
        </div>
      ) : (
        <>
          {detail.sourceChanged ? (
            <p className="text-m text-danger-text">
              掲載文を作ったあとに、宣伝が直されました。必要なら作り直してください。
            </p>
          ) : null}
          <ButtonRow>
            <Button onClick={() => setConfirming(true)}>宣伝から作り直す</Button>
          </ButtonRow>
          <ListingEditor
            key={detail.listing.generatedAt ?? "none"}
            accountId={account.id}
            detail={detail}
          />
        </>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="掲載文を作り直します"
        confirmLabel="作り直す"
        pendingLabel="作っています…"
        pending={pending}
        error={error}
        onConfirm={() => void generate()}
      >
        直した欄は、宣伝から作った文に戻ります。状況と掲載 URL は残ります。
      </ConfirmDialog>
    </ThreadsPage>
  );
}

/** ListingPage が受け取るもの。 */
export type ListingPageProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 宣伝の ID */
  promotionId: string;
  /** 媒体（道の文字） */
  media: string;
};

/**
 * 掲載文の画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID・宣伝の ID・媒体
 * @returns 画面の要素
 */
export function ListingPage({ accountId, promotionId, media }: ListingPageProps) {
  const known = (MEDIA as readonly string[]).includes(media);
  return (
    <AccountGate accountId={accountId}>
      {(account) =>
        known ? (
          <ListingContent account={account} promotionId={promotionId} media={media as Media} />
        ) : (
          <ThreadsPage title="この媒体は見つかりません" lead="URL が違う可能性があります。" />
        )
      }
    </AccountGate>
  );
}

const listingRouteApi = getRouteApi("/threads/accounts/$accountId/media/$promotionId/$media");

/**
 * 掲載文の道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function ListingRoute() {
  const { accountId, promotionId, media } = listingRouteApi.useParams();
  return <ListingPage accountId={accountId} promotionId={promotionId} media={media} />;
}
