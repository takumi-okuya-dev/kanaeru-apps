// 道の値の形と、招待の印の作り方（event の中だけで使う）。
import { randomBytes } from "node:crypto";
import { STAFF_INVITE_TOKEN_FORMAT } from "@workspace/contracts/event";

/** uuid の形（kernel/http.ts の uuidParam の z.guid() と同じ。合わなければ DB を引かずに「ない」とする）。 */
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * uuid の形か。
 * @param value 道の値
 * @returns 形が合えば true
 */
export function isUuid(value: string): boolean {
  return UUID_FORMAT.test(value);
}

/**
 * 招待の印の形か（32 バイトの base64url）。
 * @param value 道の値
 * @returns 形が合えば true
 */
export function isInviteToken(value: string): boolean {
  return STAFF_INVITE_TOKEN_FORMAT.test(value);
}

/**
 * 新しい招待の印を作る（32 バイトの乱数の base64url。research R3）。
 * @returns 招待の印
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}
