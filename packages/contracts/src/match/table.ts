// 試合表（match）の窓口の入出力の形と、試合表の中身（JSON）の形（API の入力の確かめ・OpenAPI の文書・画面が、同じ形を使う。
// match-002 contracts）。ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。入力の誤りの文は、欄のそばに出せる日本語にする。
// 中身に持つのは呼び名・レベル・当日の印・組み合わせ・進み具合・設定だけ（氏名・メールアドレスは持たない。Constitution II・FR-M1）。
// サーバーは中身を計算し直さず、この形で確かめて持つだけ（AD-28）。日時は時差つきの ISO 8601、試合の日は日本時間の日付。
import { z } from "zod";
import {
  MATCH_FORMATS,
  MATCH_GROUPINGS,
  MATCH_GROUPS,
  MATCH_GROUP_KEYS,
  MATCH_LEVELS,
  PLAYER_STATUSES,
  PLAYERS_PER_GAME,
} from "./options.ts";

/** 試合表の名前の文字数の上限（DB の CHECK と同じ）。 */
export const TABLE_NAME_MAX = 60;

/** 呼び名の文字数の上限（受付のページと同じ。AD-30）。 */
export const NICKNAME_MAX = 20;

/** 名簿の人数の上限（API の本文の上限 100KB に収まる数）。 */
export const ROSTER_MAX = 150;

/** 1つの組の試合の数の上限。 */
export const GAMES_MAX = 60;

/** 1試合の長さの下限と上限（分）。 */
export const MINUTES_PER_GAME_MIN = 5;

/** 1試合の長さの上限（分）。 */
export const MINUTES_PER_GAME_MAX = 90;

/** 担当の端末の ID の文字数の上限（DB の CHECK と同じ）。 */
export const DEVICE_ID_MAX = 64;

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/** 時刻（HH:MM。24時間）。 */
const clock = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u, { error: "時刻は 12:30 の形で入れてください。" });

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
  games: z.array(MatchGame).max(GAMES_MAX),
});

/** 1つの組の試合の型。 */
export type MatchGroupPlan = z.infer<typeof MatchGroupPlan>;

/** 設定（試合の形・レベルの分け方・1試合の長さ・試合の時間）。 */
export const MatchSettings = z
  .strictObject({
    /** 試合の形 */
    format: z.enum(MATCH_FORMATS),
    /** レベルの分け方 */
    grouping: z.enum(MATCH_GROUPINGS),
    /** 1試合の長さ（分） */
    minutesPerGame: z
      .number()
      .int({ error: "1試合の長さは分の整数で入れてください。" })
      .min(MINUTES_PER_GAME_MIN, { error: `1試合は${MINUTES_PER_GAME_MIN}分以上にしてください。` })
      .max(MINUTES_PER_GAME_MAX, { error: `1試合は${MINUTES_PER_GAME_MAX}分までにしてください。` }),
    /** 試合の始まり（HH:MM） */
    startTime: clock,
    /** 試合の終わり（HH:MM） */
    endTime: clock,
  })
  .refine((settings) => settings.startTime < settings.endTime, {
    error: "試合の終わりは、始まりより後にしてください。",
    path: ["endTime"],
  });

/** 設定の型。 */
export type MatchSettings = z.infer<typeof MatchSettings>;

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
    const allowed = new Set<string>(MATCH_GROUPS[content.settings.grouping].map((g) => g.key));
    const size = PLAYERS_PER_GAME[content.settings.format];
    const seenGroups = new Set<string>();
    for (const [groupIndex, group] of content.plan.entries()) {
      if (!allowed.has(group.key) || seenGroups.has(group.key)) {
        context.addIssue({
          code: "custom",
          message: "組み合わせの組が、レベルの分け方と合いません。",
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
  });

/** 試合表の中身の型。 */
export type MatchTableContent = z.infer<typeof MatchTableContent>;

/** 試合表を作ったときの中身（名簿なし・ダブルス・4つに分ける・1試合15分・12:30〜14:30）。 */
export const INITIAL_CONTENT: MatchTableContent = {
  settings: {
    format: "doubles",
    grouping: "four",
    minutesPerGame: 15,
    startTime: "12:30",
    endTime: "14:30",
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
