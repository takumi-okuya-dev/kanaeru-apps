// 反応の CSV の列と、1行の値の作り方（threads-012。めぐるの packages/shared/src/csv.ts の「投稿ごと」37列・「取りこみごと」13列を写した）。
// 欄を囲む・式として読まれないようにする・BOM と CRLF は API の @workspace/csv が受け持つ。ここは列の並びと値の形だけ。
import type { Judgment, MetricsState, MetricValues } from "./metrics.ts";
import { countChars } from "./text.ts";

/** 日本時間の時差（ミリ秒）。 */
const JST_OFFSET_MS = 9 * 3600_000;

/** 曜日（日〜土）。 */
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 2桁にそろえる。
 * @param n 数
 * @returns 2桁の文字
 */
const pad = (n: number) => String(n).padStart(2, "0");

/** 反応の6つの数の列名（並びの順）。 */
const METRIC_HEADERS = ["閲覧", "いいね", "返信", "リポスト", "引用", "シェア"] as const;

/** 「投稿ごと」の列名（37列）。 */
export const POST_CSV_HEADER: readonly string[] = [
  "投稿ID",
  "投稿した日時",
  "曜日",
  "時",
  "本文",
  "文字数",
  ...METRIC_HEADERS,
  "基準値に対する倍率",
  "判定",
  "投稿のURL",
  "反応数の最終取り込み日時",
  "取り込み時の経過時間",
  "値の状態",
  "投稿時点のフォロワー数",
  ...METRIC_HEADERS.map((h) => `24時間時点の${h}`),
  "バッチID",
  "バッチの中の順番",
  "バッチを登録した日時",
  "承認した日時",
  "次に投稿するで前に出したか",
  "持ち越されたか",
  "登録の後に本文を直したか",
  "予定の時刻の枠",
  "バッチ登録時の課題の最終更新日時",
  "バッチ登録時の宣伝内容の最終更新日時",
  "バッチ登録時のリサーチの最終更新日時",
  "バッチ登録時の投稿ルールの最終更新日時",
];

/** 「取りこみごと」の列名（13列）。 */
export const SNAPSHOT_CSV_HEADER: readonly string[] = [
  "投稿ID",
  "投稿した日時",
  "取り込んだ日時",
  "取り込み時の経過時間",
  "取り込みの種類",
  "取り方",
  ...METRIC_HEADERS,
  "その時点のフォロワー数",
];

/** 「投稿ごと」の1行のもと（API が DB から読んだもの）。 */
export type PostCsvRow = {
  id: string;
  publishedAt: Date;
  body: string;
  /** 最後に取りこんだ反応（まだなら null） */
  metrics: MetricValues | null;
  /** 基準値に対する倍率（判定したときだけ） */
  ratio: number | null;
  /** 取りこみの状態（反応の記録がなければ pending） */
  state: MetricsState;
  judgment: Judgment | null;
  permalink: string | null;
  lastFetchedAt: Date | null;
  lastElapsedMinutes: number | null;
  followersAtPost: number | null;
  /** 24時間時点の反応（取っていなければ null） */
  h24: MetricValues | null;
  batchId: string;
  /** まとまりの中の順番（0から） */
  batchPosition: number;
  batchCreatedAt: Date;
  approvedAt: Date | null;
  prioritized: boolean | null;
  carryover: boolean | null;
  bodyEdited: boolean;
  /** 予定の時刻の枠（0時からの分） */
  slotMinute: number | null;
  strategyUpdatedAt: Date | null;
  promotionsChangedAt: Date | null;
  researchChangedAt: Date | null;
  coreRulesChangedAt: Date | null;
};

/** 「取りこみごと」の1行のもと。 */
export type SnapshotCsvRow = {
  /** 投稿（案）の ID */
  id: string;
  publishedAt: Date;
  fetchedAt: Date;
  elapsedMinutes: number;
  kind: "h24" | "d3" | "d7" | "late";
  method: "slot" | "daily";
  metrics: MetricValues;
  followersOnDay: number | null;
};

/**
 * 日本時間の、時差つきの日時（例：2026-09-25T19:01:00+09:00）。
 * @param value 日時（null なら空）
 * @returns 文字
 */
export function formatJstIso(value: Date | null): string {
  if (!value) return "";
  const j = new Date(value.getTime() + JST_OFFSET_MS);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}T${pad(j.getUTCHours())}:${pad(
    j.getUTCMinutes(),
  )}:${pad(j.getUTCSeconds())}+09:00`;
}

/**
 * 数を欄にする（ない数は空）。
 * @param value 数
 * @returns 文字
 */
function num(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * 反応の6つの数の欄。
 * @param m 反応（なければ全部空）
 * @returns 6つの欄
 */
function metricCells(m: MetricValues | null): string[] {
  if (!m) return ["", "", "", "", "", ""];
  return [m.views, m.likes, m.replies, m.reposts, m.quotes, m.shares].map(num);
}

/**
 * はい・いいえの欄（分からなければ空）。
 * @param value 値
 * @returns 文字
 */
function yesNo(value: boolean | null): string {
  if (value === null) return "";
  return value ? "はい" : "いいえ";
}

/** 判定の見える名前。 */
const JUDGMENT_TEXT: Record<Judgment, string> = { good: "好調", normal: "普通", poor: "低調" };

/** 値の状態の見える名前（取りこみ待ち・計れないは空）。 */
const STATE_TEXT: Partial<Record<MetricsState, string>> = {
  updating: "更新中",
  confirmed: "確定",
  late_confirmed: "遅れて確定",
};

/** 取りこみの種類の見える名前。 */
const KIND_TEXT: Record<SnapshotCsvRow["kind"], string> = {
  h24: "24時間時点",
  d3: "3日時点",
  d7: "7日時点",
  late: "遅れて確定",
};

/**
 * 判定の欄（好調・普通・低調・確定待ち・計測できません・判定なし）。
 * @param row 行
 * @returns 文字
 */
function judgmentCell(row: PostCsvRow): string {
  if (row.state === "pending" || row.state === "updating") return "確定待ち";
  if (row.state === "unmeasurable") return "計測できません";
  return row.judgment ? JUDGMENT_TEXT[row.judgment] : "判定なし";
}

/**
 * 「投稿ごと」の1行の値（POST_CSV_HEADER の順）。
 * @param row 行のもと
 * @returns 欄の文字
 */
export function postCsvCells(row: PostCsvRow): string[] {
  const slot =
    row.slotMinute === null
      ? ""
      : `${pad(Math.floor(row.slotMinute / 60))}:${pad(row.slotMinute % 60)}`;
  const jst = new Date(row.publishedAt.getTime() + JST_OFFSET_MS);
  return [
    row.id,
    formatJstIso(row.publishedAt),
    WEEKDAYS[jst.getUTCDay()]!,
    String(jst.getUTCHours()),
    row.body,
    String(countChars(row.body)),
    ...metricCells(row.metrics),
    row.ratio === null ? "" : row.ratio.toFixed(3),
    judgmentCell(row),
    row.permalink ?? "",
    formatJstIso(row.lastFetchedAt),
    row.lastElapsedMinutes === null ? "" : String(Math.floor(row.lastElapsedMinutes / 60)),
    STATE_TEXT[row.state] ?? "",
    num(row.followersAtPost),
    ...metricCells(row.h24),
    row.batchId,
    String(row.batchPosition + 1),
    formatJstIso(row.batchCreatedAt),
    formatJstIso(row.approvedAt),
    yesNo(row.prioritized),
    yesNo(row.carryover),
    yesNo(row.bodyEdited),
    slot,
    formatJstIso(row.strategyUpdatedAt),
    formatJstIso(row.promotionsChangedAt),
    formatJstIso(row.researchChangedAt),
    formatJstIso(row.coreRulesChangedAt),
  ];
}

/**
 * 「取りこみごと」の1行の値（SNAPSHOT_CSV_HEADER の順）。
 * @param row 行のもと
 * @returns 欄の文字
 */
export function snapshotCsvCells(row: SnapshotCsvRow): string[] {
  return [
    row.id,
    formatJstIso(row.publishedAt),
    formatJstIso(row.fetchedAt),
    String(Math.floor(row.elapsedMinutes / 60)),
    KIND_TEXT[row.kind],
    row.method === "slot" ? "時刻の処理" : "毎日の処理",
    ...metricCells(row.metrics),
    num(row.followersOnDay),
  ];
}
