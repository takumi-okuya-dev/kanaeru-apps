// アプリの登録（AD-15）：API の領域（modules.list.ts）は、どれもちょうど1つのアプリか、スイートの共通に属する。
// アプリの領域は、どれも登録された領域。領域の数や並びは書かない（並行開発の決まり 3-2）。
// 新しい領域（例：threads）を modules.list.ts に足したら、packages/contracts/src/core/apps.list.ts にもアプリの1行を足す。
// 約束（zod）を読む前に、窓口の文書の道具（.openapi()）を zod に足す（API の入口と同じ順）
import "@hono/zod-openapi";
import { appRegistryProblems, listApps, unassignedDomains } from "@workspace/contracts/core";
import { describe, expect, it } from "vitest";
import * as modules from "../src/modules.list.ts";

/** 登録された API の領域の名前。 */
const domainNames = Object.keys(modules);

describe("アプリの登録", () => {
  it("アプリの一覧が決まりに合う", () => {
    expect(appRegistryProblems(listApps())).toEqual([]);
  });

  it("API の領域は、どれもちょうど1つのアプリか、スイートの共通に属する", () => {
    expect(unassignedDomains(domainNames)).toEqual([]);
  });

  it("アプリの領域は、どれも modules.list.ts に登録された領域", () => {
    for (const app of listApps()) {
      for (const domain of app.domains)
        expect(domainNames, `${app.key} の ${domain}`).toContain(domain);
    }
  });
});
