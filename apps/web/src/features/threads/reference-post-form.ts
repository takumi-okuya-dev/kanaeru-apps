// 参考の投稿の欄の値と、送る形への変換・確かめ（threads-012。めぐるの components/research/reference-post-form.ts を写した）。
// 足す（ためてまとめて足す）と直すの両方で使う。反応の数は入れたままの文字で持ち、送るときに数にする。
import {
  REFERENCE_METRIC_KEYS,
  REFERENCE_METRIC_MAX,
  ReferencePostInput,
  freshnessOf,
  jstToday,
} from "@workspace/contracts/threads";
import type {
  Freshness,
  PostedDateMode,
  ReferenceMetricKey,
  ReferencePlatform,
  ReferencePost,
} from "@workspace/contracts/threads";
import { fieldErrorsFromIssues } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";

/** 参考の投稿の欄の値（反応の数は入れたままの文字）。 */
export type ReferenceForm = {
  body: string;
  keyword: string;
  postUrl: string;
  whyGood: string;
  platform: ReferencePlatform;
  postedDateMode: PostedDateMode;
  /** YYYY-MM-DD（入れていなければ ""） */
  postedDate: string;
  author: string;
  memo: string;
} & Record<ReferenceMetricKey, string>;

/** 反応の数の欄の名前（めぐると同じ並び）。 */
export const REFERENCE_METRIC_LABELS: readonly (readonly [ReferenceMetricKey, string])[] = [
  ["likes", "いいね"],
  ["replies", "コメント"],
  ["views", "閲覧数"],
  ["saves", "保存数"],
  ["reposts", "リポスト"],
  ["followers", "投稿者のフォロワー数"],
];

/** 空の欄。 */
export const EMPTY_REFERENCE_FORM: ReferenceForm = {
  body: "",
  keyword: "",
  postUrl: "",
  whyGood: "",
  platform: "threads",
  postedDateMode: "unknown",
  postedDate: "",
  author: "",
  memo: "",
  likes: "",
  replies: "",
  views: "",
  saves: "",
  reposts: "",
  followers: "",
};

/**
 * 保存した参考の投稿を、欄の値にする。
 * @param post 参考の投稿
 * @returns 欄の値
 */
export function toReferenceForm(post: ReferencePost): ReferenceForm {
  const metrics = Object.fromEntries(
    REFERENCE_METRIC_KEYS.map((key) => [
      key,
      post.metrics[key] === null ? "" : String(post.metrics[key]),
    ]),
  ) as Record<ReferenceMetricKey, string>;
  return {
    body: post.body,
    keyword: post.keyword,
    postUrl: post.postUrl,
    whyGood: post.whyGood,
    platform: post.platform,
    postedDateMode: post.postedDateMode,
    postedDate: post.postedDate ?? "",
    author: post.author,
    memo: post.memo,
    ...metrics,
  };
}

/** 確かめた結果（送れる形か、欄ごとの誤り）。 */
export type ReferenceFormCheck =
  { ok: true; input: ReferencePostInput } | { ok: false; errors: FieldErrors };

/**
 * 欄の値を確かめ、送る形にする（API と同じ約束で確かめ、反応の数と投稿日は画面でも確かめる）。
 * 誤りの名前は欄の名前（body・postUrl・postedDate・likes など）にそろえる。
 * @param form 欄の値
 * @param today 今日（日本時間の YYYY-MM-DD）
 * @returns 送れる形か、欄ごとの誤り
 */
export function checkReferenceForm(
  form: ReferenceForm,
  today: string = jstToday(new Date()),
): ReferenceFormCheck {
  const errors: FieldErrors = {};
  const metrics = {} as Record<ReferenceMetricKey, number | null>;
  for (const key of REFERENCE_METRIC_KEYS) {
    const raw = form[key].trim().replace(/,/g, "");
    if (raw === "") {
      metrics[key] = null;
    } else if (!/^\d+$/.test(raw) || Number(raw) > REFERENCE_METRIC_MAX) {
      errors[key] = "0以上の整数で入れてください。";
      metrics[key] = null;
    } else {
      metrics[key] = Number(raw);
    }
  }
  const parsed = ReferencePostInput.safeParse({
    body: form.body,
    keyword: form.keyword,
    postUrl: form.postUrl,
    whyGood: form.whyGood,
    platform: form.platform,
    postedDateMode: form.postedDateMode,
    postedDate: form.postedDateMode === "exact" ? form.postedDate || null : null,
    metrics,
    author: form.author,
    memo: form.memo,
  });
  if (!parsed.success) {
    for (const [path, message] of Object.entries(fieldErrorsFromIssues(parsed.error.issues))) {
      const name = path.startsWith("metrics.") ? path.slice("metrics.".length) : path;
      errors[name] ??= message;
    }
  }
  if (form.postedDateMode === "exact" && form.postedDate > today && !errors.postedDate) {
    errors.postedDate = "今日より後の日付は選べません。";
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: parsed.data };
}

/**
 * 入れている途中の値の鮮度（今日足したとみなす）。
 * @param form 欄の値
 * @param today 今日（日本時間の YYYY-MM-DD）
 * @returns 鮮度
 */
export function freshnessOfForm(
  form: ReferenceForm,
  today: string = jstToday(new Date()),
): Freshness {
  return freshnessOf(
    {
      postedDateMode: form.postedDateMode,
      postedDate:
        form.postedDateMode === "exact" && form.postedDate !== "" ? form.postedDate : null,
      createdAt: new Date(),
    },
    today,
  );
}

/**
 * 2つの欄の値が同じか（閉じる前の確かめに使う）。
 * @param a 欄の値
 * @param b 欄の値
 * @returns 同じなら true
 */
export function sameReferenceForm(a: ReferenceForm, b: ReferenceForm): boolean {
  return (Object.keys(EMPTY_REFERENCE_FORM) as (keyof ReferenceForm)[]).every(
    (key) => a[key] === b[key],
  );
}

/**
 * 参考の投稿の、分かっている閲覧数といいねの1行。
 * @param metrics 反応の数
 * @returns 「閲覧 32,000・いいね 820」。どちらもなければ ""
 */
export function metricsLine(metrics: ReferencePost["metrics"]): string {
  const parts: string[] = [];
  if (metrics.views !== null) parts.push(`閲覧 ${metrics.views.toLocaleString("ja-JP")}`);
  if (metrics.likes !== null) parts.push(`いいね ${metrics.likes.toLocaleString("ja-JP")}`);
  return parts.join("・");
}

/**
 * Threads で言葉を検索する URL。
 * @param keyword 言葉
 * @returns URL
 */
export function threadsSearchUrl(keyword: string): string {
  return `https://www.threads.com/search?q=${encodeURIComponent(keyword)}`;
}
