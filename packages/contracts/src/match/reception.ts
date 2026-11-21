// 受付の交流会から名簿を入れる（PRD FR-M4・見本の M0。match-006）の窓口の答えの形。ふつうの zod で書く。
// 名前（チェックインと申込みの名前。LINE の表示名のことがある）は運営の画面で呼び名を作るためだけに返し、試合表には
// 呼び名とレベル（と account のある人の account）だけを持つ（Constitution II・AD-25）。
import { z } from "zod";
import { MATCH_LEVELS } from "./options.ts";

/** 受付の交流会から入れる1人。 */
export const MatchReceptionPerson = z.object({
  /** 名前（チェックイン・申込みのときの名前。呼び名を作るためだけ。試合表には持たない） */
  name: z.string(),
  /** LINE でチェックイン・申込みした人の account（手で入れた人は null） */
  accountId: z.guid().nullable(),
  /** 前にこの運営（試合表を入れた組織か持ち主）の試合表で入れたレベル（覚えていなければ null） */
  level: z.enum(MATCH_LEVELS).nullable(),
});

/** 受付の交流会から入れる1人の型。 */
export type MatchReceptionPerson = z.infer<typeof MatchReceptionPerson>;

/** 受付の交流会から入れられる人（チェックインした人と、確定した申込みの名簿）。 */
export const MatchReceptionRoster = z.object({
  /** 交流会 */
  event: z.object({
    /** 交流会の ID */
    id: z.guid(),
    /** 名前 */
    name: z.string(),
    /** 始まりの日時 */
    startsAt: z.iso.datetime({ offset: true }),
  }),
  /** チェックインした人（古い順） */
  checkins: z.array(MatchReceptionPerson),
  /** 確定した申込みの名簿（申し込んだ順。予約を使わない交流会は空） */
  applicants: z.array(MatchReceptionPerson),
});

/** 受付の交流会から入れられる人の型。 */
export type MatchReceptionRoster = z.infer<typeof MatchReceptionRoster>;
