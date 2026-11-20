// 予約（booking）の窓口の入出力の形（API の入力の確かめ・OpenAPI の文書・画面の入力の確かめが、同じ形を使う。booking-001 contracts）。
// ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。入力の誤りの文は、欄のそばにそのまま出せる日本語にする。
// 日時は時差つきの ISO 8601 だけ。媒体は受付の申し込みの媒体（AD-23）、名前の上限は受付のチェックインの名前と同じ。
// 参加者のメールアドレスは返さない（メールで申し込んだ人の連絡のメールも名簿に出さない。FR-B26・booking-003 R14）。
import { z } from "zod";
import { ApplicationSourceSchema, CHECKIN_METHODS, CHECKIN_NAME_MAX } from "../reception/index.ts";
import {
  ATTENDANCES,
  BOOKING_MODES,
  ENTRY_KINDS,
  ENTRY_STATUSES,
  SETTABLE_ENTRY_STATUSES,
  VISIBILITIES,
} from "./options.ts";
import { QuotaView, ScheduleChange, SeatSummary } from "./waitlist.ts";

/** メモの文字数の上限。 */
export const ENTRY_MEMO_MAX = 200;

/** 1回の取り込みの行の数の上限（画面も同じ数で止める。API の本文の上限 100KB に収まる数。research R5）。 */
export const ROSTER_IMPORT_ROWS_MAX = 500;

/** CSV の見出しの列の数の上限。 */
export const IMPORT_HEADERS_MAX = 50;

/** CSV の見出し1つの文字数の上限。 */
export const IMPORT_HEADER_MAX = 100;

/** 画面で読む CSV のファイルの大きさの上限（バイト。research R5）。 */
export const ROSTER_IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/** 使い方の形（選べるものだけ）。 */
export const BookingModeSchema = z.enum(BOOKING_MODES, { error: "使い方を選んでください。" });

/** 使い方を変える入力。 */
export const BookingSettingInput = z.strictObject({ mode: BookingModeSchema });

/** 使い方を変える入力の型。 */
export type BookingSettingInput = z.infer<typeof BookingSettingInput>;

/** 交流会の使い方（行がなければ受付だけ）。 */
export const BookingSetting = z.object({
  /** 使い方 */
  mode: BookingModeSchema,
  /** 名簿の行の数（受付だけに戻すときの確かめに使う。隠れている行も数える） */
  entryCount: z.number().int(),
  /** 申込みページの受付を開いているか（自前のとき。booking-003） */
  accepting: z.boolean(),
  /** 申込みページの見せる範囲（booking-003） */
  visibility: z.enum(VISIBILITIES),
  /** 交流会の始まりを過ぎたか（過ぎたら受付は閉じたものとして扱う） */
  started: z.boolean(),
  /** 交流会を組織に入れているか（部員だけを選べるか） */
  inOrganization: z.boolean(),
  /** 定員（空＝定員なし。booking-004） */
  capacity: z.number().int().nullable(),
  /** 媒体の枠 */
  quotas: z.array(QuotaView),
  /** 席の内訳（定員があるとき） */
  seats: SeatSummary.nullable(),
  /** 予約を中止したか */
  cancelled: z.boolean(),
  /** 日時や場所の変更（自前で、最後に知らせたものと今が違うとき） */
  change: ScheduleChange.nullable(),
});

/** 交流会の使い方の型。 */
export type BookingSetting = z.infer<typeof BookingSetting>;

/** 名簿の名前の形（チェックインの名前と同じ。前後の空白を消す）。 */
const EntryName = z
  .string({ error: "名前を入れてください。" })
  .trim()
  .min(1, { error: "名前を入れてください。" })
  .max(CHECKIN_NAME_MAX, { error: `名前は${CHECKIN_NAME_MAX}文字までにしてください。` });

/** 名簿に1人足す入力（主催者・受付係）。 */
export const RosterEntryInput = z.strictObject({
  name: EntryName,
  applicationSource: ApplicationSourceSchema,
  memo: z
    .string({ error: "メモは文字で入れてください。" })
    .trim()
    .max(ENTRY_MEMO_MAX, { error: `メモは${ENTRY_MEMO_MAX}文字までにしてください。` })
    .nullable()
    .optional(),
  /** キャンセル待ちに入れるか（自前で定員があるとき。既定は確定〈定員を超えて足す〉。booking-004 research R4） */
  waitlist: z.boolean({ error: "キャンセル待ちに入れるかを選んでください。" }).optional(),
});

/** 名簿に1人足す入力の型。 */
export type RosterEntryInput = z.infer<typeof RosterEntryInput>;

/** 行の状態を変える入力（取り消す・戻す）。 */
export const RosterStatusInput = z.strictObject({
  status: z.enum(SETTABLE_ENTRY_STATUSES, { error: "状態を選んでください。" }),
});

/** 行の状態を変える入力の型。 */
export type RosterStatusInput = z.infer<typeof RosterStatusInput>;

/** 同じ名前の2つの行をまとめる入力（research R7）。 */
export const RosterMergeInput = z.strictObject({
  keepEntryId: z.guid({ error: "残す行を選んでください。" }),
  removeEntryId: z.guid({ error: "まとめる行を選んでください。" }),
});

/** まとめる入力の型。 */
export type RosterMergeInput = z.infer<typeof RosterMergeInput>;

/** 名簿の行の来たか。 */
export const AttendanceSchema = z.enum(ATTENDANCES);

/** 名簿の行（主催者・受付係が読む形）。 */
export const RosterEntry = z.object({
  /** 行の ID */
  id: z.guid(),
  /** 名前 */
  name: z.string(),
  /** 媒体 */
  applicationSource: ApplicationSourceSchema,
  /** 入口 */
  entryKind: z.enum(ENTRY_KINDS),
  /** 状態 */
  status: z.enum(ENTRY_STATUSES),
  /** 申し込んだ日時 */
  appliedAt: isoDateTime,
  /** 手で足した・飛び入りの入れた人の表示名（取り込み・入れた人のアカウントが消えたときは null） */
  enteredByName: z.string().nullable(),
  /** メモ */
  memo: z.string().nullable(),
  /** 取り消しでない行に、そろえた名前が同じ行がほかにもあるか（research R7） */
  sameName: z.boolean(),
  /** 来たか（来なかったは交流会の日が終わってから。research R8） */
  attendance: AttendanceSchema,
  /** どう当たったか（手・同じアカウントで自動。当たっていなければ null） */
  match: z.enum(["manual", "auto"]).nullable(),
  /** キャンセル待ちの何番目か（booking-004） */
  waitlistPosition: z.number().int().nullable(),
  /** 待っている打診（打診中のとき。期限・期限が過ぎたか・手で打診したか） */
  offer: z.object({ deadline: isoDateTime, expired: z.boolean(), manual: z.boolean() }).nullable(),
});

/** 名簿の行の型。 */
export type RosterEntry = z.infer<typeof RosterEntry>;

/** 名簿（行と人数）。 */
export const Roster = z.object({
  /** 行（申し込んだ日時の古い順） */
  entries: z.array(RosterEntry),
  /** 人数 */
  counts: z.object({
    /** 確定 */
    confirmed: z.number().int(),
    /** 取り消し */
    cancelled: z.number().int(),
    /** キャンセル待ち（booking-004） */
    waitlisted: z.number().int(),
    /** 打診中（booking-004） */
    offered: z.number().int(),
    /** 来た（当たった行） */
    came: z.number().int(),
    /** 来なかった（交流会の日が終わってから） */
    noShow: z.number().int(),
    /** 飛び入り（入口が飛び入りの行） */
    walkIn: z.number().int(),
    /** 媒体ごとの確定の人数（受付の媒体の並び） */
    bySource: z.array(
      z.object({ applicationSource: ApplicationSourceSchema, count: z.number().int() }),
    ),
  }),
  /** 交流会の日（日本時間）が終わったか */
  eventEnded: z.boolean(),
});

/** 名簿の型。 */
export type Roster = z.infer<typeof Roster>;

/** 取り込みの入力（ファイルは送らない。画面が選んだ列の名前だけを送る。research R5）。 */
export const RosterImportInput = z.strictObject({
  applicationSource: ApplicationSourceSchema,
  rows: z
    .array(
      z.strictObject({
        /** ファイルの中の行の番号（見積もりの表に出す） */
        line: z.number().int().min(1),
        /** 名前（空でもよい。空なら「名前が空」） */
        name: z
          .string()
          .trim()
          .max(CHECKIN_NAME_MAX, { error: `名前は${CHECKIN_NAME_MAX}文字までにしてください。` }),
      }),
      { error: "取り込む行を送ってください。" },
    )
    .min(1, { error: "取り込む行がありません。" })
    .max(ROSTER_IMPORT_ROWS_MAX, {
      error: `一度に取り込めるのは${ROSTER_IMPORT_ROWS_MAX}行までです。ファイルを分けてください。`,
    }),
  /** CSV のときだけ：見出しと選んだ名前の列（持ち主ごとに覚える。research R6） */
  mapping: z
    .strictObject({
      headers: z
        .array(z.string().max(IMPORT_HEADER_MAX))
        .min(1)
        .max(IMPORT_HEADERS_MAX, {
          error: `CSV の列は${IMPORT_HEADERS_MAX}列までにしてください。`,
        }),
      nameColumn: z.string().min(1).max(IMPORT_HEADER_MAX),
    })
    .refine((value) => value.headers.includes(value.nameColumn), {
      error: "名前の列が、見出しの中にありません。",
      path: ["nameColumn"],
    })
    .optional(),
});

/** 取り込みの入力の型。 */
export type RosterImportInput = z.infer<typeof RosterImportInput>;

/** 取り込みの行の結果（入る・すでにある・名前が空）。 */
export const IMPORT_OUTCOMES = ["insert", "existing", "empty"] as const;

/** 取り込みの行の結果。 */
export type ImportOutcome = (typeof IMPORT_OUTCOMES)[number];

/** 取り込みの人数。 */
const ImportCounts = z.object({
  /** 入る（入った） */
  insert: z.number().int(),
  /** すでにある */
  existing: z.number().int(),
  /** 名前が空 */
  empty: z.number().int(),
});

/** 取り込む前の見積もり。 */
export const RosterImportPreview = z.object({
  rows: z.array(
    z.object({
      line: z.number().int(),
      name: z.string(),
      outcome: z.enum(IMPORT_OUTCOMES),
      /** 名簿（か、この取り込みのほかの行）に、そろえた名前が同じ行があるか */
      sameName: z.boolean(),
    }),
  ),
  counts: ImportCounts,
});

/** 見積もりの型。 */
export type RosterImportPreview = z.infer<typeof RosterImportPreview>;

/** 取り込んだ結果。 */
export const RosterImportResult = z.object({ counts: ImportCounts });

/** 取り込んだ結果の型。 */
export type RosterImportResult = z.infer<typeof RosterImportResult>;

/** 持ち主の CSV の列の対応。 */
export const ImportMappingList = z.object({
  mappings: z.array(
    z.object({
      headers: z.array(z.string()),
      nameColumn: z.string(),
      applicationSource: ApplicationSourceSchema,
    }),
  ),
});

/** 列の対応の型。 */
export type ImportMappingList = z.infer<typeof ImportMappingList>;

/** チェックインと名簿の当ての状態（research R8）。 */
export const MATCH_STATES = [
  "candidate",
  "unmatched",
  "matched_auto",
  "matched_manual",
  "walk_in",
] as const;

/** 当ての状態。 */
export type MatchState = (typeof MATCH_STATES)[number];

/** 名簿の行の短い形（受付係の画面）。 */
const EntryBrief = z.object({
  id: z.guid(),
  name: z.string(),
  applicationSource: ApplicationSourceSchema,
});

/** 受付係の「名簿に当てる」の画面（S1）。 */
export const MatchBoard = z.object({
  /** チェックイン（新しい順） */
  checkins: z.array(
    z.object({
      checkinId: z.guid(),
      /** チェックインの名前（写し） */
      name: z.string(),
      method: z.enum(CHECKIN_METHODS),
      checkedInAt: isoDateTime,
      state: z.enum(MATCH_STATES),
      /** 当たった行か候補（名簿にいない・飛び入りでない当たっていないときは null） */
      entry: EntryBrief.nullable(),
    }),
  ),
  /** 名簿から選べる行（確定・当たっていない。名前の順） */
  choices: z.array(EntryBrief),
  /** 人数 */
  counts: z.object({
    /** 来た（当たった確定の行） */
    came: z.number().int(),
    /** 確定 */
    confirmed: z.number().int(),
    /** 飛び入り */
    walkIn: z.number().int(),
    /** 当てを待つチェックイン（候補・名簿にいない） */
    pending: z.number().int(),
  }),
});

/** 受付係の画面の型。 */
export type MatchBoard = z.infer<typeof MatchBoard>;

/** 当てる・ちがう人の入力。 */
export const MatchInput = z.strictObject({
  entryId: z.guid({ error: "名簿の行を選んでください。" }),
});

/** 当てる・ちがう人の入力の型。 */
export type MatchInput = z.infer<typeof MatchInput>;
