// 当日の「人を選んで直す」（PRD FR-M14。モックアップ M2。match-003）。状態を持たない関数だけ。
// 人に「来なかった・来た・帰る」を付けると、当日の印を直し、その人の組だけを組み直す（plan.ts の replanGroup）。
// - 終わった試合（チェックの付いた試合）は決して変えない。今の試合（チェックのない最初の試合）も、入る人がみな出られるなら残す
// - それまでの試合の数は引き継いで均す（来た人は今の周に入り、来るまでの試合は数えない。帰った人はこれからの試合に入らない）
// - ほかの組の試合は変えない
import { PLAYERS_PER_GAME } from "@workspace/contracts/match";
import type { MatchGroup, MatchTableContent, PlayerStatus } from "@workspace/contracts/match";
import { groupsOf, presentPlayersOf, replanGroup } from "./plan.ts";
import { updatePlayer } from "./roster-edit.ts";

/** 当日の直し方（来なかった・来た・帰る）。 */
export const ATTENDANCE_ACTIONS = ["absent", "arrived", "left"] as const;

/** 当日の直し方。 */
export type AttendanceAction = (typeof ATTENDANCE_ACTIONS)[number];

/** 当日の直し方の画面の言葉（ボタン）。 */
export const ATTENDANCE_ACTION_LABELS = {
  absent: "来なかった",
  arrived: "来た",
  left: "帰る",
} as const satisfies Record<AttendanceAction, string>;

/** 直し方ごとの、直したあとの当日の印。 */
const STATUS_AFTER = {
  absent: "absent",
  arrived: "present",
  left: "left",
} as const satisfies Record<AttendanceAction, PlayerStatus>;

/**
 * 今の当日の印から選べる直し方（来る人は「来なかった」「帰る」、まだ来ていない・来なかった・帰った人は「来た」。
 * 遅れて来る人は「来なかった」も選べる）。
 * @param status 今の当日の印
 * @returns 選べる直し方
 */
export function actionsFor(status: PlayerStatus): AttendanceAction[] {
  switch (status) {
    case "present":
      return ["absent", "left"];
    case "late":
      return ["arrived", "absent"];
    default:
      return ["arrived"];
  }
}

/**
 * 人の組（今のレベルの分け方で、その人のレベルが入る組）。
 * @param content 試合表の中身
 * @param playerId 名簿の人の ID
 * @returns 組（レベルがなければ undefined）
 */
export function groupOfPlayer(
  content: MatchTableContent,
  playerId: string,
): MatchGroup | undefined {
  const level = content.players.find((player) => player.id === playerId)?.level;
  if (!level) return undefined;
  return groupsOf(content).find((group) => group.levels.includes(level));
}

/** 人を直した結果（画面の「組み直しました」の文に使う）。 */
export type AttendanceReport = {
  /** 呼び名 */
  nickname: string;
  /** 直し方 */
  action: AttendanceAction;
  /** 組の言葉（レベルがなければ undefined） */
  groupLabel?: string;
  /** 組み直した最初の試合の番号（1から。組み合わせがないときは undefined） */
  fromGame?: number;
  /** 組み直したあと、この先の試合が組めない（1試合の人数に足りない） */
  short: boolean;
};

/**
 * 人に「来なかった・来た・帰る」を付け、その人の組のこれからの試合だけを組み直す。
 * @param content 今の中身
 * @param seed くじの種（同じ名簿・同じ種なら同じ表）
 * @param playerId 名簿の人の ID
 * @param action 直し方
 * @returns 新しい中身と、何をしたか（名簿にいない人なら undefined）
 */
export function markAttendance(
  content: MatchTableContent,
  seed: number,
  playerId: string,
  action: AttendanceAction,
): { content: MatchTableContent; report: AttendanceReport } | undefined {
  const player = content.players.find((entry) => entry.id === playerId);
  if (!player) return undefined;
  const marked = updatePlayer(content, playerId, { status: STATUS_AFTER[action] });
  const group = groupOfPlayer(marked, playerId);
  const report: AttendanceReport = { nickname: player.nickname, action, short: false };
  if (!group) return { content: marked, report };
  report.groupLabel = group.label;
  // まだ組んでいない試合表（どの組も試合がない）は、当日の印だけを直す（「試合表を作る」で組む）
  if (!marked.plan.some((plan) => plan.games.length > 0)) return { content: marked, report };
  const { plan, kept } = replanGroup(marked, seed, group.key);
  const replanned = { ...marked, plan };
  const after = plan.find((entry) => entry.key === group.key);
  report.fromGame = kept + 1;
  // 組み直したあと、この先の試合がなく、組める人が1試合の人数に足りない
  report.short =
    (after?.games.length ?? 0) <= kept &&
    presentPlayersOf(replanned, group).length < PLAYERS_PER_GAME[replanned.settings.format];
  return { content: replanned, report };
}

/**
 * 人を直した結果の文（例：「組み直しました。斎藤：来た（初級の第4試合から）」。組み直さなかったときは「直しました。…」）。
 * @param report 人を直した結果
 * @returns 文
 */
export function describeAttendance(report: AttendanceReport): string {
  const who = `${report.nickname}：${ATTENDANCE_ACTION_LABELS[report.action]}`;
  if (!report.groupLabel) return `直しました。${who}（レベルがないので、試合には入りません）`;
  if (report.fromGame === undefined) {
    return `直しました。${who}（まだ試合表を作っていないので、当日の印だけを直しました）`;
  }
  if (report.short) {
    return `組み直しました。${who}（${report.groupLabel}は人が足りないため、第${report.fromGame}試合から先を組めません。一緒にする分け方にしてください）`;
  }
  return `組み直しました。${who}（${report.groupLabel}の第${report.fromGame}試合から）`;
}
