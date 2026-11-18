// 「同じ名前」の比べ方（Consistency Conventions「同じ名前」。research R4）。reception の API がこれで一覧の行に印を付ける。
// 前後と間の空白を消し、NFKC で全角・半角をそろえる。DB には入れた形のまま持ち、比べるときだけそろえる。zod を読まない。

/**
 * 名前を、比べるための形にそろえる（NFKC でそろえ、空白をすべて消す）。
 * @param name 名前
 * @returns 比べるための形
 */
export function normalizeCheckinName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/gu, "");
}
