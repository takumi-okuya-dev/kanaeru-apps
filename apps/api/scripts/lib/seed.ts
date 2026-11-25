// 見本のデータ（pnpm db:seed とテストが使う）。何度入れても増えない形にする。
// 見本の領域はもうない。領域を足したら、その領域の仮のデータ（本物の利用者のデータを入れない）を、ここで足す。
import type { Db } from "../../src/kernel/db.ts";

/**
 * 見本のデータを入れる（いまは足すものがない）。
 * @param _db DB
 * @returns 足した行の数
 */
export async function seedSampleData(_db: Db): Promise<number> {
  return Promise.resolve(0);
}
