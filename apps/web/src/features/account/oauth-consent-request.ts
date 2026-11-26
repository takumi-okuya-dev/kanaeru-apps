// 同意の画面が受け取る認可の要求を、URL から文字列のまま読む（core-021）。
// - 道の既定の読み方は、数字だけの値を数に変えるので使わない（state や code_challenge が数字だけでも落とさない）。
// - 認可の要求の項目だけを拾う。LINE のログインから戻ったときに付く項目（code・liffClientId など）は捨てる。
// - 同じ項目が2つあるとき（LINE の state と重なったときなど）や形が違うときは、URL を信じず、
//   ログインの前にしまった要求（このタブの sessionStorage）を使う。
import { AuthorizeParams } from "@workspace/contracts/account";
import type { AuthorizeQuery } from "@workspace/contracts/account";

/** しまう場所の名前（このタブだけ。ほかのタブとは分ける）。 */
const STORAGE_KEY = "kanaeru.oauth-consent-request";

/** 認可の要求の項目の名前。 */
const KEYS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
  "scope",
] as const;

/**
 * 問い合わせの文字列から、認可の要求の項目だけを文字列のまま拾う。
 * @param search 問い合わせの文字列（例：window.location.search）
 * @returns 拾った項目。同じ項目が2つ以上あれば undefined
 */
function pickFields(search: string): Record<string, string> | undefined {
  const params = new URLSearchParams(search);
  const fields: Record<string, string> = {};
  for (const key of KEYS) {
    const values = params.getAll(key);
    if (values.length > 1) return undefined;
    const [value] = values;
    if (value !== undefined) fields[key] = value;
  }
  return fields;
}

/**
 * 同意の画面の認可の要求を読む。URL の要求が正しければしまい、正しくなければしまった要求を使う。
 * @param search 問い合わせの文字列（例：window.location.search）
 * @param storage しまう場所（既定は sessionStorage）
 * @returns 認可の要求。どちらからも読めなければ undefined
 */
export function readConsentRequest(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem"> = window.sessionStorage,
): AuthorizeQuery | undefined {
  const fromUrl = AuthorizeParams.safeParse(pickFields(search));
  if (fromUrl.success) {
    storage.setItem(STORAGE_KEY, JSON.stringify(fromUrl.data));
    return fromUrl.data;
  }
  const saved = storage.getItem(STORAGE_KEY);
  if (!saved) return undefined;
  try {
    const parsed = AuthorizeParams.safeParse(JSON.parse(saved));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
