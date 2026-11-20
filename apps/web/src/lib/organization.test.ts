// 組織の画面にアプリが足すもの（suite-001）：見えないアプリの分は出さず、見えるアプリを読む前はアプリの分を出さない。
// アプリの数や並びは書かない（並行開発の決まり 3-2）。足すものは試しのもの。
import { describe, expect, it } from "vitest";
import { visibleOrganizationExtensions } from "./organization.ts";
import type { ResolvedOrganizationExtension } from "./organization.ts";

/** 試しの足すもの（sample は試しのアプリ。common はどのアプリにも属さない）。 */
const EXTENSIONS: readonly ResolvedOrganizationExtension[] = [
  {
    domain: "sample",
    appKey: "sample",
    links: (id) => [{ label: "見本の組織の画面", to: `/sample/organizations/${id}` }],
    joinNotes: ["見本では、担当の人が記録を作れます。"],
  },
  { domain: "common", joinNotes: ["共通の説明です。"] },
];

/**
 * 出すものの領域。
 * @param visibleAppKeys 見えるアプリの key（読む前は null）
 * @returns 領域の名前（登録の順）
 */
function domains(visibleAppKeys: string[] | null): string[] {
  return visibleOrganizationExtensions(
    visibleAppKeys ? new Set(visibleAppKeys) : null,
    EXTENSIONS,
  ).map((extension) => extension.domain);
}

describe("組織の画面にアプリが足すもの", () => {
  it("見えるアプリの分と、どのアプリにも属さない分を、登録の順に出す", () => {
    expect(domains(["sample"])).toEqual(["sample", "common"]);
  });

  it("見えないアプリの分は出さない", () => {
    expect(domains([])).toEqual(["common"]);
  });

  it("見えるアプリを読む前は、アプリの分を出さない", () => {
    expect(domains(null)).toEqual(["common"]);
  });

  it("入口は組織の ID から作る", () => {
    const [sample] = visibleOrganizationExtensions(new Set(["sample"]), EXTENSIONS);
    expect(sample?.links?.("org-1")).toEqual([
      { label: "見本の組織の画面", to: "/sample/organizations/org-1" },
    ]);
  });
});
