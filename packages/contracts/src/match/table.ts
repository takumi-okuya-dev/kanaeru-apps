// 試合表（match）の窓口の入出力の形と、試合表の中身（JSON）の形（API の入力の確かめ・OpenAPI の文書・画面が、同じ形を使う。
// match-002 contracts）。ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。入力の誤りの文は、欄のそばに出せる日本語にする。
// 中身に持つのは呼び名・レベル・当日の印・組み合わせ・進み具合・設定だけ（氏名・メールアドレスは持たない。Constitution II・FR-M1）。
// サーバーは中身を計算し直さず、この形で確かめて持つだけ（AD-28）。日時は時差つきの ISO 8601、試合の日は日本時間の日付。
import { z } from "zod";
import {
  MATCH_FORMATS,
  MATCH_GROUPINGS,
  MATCH_GROUP_KEYS,
  MATCH_LEVELS,
  MATCH_LEVEL_GROUPINGS,
  MINI_COURTS_MAX,
  PLAYER_STATUSES,
  PLAYERS_PER_GAME,
  matchGroupsOf,
  settingsOfGrouping,
} from "./options.ts";

/** 試合表の名前の文字数の上限（DB の CHECK と同じ）。 */
export const TABLE_NAME_MAX = 60;

/** 呼び名の文字数の上限（受付のページと同じ。AD-30）。 */
export const NICKNAME_MAX = 20;

/** 名簿の人数の上限（API の本文の上限 100KB に収まる数）。 */
export const ROSTER_MAX = 150;

/** 1つの組の試合の数の上限。 */
export const GAMES_MAX = 60;

/**
 * 中身の1つの組に持てる試合の行の上限（当日に組を一緒にすると、ほかの組の終わった試合が移ってくるので、試合の数の上限より多い。
 * match-003）。
 */
export const PLAN_GAMES_MAX = GAMES_MAX * 4;

/** 担当の端末の ID の文字数の上限（DB の CHECK と同じ）。 */
export const DEVICE_ID_MAX = 64;

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/** 名簿の人の ID（端末が作る短い英数字）。 */
const PlayerId = z
  .string()
  .regex(/^[a-z0-9]{1,16}$/u, { error: "名簿の人の ID の形が合いません。" });

/** 試合の日（日本時間の日付）。 */
export const PlayDate = z.iso.date({ error: "試合の日を選んでください。" });

/** 名簿の1人（呼び名・レベル・当日の印）。 */
export const MatchPlayer = z.strictObject({
  /** 名簿の人の ID */
  id: PlayerId,
  /** 呼び名（試合表に出る名前） */
  nickname: z
    .string()
    .trim()
    .min(1, { error: "呼び名を入れてください。" })
    .max(NICKNAME_MAX, { error: `呼び名は${NICKNAME_MAX}文字までにしてください。` }),
  /** レベル（フォームにレベルの列がないときは null。名簿で入れるまで試合に入らない。FR-M1） */
  level: z.enum(MATCH_LEVELS, { error: "レベルを選んでください。" }).nullable(),
  /** 当日の印（来る・遅れて来る・来ない） */
  status: z.enum(PLAYER_STATUSES),
  /** 姓と名の間に空白がなく、呼び名を運営に確かめてほしい印（FR-M2） */
  nameCheck: z.boolean().optional(),
  /**
   * 受付の交流会から入れた人の account（LINE でチェックイン・申込みした人だけ。前に入れたレベルを覚えるため。AD-25・match-006）。
   * 見るだけのページ・電波なしで渡す QR には出さない（呼び名だけを出す）
   */
  accountId: z.guid().optional(),
});

/** 名簿の1人の型。 */
export type MatchPlayer = z.infer<typeof MatchPlayer>;

/** 1試合（入る人の ID の並び・終わったか）。 */
export const MatchGame = z.strictObject({
  /** 入る人（ダブルスは4人・シングルスは2人。列の順） */
  players: z.array(PlayerId).min(2).max(4),
  /** 終わったか（担当の端末で行にチェックを付ける。FR-M15） */
  done: z.boolean(),
});

/** 1試合の型。 */
export type MatchGame = z.infer<typeof MatchGame>;

/** 1つの組の試合（組の key と試合の並び）。 */
export const MatchGroupPlan = z.strictObject({
  /** 組の key */
  key: z.enum(MATCH_GROUP_KEYS),
  /** 試合（古い順） */
  games: z.array(MatchGame).max(PLAN_GAMES_MAX),
  /**
   * 試合の行の数の差（当日に分け方・試合の形を変えたときだけ。組の行の数 = 設定から決まる試合の数 + offset。
   * ほかの組から終わった試合が移ってきたら増え、試合の形を変えて終わった試合を組から外したら減る。match-003）
   */
  offset: z.number().int().min(-PLAN_GAMES_MAX).max(PLAN_GAMES_MAX).optional(),
});

/** 1つの組の試合の型。 */
export type MatchGroupPlan = z.infer<typeof MatchGroupPlan>;

/**
 * 前の分け方・試合の形で終わった試合（当日に分け方や試合の形を変えて、今の組に入れられなくなった終わった試合。記録と、
 * これからの試合の数を均すために残す。組の key は、終わったときの組。match-003）。
 */
export const MatchArchivedGroup = z.strictObject({
  /** 終わったときの組の key */
  key: z.enum(MATCH_GROUP_KEYS),
  /** 終わった試合（古い順。ダブルスの4人とシングルスの2人が混ざってよい） */
  games: z.array(MatchGame).max(PLAN_GAMES_MAX),
});

/** 前の分け方・試合の形で終わった試合の型。 */
export type MatchArchivedGroup = z.infer<typeof MatchArchivedGroup>;

/** 前の形の設定（1試合の長さ・試合の時間・分け方1つ。match-008 まで）。読むときに新しい形へ直す（match-009 research R1）。 */
const LegacySettings = z.object({
  format: z.enum(MATCH_FORMATS),
  grouping: z.enum(MATCH_GROUPINGS),
  minutesPerGame: z.number(),
  startTime: z.string(),
  endTime: z.string(),
});

/**
 * 時刻（HH:MM）を分にする（前の形の設定を直すときだけ使う）。
 * @param clock 時刻
 * @returns 0時からの分
 */
function minutesOf(clock: string): number {
  const [hours = 0, minutes = 0] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * 前の形の設定を新しい形に直す（試合の数 = 試合の時間 ÷ 1試合の長さを1〜60に収める・分け方 none は分けない）。
 * 前の形でなければ、そのまま返す。
 * @param value 設定
 * @returns 新しい形の設定（か、そのままの値）
 */
function upgradeSettings(value: unknown): unknown {
  const legacy = LegacySettings.safeParse(value);
  if (!legacy.success || (value as Record<string, unknown>).gameCount !== undefined) return value;
  const { format, grouping, minutesPerGame, startTime, endTime } = legacy.data;
  const span = minutesOf(endTime) - minutesOf(startTime);
  const count = minutesPerGame > 0 ? Math.floor(span / minutesPerGame) : 0;
  return {
    format,
    gameCount: Math.min(GAMES_MAX, Math.max(1, Number.isFinite(count) ? count : 1)),
    ...settingsOfGrouping(grouping),
    courts: null,
  };
}

/**
 * 設定（試合の形・試合の数・分け方〈レベル別・分けない・ミニゲームのコート数〉。match-009）。
 * 分け方は少なくとも1つ。前の形の設定は、読むときに新しい形に直す。
 */
export const MatchSettings = z.preprocess(
  upgradeSettings,
  z
    .strictObject({
      /** 試合の形 */
      format: z.enum(MATCH_FORMATS),
      /** 1つの組の試合の数 */
      gameCount: z
        .number({ error: "試合の数を入れてください。" })
        .int({ error: "試合の数は整数で入れてください。" })
        .min(1, { error: "試合の数は1以上にしてください。" })
        .max(GAMES_MAX, { error: `試合の数は${GAMES_MAX}までにしてください。` }),
      /** レベル別の分け方（null はレベル別をしない） */
      levels: z.enum(MATCH_LEVEL_GROUPINGS).nullable(),
      /** 分けない（全員で1つ）もするか */
      ungrouped: z.boolean(),
      /** ミニゲームのコート数（null はミニゲームをしない） */
      courts: z
        .number({ error: "コート数を入れてください。" })
        .int({ error: "コート数は整数で入れてください。" })
        .min(1, { error: "コート数は1以上にしてください。" })
        .max(MINI_COURTS_MAX, { error: `コート数は${MINI_COURTS_MAX}までにしてください。` })
        .nullable(),
    })
    .refine(
      (settings) => settings.levels !== null || settings.ungrouped || settings.courts !== null,
      { error: "分け方を1つ以上選んでください。", path: ["levels"] },
    ),
);

/** 設定の型。 */
export type MatchSettings = z.infer<typeof MatchSettings>;

/**
 * ミニゲームのチーム分け（チームごとの名簿の人の ID。チームの数 = コート数 × 2。コート1はチーム1と2、コート2は3と4…。
 * チーム分けだけを持ち、チームの中の出る順・対戦の回し方は持たない。match-009）。
 */
export const MatchMini = z.strictObject({
  /** チーム（コートの順に2つずつ） */
  teams: z.array(z.array(PlayerId).min(1).max(ROSTER_MAX)).max(MINI_COURTS_MAX * 2),
});

/** ミニゲームのチーム分けの型。 */
export type MatchMini = z.infer<typeof MatchMini>;

/** 名簿を入れた受付の交流会の名前の文字数の上限（交流会の名前の上限〈100文字〉より大きくとる。入れたときの写しなので）。 */
export const RECEPTION_EVENT_NAME_MAX = 200;

/**
 * 名簿を入れた受付の交流会（入れたときの名前と日時の写し。match-007）。
 * 受付の交流会から名簿を入れたときに担当の端末が書き、別の交流会から入れ直すと置きかわり、フォームの貼り付けで名簿を
 * 置きかえると外れる。交流会があとで消えても・見られなくなっても、写しで「どこから入れたか」を運営の画面に出す。
 * 見るだけのページ・電波なしで渡す QR には出さない（AD-26）。
 */
export const MatchReceptionSource = z.strictObject({
  /** 交流会の ID（サーバーが返す小文字の形だけ。DB の uuid と文字で比べるため） */
  eventId: z.guid().regex(/^[0-9a-f-]+$/u),
  /** 入れたときの交流会の名前 */
  name: z.string().min(1).max(RECEPTION_EVENT_NAME_MAX),
  /** 入れたときの交流会の始まりの日時 */
  startsAt: isoDateTime,
});

/** 名簿を入れた受付の交流会の型。 */
export type MatchReceptionSource = z.infer<typeof MatchReceptionSource>;

/** 試合表の中身（名簿・組み合わせ・進み具合・設定）。 */
export const MatchTableContent = z
  .strictObject({
    /** 設定 */
    settings: MatchSettings,
    /** 名簿 */
    players: z
      .array(MatchPlayer)
      .max(ROSTER_MAX, { error: `名簿は${ROSTER_MAX}人までにしてください。` }),
    /** 組ごとの試合（組んでいなければ空） */
    plan: z.array(MatchGroupPlan).max(MATCH_GROUP_KEYS.length),
    /** 前の分け方・試合の形で終わった試合（組の key ごとに1つ。なければ持たない。match-003） */
    archive: z.array(MatchArchivedGroup).max(MATCH_GROUP_KEYS.length).optional(),
    /** ミニゲームのチーム分け（ミニゲームを選んで組んだときだけ。match-009） */
    mini: MatchMini.optional(),
    /** 名簿を入れた受付の交流会（入れたときの写し。受付の交流会から入れていなければ持たない。match-007） */
    receptionEvent: MatchReceptionSource.optional(),
  })
  .superRefine((content, context) => {
    const ids = new Set<string>();
    for (const [index, player] of content.players.entries()) {
      if (ids.has(player.id)) {
        context.addIssue({
          code: "custom",
          message: "名簿に同じ ID の人が2人います。",
          path: ["players", index, "id"],
        });
      }
      ids.add(player.id);
    }
    const allowed = new Set<string>(matchGroupsOf(content.settings).map((g) => g.key));
    const size = PLAYERS_PER_GAME[content.settings.format];
    const seenGroups = new Set<string>();
    for (const [groupIndex, group] of content.plan.entries()) {
      if (!allowed.has(group.key) || seenGroups.has(group.key)) {
        context.addIssue({
          code: "custom",
          message: "組み合わせの組が、分け方と合いません。",
          path: ["plan", groupIndex, "key"],
        });
      }
      seenGroups.add(group.key);
      for (const [gameIndex, game] of group.games.entries()) {
        const path = ["plan", groupIndex, "games", gameIndex, "players"];
        if (game.players.length !== size || new Set(game.players).size !== game.players.length) {
          context.addIssue({
            code: "custom",
            message: `1試合には別々の${size}人を入れてください。`,
            path,
          });
        }
        if (game.players.some((id) => !ids.has(id))) {
          context.addIssue({
            code: "custom",
            message: "名簿にいない人が試合に入っています。",
            path,
          });
        }
      }
    }
    if (content.mini) {
      const courts = content.settings.courts;
      if (courts === null || content.mini.teams.length !== courts * 2) {
        context.addIssue({
          code: "custom",
          message: "ミニゲームのチームの数が、コート数×2と合いません。",
          path: ["mini", "teams"],
        });
      }
      const seenTeam = new Set<string>();
      for (const [teamIndex, team] of content.mini.teams.entries()) {
        if (
          team.some((id) => !ids.has(id) || seenTeam.has(id)) ||
          new Set(team).size !== team.length
        ) {
          context.addIssue({
            code: "custom",
            message: "ミニゲームのチームには、名簿の人を1つのチームに1回だけ入れてください。",
            path: ["mini", "teams", teamIndex],
          });
        }
        for (const id of team) seenTeam.add(id);
      }
    }
    const seenArchive = new Set<string>();
    for (const [groupIndex, group] of (content.archive ?? []).entries()) {
      if (seenArchive.has(group.key)) {
        context.addIssue({
          code: "custom",
          message: "前の分け方の試合の組が重なっています。",
          path: ["archive", groupIndex, "key"],
        });
      }
      seenArchive.add(group.key);
      for (const [gameIndex, game] of group.games.entries()) {
        const path = ["archive", groupIndex, "games", gameIndex, "players"];
        const sizeOk = game.players.length === 2 || game.players.length === 4;
        if (!game.done || !sizeOk || new Set(game.players).size !== game.players.length) {
          context.addIssue({
            code: "custom",
            message: "前の分け方の試合は、終わった試合（別々の2人か4人）だけにしてください。",
            path,
          });
        }
        if (game.players.some((id) => !ids.has(id))) {
          context.addIssue({
            code: "custom",
            message: "名簿にいない人が試合に入っています。",
            path,
          });
        }
      }
    }
  });

/** 試合表の中身の型。 */
export type MatchTableContent = z.infer<typeof MatchTableContent>;

/** 試合表を作ったときの中身（名簿なし・ダブルス・8試合・レベル別に4つ。match-009）。 */
export const INITIAL_CONTENT: MatchTableContent = {
  settings: {
    format: "doubles",
    gameCount: 8,
    levels: "four",
    ungrouped: false,
    courts: null,
  },
  players: [],
  plan: [],
};

/** 担当の端末の ID。 */
const DeviceId = z.string().min(1).max(DEVICE_ID_MAX);

/** 組織（ID と名前）。 */
export const MatchOrganization = z.object({
  /** 組織の ID */
  id: z.uuid(),
  /** 組織の名前 */
  name: z.string(),
});

/**
 * 名簿を入れた受付の交流会（運営の画面の一覧と題の下に「受付：… から入れた」と出す。match-007）。
 * 名前と日時は、入れたときの写し（中身の receptionEvent）。交流会があとで消えても・見られなくなっても出す。
 */
export const MatchReceptionEventLink = z.object({
  /** 交流会の ID（中身の写しの ID） */
  eventId: z.guid(),
  /** 入れたときの交流会の名前 */
  name: z.string(),
  /** 入れたときの交流会の始まりの日時 */
  startsAt: isoDateTime,
  /**
   * 受付アプリで開けるか（試合表につないだ交流会で、交流会があり、今の利用者がその主催者か受付係で、受付アプリが見えるとき。
   * 消えた・見られない・試合表とつなげなかったときは false で、画面は「交流会は見られません」と出す）
   */
  canOpen: z.boolean(),
});

/** 名簿を入れた受付の交流会の型。 */
export type MatchReceptionEventLink = z.infer<typeof MatchReceptionEventLink>;

/** 試合表の一覧の1行。 */
export const MatchTableSummary = z.object({
  /** 試合表の ID */
  id: z.uuid(),
  /** 名前 */
  name: z.string(),
  /** 試合の日（日本時間の日付） */
  playDate: z.string(),
  /** 入れた組織（なければ null） */
  organization: MatchOrganization.nullable(),
  /** 自分が持ち主か */
  isOwner: z.boolean(),
  /** 名簿を入れた受付の交流会（受付の交流会から入れていなければ null。match-007） */
  receptionEvent: MatchReceptionEventLink.nullable(),
  /** 最後に直した時刻 */
  updatedAt: isoDateTime,
});

/** 試合表の一覧の1行の型。 */
export type MatchTableSummary = z.infer<typeof MatchTableSummary>;

/** 試合表の一覧（試合の日の新しい順）。 */
export const MatchTableList = z.object({ tables: z.array(MatchTableSummary) });

/** 試合表の一覧の型。 */
export type MatchTableList = z.infer<typeof MatchTableList>;

/** 試合表を作る入力。 */
export const MatchTableCreateInput = z.strictObject({
  /** 名前 */
  name: z
    .string()
    .trim()
    .min(1, { error: "試合表の名前を入れてください。" })
    .max(TABLE_NAME_MAX, { error: `名前は${TABLE_NAME_MAX}文字までにしてください。` }),
  /** 試合の日 */
  playDate: PlayDate,
  /** 入れる組織（任意。自分が入っている組織だけ） */
  organizationId: z.uuid({ error: "組織を選び直してください。" }).nullable().optional(),
  /** 作る端末の ID（作った端末が担当の端末になる。AD-28） */
  deviceId: DeviceId,
});

/** 試合表を作る入力の型。 */
export type MatchTableCreateInput = z.infer<typeof MatchTableCreateInput>;

/** 試合表（中身つき）。 */
export const MatchTable = MatchTableSummary.extend({
  /** 中身 */
  content: MatchTableContent,
  /** 版の番号 */
  version: z.number().int(),
  /** くじの種 */
  seed: z.number().int(),
  /** 担当の端末の ID（なければ null） */
  editorDeviceId: z.string().nullable(),
  /** 見るだけ・受付の札の状態（札そのものは返さない。期限を過ぎていれば null。match-004） */
  links: z.object({
    /** 見るだけの札の期限 */
    viewExpiresAt: isoDateTime.nullable(),
    /** 受付の札の期限 */
    joinExpiresAt: isoDateTime.nullable(),
    /** 受付を締めた時刻 */
    joinClosedAt: isoDateTime.nullable(),
    /** 見るだけの札の SHA-256 の頭8文字（端末に置いた札が今の札かを見分ける。期限を過ぎていれば null） */
    viewHint: z.string().nullable(),
    /** 受付の札の SHA-256 の頭8文字 */
    joinHint: z.string().nullable(),
  }),
});

/** 試合表の型。 */
export type MatchTable = z.infer<typeof MatchTable>;

/** 試合表を直す入力（担当の端末だけ。AD-28）。 */
export const MatchTableUpdateInput = z.strictObject({
  /** 送る端末の ID */
  deviceId: DeviceId,
  /** もとにした版の番号 */
  baseVersion: z.number().int().min(1),
  /** 変更の ID（端末が作る乱数。同じ ID の送り直しは二重にしない） */
  changeId: z.uuid(),
  /** くじの種 */
  seed: z.number().int().min(-2147483648).max(2147483647),
  /** 直した中身 */
  content: MatchTableContent,
});

/** 試合表を直す入力の型。 */
export type MatchTableUpdateInput = z.infer<typeof MatchTableUpdateInput>;

/** 担当の端末を受け取る入力。 */
export const MatchEditorInput = z.strictObject({
  /** 受け取る端末の ID */
  deviceId: DeviceId,
});

/** 担当の端末を受け取る入力の型。 */
export type MatchEditorInput = z.infer<typeof MatchEditorInput>;

/** 試合表を入れられる組織（自分が入っている組織）。 */
export const MatchOrganizationOptions = z.object({ organizations: z.array(MatchOrganization) });

/** 試合表を入れられる組織の型。 */
export type MatchOrganizationOptions = z.infer<typeof MatchOrganizationOptions>;
