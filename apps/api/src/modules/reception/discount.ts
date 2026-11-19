// チェックインの割引を決める（reception-002。research R5〜R7）。作る・直すの両方が使う。
// 割引は event の findEventDiscount で引き、そのときの名前と額をチェックインに写す（あとで割引を直しても過去は変わらない。AD-6）。
// 新しく選ぶ割引は、その交流会の使っている割引だけ。割引を変えない直しは、使うのをやめた割引のままでもよい。
// 紹介者の名前は割引を選んだときだけ持つ。直すときに送られなければ、割引が同じなら前の名前を残す（受付係は前の名前を読めないため）。
import type { CheckinInput } from "@workspace/contracts/reception";
import { RECEPTION_ERRORS } from "@workspace/contracts/reception";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { findEventDiscount } from "../event/index.ts";
import type { CheckinRecord } from "./repository.ts";

/** チェックインに書く割引の写しと紹介者の名前。 */
export type DiscountSnapshot = Pick<
  CheckinRecord,
  "discountId" | "discountName" | "discountAmount" | "referrerName"
>;

/** 割引なし（紹介者も持たない）。 */
const NO_DISCOUNT: DiscountSnapshot = {
  discountId: null,
  discountName: null,
  discountAmount: null,
  referrerName: null,
};

/**
 * 送られた紹介者の名前をそろえる（前後の空白は約束が除いている。空は null）。
 * @param value 送られた値
 * @returns 名前か null
 */
function cleanReferrer(value: string | null | undefined): string | null {
  return value ? value : null;
}

/**
 * 選べない割引のエラー（割引の設問のそばに出す）。
 * @returns エラー
 */
function unavailable(): AppError {
  return new AppError(RECEPTION_ERRORS.DISCOUNT_UNAVAILABLE, {
    fields: [{ path: "discountId", message: RECEPTION_ERRORS.DISCOUNT_UNAVAILABLE.message }],
  });
}

/**
 * その交流会の使っている割引を引いて写す。
 * @param db DB
 * @param eventId 交流会の ID
 * @param discountId 割引の ID
 * @param referrerName 紹介者の名前（そろえたもの）
 * @returns 割引の写し
 * @throws {AppError} その交流会の使っている割引でないとき（DISCOUNT_UNAVAILABLE）
 */
async function snapshotOf(
  db: Executor,
  eventId: string,
  discountId: string,
  referrerName: string | null,
): Promise<DiscountSnapshot> {
  const discount = await findEventDiscount(db, eventId, discountId);
  if (!discount?.active) throw unavailable();
  return {
    discountId: discount.id,
    discountName: discount.name,
    discountAmount: discount.amount,
    referrerName,
  };
}

/**
 * 新しいチェックイン（自分・手）の割引を決める。
 * @param db DB
 * @param eventId 交流会の ID
 * @param input 入力
 * @returns 割引の写しと紹介者の名前
 * @throws {AppError} 選べない割引のとき（DISCOUNT_UNAVAILABLE）
 */
export async function discountForNewCheckin(
  db: Executor,
  eventId: string,
  input: Pick<CheckinInput, "discountId" | "referrerName">,
): Promise<DiscountSnapshot> {
  if (!input.discountId) return NO_DISCOUNT;
  return snapshotOf(db, eventId, input.discountId, cleanReferrer(input.referrerName));
}

/**
 * 直すときの割引を決める。
 * @param db DB
 * @param current 今のチェックイン
 * @param input 入力
 * @returns 割引の写しと紹介者の名前・割引が変わったか
 * @throws {AppError} 新しく選んだ割引が選べないとき（DISCOUNT_UNAVAILABLE）
 */
export async function discountForUpdate(
  db: Executor,
  current: CheckinRecord,
  input: Pick<CheckinInput, "discountId" | "referrerName">,
): Promise<{ snapshot: DiscountSnapshot; changed: boolean }> {
  const nextId = input.discountId ?? null;
  if (nextId === null) return { snapshot: NO_DISCOUNT, changed: current.discountId !== null };
  if (nextId === current.discountId) {
    return {
      snapshot: {
        discountId: current.discountId,
        discountName: current.discountName,
        discountAmount: current.discountAmount,
        referrerName:
          input.referrerName === undefined
            ? current.referrerName
            : cleanReferrer(input.referrerName),
      },
      changed: false,
    };
  }
  const snapshot = await snapshotOf(db, current.eventId, nextId, cleanReferrer(input.referrerName));
  return { snapshot, changed: true };
}
