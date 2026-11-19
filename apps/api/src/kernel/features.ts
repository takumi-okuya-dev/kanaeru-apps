// 領域の機能の印（設定 DOMAIN_FEATURES。docs/rules/coding.md 2「大きな機能は設定で止められるように作る」）。
// 領域が持つ大きな機能を、コードを戻さず設定の1行で入・切にする。
// 既定は空（どれも切）。名前は "<領域>.<名前>"（領域は modules.list.ts の名前・名前は英小文字で始まる英数字）。
// 登録されていない領域の名前（書き違い・まだない領域）は、組み立て（app.ts）が起動で止める（黙って切のままにしない）。
// 領域は deps.features.enabled(key) で読む。テストは AppDeps.features で差しかえる。

/** 機能の印の名前の形（"<領域>.<名前>"。領域は英小文字で始まる英小文字・数字、名前は英小文字で始まる英数字。どちらも40文字まで）。 */
export const DOMAIN_FEATURE_KEY_FORMAT = /^[a-z][a-z0-9]{0,39}\.[a-z][a-zA-Z0-9]{0,39}$/;

/** 領域に渡す機能の印（読むだけ）。 */
export type DomainFeatures = {
  /**
   * その機能が入か（設定 DOMAIN_FEATURES に並んでいれば入。なければ切）。
   * @param key "<領域>.<名前>"（例 "event.export"）
   * @returns 入なら true
   */
  enabled(key: string): boolean;
};

/**
 * 入にする機能の名前の一覧から、機能の印を作る。
 * @param keys 入にする機能の名前（"<領域>.<名前>"）
 * @returns 機能の印
 */
export function createDomainFeatures(keys: Iterable<string>): DomainFeatures {
  const on: ReadonlySet<string> = new Set(keys);
  return { enabled: (key) => on.has(key) };
}

/**
 * 入にする機能の名前が、どれも登録された領域のものかを確かめる（組み立てが起動のときに呼ぶ）。
 * @param keys 入にする機能の名前（"<領域>.<名前>"）
 * @param domainNames 登録された領域の名前
 * @throws {Error} 登録されていない領域の名前があるとき（その名前を出す）
 */
export function assertKnownDomainFeatures(
  keys: Iterable<string>,
  domainNames: Iterable<string>,
): void {
  const known = new Set(domainNames);
  const unknown = [...new Set(keys)].filter((key) => !known.has(key.split(".")[0] ?? ""));
  if (unknown.length > 0) {
    throw new Error(
      `DOMAIN_FEATURES に、登録されていない領域の名前があります：${unknown.join("、")}（領域は modules.list.ts の名前にしてください）。`,
    );
  }
}
