// 組織の画面（suite の設定 › 組織）と、組織の招待の確かめの画面に、アプリが足すもの（suite-001。PRD 組織 FR-O22・FR-O53・O9）。
// 領域が feature.organization で出し、組み立て（router.tsx）が属するアプリを付けて provideOrganizationExtensions で渡す。
// suite の画面はここから読み、見えないアプリ（AD-16）の分は出さない。suite はアプリの領域を読まない。

/** 組織の画面に出す、アプリの組織の画面への入口。 */
export type OrganizationLink = {
  /** 見える名前（例：Threads の組織の画面） */
  label: string;
  /** 行き先の道 */
  to: string;
};

/** アプリが組織の画面と招待の確かめの画面に足すもの（領域が feature.organization で出す）。 */
export type OrganizationExtension = {
  /** 組織の画面に出す入口（組織の ID から作る） */
  links?: (organizationId: string) => readonly OrganizationLink[];
  /** 招待の確かめの画面に出す、このアプリでの見え方の説明（1行に1つ） */
  joinNotes?: readonly string[];
};

/** 属するアプリを付けたもの（組み立てが作る）。 */
export type ResolvedOrganizationExtension = OrganizationExtension & {
  /** 出した領域 */
  domain: string;
  /** 出した領域が属するアプリの key（共通の領域なら undefined） */
  appKey?: string;
};

/** 組み立てが渡したもの。 */
let provided: readonly ResolvedOrganizationExtension[] = [];

/**
 * 組み立てが、登録された領域の足すもの（属するアプリを付けたもの）を渡す（起動のときに1度）。
 * @param extensions 足すもの
 */
export function provideOrganizationExtensions(
  extensions: readonly ResolvedOrganizationExtension[],
): void {
  provided = extensions;
}

/**
 * 見る人に出す、アプリが足すもの（見えないアプリの分は出さない。見えるアプリを読む前は、アプリの分を出さない）。
 * @param visibleAppKeys 見えるアプリの key（読む前・読めないときは null）
 * @param extensions 足すもの（既定は組み立てが渡したもの）
 * @returns 出すもの（登録の順）
 */
export function visibleOrganizationExtensions(
  visibleAppKeys: ReadonlySet<string> | null,
  extensions: readonly ResolvedOrganizationExtension[] = provided,
): ResolvedOrganizationExtension[] {
  return extensions.filter((extension) =>
    extension.appKey === undefined ? true : visibleAppKeys?.has(extension.appKey) === true,
  );
}
