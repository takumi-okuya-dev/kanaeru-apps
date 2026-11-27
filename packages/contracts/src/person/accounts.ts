// 人物メモのアカウント（specs/person/001-notes/research.md R4・R5・AD-31）。zod を読まない。
// X・connpass・GitHub・LinkedIn・LINE ID はアカウント名だけを持ち、相手のページの URL はここで組み立てる（API と画面の両方が使う）。
// そのほかの URL は http・https だけを使う（javascript:・tel:・data: を開かない）。
// LINE ID は LINE の「ID で友だちを探す」リンク（相手が ID で見つけられる設定のときだけ開ける。【仮決め・要確認】R5）。

/** アカウントの種類（画面と CSV の並び）。 */
export const PERSON_ACCOUNT_KINDS = ["x", "connpass", "github", "linkedin", "line", "url"] as const;

/** アカウントの種類。 */
export type PersonAccountKind = (typeof PERSON_ACCOUNT_KINDS)[number];

/** アカウントの種類の画面の言葉。 */
export const PERSON_ACCOUNT_LABELS = {
  x: "X",
  connpass: "connpass",
  github: "GitHub",
  linkedin: "LinkedIn",
  line: "LINE ID",
  url: "そのほかの URL",
} as const satisfies Record<PersonAccountKind, string>;

/** アカウント名から URL を組み立てる種類（そのほかの URL のほか）。 */
type HandleKind = Exclude<PersonAccountKind, "url">;

/** 種類ごとの URL の組み立て方と、貼られた URL をそのまま使ってよい所（ホスト名）。 */
const HANDLE_SERVICES: Record<HandleKind, { build: (handle: string) => string; hosts: string[] }> =
  {
    x: { build: (handle) => `https://x.com/${handle}`, hosts: ["x.com", "twitter.com"] },
    connpass: {
      build: (handle) => `https://connpass.com/user/${handle}/`,
      hosts: ["connpass.com"],
    },
    github: { build: (handle) => `https://github.com/${handle}`, hosts: ["github.com"] },
    linkedin: {
      build: (handle) => `https://www.linkedin.com/in/${handle}/`,
      hosts: ["linkedin.com"],
    },
    line: { build: (handle) => `https://line.me/R/ti/p/~${handle}`, hosts: ["line.me"] },
  };

/**
 * http か https の URL か（そのほかの URL に使えるか。DB の CHECK と同じく頭が http:// か https://、かつ URL として読める）。
 * @param value 文
 * @returns 使えるなら true
 */
export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//iu.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * URL のホスト名が、その所（か、その下）か。
 * @param value URL
 * @param hosts 使ってよいホスト名
 * @returns その所なら true
 */
function isServiceUrl(value: string, hosts: readonly string[]): boolean {
  if (!isHttpUrl(value)) return false;
  const hostname = new URL(value).hostname.toLowerCase();
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/**
 * アカウントから、相手のページを開く URL を作る。
 * アカウント名は前後の空白と頭の @ を外し、道の文字として逃がす。そのサービスの URL が貼られていれば、そのまま使う。
 * @param kind アカウントの種類
 * @param value 入れた値（なければ null）
 * @returns URL（開けないときは null）
 */
export function accountUrl(
  kind: PersonAccountKind,
  value: string | null | undefined,
): string | null {
  const trimmed = (value ?? "").trim();
  if (kind === "url") return isHttpUrl(trimmed) ? trimmed : null;
  const service = HANDLE_SERVICES[kind];
  if (/^https?:\/\//iu.test(trimmed)) {
    return isServiceUrl(trimmed, service.hosts) ? trimmed : null;
  }
  const handle = trimmed.replace(/^@+/u, "").trim();
  if (handle === "") return null;
  return service.build(encodeURIComponent(handle));
}
