// 当日に分け方や試合の形を変えたときに、終わった試合をできるだけ残す（PRD FR-M6・FR-M10「まだの試合だけを組み直す」。match-003）。
// 状態を持たない関数だけ。
// - 分け方も試合の形も変わらない組（同じ key・同じ形）は、試合をまるごと残す（まだの試合も）
// - 新しい組：前の組の終わった試合のうち、入った人がみな新しい組のレベルの試合を移す（組を一緒にしたとき）。並びは、前の組の
//   試合の番号の順に交互に並べる（同じ時間に進んでいたため）。まだの試合は外す（組み直す）
// - 新しい組に入れられない終わった試合（レベルの違う人が入っている・試合の形が変わった）は、組から外して「前の分け方で
//   終わった試合」（archive）に残す。記録として出し、これからの試合の数を均すときにも数える（plan.ts の archivedHistoryOf）
// - 新しい組の行の数：時間は前の組と同じだけ進んでいるので、行の数 = 移した終わった試合 + （設定から決まる試合の数 − 進んだ試合の数）。
//   差を組の offset に持つ（進んだ試合の数は、前のすべての組の「最後に終わった試合の番号 − その組の offset」のいちばん大きいもの。
//   どの組も同じ時間に進むため）
// 【仮決め】research R3。
// 分け方を組み合わせる（match-009）：組の並びは matchGroupsOf（レベル別の組 + all）。進んだ試合の数は「外す組 + 同じ分け方の組」で
// 数える（分けないを足すだけなら、足した組は進んでいない。match-009 research R3）。ミニゲームはコート数が変わる・外すとチーム分けを
// 消す（組み直すときに分ける。research R5）。
import {
  MATCH_GROUPS,
  PLAN_GAMES_MAX,
  PLAYERS_PER_GAME,
  groupSetOf,
  matchGroupsOf,
} from "@workspace/contracts/match";
import { tableElapsed } from "./plan.ts";
import type {
  MatchArchivedGroup,
  MatchGame,
  MatchGroup,
  MatchGroupKey,
  MatchGroupPlan,
  MatchSettings,
  MatchTableContent,
} from "@workspace/contracts/match";

/** 組の key → 画面の言葉（どの分け方の組も）。 */
const GROUP_LABELS = new Map<string, string>(
  Object.values(MATCH_GROUPS).flatMap((groups) =>
    groups.map((group) => [group.key, group.label] as const),
  ),
);

/**
 * 組の key の画面の言葉。
 * @param key 組の key
 * @returns 画面の言葉
 */
export function groupLabelOf(key: string): string {
  return GROUP_LABELS.get(key) ?? key;
}

/** 設定を変えたときに、組み合わせがどう変わるか。 */
export type SettingsChangeReport = {
  /** 分け方か試合の形が変わったか（変わらなければ、組み合わせは変えない） */
  regrouped: boolean;
  /** 試合の形が変わったか */
  formatChanged: boolean;
  /** そのまま残す組（同じ key・同じ形。まだの試合も残す）の key */
  carried: MatchGroupKey[];
  /** 移す前の組の終わった試合の数（そのまま残す組の分は除く） */
  doneTotal: number;
  /** 新しい組に移した終わった試合の数 */
  moved: number;
  /** 組から外して「前の分け方で終わった試合」に残した数（前の組の key ごと） */
  archived: { key: MatchGroupKey; count: number }[];
  /** 外したまだの試合の数（組み直すと、また組まれる） */
  dropped: number;
  /** ミニゲームのチーム分けを消したか（ミニゲームを外した・コート数を変えた） */
  miniCleared: boolean;
  /** ミニゲームを外したか（コート数を変えたときは false） */
  miniRemoved: boolean;
};

/** 変えないときの答え。 */
const UNCHANGED: Omit<SettingsChangeReport, "carried"> = {
  regrouped: false,
  formatChanged: false,
  doneTotal: 0,
  moved: 0,
  archived: [],
  dropped: 0,
  miniCleared: false,
  miniRemoved: false,
};

/**
 * 前の分け方の試合に足す（同じ key は1つにまとめる）。
 * @param archive 今の前の分け方の試合
 * @param additions 足す試合（key ごと）
 * @returns 新しい前の分け方の試合
 */
function mergeArchive(
  archive: readonly MatchArchivedGroup[],
  additions: ReadonlyMap<MatchGroupKey, MatchGame[]>,
): MatchArchivedGroup[] {
  const merged = archive.map((entry) => ({ ...entry, games: [...entry.games] }));
  for (const [key, games] of additions) {
    if (games.length === 0) continue;
    const found = merged.find((entry) => entry.key === key);
    if (found) found.games.push(...games);
    else merged.push({ key, games: [...games] });
  }
  // 1つの key に持てる試合の上限を超えたら、古いものから外す（まれ。記録だけなので、新しいものを残す）
  return merged.map((entry) => ({ ...entry, games: entry.games.slice(-PLAN_GAMES_MAX) }));
}

/**
 * 設定を変える（分け方か試合の形が変わったら、終わった試合をできるだけ残して組み合わせを移す）。
 * 移したあとで buildPlan を呼ぶと、終わった試合の続きから組む。
 * @param content 今の中身
 * @param next 新しい設定（約束で確かめたもの）
 * @returns 新しい中身と、何が変わるか
 */
export function changeSettings(
  content: MatchTableContent,
  next: MatchSettings,
): { content: MatchTableContent; report: SettingsChangeReport } {
  const before = content.settings;
  const formatChanged = before.format !== next.format;
  // ミニゲーム：外した・コート数を変えたらチーム分けを消す（組み直すときに分ける）
  const miniCleared = content.mini !== undefined && before.courts !== next.courts;
  const miniRemoved = miniCleared && next.courts === null;
  const { mini: _mini, ...withoutMini } = content;
  const base: MatchTableContent = miniCleared ? withoutMini : content;
  const sameGroups =
    matchGroupsOf(before)
      .map((group) => group.key)
      .join() ===
    matchGroupsOf(next)
      .map((group) => group.key)
      .join();
  if (!formatChanged && sameGroups) {
    return {
      content: { ...base, settings: next },
      report: {
        ...UNCHANGED,
        carried: content.plan.map((plan) => plan.key),
        miniCleared,
        miniRemoved,
      },
    };
  }
  const newGroups: readonly MatchGroup[] = matchGroupsOf(next);
  const size = PLAYERS_PER_GAME[next.format];
  const levelOf = new Map(content.players.map((player) => [player.id, player.level]));
  const carriedKeys = new Set<string>(
    formatChanged
      ? []
      : newGroups
          .filter((group) => content.plan.some((plan) => plan.key === group.key))
          .map((group) => group.key),
  );
  const sources = content.plan.filter((plan) => !carriedKeys.has(plan.key));
  const moved = new Map<string, { game: MatchGame; slot: number; source: number }[]>();
  const archived = new Map<MatchGroupKey, MatchGame[]>();
  let doneTotal = 0;
  let dropped = 0;
  sources.forEach((plan, source) => {
    plan.games.forEach((game, index) => {
      if (!game.done) {
        dropped += 1;
        return;
      }
      doneTotal += 1;
      const target =
        game.players.length === size
          ? newGroups.find(
              (group) =>
                !carriedKeys.has(group.key) &&
                game.players.every((id) => {
                  const level = levelOf.get(id);
                  return level !== null && level !== undefined && group.levels.includes(level);
                }),
            )
          : undefined;
      if (target) {
        const list = moved.get(target.key) ?? [];
        // 並べる順は時刻の順（行の番号から、その組の行の数の差を引いたもの）
        list.push({ game, slot: index - (plan.offset ?? 0), source });
        moved.set(target.key, list);
      } else {
        archived.set(plan.key, [...(archived.get(plan.key) ?? []), game]);
      }
    });
  });

  const newSets = new Set(newGroups.map((group) => groupSetOf(group.key)));
  const plan: MatchGroupPlan[] = [];
  let movedCount = 0;
  for (const group of newGroups) {
    if (carriedKeys.has(group.key)) {
      const kept = content.plan.find((entry) => entry.key === group.key);
      if (kept) plan.push(kept);
      continue;
    }
    // 前の組の試合の番号の順に交互に並べる（同じ番号なら前の組の並びの順）
    const entries = (moved.get(group.key) ?? []).sort(
      (a, b) => a.slot - b.slot || a.source - b.source,
    );
    const overflow = entries.slice(0, Math.max(0, entries.length - PLAN_GAMES_MAX));
    for (const entry of overflow) {
      const key = sources[entry.source]?.key;
      if (key) archived.set(key, [...(archived.get(key) ?? []), entry.game]);
    }
    const games = entries.slice(overflow.length).map((entry) => entry.game);
    movedCount += games.length;
    // 進んだ試合の数：同じ時間に進む組（同じ分け方の組と、なくなる分け方の組〈分け方を入れかえたとき〉）でいちばん進んだもの
    const set = groupSetOf(group.key);
    const elapsed = tableElapsed(
      content.plan.filter(
        (entry) => groupSetOf(entry.key) === set || !newSets.has(groupSetOf(entry.key)),
      ),
    );
    const offset = Math.max(-PLAN_GAMES_MAX, Math.min(PLAN_GAMES_MAX, games.length - elapsed));
    if (games.length > 0 || offset !== 0) {
      plan.push({ key: group.key, games, ...(offset !== 0 ? { offset } : {}) });
    }
  }

  const archive = mergeArchive(content.archive ?? [], archived);
  const nextContent: MatchTableContent = {
    ...base,
    settings: next,
    plan,
    ...(archive.length > 0 ? { archive } : {}),
  };
  return {
    content: nextContent,
    report: {
      regrouped: true,
      formatChanged,
      carried: [...carriedKeys] as MatchGroupKey[],
      doneTotal,
      moved: movedCount,
      archived: [...archived].map(([key, games]) => ({ key, count: games.length })),
      dropped,
      miniCleared,
      miniRemoved,
    },
  };
}

/**
 * 設定を変えたときに何が変わるかの文（確かめの枠に出す。はっきり書く）。
 * @param report 何が変わるか
 * @param replanNow すぐ組み直すか（試合表の画面）。false なら「組み直す」を押してもらう文（名簿と設定の画面）
 * @returns 文の並び（変わらなければ空）
 */
export function describeSettingsChange(report: SettingsChangeReport, replanNow: boolean): string[] {
  const miniLine = report.miniRemoved
    ? "ミニゲームのチーム分けを消します。"
    : report.miniCleared
      ? replanNow
        ? "コート数が変わるので、ミニゲームのチームを分け直します。"
        : "コート数が変わるので、ミニゲームのチーム分けを消します。「組み直す」で分け直します。"
      : undefined;
  if (!report.regrouped) return miniLine ? [miniLine] : [];
  const lines: string[] = miniLine ? [miniLine] : [];
  if (report.carried.length > 0) {
    lines.push(`${report.carried.map(groupLabelOf).join("・")}の試合は、そのまま残します。`);
  }
  if (report.doneTotal > 0) {
    const archivedCount = report.archived.reduce((sum, entry) => sum + entry.count, 0);
    lines.push(
      `終わった試合 ${report.doneTotal}試合のうち、${report.moved}試合は新しい組に移して残します（組の中の試合の番号は変わります）。`,
    );
    if (archivedCount > 0) {
      const reason = report.formatChanged
        ? "試合の形が変わるため"
        : "違う組のレベルの人が一緒に入っているため";
      const where = report.archived
        .map((entry) => `${groupLabelOf(entry.key)} ${entry.count}試合`)
        .join("・");
      lines.push(
        `${archivedCount}試合（${where}）は、${reason}新しい組には入れられません。組から外し、「前の分け方で終わった試合」として残します（試合の数を均すときにも数えます）。`,
      );
    }
  }
  if (report.dropped > 0) {
    lines.push(
      replanNow
        ? `まだの試合 ${report.dropped}試合は、新しい組で組み直します。`
        : `まだの試合 ${report.dropped}試合は外します。変えたあとで「組み直す」を押すと、終わった試合の続きから組みます。`,
    );
  } else if (!replanNow) {
    lines.push("変えたあとで「組み直す」を押してください。");
  } else {
    lines.push("新しい組で組みます。");
  }
  return lines;
}
