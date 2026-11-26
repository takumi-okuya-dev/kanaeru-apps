// 名簿を直す（状態を持たない関数だけ）：読んだ人を名簿に入れる・1人足す・1人を直す・消す・数える。
// 氏名は名簿の中身に入れない（呼び名とレベルと当日の印だけ。Constitution II）。氏名は、貼った画面を開いている間だけ
// ID と結んで見せる（呼び出す側が持つ）。
import { MATCH_LEVELS, ROSTER_MAX } from "@workspace/contracts/match";
import type {
  MatchLevel,
  MatchPlayer,
  MatchReceptionSource,
  MatchTableContent,
} from "@workspace/contracts/match";
import type { NamedPerson } from "./roster-read.ts";

/**
 * 名簿の人の新しい ID（英小文字と数字の8文字。名簿の中で重ねない）。
 * @param taken 名簿にある ID
 * @returns ID
 */
export function newPlayerId(taken: ReadonlySet<string>): string {
  for (;;) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const id = [...bytes].map((byte) => "abcdefghijklmnopqrstuvwxyz0123456789"[byte % 36]).join("");
    if (!taken.has(id)) return id;
  }
}

/** 読んだ人の入れ方（置きかえる・足す）。 */
export type ImportMode = "replace" | "append";

/** 名簿に入れた結果。 */
export type ImportResult = {
  /** 新しい中身 */
  content: MatchTableContent;
  /** 入れた人の ID と氏名（画面を開いている間だけ見せる） */
  fullNames: Map<string, string>;
};

/**
 * 読んだ人を名簿に入れる（置きかえるときは今の名簿と組み合わせを消す。人数の上限を超える人は入れない）。
 * 名簿を入れた受付の交流会（中身の receptionEvent。match-007）は、受付の交流会から入れたら（置きかえても足しても）その交流会に
 * 置きかえ、フォームの貼り付け・CSV で置きかえたら外し、貼り付けで足しただけなら残す【仮決め】。
 * @param content 今の中身
 * @param people 呼び名を作った人
 * @param mode 入れ方
 * @param from 受付の交流会から入れたときの、その交流会（名前と日時の写し）
 * @returns 新しい中身と、入れた人の氏名
 */
export function importPeople(
  content: MatchTableContent,
  people: readonly NamedPerson[],
  mode: ImportMode,
  from?: MatchReceptionSource,
): ImportResult {
  const base = mode === "replace" ? [] : content.players;
  const taken = new Set(base.map((player) => player.id));
  const fullNames = new Map<string, string>();
  const added: MatchPlayer[] = [];
  for (const person of people.slice(0, Math.max(0, ROSTER_MAX - base.length))) {
    const id = newPlayerId(taken);
    taken.add(id);
    fullNames.set(id, person.fullName);
    added.push({
      id,
      nickname: person.nickname,
      level: person.level,
      status: "present",
      ...(person.nameCheck ? { nameCheck: true } : {}),
      ...(person.accountId ? { accountId: person.accountId } : {}),
    });
  }
  const { receptionEvent: before, mini, ...rest } = content;
  const receptionEvent = from ?? (mode === "replace" ? undefined : before);
  return {
    content: {
      ...rest,
      players: [...base, ...added],
      plan: mode === "replace" ? [] : content.plan,
      // 置きかえたら、ミニゲームのチーム分けも外す（前の名簿の人で分けたものなので。match-009）
      ...(mini && mode !== "replace" ? { mini } : {}),
      ...(receptionEvent ? { receptionEvent } : {}),
    },
    fullNames,
  };
}

/**
 * 1人を直す（呼び名を直したら、確かめの印を外す）。
 * @param content 今の中身
 * @param id 名簿の人の ID
 * @param patch 直す欄
 * @returns 新しい中身
 */
export function updatePlayer(
  content: MatchTableContent,
  id: string,
  patch: Partial<Pick<MatchPlayer, "nickname" | "level" | "status">>,
): MatchTableContent {
  return {
    ...content,
    players: content.players.map((player) => {
      if (player.id !== id) return player;
      const next: MatchPlayer = { ...player, ...patch };
      if (patch.nickname !== undefined) delete next.nameCheck;
      return next;
    }),
  };
}

/**
 * 1人を消す（その人の入った、まだの試合も組み合わせから消す。終わった試合は残す）。
 * 消した人の入った終わった試合（前の分け方で終わった試合も）があるときは、名簿から消さずに「来ない」にする
 * （終わった試合の名前が消えないように）。ミニゲームのチームからも外し、チームが空になるならチーム分けを外す。
 * @param content 今の中身
 * @param id 名簿の人の ID
 * @returns 新しい中身
 */
export function removePlayer(content: MatchTableContent, id: string): MatchTableContent {
  const inDone =
    content.plan.some((plan) =>
      plan.games.some((game) => game.done && game.players.includes(id)),
    ) ||
    (content.archive ?? []).some((entry) => entry.games.some((game) => game.players.includes(id)));
  if (inDone) return updatePlayer(content, id, { status: "absent" });
  const { mini, ...rest } = content;
  // ミニゲームのチームからも外す。チームが空になるならチーム分けを外す（組み直すときに分け直す。match-009）
  const teams = mini?.teams.map((team) => team.filter((member) => member !== id));
  const keepMini = teams !== undefined && teams.every((team) => team.length > 0);
  return {
    ...rest,
    players: content.players.filter((player) => player.id !== id),
    plan: content.plan.map((plan) => ({
      ...plan,
      games: plan.games.filter((game) => !game.players.includes(id)),
    })),
    ...(keepMini ? { mini: { teams } } : {}),
  };
}

/**
 * 1人足す（手で入れる。FR-M3）。
 * @param content 今の中身
 * @param input 呼び名とレベル
 * @param input.nickname 呼び名
 * @param input.level レベル
 * @returns 新しい中身
 */
export function addPlayer(
  content: MatchTableContent,
  input: { nickname: string; level: MatchLevel },
): MatchTableContent {
  const id = newPlayerId(new Set(content.players.map((player) => player.id)));
  return {
    ...content,
    players: [
      ...content.players,
      { id, nickname: input.nickname.trim(), level: input.level, status: "present" },
    ],
  };
}

/** 名簿の数（画面の「22人（上級 5・中級 8・初級 5・入門 4）」と、確かめる所）。 */
export type RosterCounts = {
  /** 来る人の数 */
  present: number;
  /** レベルごとの、来る人の数 */
  byLevel: Record<MatchLevel, number>;
  /** 遅れて来る人の数 */
  late: number;
  /** 来ない人の数 */
  absent: number;
  /** 帰った人の数 */
  left: number;
  /** 確かめる所（呼び名の印・レベルがない人） */
  checks: number;
};

/**
 * 名簿を数える。
 * @param players 名簿
 * @returns 数
 */
export function countRoster(players: readonly MatchPlayer[]): RosterCounts {
  const byLevel = Object.fromEntries(MATCH_LEVELS.map((level) => [level, 0])) as Record<
    MatchLevel,
    number
  >;
  let present = 0;
  let late = 0;
  let absent = 0;
  let left = 0;
  let checks = 0;
  for (const player of players) {
    if (player.nameCheck || player.level === null) checks += 1;
    if (player.status === "late") late += 1;
    else if (player.status === "absent") absent += 1;
    else if (player.status === "left") left += 1;
    else {
      present += 1;
      if (player.level) byLevel[player.level] += 1;
    }
  }
  return { present, byLevel, late, absent, left, checks };
}
