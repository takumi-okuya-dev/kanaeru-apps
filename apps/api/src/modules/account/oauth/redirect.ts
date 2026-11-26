// 認可の戻り先（redirect_uri）の確かめ（FR-033・RFC 8252）。
// - 登録した戻り先と完全一致なら通す。
// - ループバック（http://127.0.0.1 と http://[::1]）は、ポートだけ任意にしてよい（CLI が空きポートを使うため）。
// - 利用者の情報（userinfo）・フラグメント・登録にない別のホストは断る。
// - localhost も、ループバックとして受ける（Claude Code と Claude の CIMD が http://localhost/callback を使うため。
//   戻りはこの端末だけに届き、認可のコードは PKCE の検証器がないと使えない）。
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

/**
 * 文字列を URL として読む（失敗したら null）。
 * @param value URL の文字列
 * @returns 読めた URL、または null
 */
function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * 戻り先がループバックの形か（http・127.0.0.1・[::1]・localhost・利用者の情報とフラグメントなし）。
 * @param url 読めた URL
 * @returns ループバックなら true
 */
function isLoopbackUrl(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.hash
  );
}

/**
 * 要求された戻り先を、登録の一覧で受けてよいか確かめる。
 * @param requested 認可の要求の redirect_uri
 * @param registered クライアントが登録した redirect_uris
 * @returns 受けてよければ true
 */
export function redirectUriAllowed(requested: string, registered: readonly string[]): boolean {
  // 登録の一覧に入っていても、使えない形（http の外のホストなど）は受けない（登録の時点の守りの二重）
  if (registered.includes(requested)) return isRegistrableRedirectUri(requested);
  const req = parseUrl(requested);
  if (!req || !isLoopbackUrl(req)) return false;
  return registered.some((value) => {
    const reg = parseUrl(value);
    return (
      reg !== null &&
      isLoopbackUrl(reg) &&
      reg.hostname === req.hostname &&
      reg.pathname === req.pathname &&
      reg.search === req.search
    );
  });
}

/**
 * 登録の戻り先として受けてよい形か（CIMD・DCR の登録で使う）。https か、ループバックの http。
 * @param value 登録の戻り先
 * @returns 受けてよければ true
 */
export function isRegistrableRedirectUri(value: string): boolean {
  const url = parseUrl(value);
  if (!url || url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return isLoopbackUrl(url);
}
