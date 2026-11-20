// 取り込み（貼る・CSV）の行ごとの結果を決める（純粋な関数。見積もりと取り込みで同じものを使う。booking-001 research R4）。
// 「すでにある」：同じ交流会・入口が取り込み・同じ媒体の行（取り消しも数える）を、そろえた名前ごとに数え、その数まで。
// 名前が空の行は入れない。入る行には、名簿（取り消しでない行）か同じ取り込みのほかの入る行に同じ名前があれば印を付ける。
import type { ImportOutcome, RosterImportPreview } from "@workspace/contracts/booking";
import type { ApplicationSource } from "@workspace/contracts/reception";
import { normalizeCheckinName } from "@workspace/contracts/reception";
import type { EntryKind, EntryStatus } from "@workspace/contracts/booking";

/** 見比べる名簿の行（要る列だけ）。 */
export type ImportComparableEntry = {
  /** 名前 */
  name: string;
  /** 媒体 */
  applicationSource: ApplicationSource;
  /** 入口 */
  entryKind: EntryKind;
  /** 状態 */
  status: EntryStatus;
};

/** 取り込む行（ファイルの行の番号と名前）。 */
export type ImportRow = {
  /** ファイルの中の行の番号 */
  line: number;
  /** 名前（前後の空白を消したもの。空でもよい） */
  name: string;
};

/**
 * 数を1つ足す。
 * @param map 名前ごとの数
 * @param key そろえた名前
 */
function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * 取り込みの行ごとの結果と人数を決める。
 * @param rows 取り込む行（上から順に決める）
 * @param applicationSource 選んだ媒体
 * @param entries その交流会の名簿の行（すべて）
 * @returns 行ごとの結果と人数
 */
export function planImport(
  rows: readonly ImportRow[],
  applicationSource: ApplicationSource,
  entries: readonly ImportComparableEntry[],
): RosterImportPreview {
  const already = new Map<string, number>();
  const present = new Set<string>();
  for (const entry of entries) {
    const key = normalizeCheckinName(entry.name);
    if (entry.entryKind === "import" && entry.applicationSource === applicationSource) {
      increment(already, key);
    }
    if (entry.status !== "cancelled") present.add(key);
  }
  const decided = rows.map((row) => {
    const key = normalizeCheckinName(row.name);
    let outcome: ImportOutcome = "insert";
    if (key === "") outcome = "empty";
    else if ((already.get(key) ?? 0) > 0) {
      already.set(key, (already.get(key) ?? 0) - 1);
      outcome = "existing";
    }
    return { ...row, key, outcome };
  });
  const inserting = new Map<string, number>();
  for (const row of decided) if (row.outcome === "insert") increment(inserting, row.key);
  const counts = { insert: 0, existing: 0, empty: 0 };
  const result = decided.map(({ key, ...row }) => {
    counts[row.outcome] += 1;
    const sameName =
      row.outcome === "insert" && (present.has(key) || (inserting.get(key) ?? 0) > 1);
    return { ...row, sameName };
  });
  return { rows: result, counts };
}
