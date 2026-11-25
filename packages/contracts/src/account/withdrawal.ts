// 退会の確かめの中身（AD-22。PRD 組織 FR-O54）。各領域が自分の index.ts から出す「退会の確かめの中身」を、
// account の窓口が退会の手順と同じ順（共通 → アプリ → account）に集めて返す。account はほかの領域を知らない。
import { z } from "zod";

/** 確かめの中身の種類（組織の引き継ぎ・消す、引き継がれる記録、消える記録）。 */
export const WITHDRAWAL_ITEM_KINDS = ["organization", "handover", "delete"] as const;

/** 確かめの中身の1行（文は各領域が日本語で作る）。 */
export const WithdrawalItem = z.object({
  kind: z.enum(WITHDRAWAL_ITEM_KINDS),
  /** 出した領域が属するアプリの名前（共通の領域は「スイート」） */
  source: z.string(),
  text: z.string(),
});

/** 確かめの中身の1行の型。 */
export type WithdrawalItem = z.infer<typeof WithdrawalItem>;

/** 退会の確かめの中身（GET /api/v1/accounts/me/withdrawal）。 */
export const WithdrawalPreview = z.object({ items: z.array(WithdrawalItem) });

/** 退会の確かめの中身の型。 */
export type WithdrawalPreview = z.infer<typeof WithdrawalPreview>;
