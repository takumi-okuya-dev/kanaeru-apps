// 利用規約とプライバシーポリシーの写し（_bmad-output/legal/*-draft.md）の、印より下を作り直す（suite-002）。
// 正本は src/features/suite/legal-content.ts。本文を直したら、リポジトリのルートで `pnpm exec tsx apps/web/legal-md.ts` を流す。
// 写しの印より上（主催者に向けた書きこみ・〈 〉の一覧・要確認の一覧）は残す。食い違いは legal-content.test.ts が止める。
import { readFileSync, writeFileSync } from "node:fs";
import { LEGAL_DOCUMENTS } from "./src/features/suite/legal-content.ts";
import type { LegalDocumentKey } from "./src/features/suite/legal-content.ts";
import { syncLegalMarkdown } from "./src/features/suite/legal-text.ts";

/** 写しの場所（文書の種類ごと）。 */
const DRAFT_FILES: Record<LegalDocumentKey, URL> = {
  terms: new URL("../../_bmad-output/legal/terms-draft.md", import.meta.url),
  privacy: new URL("../../_bmad-output/legal/privacy-policy-draft.md", import.meta.url),
};

for (const [key, file] of Object.entries(DRAFT_FILES) as [LegalDocumentKey, URL][]) {
  const current = readFileSync(file, "utf8");
  const next = syncLegalMarkdown(current, LEGAL_DOCUMENTS[key]);
  if (next !== current) writeFileSync(file, next);
  console.log(`${next === current ? "変わりなし" : "作り直しました"}：${file.pathname}`);
}
